import re

with open('backend/src/game/engine/engine.service.ts', 'r') as f:
    content = f.read()

def replace_block(content, start, end, new_text):
    pattern = re.compile(re.escape(start) + r'.*?' + re.escape(end), re.DOTALL)
    if not pattern.search(content):
        print(f"Failed to find block:\n{start}\n...\n{end}")
        return content
    return pattern.sub(new_text, content)

block3_start = """      for (const dir of captureDirs) {
        const overR = currentPos.row + dir.dr;
        const overC = currentPos.col + dir.dc;
        const landR = currentPos.row + dir.dr * 2;
        const landC = currentPos.col + dir.dc * 2;"""

block3_end = """          this.board[currentPos.row][currentPos.col] = originalCurrent;
          this.board[landR][landC] = null;

          if (subJumps.length > 0) {
             jumps.push(...subJumps);
          } else {
             jumps.push({ from: start, to: { row: landR, col: landC }, captured: newCaptured });
          }
        }
      }"""

block3_new = """      for (const dir of captureDirs) {
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

          let subJumps: Move[] = [];

          // In 8x8 standard draughts, a man stops multi-jumping immediately upon hitting the promotion row.
          const promotesThisJump = piece.type === PieceType.MAN && this.rules.boardSize === 8 &&
                ((piece.color === PieceColor.LIGHT && landR === 0) || (piece.color === PieceColor.DARK && landR === this.rules.boardSize - 1));

          if (!promotesThisJump) {
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
      }"""

content = replace_block(content, block3_start, block3_end, block3_new)

with open('backend/src/game/engine/engine.service.ts', 'w') as f:
    f.write(content)
print("Updated engine.service.ts")
