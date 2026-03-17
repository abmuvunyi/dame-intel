export enum GameVariant {
  STANDARD = 'STANDARD',
  INTERNATIONAL = 'INTERNATIONAL'
}

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

  // Generate standard or international Draughts board
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));

    const rowsPerPlayer = this.BOARD_SIZE === 10 ? 4 : 3;

    // Dark pieces
    for (let row = 0; row < rowsPerPlayer; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
        if ((row + col) % 2 !== 0) {
          board[row][col] = { color: PieceColor.DARK, type: PieceType.MAN };
        }
      }
    }

    // Light pieces
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
        // Longest jump rule for International
        let maxJumpLength = 0;
        for (const jump of jumps) {
          if (jump.captured && jump.captured.length > maxJumpLength) {
            maxJumpLength = jump.captured.length;
          }
        }
        return jumps.filter(j => j.captured && j.captured.length === maxJumpLength);
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

  private getCaptureDirections(piece: Piece): { dr: number, dc: number }[] {
    if (piece.type === PieceType.KING || this.variant === GameVariant.INTERNATIONAL) {
      // Kings and International Men can capture in all 4 directions
      return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
    }
    // Standard Men can only capture forward
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
      // Flying King normal moves
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
      // Standard normal moves
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
    const dirs = this.getCaptureDirections(piece);

    for (const dir of dirs) {
      if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
        // Flying King jump
        let overR = currentPos.row + dir.dr;
        let overC = currentPos.col + dir.dc;
        let capturedPos: Position | null = null;

        // Find the first piece in this direction
        while (this.isValidPos(overR, overC)) {
          const overPiece = this.board[overR][overC];

          if (overPiece) {
            // Found a piece
            if (overPiece.color === piece.color) {
              break; // Blocked by own piece
            }

            const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);
            if (alreadyCaptured) {
              break; // Already captured this piece in sequence
            }

            capturedPos = { row: overR, col: overC };
            break;
          }

          overR += dir.dr;
          overC += dir.dc;
        }

        if (capturedPos) {
          // Check all possible landing spots after the captured piece
          let landR = capturedPos.row + dir.dr;
          let landC = capturedPos.col + dir.dc;

          let subJumpsFoundForThisDirection = false;

          while (this.isValidPos(landR, landC) && this.board[landR][landC] === null) {
            const newCaptured = [...capturedSoFar, capturedPos];

            // Temporarily apply jump
            const originalCurrent = this.board[currentPos.row][currentPos.col];
            this.board[currentPos.row][currentPos.col] = null;
            this.board[landR][landC] = piece;

            // In international draughts, a king cannot land and change direction immediately *if* there's a jump available
            // Actually, we must check all sub-jumps
            const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

            // Revert board
            this.board[currentPos.row][currentPos.col] = originalCurrent;
            this.board[landR][landC] = null;

            if (subJumps.length > 0) {
              jumps.push(...subJumps);
              subJumpsFoundForThisDirection = true;
            } else {
              // Only add this exact landing spot as a terminal jump if no further jumps can be made from it
              jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
            }

            landR += dir.dr;
            landC += dir.dc;
          }

          // Important for International Rules longest jump:
          // If sub-jumps were found from SOME landing squares in this direction,
          // those paths must be taken. The single jumps added above (where subJumps.length === 0)
          // will be filtered out by the longest jump rule if they are sub-optimal.
        }
      } else {
        // Standard Jump (Men, and Standard Kings)
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

          // Note: In some variants, a man cannot be promoted mid-jump and continue jumping as a king.
          // In international draughts, a man promoting to a king ends the turn, UNLESS it lands on the king row
          // and can continue jumping backwards *as a man*. We don't implement full complex promotion rules here,
          // but just basic multi-jumps.

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
