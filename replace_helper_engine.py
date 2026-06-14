import re

with open('backend/src/game/engine/engine.service.ts', 'r') as f:
    content = f.read()

def replace_block(content, start, end, new_text):
    pattern = re.compile(re.escape(start) + r'.*?' + re.escape(end), re.DOTALL)
    if not pattern.search(content):
        print(f"Failed to find block:\n{start}\n...\n{end}")
        return content
    return pattern.sub(new_text, content)

# 1. getValidNormalMovesForPiece King Logic
block1_start = """  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (piece.type === PieceType.KING) {
      // Kings can fly (slide across empty diagonals)
      for (const dir of dirs) {"""

block1_end = """        }
      }
    } else {
      for (const dir of dirs) {
        const nr = pos.row + dir.dr;
        const nc = pos.col + dir.dc;"""

block1_new = """  private getValidNormalMovesForPiece(pos: Position, piece: Piece): Move[] {
    const moves: Move[] = [];
    const dirs = this.getMoveDirections(piece);

    if (piece.type === PieceType.KING) {
      for (const dir of dirs) {
        let step = 1;
        while (true) {
          const nr = pos.row + dir.dr * step;
          const nc = pos.col + dir.dc * step;
          if (!this.isValidPos(nr, nc) || this.board[nr][nc] !== null) {
            break; // Stop sliding in this direction if off board or blocked
          }
          moves.push({ from: pos, to: { row: nr, col: nc } });

          if (this.rules.boardSize === 8) {
              break; // 8x8 kings only move 1 square
          }
          step++;
        }
      }
    } else {
      for (const dir of dirs) {
        const nr = pos.row + dir.dr;
        const nc = pos.col + dir.dc;"""

content = replace_block(content, block1_start, block1_end, block1_new)

# 2. getValidJumpsForPiece KING logic
block2_start = """    if (piece.type === PieceType.KING) {
      // Flying King captures
      for (const dir of dirs) {
        let step = 1;
        let opponentFoundPos: Position | null = null;"""

block2_end = """              jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
            }
          }

          step++;
        }
      }
    } else {
      // Men captures
      for (const dir of dirs) {"""

block2_new = """    if (piece.type === PieceType.KING) {
      // King captures
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

            const subJumps = this.getValidJumpsForPiece(start, piece, { row: landR, col: landC }, newCaptured);

            // Revert
            this.board[currentPos.row][currentPos.col] = originalCurrent;
            this.board[landR][landC] = null;

            if (subJumps.length > 0) {
              jumps.push(...subJumps);
            } else {
              jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
            }

            if (this.rules.boardSize === 8) {
               break; // 8x8 kings only jump to immediate square after capture
            }
          }

          if (this.rules.boardSize === 8 && opponentFoundPos === null) {
              break; // 8x8 kings only search 1 square ahead for an opponent
          }

          step++;
        }
      }
    } else {
      // Men captures
      // In 10x10, men can capture backward (all 4 directions). In 8x8, only forward.
      const captureDirs = this.rules.boardSize === 10 ? dirs : this.getMoveDirections(piece);

      for (const dir of captureDirs) {"""

content = replace_block(content, block2_start, block2_end, block2_new)

with open('backend/src/game/engine/engine.service.ts', 'w') as f:
    f.write(content)
print("Updated engine.service.ts")
