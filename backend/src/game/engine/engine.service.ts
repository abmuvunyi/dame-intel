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
  STANDARD = 'STANDARD', // 8x8
  INTERNATIONAL = 'INTERNATIONAL', // 10x10
}

export class DraughtsEngine {
  private board: BoardState;
  private currentTurn: PieceColor;
  public readonly variant: GameVariant;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  get BOARD_SIZE(): number {
    return this.variant === GameVariant.INTERNATIONAL ? 10 : 8;
  }

  // Generate the Draughts board based on the variant
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
    const startLightRow = this.BOARD_SIZE - rowsPerPlayer;
    for (let row = startLightRow; row < this.BOARD_SIZE; row++) {
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
        // International rules: Must capture the maximum possible number of pieces
        let maxCaptures = 0;
        for (const j of jumps) {
          if (j.captured && j.captured.length > maxCaptures) {
            maxCaptures = j.captured.length;
          }
        }
        return jumps.filter(j => j.captured && j.captured.length === maxCaptures);
      }
      return jumps;
    }

    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getMoveDirections(piece: Piece, isJump: boolean = false): { dr: number, dc: number }[] {
    const allDirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];

    if (piece.type === PieceType.KING) {
      return allDirs;
    }

    // International rules: Men can capture backward
    if (this.variant === GameVariant.INTERNATIONAL && isJump) {
      return allDirs;
    }

    // Men normal move: Light moves UP (-1), Dark moves DOWN (+1)
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
    return [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
      // Flying kings: can move any number of empty squares diagonally
      for (const dir of dirs) {
        let nr = pos.row + dir.dr;
        let nc = pos.col + dir.dc;
        while (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
          moves.push({ from: pos, to: { row: nr, col: nc } });
          nr += dir.dr;
          nc += dir.dc;
        }
      }
    } else {
      // Standard king or normal man
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
    const dirs = this.getMoveDirections(piece, true);

    if (this.variant === GameVariant.INTERNATIONAL && piece.type === PieceType.KING) {
      // Flying kings jumping: can fly any distance, jump an opponent piece, and land anywhere empty behind it.
      for (const dir of dirs) {
        let overR = currentPos.row + dir.dr;
        let overC = currentPos.col + dir.dc;
        let opponentFound = false;
        let opponentPos: Position | null = null;

        // Traverse until we hit a piece or board edge
        while (this.isValidPos(overR, overC)) {
          const overPiece = this.board[overR][overC];

          if (overPiece) {
            // Already found one opponent piece in this line and hit another piece? Stop.
            if (opponentFound) break;

            if (overPiece.color !== piece.color) {
              // Found an opponent piece
              const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);
              if (alreadyCaptured) {
                break; // Cannot capture same piece twice in a multi-jump sequence
              }
              opponentFound = true;
              opponentPos = { row: overR, col: overC };
            } else {
              // Hit own piece
              break;
            }
          } else if (opponentFound && opponentPos) {
            // Empty space after an opponent piece = valid landing spot
            const landR = overR;
            const landC = overC;

            const newCaptured = [...capturedSoFar, opponentPos];

            // Temporarily apply jump to search for multi-jumps
            const originalCurrent = this.board[currentPos.row][currentPos.col];
            this.board[currentPos.row][currentPos.col] = null;
            this.board[landR][landC] = piece;

            const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

            // Revert
            this.board[currentPos.row][currentPos.col] = originalCurrent;
            this.board[landR][landC] = null;

            if (subJumps.length > 0) {
               jumps.push(...subJumps);
            } else {
               jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
            }
          }

          overR += dir.dr;
          overC += dir.dc;
        }
      }
    } else {
      // Standard jumping logic for men (in both variants) and kings in STANDARD variant
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
