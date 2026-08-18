// Shared types and pure helpers for the draughts board — used by GameBoard and its
// sub-components (Board, MoveList, CapturedTray, Timer). These mirror
// backend/src/game/engine/engine.service.ts's shapes; there's no code sharing across
// the frontend/backend boundary here (different package, different build), so keep
// this in sync by hand if the engine's wire shapes ever change.

export enum PieceColor {
  LIGHT = 'L',
  DARK = 'D',
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export interface Piece {
  color: PieceColor;
  type: PieceType;
}

export type BoardPosition = Piece | null;
export type BoardState = BoardPosition[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  captured?: Position[];
}

export interface GameRules {
  boardSize: number;
}

/**
 * Standard draughts square numbering: only the playable (dark) squares are numbered,
 * left-to-right, top-to-bottom, starting at 1. For a 10x10 board this produces the
 * same 1-50 numbering FMJD's official notation uses (Annex 1, article 2.6); for 8x8
 * it produces the standard 1-32 English-draughts numbering. Returns null for a light
 * (unplayable) square.
 */
export function squareNumber(row: number, col: number, boardSize: number): number | null {
  if ((row + col) % 2 === 0) return null;
  let n = 0;
  for (let r = 0; r <= row; r++) {
    const lastCol = r === row ? col : boardSize - 1;
    for (let c = 0; c <= lastCol; c++) {
      if ((r + c) % 2 !== 0) n++;
    }
  }
  return n;
}

/**
 * Formats a move in FMJD-style notation (Annex 1, article 8.2): "-" for a simple
 * move, "x" for a capture. This is a simplification of full PDN notation — the
 * engine only reports a move's final captured-pieces list and landing square, not
 * each intermediate square in a multi-jump chain, so a 2+ piece capture is shown as
 * a single "x" with a "+N" suffix rather than the full chained square list.
 */
export function formatMove(move: Move, boardSize: number): string {
  const from = squareNumber(move.from.row, move.from.col, boardSize);
  const to = squareNumber(move.to.row, move.to.col, boardSize);
  const captured = move.captured?.length ?? 0;
  const sep = captured > 0 ? 'x' : '-';
  const suffix = captured > 1 ? ` (+${captured})` : '';
  return `${from}${sep}${to}${suffix}`;
}

export function countPieces(board: BoardState, color: PieceColor): number {
  let n = 0;
  for (const row of board) for (const cell of row) if (cell && cell.color === color) n++;
  return n;
}

export function initialPieceCount(boardSize: number): number {
  const rowsOfPieces = boardSize === 10 ? 4 : 3;
  return rowsOfPieces * (boardSize / 2);
}
