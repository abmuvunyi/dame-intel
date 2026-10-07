import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GameReview, MoveReview } from './game-review.entity';
import { classifyMove, computeAccuracy } from './move-classification';
import { HistoryService } from '../../history/history.service';
import { AiService } from '../ai/ai/ai.service';
import { DraughtsEngine, PieceColor, Move } from '../engine/engine.service';

// Search depth used for post-game review. Matches the existing default used by both
// analysis.controller.ts's manual "Run Engine" endpoint and anticheat.service.ts's
// replay pass — deep enough to catch real tactical swings, shallow enough that
// reviewing a full ~40-move game stays fast (this runs synchronously on the same
// process — see analyzeCompletedGame's own comment on why that's an accepted
// simplification for this phase).
const ANALYSIS_DEPTH = 4;

// How many total plies a preview line runs (the triggering move itself plus this
// many more) — long enough to show a real trend (a piece actually being won back, an
// advantage actually growing), short enough to stay cheap across every flagged move
// in a full game and to stay genuinely "a couple of moves", not a full continuation.
const PREVIEW_LINE_ADDITIONAL_PLIES = 2;

// A position as "side to move + board", normalized through the engine so two boards
// compare equal however their piece objects were serialized.
export const positionKey = (engine: DraughtsEngine) => `${engine.getCurrentTurn()}|${engine.getBoardString()}`;

@Injectable()
export class GameReviewService {
  constructor(
    @InjectRepository(GameReview)
    private reviewRepository: Repository<GameReview>,
    private historyService: HistoryService,
    private aiService: AiService,
  ) {}

  async getReview(gameId: number): Promise<GameReview | null> {
    return this.reviewRepository.findOne({ where: { gameId } });
  }

  // Every position reached in a saved game (see positionKey), or null if the game
  // doesn't exist. Lets analysis under a free review confirm a submitted position
  // really belongs to the game the review was spent on.
  async gamePositionKeys(gameId: number): Promise<Set<string> | null> {
    const game = await this.historyService.getGame(gameId);
    if (!game) return null;
    let moves: Move[];
    try {
      moves = typeof game.moves === 'string' ? JSON.parse(game.moves) : game.moves;
    } catch {
      moves = [];
    }
    const rules = typeof game.rules === 'string' ? JSON.parse(game.rules) : (game.rules ?? {});
    const engine = new DraughtsEngine(rules);
    const keys = new Set<string>([positionKey(engine)]);
    for (const move of Array.isArray(moves) ? moves : []) {
      if (!engine.makeMove(move)) break;
      keys.add(positionKey(engine));
    }
    return keys;
  }

  // Builds a short engine-vs-engine continuation: `firstMove` played from
  // `startEngine`'s CURRENT position, then up to `additionalPlies` more moves of
  // each side's own best play in turn. Works on a clone (same pattern
  // puzzle-generator.service.ts's buildCandidate already uses) so the caller's own
  // engine/traversal is never disturbed. Stops early if the game ends mid-line or the
  // engine reports no legal moves — a real short forced sequence is a perfectly valid,
  // shorter-than-requested line, not an error.
  private async buildPreviewLine(startEngine: DraughtsEngine, firstMove: Move, additionalPlies: number): Promise<Move[]> {
    const walker = new DraughtsEngine(startEngine.getRules());
    walker.loadBoard(JSON.parse(JSON.stringify(startEngine.getBoard())), startEngine.getCurrentTurn());
    walker.makeMove(firstMove);
    const line: Move[] = [firstMove];

    for (let i = 0; i < additionalPlies; i++) {
      if (walker.isGameOver()) break;
      const evals = await this.aiService.analyzePositionAsync(walker, ANALYSIS_DEPTH);
      if (evals.length === 0) break;
      const next = evals[0].move;
      line.push(next);
      walker.makeMove(next);
    }

    return line;
  }

  // The actual "automated post-game review" pass (Phase 11). Called fire-and-forget
  // from game.gateway.ts's handleGameOver — same established pattern as
  // AnticheatService.analyzeGameForCheating: "we don't await this because it's CPU
  // intensive and we don't want to block the gateway". This is a background PASS, not
  // a background PROCESS — it still runs on the same Node event loop, just after the
  // gameOver response has already gone out and yielding between moves (see
  // yieldEventLoop below) so it doesn't starve other concurrent games' WebSocket
  // traffic. A real production system might offload this to a separate worker
  // process or a job queue (BullMQ, etc.); this codebase doesn't have that
  // infrastructure yet, and this follows the exact precedent already established for
  // anti-cheat rather than inventing a second, different async pattern.
  async analyzeCompletedGame(gameId: number): Promise<void> {
    const game = await this.historyService.getGame(gameId);
    if (!game) return;

    let moves: Move[];
    try {
      moves = typeof game.moves === 'string' ? JSON.parse(game.moves) : game.moves;
    } catch {
      moves = [];
    }
    if (!Array.isArray(moves) || moves.length === 0) return; // nothing to review

    const existing = await this.reviewRepository.findOne({ where: { gameId } });
    if (existing?.status === 'COMPLETED') return; // idempotent — don't recompute

    // Persist a PENDING row up front, before the expensive loop, so a viewer who
    // opens the game history mid-analysis sees "in progress" rather than nothing at
    // all (getReview() returning null is indistinguishable from "never queued").
    const review = existing ?? this.reviewRepository.create({ gameId });
    review.status = 'PENDING';
    review.moveReviews = null;
    review.lightAccuracy = null;
    review.darkAccuracy = null;
    review.errorMessage = null;
    await this.reviewRepository.save(review);

    try {
      const rules = typeof game.rules === 'string' ? JSON.parse(game.rules) : (game.rules ?? {});
      const engine = new DraughtsEngine(rules);
      const moveReviews: MoveReview[] = [];
      const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));

