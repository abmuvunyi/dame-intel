export enum PieceColor {
  LIGHT = 'L', // Usually White or Red
  DARK = 'D',  // Usually Black
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export enum GameVariant {
  STANDARD = 'STANDARD',
  INTERNATIONAL = 'INTERNATIONAL',
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

export class DraughtsEngine {
  private board: BoardState;
  private currentTurn: PieceColor;
  public readonly BOARD_SIZE: number;
  public readonly variant: GameVariant;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  // Generate an 8x8 standard or 10x10 international Draughts board
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    const rowsPerPlayer = this.variant === GameVariant.INTERNATIONAL ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < rowsPerPlayer; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces (bottom rows)
    for (let row = this.BOARD_SIZE - rowsPerPlayer; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
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
  public getBoardString(): string {
    let result = '';
    for (let r = 0; r < this.BOARD_SIZE; r++) {
      for (let c = 0; c < this.BOARD_SIZE; c++) {
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

  // Load a custom board state (useful for tests and puzzles)
  public loadBoard(board: BoardState, turn: PieceColor): void {
    this.board = board;
    this.currentTurn = turn;
  }

  // Get all legal moves for the current player
  public getLegalMoves(): Move[] {
    const jumps: Move[] = [];
    const normalMoves: Move[] = [];

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
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

    // Forced capture rule: if any jump is possible, only jumps are legal
    if (jumps.length > 0) {
      if (this.variant === GameVariant.INTERNATIONAL) {
        // International rule: must capture the maximum number of pieces
        let maxCaptures = 0;
        for (const jump of jumps) {
          if (jump.captured && jump.captured.length > maxCaptures) {
            maxCaptures = jump.captured.length;
          }
        }
        return jumps.filter(jump => jump.captured && jump.captured.length === maxCaptures);
      }
      return jumps;
    }
    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getMoveDirections(piece: Piece): { dr: number, dc: number }[] {
    if (piece.type === PieceType.KING) {
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }
    // Men: Light moves UP (-1), Dark moves DOWN (+1)
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getJumpDirections(piece: Piece): { dr: number, dc: number }[] {
    if (piece.type === PieceType.KING || this.variant === GameVariant.INTERNATIONAL) {
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
      // Flying king normal moves
      for (const dir of dirs) {
        let nr = pos.row + dir.dr;
        let nc = pos.col + dir.dc;
        while (this.isValidPos(nr, nc)) {
          if (this.board[nr][nc] === null) {
            moves.push({ from: pos, to: { row: nr, col: nc } });
          } else {
            break; // Blocked by a piece
          }
          nr += dir.dr;
          nc += dir.dc;
        }
      }
    } else {
      for (const dir of dirs) {
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
    const jumps: Move[] = [];
    const dirs = this.getJumpDirections(piece);

    if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
      // Flying king jumps
      for (const dir of dirs) {
        let r = currentPos.row + dir.dr;
        let c = currentPos.col + dir.dc;
        let foundOpponent: Position | null = null;
        let opponentPiece: Piece | null = null;

        while (this.isValidPos(r, c)) {
          const p = this.board[r][c];
          if (p !== null) {
            if (p.color === piece.color) break; // Blocked by own piece
            if (foundOpponent) break; // Two pieces in a row

            const alreadyCaptured = capturedSoFar.some(cap => cap.row === r && cap.col === c);
            if (alreadyCaptured) break; // Already captured this sequence

            foundOpponent = { row: r, col: c };
            opponentPiece = p;
          } else if (foundOpponent) {
             // Found an empty square after an opponent piece
             const landR = r;
             const landC = c;
             const newCaptured = [...capturedSoFar, foundOpponent];

             // Temporarily apply the jump to check for further jumps
             const originalCurrent = this.board[currentPos.row][currentPos.col];
             const originalOpponent = this.board[foundOpponent.row][foundOpponent.col];

             this.board[currentPos.row][currentPos.col] = null;
             this.board[foundOpponent.row][foundOpponent.col] = null; // Important: remove the captured piece for sub-jumps
             this.board[landR][landC] = piece;

             const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

             // Revert board
             this.board[currentPos.row][currentPos.col] = originalCurrent;
             this.board[foundOpponent.row][foundOpponent.col] = originalOpponent;
             this.board[landR][landC] = null;

             if (subJumps.length > 0) {
                jumps.push(...subJumps);
             } else {
                jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
             }
          }
          r += dir.dr;
          c += dir.dc;
        }
      }
    } else {
      // Normal man jump, and standard king jump
      for (const dir of dirs) {
        const overR = currentPos.row + dir.dr;
        const overC = currentPos.col + dir.dc;
        const landR = currentPos.row + dir.dr * 2;
        const landC = currentPos.col + dir.dc * 2;

        if (!this.isValidPos(landR, landC)) continue;

        const overPiece = this.board[overR][overC];
        const landPos = this.board[landR][landC];

        const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);

        if (overPiece && overPiece.color !== piece.color && landPos === null && !alreadyCaptured) {
          const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

          const originalCurrent = this.board[currentPos.row][currentPos.col];
          const originalOpponent = this.board[overR][overC];

          this.board[currentPos.row][currentPos.col] = null;
          this.board[overR][overC] = null; // remove the captured piece for subjumps
          this.board[landR][landC] = piece;

          const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

          this.board[currentPos.row][currentPos.col] = originalCurrent;
          this.board[overR][overC] = originalOpponent;
          this.board[landR][landC] = null;

          if (subJumps.length > 0) {
             jumps.push(...subJumps);
          } else {
             jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
          }
        }
      }
    }

    return jumps;
  }

  public makeMove(move: Move): boolean {
    const legalMoves = this.getLegalMoves();

    const isLegal = legalMoves.some(m =>
      m.from.row === move.from.row && m.from.col === move.from.col &&
      m.to.row === move.to.row && m.to.col === move.to.col
    );

    if (!isLegal) {
      return false; // Illegal move
    }

    const exactLegalMove = legalMoves.find(m =>
        m.from.row === move.from.row && m.from.col === move.from.col &&
        m.to.row === move.to.row && m.to.col === move.to.col
    );

    const piece = this.board[move.from.row][move.from.col];
    if (!piece) return false;

    // Apply move
    this.board[move.to.row][move.to.col] = piece;
    this.board[move.from.row][move.from.col] = null;

    // Remove captured pieces
    if (exactLegalMove && exactLegalMove.captured) {
      for (const cap of exactLegalMove.captured) {
        this.board[cap.row][cap.col] = null;
      }
    }

    // King promotion
    if (piece.type === PieceType.MAN) {
      // In International draughts, you only crown if the move ENDS on the promotion square,
      // not if it merely passes through during a jump.
      // Since makeMove is only called with the FINAL destination, we can safely promote here.
      if (piece.color === PieceColor.LIGHT && move.to.row === 0) {
        piece.type = PieceType.KING;
      } else if (piece.color === PieceColor.DARK && move.to.row === this.BOARD_SIZE - 1) {
        piece.type = PieceType.KING;
      }
    }

    // Switch turns
    this.currentTurn = this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;

    return true;
  }

  public isGameOver(): boolean {
    return this.getLegalMoves().length === 0;
  }

  public getWinner(): PieceColor | null {
    if (this.isGameOver()) {
       return this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    }
    return null;
  }
}
