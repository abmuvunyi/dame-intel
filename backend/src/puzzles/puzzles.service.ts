import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Puzzle } from './puzzle.entity';
import { PieceColor, PieceType, Move, BoardState } from '../game/engine/engine.service';

@Injectable()
export class PuzzlesService implements OnModuleInit {
  constructor(
    @InjectRepository(Puzzle)
    private puzzlesRepository: Repository<Puzzle>,
  ) {}

  async onModuleInit() {
    // Seed initial puzzles if none exist
    const count = await this.puzzlesRepository.count();
    if (count === 0) {
      console.log('Seeding initial draughts puzzles...');
      await this.seedPuzzles();
    }
  }

  async getRandomPuzzle(difficulty?: number): Promise<Puzzle> {
    const query = this.puzzlesRepository.createQueryBuilder('puzzle');
    if (difficulty) {
      query.where('puzzle.difficulty = :diff', { diff: difficulty });
    }
    // Simple way to get a random row in SQLite
    query.orderBy('RANDOM()').limit(1);
    const result = await query.getOne();

    // In rare cases (like postgres) RANDOM() is wrong, but since this is SQLite or Postgres it usually works,
    // however for fallback, just get all and pick one
    if (!result) {
       const all = await this.puzzlesRepository.find();
       return all[Math.floor(Math.random() * all.length)];
    }
    return result;
  }

  private async seedPuzzles() {
    // Puzzle 1: Basic forced capture for Light
    // . . .
    // . d .
    // . . l
    const board1: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
    board1[4][3] = { color: PieceColor.DARK, type: PieceType.MAN }; // Dark piece
    board1[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Light piece

    const move1: Move = {
      from: { row: 5, col: 4 },
      to: { row: 3, col: 2 },
      captured: [{ row: 4, col: 3 }]
    };

    const p1 = this.puzzlesRepository.create({
      difficulty: 1,
      board: board1,
      turnToMove: 'L',
      correctMove: move1
    });

    // Puzzle 2: Multi-jump
    const board2: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
    board2[2][1] = { color: PieceColor.DARK, type: PieceType.MAN };
    board2[4][3] = { color: PieceColor.DARK, type: PieceType.MAN };
    board2[5][4] = { color: PieceColor.LIGHT, type: PieceType.MAN }; // Our piece

    const move2: Move = {
      from: { row: 5, col: 4 },
      to: { row: 1, col: 0 },
      captured: [{ row: 4, col: 3 }, { row: 2, col: 1 }]
    };

    const p2 = this.puzzlesRepository.create({
      difficulty: 2,
      board: board2,
      turnToMove: 'L',
      correctMove: move2
    });

    await this.puzzlesRepository.save([p1, p2]);
  }
}