      for (let i = 0; i < moves.length; i++) {
        const recordedMove = moves[i];
        const mover = engine.getCurrentTurn();

        // Evaluate every legal move from this position BEFORE playing the recorded
        // one, exactly like AnalysisController's live "Run Engine" query.
        const evaluations = await this.aiService.analyzePositionAsync(engine, ANALYSIS_DEPTH);
        if (evaluations.length > 0) {
          const bestEval = evaluations[0].evaluation;
          // Match against the engine's OWN legal-move list (same defense-in-depth
          // principle as handleMakeMove's `exactLegalMove` in game.gateway.ts) rather
          // than trusting the recorded move's coordinates blindly.
          const playedEntry = evaluations.find(e =>
            e.move.from.row === recordedMove.from.row && e.move.from.col === recordedMove.from.col &&
            e.move.to.row === recordedMove.to.row && e.move.to.col === recordedMove.to.col,
          );
          if (playedEntry) {
            // analyzePosition() already sorts best-first, so this is never negative
            // in practice; clamped defensively rather than assumed.
            const evalDelta = Math.max(0, bestEval - playedEntry.evaluation);
            // playedEntry.evaluation is from `mover`'s own perspective (see
            // AiService.searchRoot/evaluateBoard — every leaf is scored relative to
            // whoever was on move at the root). Flip it onto a fixed LIGHT-positive
            // axis so the eval bar has one consistent direction across the whole
            // game instead of alternating meaning every ply.
            const evaluation = mover === PieceColor.LIGHT ? playedEntry.evaluation : -playedEntry.evaluation;
            const classification = classifyMove(evalDelta);

            // "Why was this the best move" preview — a real, engine-followed
            // continuation starting with the move actually recommended, not just the
            // bare move itself. Nothing to show when the played move already WAS the
            // recommendation.
            const recommendedLine = classification !== 'BEST'
              ? await this.buildPreviewLine(engine, evaluations[0].move, PREVIEW_LINE_ADDITIONAL_PLIES)
              : null;

            // "How does this get punished" preview — only for a real mistake/blunder,
            // starting from the position the ACTUAL (bad) move produced, showing the
            // opponent's own best-play response. Built on a fresh clone at that
            // resulting position, since buildPreviewLine's own clone starts from
            // BEFORE its first move, and here the "first move" to preview is the
            // opponent's reply, not the mistake itself (which already happened).
            let punishmentLine: Move[] | null = null;
            if (classification === 'MISTAKE' || classification === 'BLUNDER') {
              const afterMistake = new DraughtsEngine(engine.getRules());
              afterMistake.loadBoard(JSON.parse(JSON.stringify(engine.getBoard())), engine.getCurrentTurn());
              afterMistake.makeMove(recordedMove);
              if (!afterMistake.isGameOver()) {
                const opponentEvals = await this.aiService.analyzePositionAsync(afterMistake, ANALYSIS_DEPTH);
                if (opponentEvals.length > 0) {
                  punishmentLine = await this.buildPreviewLine(afterMistake, opponentEvals[0].move, PREVIEW_LINE_ADDITIONAL_PLIES);
                }
              }
            }

            moveReviews.push({
              moveIndex: i,
              mover,
              classification,
              evalDelta,
              evaluation,
              bestMove: evaluations[0].move,
              recommendedLine,
              punishmentLine,
            });
          }
          // If the recorded move isn't found among the engine's own legal moves at
          // all, it's skipped rather than guessed at — this would only happen for a
          // corrupted/foreign move history, not a game actually played through this
          // gateway (which only ever records engine-validated moves).
        }

        engine.makeMove(recordedMove);
        await yieldEventLoop();
      }

      const lightClassifications = moveReviews.filter(m => m.mover === PieceColor.LIGHT).map(m => m.classification);
      const darkClassifications = moveReviews.filter(m => m.mover === PieceColor.DARK).map(m => m.classification);

      review.status = 'COMPLETED';
      review.moveReviews = moveReviews;
      review.lightAccuracy = computeAccuracy(lightClassifications);
      review.darkAccuracy = computeAccuracy(darkClassifications);
      review.completedAt = new Date();
      await this.reviewRepository.save(review);
    } catch (err: any) {
      review.status = 'FAILED';
      review.errorMessage = err?.message ?? 'Unknown error during analysis';
      await this.reviewRepository.save(review);
      throw err; // let the caller's own .catch() log it too, same as anti-cheat's call site
    }
  }
}
