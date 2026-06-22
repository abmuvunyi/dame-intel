1. **Update `DraughtsEngine` (`backend/src/game/engine/engine.service.ts`) for 10x10 International vs 8x8 Standard Rules**:
   - `DraughtsEngine.constructor`:
     - If `boardSize` is 8, `forceMajorityCapture` should default to `false`.
     - If `boardSize` is 10, `forceMajorityCapture` should default to `true`.
   - Men Capture Direction:
     - 8x8: Men only capture *forward*.
     - 10x10: Men can capture *forward AND backward*.
     - Update `getValidJumpsForPiece` in `else { // Men captures }` block. We'll need to compute `dirs` differently based on `boardSize` (all 4 directions for 10x10, forward 2 directions for 8x8).
   - Flying Kings:
     - 8x8 (Standard Checkers / English Draughts): Kings move and capture exactly one step diagonally. They *cannot* fly across the board.
     - 10x10 (International): Kings *can* fly.
     - Update `getValidNormalMovesForPiece` and `getValidJumpsForPiece` to only fly if `boardSize === 10`.
   - Multi-jump Turn Ending on Promotion:
     - 8x8: If a Man reaches the king row during a multi-jump sequence, it promotes to a King and its turn immediately *ends*. It cannot continue jumping as a King.
     - 10x10: Same, but we should make sure we're strictly enforcing this in 8x8. (In standard International rules, a piece that just touches the promotion rank during a jump and continues backwards does not promote unless it lands there, but in 8x8 it promotes and stops).

2. **Update UI (`frontend/src/components/game/GameBoard.tsx`)**:
   - Instead of separate toggles for `boardSize` and `forceMajorityCapture`, combine it into a single clean selector: "Variant: Standard 8x8 | International 10x10".
   - This handles setting `boardSize` and automatically infers `forceMajorityCapture`, flying kings, and backwards capturing on the backend.
   - For a "Chess.com" style interface, we want it to be simple and sleek.

3. **Verify backend tests pass**
   - Run `cd backend && npm run test` to make sure we haven't broken the engine.

4. **Run pre-commit steps and submit**
   - Call `pre_commit_instructions` to ensure proper testing, verification, review, and reflection are done.
   - Run UI verification using playwright to verify frontend changes.
