import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheatFlag } from './cheat-flag.entity';
import { AiService } from '../game/ai/ai/ai.service';
import { DraughtsEngine, PieceColor, Move, GameRules } from '../game/engine/engine.service';
import { User } from '../users/user.entity';

@Injectable()
export class AnticheatService {
  constructor(
    @InjectRepository(CheatFlag)
    private cheatFlagRepository: Repository<CheatFlag>,
    private aiService: AiService,
  ) {}

  public async analyzeGameForCheating(
    lightPlayer: User | null,
    darkPlayer: User | null,
    moves: Move[],
    // Real bug found while building Phase 11's post-game review, which does this
    // exact same "replay the recorded moves on a fresh engine" pattern: this used to
    // construct `new DraughtsEngine()` with no rules at all, silently defaulting to
    // 8x8 American — the same class of bug Phase 3 already found and fixed in
    // analysis.controller.ts, just never caught here. Confirmed directly (not
    // assumed, see the regression test below): an 8x8 board isn't just a truncated
    // 10x10 one, it's a different width with a different starting layout, so a
    // 10x10 game's very FIRST recorded move already fails to match anything in the
    // wrong-sized engine's `getLegalMoves()` — `engine.makeMove()` returns `false`
    // and does nothing, so the "replay" never advances past the initial position at
    // all. Not a crash: every move for the rest of the game gets silently compared
    // against that same frozen starting board instead of the real one, making
    // anti-cheat's analysis of any 10x10 game meaningless from move one. Optional and
    // defaults to the old 8x8 behavior only when omitted, so this stays backward
    // compatible.
    rules?: Partial<GameRules>,
  ) {
    if (!lightPlayer && !darkPlayer) return;
    if (moves.length < 10) return; // Too short to analyze accurately

    const engine = new DraughtsEngine(rules ?? {});
    let lightEngineMatches = 0;
    let darkEngineMatches = 0;
    let lightTotalMoves = 0;
    let darkTotalMoves = 0;

    // Helper to yield event loop so we don't freeze WebSocket connections during heavy CPU task
    const yieldEventLoop = () => new Promise(resolve => setImmediate(resolve));

    // Simulate game
    for (const move of moves) {
      const currentTurn = engine.getCurrentTurn();

      // Analyze the position BEFORE the move is made
      // We use depth 4. If a player consistently matches depth 4 exactly, it's highly suspicious.
      const evaluations = this.aiService.analyzePosition(engine, 4);

      if (evaluations.length > 0) {
        // Did they pick the absolute best move?
        const bestMove = evaluations[0].move;

        // Compare coordinates
        const isMatch = bestMove.from.row === move.from.row &&
                        bestMove.from.col === move.from.col &&
                        bestMove.to.row === move.to.row &&
                        bestMove.to.col === move.to.col;

        if (currentTurn === PieceColor.LIGHT) {
          lightTotalMoves++;
          if (isMatch) lightEngineMatches++;
        } else {
          darkTotalMoves++;
          if (isMatch) darkEngineMatches++;
        }
      }

      // Apply the move to proceed
      engine.makeMove(move);

      // Yield back to Node event loop between expensive move evaluations
      await yieldEventLoop();
    }

    // Evaluate correlation
    if (lightPlayer && lightTotalMoves > 5) {
      const lightScore = lightEngineMatches / lightTotalMoves;
      if (lightScore >= 0.95) { // 95% engine match
        await this.flagUser(lightPlayer, lightScore, 'Highly suspicious move accuracy (Engine-like patterns)');
      }
    }

    if (darkPlayer && darkTotalMoves > 5) {
      const darkScore = darkEngineMatches / darkTotalMoves;
      if (darkScore >= 0.95) {
        await this.flagUser(darkPlayer, darkScore, 'Highly suspicious move accuracy (Engine-like patterns)');
      }
    }
  }

  private async flagUser(user: User, score: number, reason: string) {
    console.warn(`[AntiCheat] Flagging user ${user.username} for cheating. Correlation: ${score}`);
    const flag = this.cheatFlagRepository.create({
      user,
      engineCorrelationScore: score,
      reason,
    });
    await this.cheatFlagRepository.save(flag);
  }
}
