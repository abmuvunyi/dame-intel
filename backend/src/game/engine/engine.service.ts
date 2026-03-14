export enum PieceColor {
  LIGHT = 'L', // Usually White or Red
  DARK = 'D',  // Usually Black
}

export enum PieceType {
  MAN = 'M',
  KING = 'K',
}

export enum GameVariant {
  STANDARD = 'STANDARD',       // 8x8, 12 pieces
  INTERNATIONAL = 'INTERNATIONAL', // 10x10, 20 pieces, flying kings, backwards capture
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
  private readonly BOARD_SIZE: number;
  private readonly variant: GameVariant;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  public getVariant(): GameVariant {
    return this.variant;
  }

  // Generate an 8x8 standard or 10x10 international Draughts board
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

    const rowsPerSide = this.variant === GameVariant.INTERNATIONAL ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < rowsPerSide; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces (bottom rows)
    for (let row = this.BOARD_SIZE - rowsPerSide; row < this.BOARD_SIZE; row++) {
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
    let normalMoves: Move[] = [];

    for (let row = 0; row < this.BOARD_SIZE; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        const piece = this.board[row][col];
        if (piece && piece.color === this.currentTurn) {
          const pos = { row, col };
          const pieceJumps = this.getValidJumpsForPiece(pos, piece);
          if (pieceJumps.length > 0) {
            jumps.push(...pieceJumps);
          } else {
            normalMoves.push(...this.getValidNormalMovesForPiece(pos, piece));
          }
        }
      }
    }

    // Forced capture rule: if any jump is possible, only jumps are legal
    if (jumps.length > 0) {
      if (this.variant === GameVariant.INTERNATIONAL) {
        // Maximum capture rule: only jumps that capture the most pieces are legal
        let maxCaptured = 0;
        for (const jump of jumps) {
          const numCaptured = jump.captured?.length || 0;
          if (numCaptured > maxCaptured) {
            maxCaptured = numCaptured;
          }
        }
        return jumps.filter(jump => (jump.captured?.length || 0) === maxCaptured);
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

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    for (const dir of dirs) {
      if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
        // Flying kings: can move any number of empty squares
        let dist = 1;
        while (true) {
          const nr = pos.row + dir.dr * dist;
          const nc = pos.col + dir.dc * dist;
          if (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
            moves.push({ from: pos, to: { row: nr, col: nc } });
            dist++;
          } else {
            break;
          }
        }
      } else {
        // Standard moves for men and standard kings (1 step)
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

    let jumpDirs = this.getMoveDirections(piece);
    if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.MAN) {
      // In International variant, men can capture backward
      jumpDirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }

    for (const dir of jumpDirs) {
      if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
        // International Kings can fly: move along empty squares before and after the captured piece
        let distToPiece = 1;
        while (true) {
          const overR = currentPos.row + dir.dr * distToPiece;
          const overC = currentPos.col + dir.dc * distToPiece;

          if (!this.isValidPos(overR, overC)) break;

          const overPiece = this.board[overR][overC];
          if (overPiece) {
            // Found a piece. Can we capture it?
            const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);
            if (overPiece.color !== piece.color && !alreadyCaptured) {
              // Now we can land on any empty square after it
              let distAfterPiece = 1;
              let hasLanded = false;
              while (true) {
                const landR = overR + dir.dr * distAfterPiece;
                const landC = overC + dir.dc * distAfterPiece;

                if (!this.isValidPos(landR, landC)) break;
                if (this.board[landR][landC] !== null) {
                  // Must land on empty squares, cannot jump over two pieces
                  // Note: The captured piece is not removed yet during a multi-jump sequence,
                  // but we cannot jump over the same piece again.
                  break;
                }

                hasLanded = true;
                const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

                // Temporarily apply the jump
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

                distAfterPiece++;
              }
            }
            break; // Stop looking further in this direction whether we captured or not
          }
          distToPiece++;
        }
      } else {
        // Standard jumps for men, or standard kings
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
