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

export interface GameRules {
  boardSize: number; // 8 or 10
  forceMajorityCapture: boolean;
}

export class DraughtsEngine {
  private board: BoardState;
  private currentTurn: PieceColor;
  private rules: GameRules;

  constructor(rules: Partial<GameRules> = {}) {
    this.rules = {
      boardSize: rules.boardSize || 8,
      forceMajorityCapture: rules.forceMajorityCapture !== undefined ? rules.forceMajorityCapture : true
    };
    this.board = this.createInitialBoard();
    this.currentTurn = PieceColor.LIGHT; // Light always starts
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

  // Load a custom board state (useful for tests and puzzles)
  public loadBoard(board: BoardState, turn: PieceColor): void {
    this.board = board;
    this.currentTurn = turn;
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

    // Forced capture rule: if any jump is possible, only jumps are legal
    if (jumps.length > 0) {
        if (this.rules.forceMajorityCapture) {
            // Find the maximum number of captures in any sequence
            let maxCaptures = 0;
            for (const jump of jumps) {
                const numCaps = jump.captured ? jump.captured.length : 0;
                if (numCaps > maxCaptures) maxCaptures = numCaps;
            }
            // Filter legal jumps to only those that capture the maximum amount
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

    if (piece.type === PieceType.KING) {
      if (this.rules.boardSize === 8) {
        // Standard 8x8 Kings move only one step
        for (const dir of dirs) {
          const nr = pos.row + dir.dr;
          const nc = pos.col + dir.dc;
          if (this.isValidPos(nr, nc) && this.board[nr][nc] === null) {
            moves.push({ from: pos, to: { row: nr, col: nc } });
          }
        }
      } else {
        // Kings can fly (slide across empty diagonals) in 10x10
        for (const dir of dirs) {
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
    let dirs = [
      { dr: -1, dc: -1 }, { dr: -1, dc: 1 },
      { dr: 1, dc: -1 }, { dr: 1, dc: 1 }
    ];

    // In 8x8 standard rules, men can only capture forward.
    if (piece.type === PieceType.MAN && this.rules.boardSize === 8) {
        const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
        dirs = [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
    }

    if (piece.type === PieceType.KING) {
      if (this.rules.boardSize === 8) {
        // Standard 8x8 King captures (short range, all directions)
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
      } else {
        // Flying King captures (10x10)
        for (const dir of dirs) {
          let step = 1;
          let opponentFoundPos: Position | null = null;

          while (true) {
            const r = currentPos.row + dir.dr * step;
            const c = currentPos.col + dir.dc * step;

            if (!this.isValidPos(r, c)) break;

            const cell = this.board[r][c];

            if (cell !== null) {
              if (cell.color === piece.color) {
                // Blocked by own piece
                break;
              } else if (cell.color !== piece.color) {
                // Found opponent
                if (opponentFoundPos) {
                   // Two opponents in a row, can't jump
                   break;
                }
                // Check if we already captured this exact piece in this multi-jump sequence
                const alreadyCaptured = capturedSoFar.some(cap => cap.row === r && cap.col === c);
                if (alreadyCaptured) {
                   break;
                }
                opponentFoundPos = { row: r, col: c };
              }
            } else if (opponentFoundPos !== null) {
              // Empty square after finding an opponent! We can land here.
              const newCaptured = [...capturedSoFar, opponentFoundPos];
              const landR = r;
              const landC = c;

              // Temporarily apply jump to check for sub-jumps from THIS landing spot
              const originalCurrent = this.board[currentPos.row][currentPos.col];
              this.board[currentPos.row][currentPos.col] = null;
              this.board[landR][landC] = piece;

              // In international draughts, pieces captured during a sequence are removed ONLY
              // after the entire sequence finishes, preventing "jumping over the same piece twice"
              // but allowing crossing the same empty square twice.
              // We've satisfied this by checking `alreadyCaptured` above.

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

            step++;
          }
        }
      }
    } else {
      // Men captures
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

          // In 8x8 standard draughts, a man immediately ends its turn upon reaching the promotion rank.
          let promoted = false;
          if (piece.type === PieceType.MAN && this.rules.boardSize === 8) {
              if ((piece.color === PieceColor.LIGHT && landR === 0) ||
                  (piece.color === PieceColor.DARK && landR === this.rules.boardSize - 1)) {
                  promoted = true;
              }
          }

          let subJumps: Move[] = [];
          if (!promoted) {
             subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);
          }

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
      } else if (piece.color === PieceColor.DARK && move.to.row === this.rules.boardSize - 1) {
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
