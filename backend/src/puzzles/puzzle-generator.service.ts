import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Puzzle } from './puzzle.entity';
import { GameHistory } from '../history/history.entity';
import { DraughtsEngine, Move } from '../game/engine/engine.service';
import { sameMove } from './move-utils';

// Robustness note: simple-json columns are supposed to round-trip as real JS
// values through TypeORM, but the frontend's analysis page already had to defend
// against getting a raw string back in practice (see analysis/[id]/page.tsx) — same
// defensive parse here, for the same reason.
function asObject<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

@Injectable()
export class PuzzleGeneratorService {
  constructor(
    @InjectRepository(Puzzle)
    private puzzlesRepository: Repository<Puzzle>,
    @InjectRepository(GameHistory)
    private historyRepository: Repository<GameHistory>,
  ) {}

  /**
   * Scans one completed game move-by-move. At every position where the side to move
   * had a legal capture sequence taking 2+ pieces available, but didn't play it (or
   * played a different capture of the same length, still worth surfacing as a
   * multi-jump tactic), flags that position as a pending candidate puzzle for human
   * review — never auto-published. Returns the candidates created.
   */
  async scanGame(gameId: number): Promise<Puzzle[]> {
    const game = await this.historyRepository.findOneBy({ id: gameId });
    if (!game) throw new NotFoundException('Game not found');

    const rules = asObject(game.rules) || {};
    const moves: Move[] = asObject(game.moves) || [];
    const boardSize = rules.boardSize ?? 8;

    const engine = new DraughtsEngine(rules);
    const candidates: Puzzle[] = [];

    for (const playedMove of moves) {
      const legalMoves = engine.getLegalMoves();
      const bestCapture = legalMoves
        .filter(m => (m.captured?.length ?? 0) >= 2)
        .sort((a, b) => (b.captured?.length ?? 0) - (a.captured?.length ?? 0))[0];

      if (bestCapture && !sameMove(bestCapture, playedMove)) {
        const puzzle = this.puzzlesRepository.create({
          difficulty: (bestCapture.captured?.length ?? 0) >= 3 ? 3 : 2,
          boardSize,
          board: JSON.parse(JSON.stringify(engine.getBoard())),
          turnToMove: engine.getCurrentTurn(),
          solution: [bestCapture],
          status: 'pending',
          sourceGameId: gameId,
        });
        candidates.push(await this.puzzlesRepository.save(puzzle));
      }

      // Advance with whatever was actually played, so later positions in the scan
      // reflect the real game continuation, not the missed capture.
      const applied = engine.makeMove(playedMove);
      if (!applied) break; // malformed/legacy history entry — stop rather than desync silently
    }

    return candidates;
  }

  async scanRecentGames(limit: number = 20): Promise<{ gameId: number; candidatesFound: number }[]> {
    const games = await this.historyRepository.find({ order: { playedAt: 'DESC' }, take: limit });
    const results: { gameId: number; candidatesFound: number }[] = [];
    for (const game of games) {
      const candidates = await this.scanGame(game.id);
      results.push({ gameId: game.id, candidatesFound: candidates.length });
    }
    return results;
  }
}
