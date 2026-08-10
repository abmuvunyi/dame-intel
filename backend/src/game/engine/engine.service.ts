// Framework-independent draughts rules engine. No NestJS imports here on purpose —
// this class must be unit-testable in complete isolation from the Nest DI container.
//
// Rules are sourced from the official FMJD "Annex 1 – Official FMJD rules for
// international draughts" (fmjd.org/docs/Annex_1.pdf) for the International (10x10)
// variant, and from standard American Checkers / English draughts rules (ACF /
// English Draughts Association — men capture forward only, kings are non-flying)
// for the American (8x8) variant. Specific article numbers are cited inline where a
// rule maps directly onto one, so a reviewer can check the implementation against
// the source without re-deriving it.

export enum PieceColor {
  LIGHT = 'L', // Usually White or Red
  DARK = 'D',  // Usually Black
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
  captured?: Position[]; // Array of captured piece positions in this move sequence
}

export type Variant = 'international' | 'american';

export interface GameRules {
  boardSize: number; // 8 or 10
  variant?: Variant; // informational label; behavior is driven by the flags below
  forceMajorityCapture: boolean; // FMJD 4.13: capture of the largest number of pieces is obligatory
  flyingKings: boolean; // FMJD 3.9: international kings slide any distance; American kings move one square
  manCaptureBackward: boolean; // FMJD 4.1: international men may capture backward; American men may not
  resetOnManMove: boolean; // FMJD 6.2: the no-progress draw counter resets on a man move OR a capture
  drawNoProgressHalfMoves: number; // FMJD 6.2 specifies 25 moves per player (50 half-moves) for International.
  // American Checkers' official move-count draw threshold was not sourced for this
  // implementation; 80 half-moves (40 per player) is used as a documented approximation.
}

