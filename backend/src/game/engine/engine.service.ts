export enum PieceColor {
  LIGHT = 'L', // Usually White or Red
  DARK = 'D',  // Usually Black
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export enum GameVariant {
  STANDARD_8X8 = 'STANDARD_8X8',
  INTERNATIONAL_10X10 = 'INTERNATIONAL_10X10',
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

  constructor(variant: GameVariant = GameVariant.STANDARD_8X8) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL_10X10 ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  // Generate the Draughts board
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

    const rowsOfPieces = this.variant === GameVariant.INTERNATIONAL_10X10 ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < rowsOfPieces; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        // International checkers standard is bottom-left dark square, but here we keep logic consistent with parity
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces (bottom rows)
    for (let row = this.BOARD_SIZE - rowsOfPieces; row < this.BOARD_SIZE; row++) {
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
      if (this.variant === GameVariant.INTERNATIONAL_10X10) {
        // International Rules: Must choose the jump sequence that captures the maximum number of pieces.
        const maxCaptures = Math.max(...jumps.map(j => j.captured ? j.captured.length : 0));
        return jumps.filter(j => j.captured && j.captured.length === maxCaptures);
      }
      return jumps;
    }

    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getMoveDirections(piece: Piece, isCapturing: boolean = false): { dr: number, dc: number }[] {
    const allDirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];

    if (piece.type === PieceType.KING) {
      return allDirs;
    }

    // In International 10x10, men can capture backwards
    if (isCapturing && this.variant === GameVariant.INTERNATIONAL_10X10) {
      return allDirs;
    }

    // Men: Light moves UP (-1), Dark moves DOWN (+1)
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece, false);

    const isFlyingKing = this.variant === GameVariant.INTERNATIONAL_10X10 && piece.type === PieceType.KING;

    for (const dir of dirs) {
      let step = 1;
      while (true) {
        const nr = pos.row + dir.dr * step;
        const nc = pos.col + dir.dc * step;

        if (!this.isValidPos(nr, nc)) break;

        if (this.board[nr][nc] === null) {
          moves.push({ from: pos, to: { row: nr, col: nc } });
          if (!isFlyingKing) break; // Normal pieces or standard kings only move 1 square
          step++;
        } else {
          break; // Blocked by a piece
        }
      }
    }

    return moves;
  }

  private getValidJumpsForPiece(start: Position, piece: Piece, currentPos: Position = start, capturedSoFar: Position[] = []): Move[] {
    const jumps: Move[] = [];
    const dirs = this.getMoveDirections(piece, true);

    const isFlyingKing = this.variant === GameVariant.INTERNATIONAL_10X10 && piece.type === PieceType.KING;

    for (const dir of dirs) {
      let step = 1;
      let foundPieceToJump: Position | null = null;

      while (true) {
        const nr = currentPos.row + dir.dr * step;
        const nc = currentPos.col + dir.dc * step;

        if (!this.isValidPos(nr, nc)) break;

        const encounteredPiece = this.board[nr][nc];

        if (encounteredPiece !== null) {
          if (encounteredPiece.color === piece.color) {
            break; // Blocked by our own piece
          } else {
            // Found opponent piece
            if (foundPieceToJump) {
               break; // Can't jump over two pieces in the same line
            }

            // Check if already captured in this sequence (multi-jump loop prevention)
            const alreadyCaptured = capturedSoFar.some(cap => cap.row === nr && cap.col === nc);
            if (alreadyCaptured) {
               break;
            }

            foundPieceToJump = { row: nr, col: nc };
          }
        } else if (foundPieceToJump) {
          // Empty square after finding a piece to jump! We can land here.
          const landR = nr;
          const landC = nc;

          const newCaptured = [...capturedSoFar, foundPieceToJump];

          // Temporarily apply the jump to check for further jumps
          const originalCurrent = this.board[currentPos.row][currentPos.col];
          const capturedOriginal = this.board[foundPieceToJump.row][foundPieceToJump.col];

          this.board[currentPos.row][currentPos.col] = null;
          this.board[foundPieceToJump.row][foundPieceToJump.col] = null;
          this.board[landR][landC] = piece;

          // Note: When a man reaches the king row during a capture sequence,
          // International rules state it doesn't promote UNLESS it finishes the move there.
          // Since it's a bit complex, we keep the piece as is for the sub-jump search.
          const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

          // Revert board
          this.board[currentPos.row][currentPos.col] = originalCurrent;
          this.board[foundPieceToJump.row][foundPieceToJump.col] = capturedOriginal;
          this.board[landR][landC] = null;

          if (subJumps.length > 0) {
             jumps.push(...subJumps);
          } else {
             // End of a jump sequence
             jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
          }

          if (!isFlyingKing) {
            break; // Standard pieces can only land immediately after the jumped piece
          }
        }

        if (!isFlyingKing && !foundPieceToJump) {
           // Standard pieces only check exactly 1 square away for a piece to jump
           if (step === 1) {
              step++;
              continue;
           } else {
              break;
           }
        }

        step++;
      }
    }

    return jumps;
  }

  public makeMove(move: Move): boolean {
    const legalMoves = this.getLegalMoves();

    // Check if move is in legal moves (deep compare positions)
    const isLegal = legalMoves.some(m =>
      m.from.row === move.from.row && m.from.col === move.from.col &&
      m.to.row === move.to.row && m.to.col === move.to.col
    );

    if (!isLegal) {
      return false; // Illegal move
    }

    // Find the exact legal move to get the captured pieces
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

  // Check if game is over (no legal moves for the current player)
  public isGameOver(): boolean {
    return this.getLegalMoves().length === 0;
  }

  public getWinner(): PieceColor | null {
    if (this.isGameOver()) {
       // If current player has no moves, the other player wins
       return this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    }
    return null;
  }
}
