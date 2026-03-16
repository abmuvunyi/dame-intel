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

export enum GameVariant {
  STANDARD = 'STANDARD',
  INTERNATIONAL = 'INTERNATIONAL'
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

  // Generate the board
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    const pieceRows = this.variant === GameVariant.INTERNATIONAL ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < pieceRows; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces (bottom rows)
    for (let row = this.BOARD_SIZE - pieceRows; row < this.BOARD_SIZE; row++) {
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

    if (jumps.length > 0) {
      if (this.variant === GameVariant.INTERNATIONAL) {
         // In International draughts, you must take the sequence with the maximum number of captures.
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

  private getMoveDirections(piece: Piece): { dr: number, dc: number }[] {
    if (piece.type === PieceType.KING) {
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }
    // Men: Light moves UP (-1), Dark moves DOWN (+1)
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getJumpDirections(piece: Piece): { dr: number, dc: number }[] {
     if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.MAN) {
        // Men can capture backwards in International Draughts
        return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
     }
     return this.getMoveDirections(piece);
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
       // Flying kings normal moves
       for (const dir of dirs) {
          for (let step = 1; step < this.BOARD_SIZE; step++) {
             const nr = pos.row + dir.dr * step;
             const nc = pos.col + dir.dc * step;
             if (!this.isValidPos(nr, nc)) break;
             if (this.board[nr][nc] !== null) break;
             moves.push({ from: pos, to: { row: nr, col: nc } });
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

    if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
       // Flying kings jumps
       for (const dir of dirs) {
          let foundOpponent = false;
          let overR = -1;
          let overC = -1;

          for (let step = 1; step < this.BOARD_SIZE; step++) {
             const nr = currentPos.row + dir.dr * step;
             const nc = currentPos.col + dir.dc * step;

             if (!this.isValidPos(nr, nc)) break;

             const p = this.board[nr][nc];

             if (!foundOpponent) {
                if (p !== null) {
                   if (p.color === piece.color) break; // Blocked by own piece
                   // Check if already captured in this sequence
                   const alreadyCaptured = capturedSoFar.some(cap => cap.row === nr && cap.col === nc);
                   if (alreadyCaptured) break; // Cannot jump same piece twice

                   foundOpponent = true;
                   overR = nr;
                   overC = nc;
                }
             } else {
                if (p !== null) break; // Must land on empty square, block if another piece is there

                // We have a valid landing spot
                const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

                // Temporarily apply the jump to check for further jumps
                const originalCurrent = this.board[currentPos.row][currentPos.col];
                this.board[currentPos.row][currentPos.col] = null;
                this.board[nr][nc] = piece;

                const subJumps = this.getValidJumpsForPiece(start, piece, { row: nr, col: nc }, newCaptured);

                // Revert board
                this.board[currentPos.row][currentPos.col] = originalCurrent;
                this.board[nr][nc] = null;

                if (subJumps.length > 0) {
                   jumps.push(...subJumps);
                } else {
                   jumps.push({ from: start, to: { row: nr, col: nc }, captured: newCaptured });
                }
             }
          }
       }
    } else {
       // Normal jumps (Standard rules + International men backward captures)
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
           this.board[currentPos.row][currentPos.col] = null;
           this.board[landR][landC] = piece;

           // For standard draughts men, we stop checking if they promote to king during a multi-jump sequence
           // Wait, standard rules say a man cannot continue jumping if it promotes to a king.
           // In International, it can only continue if the jump lands it back out of the king row (it doesn't promote in that case).
           // This level of detail is a bit beyond the basic requested rules unless needed, but let's just do basic jumps.

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
    }

    return jumps;
  }

  public makeMove(move: Move): boolean {
    const legalMoves = this.getLegalMoves();

    // Check if move is in legal moves (deep compare positions)
    const exactLegalMove = legalMoves.find(m =>
        m.from.row === move.from.row && m.from.col === move.from.col &&
        m.to.row === move.to.row && m.to.col === move.to.col
    );

    if (!exactLegalMove) {
      return false; // Illegal move
    }

    const piece = this.board[move.from.row][move.from.col];
    if (!piece) return false;

    // Apply move
    this.board[move.to.row][move.to.col] = piece;
    this.board[move.from.row][move.from.col] = null;

    // Remove captured pieces
    if (exactLegalMove.captured) {
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
       return this.currentTurn === PieceColor.LIGHT ? PieceColor.DARK : PieceColor.LIGHT;
    }
    return null;
  }
}