const DIAGONAL_DIRS = [
  { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
  { dr: 1, dc: -1 }, { dr: 1, dc: 1 },
];

function resolveRules(rules: Partial<GameRules>): GameRules {
  const boardSize = rules.boardSize ?? 8;
  // International draughts is always played on 10x10; anything else defaults to the
  // American/English rule set. Every individual flag remains explicitly overridable
  // (e.g. for tests that want a small custom board with international-style rules).
  const isInternational = rules.variant
    ? rules.variant === 'international'
    : boardSize >= 10;

  return {
    boardSize,
    variant: rules.variant ?? (isInternational ? 'international' : 'american'),
    forceMajorityCapture: rules.forceMajorityCapture ?? isInternational,
    flyingKings: rules.flyingKings ?? isInternational,
    manCaptureBackward: rules.manCaptureBackward ?? isInternational,
    resetOnManMove: rules.resetOnManMove ?? isInternational,
    drawNoProgressHalfMoves: rules.drawNoProgressHalfMoves ?? (isInternational ? 50 : 80),
  };
}

export class DraughtsEngine {
  private board: BoardState;
  private currentTurn: PieceColor;
  private rules: GameRules;

  // Draw-condition bookkeeping (FMJD 6.1 threefold repetition, 6.2 no-progress rule).
  private halfMovesSinceProgress = 0;
  private positionCounts: Map<string, number> = new Map();

  constructor(rules: Partial<GameRules> = {}) {
    this.rules = resolveRules(rules);
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
    this.recordPosition();
  }

  static createInternational(overrides: Partial<GameRules> = {}): DraughtsEngine {
    return new DraughtsEngine({ boardSize: 10, variant: 'international', ...overrides });
  }

  static createAmerican(overrides: Partial<GameRules> = {}): DraughtsEngine {
    return new DraughtsEngine({ boardSize: 8, variant: 'american', ...overrides });
  }

  // Generate the Draughts board
  private createInitialBoard(): BoardState {
    const size = this.rules.boardSize;
    const board: BoardState = Array(size).fill(null).map(() => Array(size).fill(null));

    const rowsOfPieces = size === 10 ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < rowsOfPieces; row++) {
      for (let col = 0; col < size; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces (bottom rows)
    for (let row = size - rowsOfPieces; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.LIGHT, type: PieceType.MAN };
        }
      }
    }

    return board;
  }

  public getBoard(): BoardState {
    return this.board;
  }

  public getCurrentTurn(): PieceColor {
    return this.currentTurn;
  }

  // Standard string representation for debugging/testing
  public getRules(): GameRules {
    return this.rules;
  }

  public getBoardString(): string {
    let result = '';
    const size = this.rules.boardSize;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = this.board[r][c];
        if (!p) {
          result += '.';
        } else {
          result += (p.color === PieceColor.LIGHT ? 'l' : 'd') + (p.type === PieceType.KING ? 'K' : 'm');
        }
        result += ' ';
      }
      result += '\n';
    }
    return result;
  }

  // Load a custom board state (useful for tests and puzzles). This is treated as a
  // fresh position: draw-tracking counters reset rather than carrying over history
  // from whatever the engine was doing before.
  public loadBoard(board: BoardState, turn: PieceColor): void {
    this.board = board;
    this.currentTurn = turn;
    this.halfMovesSinceProgress = 0;
    this.positionCounts = new Map();
    this.recordPosition();
  }

  // Get all legal moves for the current player
  public getLegalMoves(): Move[] {
    const jumps: Move[] = [];
    const normalMoves: Move[] = [];
    const size = this.rules.boardSize;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === this.currentTurn) {
          const pos = { row, col };
          const pieceJumps = this.getValidJumpsForPiece(pos, piece);
          if (pieceJumps.length > 0) {
            jumps.push(...pieceJumps);
          } else if (jumps.length === 0) { // Only calculate normal moves if no jumps are found anywhere (forced capture rule)
            normalMoves.push(...this.getValidNormalMovesForPiece(pos, piece));
          }
        }
      }
    }

    // Forced capture rule (FMJD 4.2/4.5, and standard for American checkers too):
    // if any jump is possible, only jumps are legal.
    if (jumps.length > 0) {
      if (this.rules.forceMajorityCapture) {
        // FMJD 4.13: the capture of the largest number of pieces has priority and is
        // obligatory; a king has no priority or special weighting over a man for this
        // purpose (4.13), so we compare raw capture counts across all pieces globally.
        let maxCaptures = 0;
        for (const jump of jumps) {
          const numCaps = jump.captured ? jump.captured.length : 0;
          if (numCaps > maxCaptures) maxCaptures = numCaps;
        }
        // FMJD 4.14: if multiple sequences tie for the maximum, any of them is legal.
        return jumps.filter(j => j.captured && j.captured.length === maxCaptures);
      }
      return jumps;
    }

    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    const size = this.rules.boardSize;
    return r >= 0 && r < size && c >= 0 && c < size;
  }

  // Men: forward-only, per FMJD 3.4 (international) and standard American rules alike.
  private getManMoveDirections(color: PieceColor): { dr: number, dc: number }[] {
    const forward = color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  // FMJD 4.1: international men may capture forwards AND backwards. American men may
  // only capture forward (same restriction as their normal move).
  private getManCaptureDirections(color: PieceColor): { dr: number, dc: number }[] {
    return this.rules.manCaptureBackward ? DIAGONAL_DIRS : this.getManMoveDirections(color);
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];

    if (piece.type === PieceType.KING) {
      if (this.rules.flyingKings) {
        // FMJD 3.9: a king slides across any number of successive free squares.
        for (const dir of DIAGONAL_DIRS) {
          let step = 1;
          while (true) {
            const nr = pos.row + dir.dr * step;
            const nc = pos.col + dir.dc * step;
            if (!this.isValidPos(nr, nc) || this.board[nr][nc] !== null) {
              break; // Stop sliding in this direction if off board or blocked
            }
            moves.push({ from: pos, to: { row: nr, col: nc } });
            step++;
          }
        }
      } else {
        // American checkers: a king moves exactly one square, in any of the 4 diagonal directions.
        for (const dir of DIAGONAL_DIRS) {
          const nr = pos.row + dir.dr;
          const nc = pos.col + dir.dc;
          if (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
            moves.push({ from: pos, to: { row: nr, col: nc } });
          }
        }
      }
    } else {
      for (const dir of this.getManMoveDirections(piece.color)) {
        const nr = pos.row + dir.dr;
        const nc = pos.col + dir.dc;

        if (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
          moves.push({ from: pos, to: { row: nr, col: nc } });
        }
      }
    }

    return moves;
  }

  private getValidJumpsForPiece(start: Position, piece: Piece, currentPos: Position = start, capturedSoFar: Position[] = []): Move[] {
    if (piece.type === PieceType.KING && this.rules.flyingKings) {
      return this.getFlyingKingJumps(start, piece, currentPos, capturedSoFar);
    }
    return this.getSingleStepJumps(start, piece, currentPos, capturedSoFar);
  }

  // Used by men (always) and by non-flying kings (American variant): the capturing
  // piece jumps exactly one square over an adjacent opponent piece, landing on the
  // square immediately beyond it.
  private getSingleStepJumps(start: Position, piece: Piece, currentPos: Position, capturedSoFar: Position[]): Move[] {
    const jumps: Move[] = [];
    const dirs = piece.type === PieceType.KING ? DIAGONAL_DIRS : this.getManCaptureDirections(piece.color);

    for (const dir of dirs) {
      const overR = currentPos.row + dir.dr;
      const overC = currentPos.col + dir.dc;
      const landR = currentPos.row + dir.dr * 2;
      const landC = currentPos.col + dir.dc * 2;

      if (!this.isValidPos(landR, landC)) continue;

      const overPiece = this.board[overR][overC];
      const landPos = this.board[landR][landC];

      // FMJD 4.8: forbidden to jump over the same opponent piece more than once
      // within a single multi-capture sequence (crossing the same empty square twice
      // is fine, and isn't checked here since only occupied-then-captured squares matter).
      const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);

      if (overPiece && overPiece.color !== piece.color && landPos === null && !alreadyCaptured) {
        const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

        // Temporarily apply the jump so we can look for further jumps from the
        // landing square (FMJD 4.5/4.6: multi-jump chains are mandatory to continue
        // if available). Captured pieces stay on the board during this search — FMJD
        // 4.11: they are only lifted once the whole sequence is complete — which is
        // exactly why `alreadyCaptured` (not board emptiness) is what prevents
        // recapturing the same piece.
        const originalCurrent = this.board[currentPos.row][currentPos.col];
        this.board[currentPos.row][currentPos.col] = null;
        this.board[landR][landC] = piece;

        const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

        this.board[currentPos.row][currentPos.col] = originalCurrent;
        this.board[landR][landC] = null;

        if (subJumps.length > 0) {
          jumps.push(...subJumps);
        } else {
          jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
        }
      }
    }

    return jumps;
  }

  // Flying king captures (international variant only): the king may be any distance
  // from the opponent piece it captures, and chooses freely among the empty squares
  // beyond it to land on (FMJD 4.3), including turning onto a perpendicular diagonal
  // mid-sequence (FMJD 4.6).
  private getFlyingKingJumps(start: Position, piece: Piece, currentPos: Position, capturedSoFar: Position[]): Move[] {
    const jumps: Move[] = [];

    for (const dir of DIAGONAL_DIRS) {
      let step = 1;
      let opponentFoundPos: Position | null = null;

      while (true) {
        const r = currentPos.row + dir.dr * step;
        const c = currentPos.col + dir.dc * step;

        if (!this.isValidPos(r, c)) break;

        const cell = this.board[r][c];

        if (cell !== null) {
          if (cell.color === piece.color) {
            break; // Blocked by own piece (FMJD 4.7)
          }
          if (opponentFoundPos) {
            break; // Two opponents in a row on this diagonal: can't jump past the first
          }
          const alreadyCaptured = capturedSoFar.some(cap => cap.row === r && cap.col === c);
          if (alreadyCaptured) {
            break; // FMJD 4.8: can't jump the same opponent piece twice
          }
          opponentFoundPos = { row: r, col: c };
        } else if (opponentFoundPos !== null) {
          // Empty square after finding an opponent: a legal landing square.
          const newCaptured = [...capturedSoFar, opponentFoundPos];
          const landR = r;
          const landC = c;

          const originalCurrent = this.board[currentPos.row][currentPos.col];
          this.board[currentPos.row][currentPos.col] = null;
          this.board[landR][landC] = piece;

          const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

          this.board[currentPos.row][currentPos.col] = originalCurrent;
          this.board[landR][landC] = null;

          if (subJumps.length > 0) {
            jumps.push(...subJumps);
          } else {
            jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
          }
        }

        step++;
      }
    }

    return jumps;
  }

  public makeMove(move: Move): boolean {
    const legalMoves = this.getLegalMoves();

    const exactLegalMove = legalMoves.find(m =>
      m.from.row === move.from.row && m.from.col === move.from.col &&
      m.to.row === move.to.row && m.to.col === move.to.col,
    );

    if (!exactLegalMove) {
      return false; // Illegal move
    }

    const piece = this.board[move.from.row][move.from.col];
    if (!piece) return false;
    const wasMan = piece.type === PieceType.MAN;

    // Apply move
    this.board[move.to.row][move.to.col] = piece;
    this.board[move.from.row][move.from.col] = null;

    // Remove captured pieces (only now — FMJD 4.11 — regardless of how many were
    // crossed during the search above)
    const wasCapture = !!(exactLegalMove.captured && exactLegalMove.captured.length > 0);
    if (exactLegalMove.captured) {
      for (const cap of exactLegalMove.captured) {
        this.board[cap.row][cap.col] = null;
      }
    }

    // King promotion. FMJD 3.5/4.15: promotion is based on where the piece FINALLY
    // stops, not any square it merely passed over mid-capture — which `move.to` (the
    // end of the whole turn, single or multi-jump) already represents correctly.
    if (piece.type === PieceType.MAN) {
      if (piece.color === PieceColor.LIGHT && move.to.row === 0) {
        piece.type = PieceType.KING;
      } else if (piece.color === PieceColor.DARK && move.to.row === this.rules.boardSize - 1) {
        piece.type = PieceType.KING;
      }
    }

    // Draw-condition bookkeeping. FMJD 6.2: the no-progress counter resets on a
    // capture, or (for international rules specifically) on a man move — a
    // king-only, non-capturing sequence is what's allowed to run the counter up.
    if (wasCapture || (this.rules.resetOnManMove && wasMan)) {
      this.halfMovesSinceProgress = 0;
    } else {
      this.halfMovesSinceProgress++;
    }

    // Switch turns
    this.currentTurn = this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;

    this.recordPosition();

    return true;
  }

  private positionSignature(): string {
    const size = this.rules.boardSize;
    let sig = this.currentTurn + '|';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const p = this.board[r][c];
        sig += p ? p.color + p.type : '.';
      }
    }
    return sig;
  }

  private recordPosition(): void {
    const sig = this.positionSignature();
    this.positionCounts.set(sig, (this.positionCounts.get(sig) ?? 0) + 1);
  }

  // FMJD 6.1 (threefold repetition) and 6.2 (no-progress rule). Note this
  // deliberately does not implement FMJD 6.3/6.4 (the reduced move limits that apply
  // in specific low-piece-count endgames) — that's a known simplification.
  public getDrawReason(): 'threefold-repetition' | 'no-progress' | null {
    if (this.halfMovesSinceProgress >= this.rules.drawNoProgressHalfMoves) {
      return 'no-progress';
    }
    const sig = this.positionSignature();
    if ((this.positionCounts.get(sig) ?? 0) >= 3) {
      return 'threefold-repetition';
    }
    return null;
  }

  public isDraw(): boolean {
    return this.getDrawReason() !== null;
  }

  // Check if game is over: either the current player has no legal moves, or a draw
  // condition has been met.
  public isGameOver(): boolean {
    return this.getLegalMoves().length === 0 || this.isDraw();
  }

  // Returns the winning color, or null if the game isn't over or ended in a draw.
  // FMJD 7.2.2: a player who has the move but cannot move (all pieces blocked, or no
  // pieces left, which is the same condition — zero legal moves) loses.
  public getWinner(): PieceColor | null {
    if (this.isDraw()) return null;
    if (this.getLegalMoves().length === 0) {
      return this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    }
    return null;
  }
}
