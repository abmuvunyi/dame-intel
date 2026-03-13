export enum GameVariant {
  STANDARD = 'STANDARD', // 8x8
  INTERNATIONAL = 'INTERNATIONAL', // 10x10
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
  public readonly BOARD_SIZE: number;
  public readonly variant: GameVariant;

  constructor(variant: GameVariant = GameVariant.STANDARD) {
    this.variant = variant;
    this.BOARD_SIZE = variant === GameVariant.INTERNATIONAL ? 10 : 8;
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
  }

  // Generate the board based on the selected variant
  private createInitialBoard(): BoardState {
    const board: BoardState = Array(this.BOARD_SIZE).fill(null).map(() => Array(this.BOARD_SIZE).fill(null));
    const rowsOfPieces = this.variant === GameVariant.INTERNATIONAL ? 4 : 3;

    // Dark pieces (top rows)
    for (let row = 0; row < rowsOfPieces; row++) {
      for (let col = 0; col < this.BOARD_SIZE; col++) {
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
    let jumps: Move[] = [];
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
        // International rules: must take the sequence that captures the MAXIMUM number of pieces
        let maxCaptures = 0;
        for (const jump of jumps) {
          if (jump.captured && jump.captured.length > maxCaptures) {
            maxCaptures = jump.captured.length;
          }
        }
        jumps = jumps.filter(jump => jump.captured && jump.captured.length === maxCaptures);
      }
      return jumps;
    }
    return normalMoves;
  }

  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getMoveDirections(piece: Piece): { dr: number, dc: number }[] {
    return [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;

    for (const dir of dirs) {
      // In Standard, men only move forward
      if (piece.type === PieceType.MAN && this.variant === GameVariant.STANDARD && dir.dr !== forward) {
        continue;
      }
      // In International, men only move forward
      if (piece.type === PieceType.MAN && this.variant === GameVariant.INTERNATIONAL && dir.dr !== forward) {
        continue;
      }

      if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
         // Flying kings in international draughts
         let nr = pos.row + dir.dr;
         let nc = pos.col + dir.dc;
         while (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
            moves.push({ from: pos, to: { row: nr, col: nc } });
            nr += dir.dr;
            nc += dir.dc;
         }
      } else {
         // Standard kings and all men move 1 square
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
    let hasSubJumps = false;
    const jumps: Move[] = [];
    const dirs = this.getMoveDirections(piece);
    const forward = piece.color === PieceColor.LIGHT ? -1 : 1;

    for (const dir of dirs) {
      // In Standard, men only jump forward
      if (piece.type === PieceType.MAN && this.variant === GameVariant.STANDARD && dir.dr !== forward) {
        continue;
      }
      // In International, men can jump backward (all directions are fine)

      if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
        // Flying kings: jump over any distance
        let curR = currentPos.row + dir.dr;
        let curC = currentPos.col + dir.dc;
        let foundOpponent = false;
        let opponentPos: Position | null = null;

        while (this.isValidPos(curR, curC)) {
           const sq = this.board[curR][curC];

           if (sq !== null) {
              // Can't jump over two pieces, or our own piece
              if (foundOpponent || sq.color === piece.color) {
                 break;
              }
              const alreadyCaptured = capturedSoFar.some(cap => cap.row === curR && cap.col === curC);
              if (alreadyCaptured) {
                 break;
              }
              foundOpponent = true;
              opponentPos = { row: curR, col: curC };
           } else if (foundOpponent && opponentPos) {
              // Found a landing spot after an opponent piece
              hasSubJumps = true;
              const newCaptured = [...capturedSoFar, opponentPos];
              const landR = curR;
              const landC = curC;

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
           curR += dir.dr;
           curC += dir.dc;
        }

      } else {
        // Standard jumps (1 square over to 1 square land)
        const overR = currentPos.row + dir.dr;
        const overC = currentPos.col + dir.dc;
        const landR = currentPos.row + dir.dr * 2;
        const landC = currentPos.col + dir.dc * 2;

        if (!this.isValidPos(landR, landC)) continue;

        const overPiece = this.board[overR][overC];
        const landPos = this.board[landR][landC];

        const alreadyCaptured = capturedSoFar.some(cap => cap.row === overR && cap.col === overC);

        if (overPiece && overPiece.color !== piece.color && landPos === null && !alreadyCaptured) {
          hasSubJumps = true;
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
