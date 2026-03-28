export enum PieceColor {
  LIGHT = 'L', // Usually White or Red
  DARK = 'D',  // Usually Black
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export enum GameVariant {
  STANDARD = 'STANDARD', // 8x8
  INTERNATIONAL = 'INTERNATIONAL', // 10x10
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
  private readonly variant: GameVariant;
  private readonly BOARD_SIZE: number;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  public getVariant(): GameVariant {
    return this.variant;
  }

  // Generate an 8x8 or 10x10 standard Draughts board
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
        // Forced maximum capture rule
        let maxJumps = 0;
        for (const jump of jumps) {
          if (jump.captured && jump.captured.length > maxJumps) {
            maxJumps = jump.captured.length;
          }
        }
        return jumps.filter(j => j.captured && j.captured.length === maxJumps);
      }
      return jumps;
    }

    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getMoveDirections(piece: Piece, isCapture: boolean = false): { dr: number, dc: number }[] {
    if (piece.type === PieceType.KING) {
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }

    // In international draughts, men can capture backwards
    if (this.variant === GameVariant.INTERNATIONAL && isCapture) {
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }

    // Men normal moves: Light moves UP (-1), Dark moves DOWN (+1)
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece, false);

    for (const dir of dirs) {
      if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
        // Flying kings can move multiple steps
        let steps = 1;
        while (true) {
          const nr = pos.row + dir.dr * steps;
          const nc = pos.col + dir.dc * steps;

          if (!this.isValidPos(nr, nc)) break;
          if (this.board[nr][nc] !== null) break;

          moves.push({ from: pos, to: { row: nr, col: nc } });
          steps++;
        }
      } else {
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
    const dirs = this.getMoveDirections(piece, true);

    for (const dir of dirs) {
      if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
        // Flying kings can jump over multiple empty squares, then an opponent piece, then land on multiple empty squares
        let steps = 1;
        let foundOpponent = false;
        let overPos: Position | null = null;

        while (true) {
          const checkR = currentPos.row + dir.dr * steps;
          const checkC = currentPos.col + dir.dc * steps;

          if (!this.isValidPos(checkR, checkC)) break;

          const checkPiece = this.board[checkR][checkC];

          if (!foundOpponent) {
            if (checkPiece !== null) {
              if (checkPiece.color === piece.color) {
                break; // Blocked by own piece
              } else {
                // Check if already captured in this sequence
                const alreadyCaptured = capturedSoFar.some(cap => cap.row === checkR && cap.col === checkC);
                if (alreadyCaptured) {
                  break; // Can't jump same piece twice
                }
                foundOpponent = true;
                overPos = { row: checkR, col: checkC };
              }
            }
          } else {
            // Found opponent, now looking for empty landing spots
            if (checkPiece !== null) {
              break; // Blocked by another piece immediately after or along the way
            }

            // This is a valid landing spot
            const landR = checkR;
            const landC = checkC;

            const newCaptured = [...capturedSoFar, overPos!];

            // Temporarily apply the jump to check for further jumps
            const originalCurrent = this.board[currentPos.row][currentPos.col];
            this.board[currentPos.row][currentPos.col] = null;
            this.board[landR][landC] = piece;

            const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

            // Revert board
            this.board[currentPos.row][currentPos.col] = originalCurrent;
            this.board[landR][landC] = null;

            if (subJumps.length > 0) {
              jumps.push(...subJumps);
            } else {
              jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
            }
          }
          steps++;
        }

      } else {
        const overR = currentPos.row + dir.dr;
        const overC = currentPos.col + dir.dc;
        const landR = currentPos.row + dir.dr * 2;
        const landC = currentPos.col + dir.dc * 2;

        // Check bounds
        if (!this.isValidPos(landR, landC)) continue;

        const overPiece = this.board[overR][overC];
        const landPos = this.board[landR][landC];

        // We can jump if there's an opponent piece and the landing spot is empty
        // Also ensure we haven't already captured this exact piece in the current sequence (multi-jump loop prevention)
        const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);

        if (overPiece && overPiece.color !== piece.color && landPos === null && !alreadyCaptured) {
          const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

          // Temporarily apply the jump to check for further jumps
          const originalCurrent = this.board[currentPos.row][currentPos.col];
          this.board[currentPos.row][currentPos.col] = null;
          this.board[landR][landC] = piece;

          // Standard rule: King promotion happens immediately if a piece lands on the promotion row during a jump sequence.
          // In standard, the turn also ends.
          let promotedInJump = false;
          let originalPieceType = piece.type;

          if (this.variant === GameVariant.STANDARD && piece.type === PieceType.MAN) {
            if ((piece.color === PieceColor.LIGHT && landR === 0) ||
                (piece.color === PieceColor.DARK && landR === this.BOARD_SIZE - 1)) {
              piece.type = PieceType.KING;
              promotedInJump = true;
            }
          }

          let subJumps: Move[] = [];

          // In standard variant, if promoted during a jump, the turn ends immediately.
          if (!promotedInJump) {
            subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);
          }

          // Revert board
          this.board[currentPos.row][currentPos.col] = originalCurrent;
          this.board[landR][landC] = null;
          piece.type = originalPieceType;

          if (subJumps.length > 0) {
             jumps.push(...subJumps);
          } else {
             // End of a jump sequence
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
    // Standard rule: A piece promotes if it ends its move on the back rank, OR if it lands on it during a jump sequence (already handled and its turn ends).
    // International rule: A piece promotes ONLY if it *ends* its move on the back rank.
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
