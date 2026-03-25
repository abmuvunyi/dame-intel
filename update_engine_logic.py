import re

filepath = "backend/src/game/engine/engine.service.ts"
with open(filepath, "r") as f:
    content = f.read()

# Update createInitialBoard
create_board = """  private createInitialBoard(): BoardState {
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
  }"""
content = re.sub(r"  private createInitialBoard\(\): BoardState \{[\s\S]*?return board;\n  \}", create_board, content)

# Update getLegalMoves to enforce max captures rule for International
get_legal = """  public getLegalMoves(): Move[] {
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
        // Capture maximum pieces rule
        let maxCaptures = 0;
        for (const jump of jumps) {
          const numCaptures = jump.captured ? jump.captured.length : 0;
          if (numCaptures > maxCaptures) maxCaptures = numCaptures;
        }
        return jumps.filter(jump => (jump.captured ? jump.captured.length : 0) === maxCaptures);
      }
      return jumps;
    }
    return normalMoves;
  }"""
content = re.sub(r"  public getLegalMoves\(\): Move\[\] \{[\s\S]*?return jumps\.length > 0 \? jumps : normalMoves;\n  \}", get_legal, content)

# Update getMoveDirections and movement logic for backward captures / flying kings
movement_logic = """  private isValidPos(r: number, c: number): boolean {
    return r >= 0 && r < this.BOARD_SIZE && c >= 0 && c < this.BOARD_SIZE;
  }

  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];

    if (piece.type === PieceType.KING) {
      const dirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
      for (const dir of dirs) {
        let nr = pos.row + dir.dr;
        let nc = pos.col + dir.dc;
        while (this.isValidPos(nr, nc)) {
          if (this.board[nr][nc] !== null) break;
          moves.push({ from: pos, to: { row: nr, col: nc } });

          if (this.variant === GameVariant.STANDARD) break; // Kings only move 1 step in Standard
          nr += dir.dr;
          nc += dir.dc;
        }
      }
    } else {
      const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
      const dirs = [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
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
    let hasSubJumps = false;
    const jumps: Move[] = [];

    if (piece.type === PieceType.KING && this.variant === GameVariant.INTERNATIONAL) {
      // Flying Kings Jump Logic
      const dirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
      for (const dir of dirs) {
        let nr = currentPos.row + dir.dr;
        let nc = currentPos.col + dir.dc;
        let foundOpponent = null;
        let opponentPos = null;

        while (this.isValidPos(nr, nc)) {
          const cell = this.board[nr][nc];
          if (cell !== null) {
            if (cell.color === piece.color || foundOpponent !== null) {
              // Blocked by own piece or already found an opponent and blocked by another piece
              break;
            } else {
              // Found opponent piece
              const alreadyCaptured = capturedSoFar.some(cap => cap.row === nr && cap.col === nc);
              if (alreadyCaptured) break; // Cannot jump same piece twice in a sequence
              foundOpponent = cell;
              opponentPos = { row: nr, col: nc };
            }
          } else if (foundOpponent !== null) {
            // Empty landing square after an opponent piece
            hasSubJumps = true;
            const newCaptured = [...capturedSoFar, opponentPos!];

            // Temporarily apply jump
            const originalCurrent = this.board[currentPos.row][currentPos.col];
            this.board[currentPos.row][currentPos.col] = null;
            this.board[nr][nc] = piece;

            // In international draughts, captured pieces are not removed until the sequence is complete.
            // But they CANNOT be jumped over again. We handle this via capturedSoFar.

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
          nr += dir.dr;
          nc += dir.dc;
        }
      }
    } else {
      // Standard King Jump OR Men Jump (Backward captures for Men in International)
      let dirs: { dr: number, dc: number }[];

      if (piece.type === PieceType.KING) {
         dirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
      } else {
         if (this.variant === GameVariant.INTERNATIONAL) {
            // Men can capture backwards in International
            dirs = [{ dr: -1, dc: -1 }, { dr: -1, dc: 1 }, { dr: 1, dc: -1 }, { dr: 1, dc: 1 }];
         } else {
            const forward = piece.color === PieceColor.LIGHT ? -1 : 1;
            dirs = [{ dr: forward, dc: -1 }, { dr: forward, dc: 1 }];
         }
      }

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
          hasSubJumps = true;
          const newCaptured = [...capturedSoFar, { row: overR, col: overC }];

          // Temporarily apply the jump to check for further jumps
          const originalCurrent = this.board[currentPos.row][currentPos.col];
          this.board[currentPos.row][currentPos.col] = null;
          this.board[landR][landC] = piece;

          // In International, men promoting to king during a multi-jump sequence
          // do NOT become kings until the sequence ends, UNLESS it's Standard?
          // Actually, in Standard they stop jumping upon reaching the end row.
          // Let's implement basic stopping for Standard and continuation for International if they become King?
          // For simplicity, men stay men during the jump evaluation, and we'll apply promotion at the end of makeMove.
          // Exception: Standard rules state turn ends upon reaching king row.
          let isPromotedStandard = false;
          if (this.variant === GameVariant.STANDARD && piece.type === PieceType.MAN) {
            if (piece.color === PieceColor.LIGHT && landR === 0) isPromotedStandard = true;
            if (piece.color === PieceColor.DARK && landR === this.BOARD_SIZE - 1) isPromotedStandard = true;
          }

          let subJumps: Move[] = [];
          if (!isPromotedStandard) {
             subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);
          }

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

    // Filter out intermediate jumps if this piece must jump further
    // (A jump sequence must be maximal for that path)
    if (jumps.length > 0) {
      let maxLen = 0;
      for (const j of jumps) {
        if (j.captured && j.captured.length > maxLen) maxLen = j.captured.length;
      }
      return jumps.filter(j => j.captured && j.captured.length === maxLen);
    }

    return jumps;
  }"""
content = re.sub(r"  private isValidPos\([\s\S]*?    return jumps;\n  \}", movement_logic, content)

with open(filepath, "w") as f:
    f.write(content)

print("Updated DraughtsEngine rules for 10x10 and International variant.")
