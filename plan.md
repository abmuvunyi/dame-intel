1. *Modify King normal moves in `engine.service.ts`.*
   - In `getValidNormalMovesForPiece`, restrict King movement to a single square (short-range) if `boardSize` is 8.
2. *Modify King jumps in `engine.service.ts`.*
   - In `getValidJumpsForPiece`, implement short-range King jumps for 8x8 boards.
3. *Modify Men backward captures in `engine.service.ts`.*
   - In `getValidJumpsForPiece`, allow Men captures using all 4 directions if `boardSize` is 10 (International rules), while keeping it forward-only for 8x8 boards.
4. *Modify King promotion in `engine.service.ts`.*
   - In `getValidJumpsForPiece`, implement immediate turn end upon promotion for Men in 8x8 boards during multi-jumps.
5. *Verify file edits.*
   - Use `run_in_bash_session` with `cat` to read `backend/src/game/engine/engine.service.ts` and confirm the changes were applied correctly without syntax errors.
6. *Run the tests to verify the rules.*
   - Run backend tests (`npm run test --prefix backend`) and ensure they pass.
7. *Complete pre-commit steps*
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
8. *Submit the change.*
   - Once all tests pass, submit the change with a descriptive commit message.
