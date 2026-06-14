1. **Update `frontend/src/app/layout.tsx` to use dark theme matching chess.com.**
   - Modify the body class to use `#302e2b` for the background and `text-white`.
   - Implement a consistent dark sidebar or navbar to navigate to features.

2. **Update `frontend/src/components/game/GameBoard.tsx` piece styles and board colors.**
   - Update the board colors to `#769656` (dark squares) and `#eeeed2` (light squares).
   - Add specific king SVG icons matching chess.com style instead of using the simple CSS circle stack.
   - Adjust the layout and padding.

3. **Verify engine rules for 8x8 vs 10x10.**
   - Review `engine.service.ts` logic to confirm standard 8x8 rules (no flying kings, no backward captures for men, immediate end of turn on promotion) vs 10x10 international rules. Modify if needed to correctly reflect standard vs international variations.

4. **Verify changes visually and functionally.**
   - Use playwright to take a screenshot to ensure the UI looks like chess.com.
   - Run backend tests to verify engine rules.

5. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**

6. **Submit.**
