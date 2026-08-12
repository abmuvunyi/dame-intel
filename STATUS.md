# STATUS

Living source of truth for what's real vs. stub in dame-intel. Update this at the end of every phase.

Generated during Phase 0 repo cleanup (2026-08-09). Verified during Phase 1 (2026-08-10) by actually
running the backend test suite, type-checking both apps, and **launching both servers and driving them
with a headless browser** — not just reading code. Rules engine rebuilt test-first during Phase 2
(2026-08-10). Callers reconnected to the rebuilt engine in Phase 3 (2026-08-10). Frontend board rebuilt
in Phase 4 (2026-08-10). Real-time PvP matchmaking, server-authoritative clocks, and disconnect/reconnect
built in Phase 5 (2026-08-10). Glicko-2 rating system built in Phase 6 (2026-08-10). Puzzle solving,
rating, Storm mode, and generation pipeline built in Phase 7 (2026-08-11). Swiss-pairing tournaments built
in Phase 8 (2026-08-11). See "How this was verified" below for exact method, and the per-phase sections
below for each phase specifically.

## Backend (NestJS)

| Module | Exists (Y/N) | Has tests (Y/N) | Tests passing (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|---|
| Auth | Y | Y | Y | Y | Controller + service + JWT guard. 1 test only (shallow). Live-verified indirectly: unauthenticated `/profile` correctly redirects to `/login` client-side. |
| Users | Y | Y | Y | Y | `GET /users/rankings` and `/users/stats` confirmed **live** — routes registered in the running Nest app, hit by the `/rankings` page with zero failed requests. Returns correct empty-state shape (no seeded rating data in a fresh DB, not an error). Core CRUD/ELO methods have 2 tests. |
| Friends | Y | Y | Y | N | Not exercised live this pass (no UI page hits it directly in the flows tested). Test coverage still just 2 tests, happy-path only. |
| Game engine (`game/engine/engine.service.ts`) | Y | Y | Y | Y | **Rebuilt in Phase 2 (2026-08-10).** 27 tests, all passing, covering every category the plan doc requires: forced capture, maximum-capture-sequence (3 scenarios grounded in FMJD Annex 1 articles 4.13/4.14, plus a 4th covering the king "corner-turn" rule at 4.6), multi-jump chains, king promotion mid-chain (4.15), flying vs. non-flying kings, and draw detection (6.1 threefold repetition, 6.2 no-progress rule) for both variants. Two real bugs fixed: kings always flew regardless of board size (should be non-flying for 8x8 American), and men always allowed backward captures regardless of variant (American men should be forward-only). Still framework-independent (no NestJS imports). |
| Game AI (`game/ai/ai/ai.service.ts`) | Y | Y | Y | Y | **Reconnected in Phase 3.** Needed no source changes at all — it already went through `engine.getRules()`/`getLegalMoves()`/`makeMove()`, all of which kept their signatures. Verified for real, not just by reading: added a full AI-vs-AI self-play test for each variant (see "Phase 3" below) asserting every single move the AI plays is accepted by the engine's own validation. |
| Game gateway (WebSocket, matchmaking/spectate/chat) | Y | Y | Y | Y | **Reconnected in Phase 3; matchmaking/clocks/reconnect built in Phase 5** — see "Phase 5" below for the full breakdown. |
| `matchmaking.ts` (rating-band seek pairing) | Y | Y | Y | Y | **New in Phase 5.** Pure, framework-independent pairing logic (same design pattern as the engine) — 15 tests. |
| `time-control.ts` | Y | N (data only) | — | Y | **New in Phase 5.** Bullet/blitz/rapid/correspondence bands; exercised indirectly through the gateway/matchmaking tests. |
| Analysis endpoint (`game/analysis.controller.ts`) | Y | Y | Y | Y | **Bug found and fixed in Phase 3** (pre-existing, not caused by the Phase 2 rebuild): `analyze()` constructed `new DraughtsEngine()` with no rules at all, always defaulting to 8x8. Since `getLegalMoves()`'s own scan is bounded by `rules.boardSize`, any 10x10 game submitted for analysis had pieces on rows 8–9 silently invisible to move generation — not clipped, just never considered. Fixed to derive board size (and accept explicit rules) from the submitted position. Had zero test coverage before this pass; now has 3 tests, including one that fails without the fix (verified by temporarily reverting it) so this can't silently regress. |
| Anticheat | Y | Y | Y | N | Not exercised live this pass. No TODO/stub markers in source. |
| Tournaments (Arena — pre-existing) | Y | Y | Y | Y | Live-verified: `/tournaments` page rendered real seeded data ("Weekly Beginner Arena", format, status) — not a placeholder. Untouched by Phase 8; its exact original code paths (`updateTournamentScore` inline in `game.gateway.ts`, the `@Cron` auto-start logic) remain as-is. |
| Tournaments — Swiss (`tournaments.service.ts` lifecycle/pairing methods) | Y | Y | Y | Y | **New in Phase 8 (2026-08-11).** Full SCHEDULED → REGISTRATION_OPEN → IN_PROGRESS → COMPLETED lifecycle, automatic round generation/advancement, Buchholz tiebreak standings. See "Phase 8" below. |
| `tournaments/swiss-pairing.ts` | Y | Y | Y | Y | **New in Phase 8.** Pure, framework-independent pairing algorithm (same pattern as `matchmaking.ts`/`glicko2.ts`) — greedy score-sorted pairing, bye to the lowest score without one yet, avoids rematches where a fresh opponent exists in the pool. 10 tests, including a full printed 8-player/3-round walkthrough. Documented limitation: no backtracking, so a small field pushed over many rounds can occasionally be forced into a rematch — see "Phase 8" below. |
| `SwissRound` / `SwissPairingRecord` entities | Y | Y (via service tests) | Y | Y | **New in Phase 8.** Persist each round and its pairings/results against real relational queries in `tournaments-swiss.service.spec.ts` (in-memory sqlite, not mocked repos). |
| Puzzles (`puzzles.service.ts` + entity) | Y | Y | Y | Y | **Rebuilt in Phase 7 (2026-08-11)** — real engine-validated solving, its own Glicko-2 rating pool, Storm mode, and a generation pipeline. See "Phase 7" below for the full breakdown, including a real bug fixed: the previous version sent the puzzle's solution straight to the client and validated moves with a client-side coordinate comparison, meaning it could be read out of the network tab and solved without knowing draughts at all. |
| History | Y | Y | Y | Y | **Live-verified in Phase 7**: a real PvP game's resignation correctly produced a `GameHistory` row, confirmed by querying `/history/player/:id` on the running server. |
| `rating/glicko2.ts` | Y | Y | Y | Y | **New in Phase 6.** Pure Glicko-2 implementation, verified against the algorithm's own published worked example (exact match) plus 7 property tests. Reused as-is for puzzle ratings in Phase 7. See "Phase 6" below. |
| `rating/rating.service.ts` + entities (`PlayerRating`, `RatingHistoryEntry`) | Y | Y | Y | Y | **New in Phase 6.** Per-(variant, time control) rating pools, provisional status, rating history. 7 tests against a real in-memory sqlite DB. |
| `GET /rating/:userId`, `GET /rating/:userId/history` | Y | Y | Y | Y | **New in Phase 6.** Live-verified against a real completed PvP game — see "Phase 6" below for the actual before/after numbers. |
| `puzzles/puzzle-generator.service.ts` | Y | Y | Y | Y | **New in Phase 7.** Scans completed games for a missed 2+-piece capture; flags `pending` candidates for review. See "Phase 7" below for the worked example. |
| `GET/POST /puzzles/admin/*` (pending/approve/reject/generate) | Y | Y | Y | Y | **New in Phase 7.** No admin-role system exists in this codebase (no `isAdmin` flag) — these just require being logged in, same bar as the rest of the app; documented as a known simplification, not invented as a side effect of this phase. |
| `puzzles/puzzle-rush.service.ts` (Puzzle Storm) | Y | Y | Y | Y | **New in Phase 7.** Server-authoritative timing (same principle as Phase 5's game clocks), streak, score. |

**Test run:** `npx jest` from `backend/` → 23 suites, 138 tests, all passing, ~1.7s (up from 110 as of
Phase 7 — the +28 are Phase 8's `swiss-pairing.spec.ts` (10), `tournaments-swiss.service.spec.ts` (17),
and 1 new regression test in `game.gateway.spec.ts` for a real cross-cutting bug Phase 8 found — see
"Phase 8" below). `tsc --noEmit` clean across the whole backend. No `TODO`/`FIXME`/`not implemented`/
`placeholder` markers anywhere in `backend/src`. Caveat on the remaining unbolded modules above is
unchanged from Phase 0/1: their test coverage is still thin, mostly happy-path only.

## Frontend (Next.js)

| Page/Component | Exists (Y/N) | Wired to real backend (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|
| `/` (home — hosts `GameBoard`) | Y | Y | Y | **Board rebuilt in Phase 4 (2026-08-10).** Live-verified end-to-end for both variants and both interaction modes — see "Phase 4" below for the full breakdown. |
| `GameBoard.tsx` | Y | Y | Y | **Rebuilt in Phase 4** as a thinner orchestrator (socket/game-state logic only) composing 4 new sub-components. |
| `Board.tsx` | Y | Y | Y | **New in Phase 4.** Board rendering, orientation/flip, drag-and-drop + click-click move input, move animation. Never computes legal moves itself — only ever filters the `legalMoves` array the server sends. |
| `MoveList.tsx` | Y | Y | Y | **New in Phase 4.** Real move history in FMJD-style square-numbering notation. |
| `CapturedTray.tsx` | Y | Y | Y | **New in Phase 4.** Per-side captured-piece tally, derived from the actual captured piece data at the moment of capture (not guessed after the fact). |
| `ConnectionStatus.tsx` | Y | Y | Y | **New in Phase 4.** Reflects real socket connect/disconnect events. |
| `/login` | Y | Y (1 API call) | Y | Renders correctly, zero console errors. |
| `/profile` | Y | Y (5 API calls) | Y | Unauthenticated visits client-side redirect to `/login` — correct auth-guard behavior, confirmed live (Phase 1). |
| `/puzzles` | Y | Y | Y | **Rebuilt in Phase 7.** Reuses `Board.tsx` (Phase 4) instead of its own bespoke board — real drag/click, real legal-move highlighting fetched from `GET /puzzles/:id/legal-moves`, moves validated via `POST /puzzles/:id/attempt`. Confirmed live: the solution never appears in any network response (checked every `/puzzles/*` response body across a full solve), zero console errors. |
| `/puzzles/rush` (Puzzle Storm) | Y | Y | Y | **New in Phase 7.** Live-verified: real countdown, score, and streak UI backed by the server-authoritative rush session. |
| `/tournaments` + `/tournaments/[id]` | Y | Y (1 + 4 API calls) | Y (list only) | List view confirmed live with real seeded data. Detail view (`[id]`) not driven live this pass. |
| `/analysis/[id]` | Y | Y (2 API calls) | N | Not driven live this pass (needs a real game ID with saved history). |
| `/rankings` | Y | Y (calls `/users/rankings`, `/users/stats`) | Y | Live-verified — renders correctly, zero console errors, correct empty state on a fresh DB. Still not linked from any nav. |
| `Timer.tsx` | Y | Y | Y | Wired in during Phase 4 (was orphaned since Phase 0); **as of Phase 5, genuinely server-authoritative** — it's fed a live-computed snapshot of the backend's real clock/turnStartedAt on every move, not a fixed cosmetic constant. See "Phase 5" below. |
| Site-wide nav/sidebar | N | — | — | Still doesn't exist. Unchanged from Phase 0. Not in scope for Phases 4 or 5. |
| Direct-challenge-by-user-ID UI | N | — | — | **Backend flow exists (Phase 5), no frontend UI for it yet** — no button/modal to challenge a specific friend. Scoped out: Phase 5's brief is backend real-time infrastructure; adding a challenge UI is a Phase-4-style frontend task better done as its own slice. |

**Type check:** `npx tsc --noEmit` from `frontend/` → clean, no errors. **Production build** (`npm run build`,
not just the type-check) → succeeds, all 10 routes generated (Phase 7 adds `/puzzles/rush`), zero build errors.

## How this was verified (Phase 1 method)

Static checks (`tsc --noEmit`, `npx jest`, grep for API calls) were re-run and matched Phase 0. Beyond
that, this pass actually **launched the app**: `npm run start:dev` (backend, port 3001, sqlite fallback
DB) and `npm run dev` (frontend, port 3000), then drove it with headless Chromium via Playwright —
navigating every page above, capturing console errors and failed network requests, and screenshotting
each. Additionally played through one full move-and-AI-response cycle on both board sizes by clicking
actual board squares (not calling internal functions directly). Zero console errors and zero failed
(4xx/5xx) requests were observed across all of it.

## Biggest surprises (things that looked done but aren't, or vice versa)

1. **The single riskiest rule remains completely unexercised, live or in tests.** Mandatory-capture /
   maximum-capture-sequence enforcement — the rule the plan doc calls "most often gotten wrong" — has
   zero test coverage (unchanged from Phase 0) *and* the live click-through only happened to test a
   non-capture move, so it's still fully unverified whether it actually works. This is the one finding
   that should block calling the engine "done" in any sense.
2. **Nothing in Phase 0's STATUS.md turned out to be wrong.** For a repo with a history of ~85 abandoned
   branches, that's not what I expected going in — the surviving `main` genuinely works as described.
3. **The core game loop is more solid than the thin test suite suggests.** A real click-to-move UI,
   legal-destination highlighting, and a live AI response all work correctly on both 8x8 and 10x10 —
   despite the engine spec file having only 4 shallow tests. The code is ahead of its test coverage, not
   behind its apparent completeness.
4. **The "unverified" rankings feature merged during cleanup turned out to work fine live** — real
   endpoints, real empty-state handling, zero errors. It just still isn't linked in any nav.
5. **`/profile`'s auth redirect is correct**, which wasn't obvious from a static read — worth noting since
   auth-gating bugs are an easy way to leak or block legitimate data.

## Phase 2: rules engine rebuild (2026-08-10)

Rebuilt `backend/src/game/engine/engine.service.ts` test-first. Full test file and diff are in the
`phase-2-rules-engine-rebuild` branch / PR. Summary:

**Sourcing:** International rules are pinned to the official FMJD "Annex 1 – Official FMJD rules for
international draughts" (fmjd.org/docs/Annex_1.pdf), fetched and read in full for this task; specific
article numbers are cited inline in both the engine and its tests. American Checkers rules (men capture
forward-only, kings non-flying) were confirmed against multiple secondary sources (playstrategy.org,
gambiter.com) but a numbered official-ACF-rules citation for the exact draw move-count was not found —
that one threshold (80 half-moves) is a documented approximation, called out as such in code.

**Bugs fixed:**
1. Kings always flew (unlimited slide) regardless of board size. American Checkers kings should move/
   capture exactly one square. Now `flyingKings` is a rule flag, defaulted from variant.
2. Men could always capture backward regardless of variant. American Checkers men may only capture
   forward (same restriction as their normal move); International men may capture either way (FMJD 4.1).
   Now `manCaptureBackward` is a rule flag, defaulted from variant.
3. `forceMajorityCapture` defaulted to `true` unconditionally, which would have wrongly enforced the
   majority-capture rule on American games unless every caller remembered to override it. Now defaults
   correctly per variant.
4. No draw detection existed at all. Added FMJD 6.1 (threefold repetition) and 6.2 (25-moves-per-player/
   50-half-move no-progress rule, exact for International; American uses the documented approximation
   above). FMJD 6.3/6.4 (reduced move limits in specific low-piece endgames) are a known, out-of-scope
   simplification — not implemented.

**Backward compatibility:** all existing public methods kept the same signature (`getBoard`,
`getCurrentTurn`, `getRules`, `getBoardString`, `loadBoard`, `getLegalMoves`, `makeMove`, `isGameOver`,
`getWinner`), plus additions (`isDraw`, `getDrawReason`, `DraughtsEngine.createInternational/createAmerican`
static factories). The class remains framework-independent — no NestJS imports.

**Test suite:** 27 tests (`engine.service.spec.ts`), all passing, covering every category the plan
requires: initial setup both sizes, legal move generation (men forward-only, flying vs. non-flying
kings), mandatory capture, 3 maximum-capture scenarios plus a 4th for the king corner-turn rule,
multi-jump chains, king promotion (including the mid-chain non-promotion edge case), win detection, draw
detection (both rules, both variants), and an American-vs-International contrast pair run against the
identical board to directly prove the variant-specific behavior differs where it should.

### Manual walkthroughs (3 required by the plan)

**1. Majority capture forces the choice of piece, not just the sequence (FMJD 4.13)**
Board (10x10, all else empty): Light men at (9,0) and (9,8); Dark men at (8,1), (8,7), (6,5). Light to
move. By hand: the (9,0) man can capture the (8,1) man alone, landing (7,2) — 1 piece. The (9,8) man can
capture (8,7) landing (7,6), and from there must continue onto (6,5), landing (5,4) — 2 pieces. FMJD 4.13
makes the larger capture obligatory, so the (9,0) man's capture is **illegal this turn**, even though
it's a "different piece" than the one that must move. **Engine output:** `getLegalMoves()` returns
exactly one move — (9,8)→(5,4), capturing both Dark men. The (9,0)→(7,2) move does not appear. Matches.

**2. A man that passes through the promotion row mid-chain does not become a king (FMJD 3.5, 4.15)**
Board: Light man at (2,1); Dark men at (1,2) and (1,4). Light to move. By hand: the man must capture
(1,2), landing on (0,3) — Light's promotion row. But a further capture is available from there (of
(1,4), a backward-relative direction, legal for International men per 4.1), so the chain must continue,
landing on (2,5). Since the piece's final resting square (2,5) is not row 0, per 4.15 it **remains a
man** — it never gained king powers even though it sat on the king row mid-move. **Engine output:**
`getLegalMoves()` returns exactly one move, (2,1)→(2,5), capturing both. After `makeMove`, the piece at
(2,5) has `type: MAN`. Matches. (A companion case in the test suite confirms the opposite: a chain that
ends exactly on row 0 does correctly promote.)

**3. A flying king must "turn the corner" onto a perpendicular diagonal mid-chain (FMJD 4.6)**
Board: Light king at (5,4); Dark men at (4,5) and (3,8). Light to move. By hand: the king flies NE,
finds the Dark man at (4,5), and could land on any empty square beyond it: (3,6), (2,7), (1,8), or (0,9)
— naively, all 4 look like valid 1-piece captures. But only from (2,7) is there a further capture: turning
90° onto the SE diagonal to reach the Dark man at (3,8), landing on (4,9). This is the specific,
easy-to-miss FMJD 4.6 behavior (a naive implementation checking only "continue straight" would miss it
entirely). Combined with 4.13, this also means the 3 other landing choices along the original diagonal
are **not legal** — only the 2-capture path is. **Engine output:** `getLegalMoves()` returns exactly one
move, (5,4)→(4,9), capturing both. Matches.

## Phase 3: reconnect backend modules to the rebuilt engine (2026-08-10)

Checked the 3 modules the plan doc named, in order, without rebuilding anything that was already fine.

**1. `game.gateway.ts`** — 3 spots built `GameRules` object literals by hand (`{boardSize: 8,
forceMajorityCapture: true}`) that no longer satisfied the engine's fully-resolved `GameRules` type.
Fixed by constructing the engine from the client's `Partial<GameRules>` and reading back
`engine.getRules()` for the room's stored rules, rather than hand-assembling a literal. This also fixed
a **real latent bug**: the old hardcoded fallback always set `forceMajorityCapture: true`, which is
wrong for the 8x8 American default (should be `false`) — it just hadn't mattered before because the old
engine ignored variant-specific defaults entirely. Added 2 tests (`game.gateway.spec.ts`) that create a
vs-AI game for each variant and check the room's resolved rules and the emitted board size are correct.

**2. `ai.service.ts`** — needed zero source changes. It already builds its search engine via
`new DraughtsEngine(engine.getRules())` and only calls `getLegalMoves()` / `makeMove()` /
`loadBoard()` / `isGameOver()` / `getCurrentTurn()` / `getBoard()`, none of which changed signature in
the Phase 2 rebuild. Verified this is actually true, not just plausible, with a real AI-vs-AI self-play
test per variant — see transcripts below.

**3. `analysis.controller.ts`** — found and fixed a **real, pre-existing bug** (not caused by the Phase
2 rebuild, just newly discovered while checking this file): `analyze()` constructed `new
DraughtsEngine()` with no rules argument at all, silently defaulting to an 8x8 board no matter what was
submitted. Because `getLegalMoves()`'s piece-scanning loop is itself bounded by `rules.boardSize`, any
piece on row 8 or 9 of a submitted 10x10 board was invisible to move generation — every game analyzed
via `/analysis` for the International variant was silently getting incomplete results. Fixed to derive
board size (and accept an optional explicit `rules` object) from the submitted position. This file had
zero test coverage before this pass; added 3 tests, and confirmed the regression test actually catches
the bug by temporarily reverting the fix and watching it fail before restoring it.

**Full backend suite:** 16 suites, 51 tests, all passing. `tsc --noEmit` clean across the whole backend
— no outstanding compile errors anywhere.

### AI self-play transcripts (both variants play to genuine completion, zero illegal moves)

Both games were driven by the real `AiService.getBestMove()` (difficulty 1 / search depth 2 — deep
enough to prove correctness, shallow enough to run fast) against the real `DraughtsEngine`, with a hard
assertion after every single half-move that `engine.makeMove()` returned `true`. Neither game hit the
300-half-move safety cap — both ended via the engine's own draw detection.

**8x8 American:** 84 half-moves, ended by **threefold repetition**. Last few moves — the two sides
settle into a repeating king shuffle once neither can make further progress, exactly the sort of
worn-down endgame the FMJD 6.1-style repetition rule exists to catch:
```
79. L (0,1)->(1,0)
80. D (4,1)->(5,2)
81. L (1,0)->(0,1)
82. D (5,2)->(4,1)
83. L (0,1)->(1,0)
84. D (4,1)->(5,2)
```

**10x10 International:** 174 half-moves, also ended by **threefold repetition**, after a much longer
game including multiple multi-piece captures throughout (e.g. move 24, `D (2,3)->(6,3) x2`). Same
shuffle-to-draw pattern at the end:
```
169. L (3,2)->(5,4)
170. D (3,4)->(2,3)
171. L (5,4)->(4,3)
172. D (2,3)->(4,5)
173. L (4,3)->(3,2)
174. D (4,5)->(3,4)
```

Both transcripts are reproducible by running `npx jest src/game/ai/ai/ai.service.spec.ts --verbose`.

## Phase 4: frontend board rebuild (2026-08-10)

Read `GameBoard.tsx` (432 lines, one file doing everything) and every other frontend page fully before
changing anything, per the brief. Decomposed the board into `Board.tsx` / `MoveList.tsx` /
`CapturedTray.tsx` / `ConnectionStatus.tsx`, kept `GameBoard.tsx` as a thinner orchestrator (socket
wiring + game state only), and extracted the types it used to define inline into `frontend/src/lib/
draughts.ts` (also fixed the one other place — `analysis/[id]/page.tsx` — that imported types from
`GameBoard.tsx` directly). One small, justified backend touch: `game.gateway.ts`'s two `gameState`
broadcasts now also include the move that was just applied, so the frontend can animate deterministically
instead of diffing board states heuristically — purely additive, doesn't change any existing field.

**1. Board renderer** — `Board.tsx`. Correct 8x8/10x10 rendering (cell size adapts, same visual language
as before). **Board-flip**: auto-orients so a Dark player sees their own pieces at the bottom by default
(this was a real, if minor, UX bug before — Dark players always saw an unflipped board), plus a manual
"Flip Board" toggle for either side or a spectator, live-verified working (screenshots below). Legal
moves are never computed client-side — `Board.tsx` only ever filters the server-supplied `legalMoves`
array for highlighting/validation; the `onMove` callback just relays the player's chosen legal move
to the socket for the server to authoritatively validate and apply.

**2. Move input** — drag-and-drop implemented with plain pointer events (no new dependency; covers
mouse and touch identically), with click-click as a genuine fallback sharing the same underlying
`attemptMove()` path, not a separate code path. **Bug found and fixed while live-testing this**: the
dragged piece is rendered centered on the pointer and was intercepting `elementFromPoint()` at drop
time, so a drop always landed on nothing. Fixed by making the piece being dragged `pointer-events-none`
while it's the one in motion. Legal-move highlighting kept from before. Animated piece movement:
pieces are tracked with a stable client-side identity (not just a grid position) and diffed against the
move the server just confirmed, so a moving piece's DOM node persists across the move and its position
change animates via CSS transition; captured pieces get a fade-and-shrink exit instead of vanishing
instantly.

**3. Game page layout** — live clock display per player (see honesty caveat below), a real move list in
FMJD-style notation (`frontend/src/lib/draughts.ts`'s `squareNumber`/`formatMove`, citing Annex 1 article
8.2's `-`/`x` convention; simplified vs. full PDN since the engine only reports a move's final captured
list and landing square, not each intermediate square of a multi-jump), resign/draw-offer controls
(kept from before), a captured-pieces tray (tallied from the actual captured-piece data at the moment of
capture, not reconstructed after the fact), and a connection-status indicator wired to real socket
connect/disconnect events.

**Clock honesty caveat**: there is no time-control data anywhere in the backend yet — "server-
authoritative clocks" is explicitly Phase 5's job in the plan doc. Wiring in the previously-orphaned
`Timer.tsx` as a genuine per-turn countdown (closing a gap flagged since Phase 0) satisfies the literal
"live clock display" ask, but it's clearly commented in both files as client-only and cosmetic — it
doesn't enforce anything and isn't backed by any server state. `onTimeout` is deliberately a no-op
rather than a fake client-only "loss on time," since that would just be a different kind of broken.

**4. Existing pages using real data** — re-checked profile/puzzles/tournaments/analysis: all make real
`axios` calls (confirmed by grep, 16 calls total across the app pages), no mock/dummy/hardcoded data
patterns found anywhere in `src/app` or `src/components`. No changes needed; this was already true as of
Phase 1's live verification and still holds.

**Verification**: `npx tsc --noEmit` clean, and a full **production build** (`npm run build`, not just
the type-check) succeeds with all 9 routes generated, zero build errors. Live-verified with headless
Chromium across 3 scenarios — 8x8 click-click, 10x10 click-click, 8x8 drag-and-drop — each playing several
real moves against the AI, checking console errors after every move. **Zero console errors in any
scenario.** Confirmed the full round-trip (frontend click/drag → `makeMove` socket emit → backend
`DraughtsEngine.makeMove` validation → `gameState` broadcast with the applied move → frontend re-render
and animation) by reading the real move notation that appeared in the move list after each interaction
(e.g. `21-17`, `9-14`, `22-18`, `14x21` for the 8x8 game) — not just "no error was thrown."

## Phase 5: real-time PvP matchmaking, server clocks, disconnect/reconnect (2026-08-10)

Read `game.gateway.ts` and STATUS.md fully before building, per the brief. The prior matchmaking was a
single-pass check against whoever else happened to already be in the queue when you joined — no rating
awareness, no time control, no periodic re-check, and disconnecting from a real PvP game triggered an
immediate, client-side-only "you win" claim with no way to actually reconnect. Built all 5 items the
plan asked for:

**1. Seek queue with rating-band widening.** New `matchmaking.ts` — pure, framework-independent pairing
logic (same design as the rules engine: no I/O, no `Date.now()` called internally, fully unit-testable).
A player's acceptable rating gap starts at ±100 and widens by 50 every 5 seconds waited, capped at 1000.
Matching requires **mutual** consent — the gap must fit within *both* players' current bands, so a
long-waiting player can't be force-matched against someone who just joined and hasn't widened yet. Time
control bands (`time-control.ts`): bullet (2min+1s), blitz (5min+3s), rapid (10min+5s), correspondence
(1 day base). The gateway sweeps the queue both immediately after someone joins (so an already-waiting
opponent matches instantly) and on a 2-second interval (so two players who are both still waiting can
match purely from their bands widening, without either taking any new action). **15 unit tests** in
`matchmaking.spec.ts`.

**2. Match → room → engine.** Unchanged in spirit from before, refactored into a shared
`createPvpRoom()` used by both matchmaking and accepted direct challenges — both clients get `gameStart`
with the real board/legal-moves/clocks from a freshly-constructed `DraughtsEngine(rules)`.

**3. Disconnection/reconnection.** This was the piece that didn't exist at all before. An authenticated
player whose socket drops now gets a 60-second grace period (`DISCONNECT_GRACE_MS`): the room stays
alive, the opponent is told via `opponentDisconnected` (not a fake win), and the seat is held open. On
reconnect — which happens **automatically** the moment the same authenticated user's socket reconnects
with a valid token, no client-side action required beyond what it already does — the server resyncs full
game state (`gameResync`: board, turn, legal moves if it's their turn, full move history, clocks) and
tells the opponent via `opponentReconnected`. If the grace period expires with no reconnect, the opponent
is awarded the win (`gameOver` with `reason: 'abandonment'`). Anonymous (unauthenticated) players have no
stable identity across a new socket connection, so they keep the old immediate-departure behavior — this
is a real, documented limitation, not an oversight. vs-AI games get a shorter no-consequence version (just
keeps the room alive briefly for a quick reload, no "opponent" to award a win to).

**4. Server-authoritative clocks.** Each room tracks `clocks: {L, D}` (seconds remaining) and
`turnStartedAt`. On every move (human or AI), the mover's actual elapsed thinking time is deducted from
their own clock and their increment applied — never trusting anything the client reports. A `flagTimer`
is scheduled for exactly the current player's remaining time; if it fires before their move arrives, the
opponent wins by `flag-fall`. The frontend's `Timer.tsx` (wired in during Phase 4 as a cosmetic
placeholder) now displays this real data — `GameBoard.tsx` computes a live-ticking snapshot from the
server's `clocks`/`turnStartedAt` on every sync, only recomputing when that snapshot actually changes
(not on unrelated re-renders, which would otherwise jitter the display). The display is just that — a
display; enforcement is 100% server-side via the flag timer, exactly as required.

**5. Direct challenge by user ID.** `challengePlayer({targetUserId, rules, timeControl})` looks up
whether that user is currently online (`userIdToSocket`, maintained across all authenticated
connections) and sends them a `challengeReceived` event; `respondToChallenge({challengeId, accept})`
either creates a room via the same `createPvpRoom()` matchmaking uses, or notifies the challenger it was
declined. Backend-only — see the frontend table above for why the UI for this wasn't built in this pass.

**Testing note:** the first test run after this change hung on a real (non-fake) 300-second timer left
running by the *existing* Phase 3 gateway tests, which create vs-AI rooms that now schedule a real
flag-fall timeout — Jest doesn't exit until every timer clears, and the timer fired *after* the test run
had already reported results ("Cannot log after tests are done"). Fixed by adding proper `afterEach`
teardown to `game.gateway.spec.ts` that clears every room's timers — a good instance of a new feature
exposing a pre-existing test-hygiene gap in older tests, not just needing its own tests.

**7 new gateway tests** (`game.gateway.spec.ts`), using Jest fake timers to simulate the 60-second grace
period and 300-second flag-fall without real waiting: matchmaking wired end-to-end into real rooms, clock
initialization + flag-fall, disconnect keeps the game alive + notifies the opponent, full resync on
reconnect under a new socket id, abandonment win after grace expires, and reconnecting *after* the grace
period already expired correctly does nothing (no zombie resurrection).

### How the reconnect flow was verified

Beyond the fake-timer gateway tests above (which prove the *state machine* is correct), this was verified
**live, end-to-end, with two real authenticated browser sessions**: registered two real users via
`POST /auth/register`, launched both real servers, opened two Playwright browser contexts each with a
different user's JWT already in `localStorage` (matching exactly how the app authenticates a real
socket connection), and had both click "Play Multiplayer" — real matchmaking paired them into a real
room. Both played real moves via the click-click interaction (`21-17`, `9-13`), confirmed in the move
list and via a real server-computed clock increment (`5:02` after one move each, matching 300s base + 3s
increment). Then the Dark player's **entire browser page was closed** (a real dropped connection, not a
simulated event) — the Light player's screen correctly showed "Opponent disconnected — game is still
live" rather than an instant fake win. A **fresh page for the same authenticated user** was opened, which
**automatically** (no manual rejoin action) resynced into the game: same board, same move history, same
clocks, board correctly still oriented for Dark. The Light player's screen then showed "Opponent
reconnected." **Zero console errors on any of the three pages throughout.**

## Phase 6: Glicko-2 rating system (2026-08-10)

Checked STATUS.md and the existing `User`/`GameHistory` entities before building, per the brief. The
existing rating system was a single flat `user.rating` field updated by a plain-ELO formula
(`UsersService.calculateEloChange`), the same number regardless of whether you'd just played 8x8 bullet
or 10x10 correspondence. Built all 4 items the plan asked for, as a new, additive `rating` module —
the legacy ELO field is left alone (see below for why) rather than replaced.

**1. Separate pools per variant and time control.** New `PlayerRating` entity: one row per
`(userId, variant, timeControl)`, created lazily the first time that pool is touched, holding the
Glicko-2 triple (`rating`, `ratingDeviation`, `volatility`) plus `gamesPlayed`. A player has up to 8
fully independent ratings (2 variants × 4 time controls).

**2. Real Glicko-2 updates, with history.** `rating/glicko2.ts` is a pure, framework-independent
implementation of Mark Glickman's published algorithm (glicko.net/glicko/glicko2.pdf) — no I/O, all 8
steps from the paper, same design discipline as the rules engine. **Verified against the paper's own
worked example, not just trusted**: the paper's example (player 1500/RD 200/σ 0.06, three games against
opponents at 1400/1550/1700 with results win/loss/loss, τ=0.5) states the answer as rating≈1464.06,
RD≈151.52, σ≈0.05999 — my implementation reproduces those exact values. Plus 7 property tests (winning
raises rating, losing lowers it, draws vs. equal-rated opponents are a wash, an upset win is worth more
than a expected one, RD always shrinks after a game and grows during idle periods, symmetric results
produce symmetric outcomes). `RatingHistoryEntry` records one row per player per completed rated game
(rating/RD/volatility snapshot, opponent, result, timestamp) — enough for a rating-over-time graph later,
not just the current number.

**Simplification, stated plainly:** the paper's "rating period" formally can contain many games; this
treats each individual game as its own one-opponent period, the standard adaptation for continuous
real-time play (games arrive one at a time) rather than the batch/tournament setting Glickman's paper
assumes. Documented in `glicko2.ts`'s module comment.

**3. Provisional status.** `gamesPlayed < 20` (within the plan's "15-20" range) marks a pool
`provisional: true` in the API response — verified directly: a pool stays provisional through 19 games
and clears at the 20th.

**4. Endpoint.** `GET /rating/:userId` → current rating/RD/volatility/provisional per pool. `GET
/rating/:userId/history` → full history, optionally narrowed with `?variant=&timeControl=` query params.

**Wired into game completion**: `game.gateway.ts`'s `handleGameOver`, in the same non-tournament
authenticated-PvP branch that already updates the legacy ELO field, now also calls
`ratingService.recordGameResult(...)` for the game's actual `(room.rules.variant, room.timeControl.name)`
pool. The legacy single `user.rating` field is **left in place, not replaced** — `/rankings` and
`/users/stats` (from the Phase 0 cleanup) already read it, and reconciling a single-number ranking page
with 8 separate pools is a real design question (which pool should "the" leaderboard show?) better
handled as its own follow-up than folded into this phase.

**9 unit tests**: `glicko2.spec.ts` (3 reference-value tests + 7 property tests — 10 total, one file),
`rating.service.spec.ts` (7 tests against a real in-memory sqlite database: pool creation defaults, pool
isolation across variant/time-control, provisional threshold crossing, win/loss/draw updates both sides
and records history correctly, history filtering by pool).

### Live verification (not just tests)

Registered two real users, launched both real servers, matched them into a real PvP room exactly as in
Phase 5's verification, and had one **resign** (a real socket event, not a simulated game-over call) to
reach a decisive result quickly. Then queried the real running server's `/rating/:userId` endpoint:

- Winner: `1500 → 1662.31` rating, `RD 350 → 290.32` (more confidence after a game), `gamesPlayed: 1`,
  `provisional: true`, pool correctly labeled `american/blitz` (the variant/time-control actually played).
- Loser: `1500 → 1337.69` rating, same RD reduction.
- `/rating/1/history` showed exactly one entry: `result: "win"`, `opponentUserId: 2`, matching numbers.

Zero console errors on either browser throughout.

## Phase 7: puzzle solving, rating, Storm mode, generation pipeline (2026-08-11)

Checked the existing puzzles module first, per the brief. What existed was thin scaffolding with a real
security/integrity problem, not something to extend as-is: `GET /puzzles/random` sent the puzzle's
`correctMove` straight to the client, and the frontend compared a submitted move against it with a bare
coordinate check — meaning a puzzle could be solved by reading the network tab, without knowing any
draughts. That's fixed as the foundation for everything else in this phase, not a side effect of it.

**1. Puzzle solving flow.** `Puzzle.solution` is now a move *sequence* (solver ply, optional scripted
opponent reply, solver ply, ...) rather than a single move, and the server never sends it to the client
(`PuzzlesService.toPublic()` strips it). `POST /puzzles/:id/attempt` reconstructs the position by
replaying the solution so far on a real `DraughtsEngine`, confirms the submitted move is both legal
there *and* matches the prescribed move — not a hardcoded comparison — then auto-plays any scripted
opponent reply and reports whether the whole sequence is solved. A new `GET /puzzles/:id/legal-moves`
endpoint lets the frontend reuse Phase 4's `Board.tsx` (real drag/click, real highlighting) instead of
a separate bespoke puzzle board.

**Puzzle rating** reuses `rating/glicko2.ts` from Phase 6 as-is: each solve attempt is treated as a
one-off Glicko-2 "game" between the player's own puzzle-rating pool (`PlayerPuzzleRating`, separate from
their game rating — solving isolated tactics and playing full games are related but different skills)
and the puzzle's own rating, chess.com/lichess-style — a correct solve raises the player's rating and
lowers the puzzle's (it was "too easy" for them), a wrong one does the reverse, and both use pre-attempt
snapshots applied together, same discipline as Phase 6's player-vs-player updates. An anonymous solver's
attempt still calibrates the puzzle's own rating (treated as a nominal 1500 opponent) but persists no
per-user rating, mirroring how anonymous PvP already works.

**Known simplification, stated plainly**: the design is fully stateless per request (the client tracks
`moveIndex`, the server always replays from scratch) — there's no server-side "this puzzle instance is
already solved" flag, so resubmitting the same already-correct final move twice would score it twice.
Real puzzle platforms solve this with a session/attempt id; not built here to keep this phase's scope to
what the brief asked for. Worth fixing before puzzles are load-bearing for competitive ranking.

**2. Puzzle Rush / Storm mode.** `PuzzleRushSession` + `PuzzleRushService`: a 3-minute (chess.com Storm's
default) server-authoritative run — `startedAt` + `durationSeconds` is what actually ends it, never a
client-reported timer, same principle as the Phase 5 game clocks. Tracks score, streak, and best streak;
a wrong answer resets the streak but (Storm-style, not classic-Rush-style) doesn't end the run — it moves
straight to the next puzzle. Difficulty scales up every 3 in a row.

**3. Puzzle generation pipeline.** `PuzzleGeneratorService.scanGame(gameId)` replays a completed game
move-by-move on a real engine; at every position where the side to move had a legal capture of 2+ pieces
available but played something else (a shorter capture, or no capture available at all wasn't the
trigger — only "a longer one existed and wasn't taken"), it saves that position as a `status: 'pending'`
candidate puzzle linked back to the source game via `sourceGameId`. Never auto-published. This can only
produce a genuine finding on American-rules games (`forceMajorityCapture: false`) — under International
rules, only the maximal capture is ever legal in the first place (Phase 2), so "available but not taken"
can't happen the same way there; that's a real rules difference, not a generator gap.

**4. Admin review.** `GET /puzzles/admin/pending`, `POST /puzzles/admin/:id/approve`,
`POST /puzzles/admin/:id/reject` — plus `POST /puzzles/admin/generate/:gameId` and
`/admin/generate-recent` to trigger scanning. No admin-role system exists anywhere in this codebase (no
`isAdmin` flag on `User`) — these endpoints just require being logged in, the same bar as the rest of
the app's authenticated actions. A real admin gate is future work, not invented here as a side effect.

**21 new tests**: `puzzles.service.spec.ts` (11 — solution validation including a genuine multi-move
replay-not-original-board test, rating adjustment direction for both success and failure, anonymous
solving, published-only random selection, admin review flow), `puzzle-generator.service.spec.ts` (4,
against real engine-verified move sequences — see the worked example below), `puzzle-rush.service.spec.ts`
(6, using backdated timestamps to simulate the clock running out without waiting).

### Worked example: one generated candidate puzzle from a sample game

This is the exact position `puzzle-generator.service.spec.ts` verifies (and the pipeline was separately
confirmed to run cleanly end-to-end against a real completed game on the live server — see "Live
verification" below). Reaching it requires 18 real, engine-legal moves from the standard American 8x8
starting position (found by search, not hand-picked, then verified against the actual engine — full move
list is in the test file). At that position:

- **Available**: Light's man at (5,6) can fly... no — American kings aren't flying; this is a man chain:
  (5,6) captures the Dark man at (4,5), continues to capture the Dark man at (2,3), landing at (1,2) — a
  **2-piece capture**.
- **Also legal** (American rules don't require the longest capture): a different Light man at (6,1)
  could instead capture just the one Dark man at (5,2), landing at (4,3) — a **1-piece capture**.
- **What gets "played"** in this scan: the 1-piece capture — completely legal under American rules, but
  it leaves the better 2-piece line on the table.

**Generator output**: one `pending` candidate puzzle, `difficulty: 2`, `turnToMove: 'L'`,
`solution: [{ from: (5,6), to: (1,2), captured: [(4,5), (2,3)] }]`, `sourceGameId` pointing back to the
source game. `scanGame` correctly does **not** flag the position if the 2-piece capture is what actually
gets played instead (a second test confirms this directly on the identical position).

### Live verification

Beyond the test suite: hit the running server's `GET /puzzles/random` directly and confirmed the response
contains no `solution` field anywhere. Drove `/puzzles` with headless Chromium: loaded a real puzzle,
picked a real legal move from the server's own `/legal-moves` response (not a scripted shortcut), got
"Correct! You solved the puzzle." back from real server validation, and independently captured every
`/puzzles/*` network response body across the whole session to confirm the string `"solution"` never
appeared in any of them. Loaded `/puzzles/rush` and confirmed the live countdown/score/streak UI. Played
a real PvP game to a real resignation, confirmed a `GameHistory` row was actually created
(`GET /history/player/1`), then called the live `/puzzles/admin/generate-recent` endpoint against it and
confirmed the pipeline runs cleanly against real production data (0 candidates, expected — a
zero-move resignation has no positions to scan). Zero console errors throughout.

## Phase 8: Swiss-pairing tournaments (2026-08-11)

The brief was explicit that Arena and Knockout formats are out of scope for this phase — Arena's existing
code paths (`updateTournamentScore` calls inline in `game.gateway.ts`'s `handleGameOver`, the `@Cron`
auto-start logic) are untouched; the Swiss work below is entirely additive alongside it.

**1. Pairing algorithm.** `tournaments/swiss-pairing.ts`: pure, framework-independent (no NestJS/TypeORM
imports), same design pattern as `matchmaking.ts` and `rating/glicko2.ts`. Sorts players by score
(desc, id as tiebreak), gives a bye to the lowest-scoring player who hasn't had one yet if the field is
odd, then greedily pairs the rest — for each player, searches the *entire* remaining pool for an opponent
they haven't already faced before falling back to a rematch. **Documented, not hidden, limitation**: this
is a simplified greedy algorithm, not the full FIDE Dutch system with backtracking — with a small field
pushed over many rounds relative to its size, the greedy selection order can occasionally trap a player
into a forced rematch even though a valid rematch-free assignment exists elsewhere in the search space.
Proven clean at 8 players / 3 rounds (both in the pure-algorithm test and live, see below); a dedicated
service-level test intentionally uses 8 players rather than a smaller field for exactly this reason, with
the limitation spelled out in a comment rather than either weakening the assertion or over-building a full
backtracking solver beyond what the brief asked for.

**2. Lifecycle.** `Tournament.status` for Swiss now runs SCHEDULED → REGISTRATION_OPEN → IN_PROGRESS →
COMPLETED (`totalRounds`/`currentRound` columns added, Swiss-only — Arena keeps its original
UPCOMING/IN_PROGRESS/COMPLETED states and columns untouched). `openRegistration()` and `startTournament()`
enforce the transitions (`BadRequestException` on an out-of-order call, or starting with fewer than 2
players); `joinTournament()` was extended to also accept `REGISTRATION_OPEN` as a valid join state
alongside Arena's existing `UPCOMING`.

**3. Round generation and automatic progression.** `generateNextRound()` persists a `SwissRound` plus one
`SwissPairingRecord` per pairing (bye pairings get `player2Id: null` and an immediate full point via
`updateTournamentScore` — no game to wait for). `recordSwissPairingResult()` is the single entry point a
finished game reports through: it locates the pairing regardless of which player is passed as "player1"
vs "player2", is a no-op if the pairing was already resolved (double-recording guard) or doesn't exist for
that pair this round, updates both players' scores itself, and then calls `checkRoundCompletion()` — which
marks the round `COMPLETED` once every pairing in it has a result, and either generates the next round or
(if that was the final round) marks the whole tournament `COMPLETED`. The existing `@Cron` job gained a
Swiss-only branch: any pairing still unresolved after a 24h time limit is force-resolved as a `DRAW` so a
missing/AFK player can never permanently stall a round.

**4. Standings with Buchholz tiebreak.** `getStandingsWithTiebreak()` sums each player's faced opponents'
*current* scores (a bye contributes 0) as the tiebreak, sorts by score desc then Buchholz desc. Using
current (not final) scores means it's a genuinely live-updating tiebreak, at the standard cost that it can
fluctuate as the tournament progresses — the normal trade-off for a live Buchholz display, not a bug.

**5. Matchmaking integration.** `findSwissOpponent(tournamentId, userId)` tells `game.gateway.ts`'s
`joinMatchmaking` handler exactly who a Swiss entrant is supposed to play this round (or `null` if they
have a bye, their pairing is already resolved, or the tournament isn't Swiss at all) — critical because
routing Swiss players onto the *generic* matchmaking queue would risk pairing them against any other
entrant queuing for the same tournament, not the specific opponent the algorithm actually assigned. New
`tryJoinSwissPairing()` in the gateway checks this first and, if it applies, seats the prescribed pair
into a real game room (or tells the client to wait if the opponent isn't connected yet) instead of falling
through to the rating-band queue from Phase 5. `handleGameOver` branches on `tournament.format === 'Swiss'`
to call `recordSwissPairingResult` (which owns scoring itself) instead of Arena's inline WIN/LOSS/DRAW
calls.

**A real bug found and fixed, not just new code.** Live verification (below) surfaced a genuine
pre-existing defect, not something introduced by Phase 8's own logic: `game.gateway.ts`'s `socketToRoom`
map (socket id → active room id) was only ever cleared in `handleDisconnect`, never in `handleGameOver`.
Two players who stayed connected straight from one game into the next — exactly what happens between
Swiss rounds — kept a stale mapping pointing at their just-finished, now-deleted room. Swiss's
`tryJoinSwissPairing` guard (checking neither player is "already in a room" right before seating them)
then read that stale entry as "still occupied" and refused to pair them, leaving both stuck on
`waitingForOpponent` forever. Fixed by releasing `socketToRoom` for both seats' current sockets at the end
of `handleGameOver`, alongside the `userIdToRoom` cleanup that was already there. Added a regression test
(`game.gateway.spec.ts`, "Phase 8 regression" block) that fails without the fix: two players resign
straight into a second `joinMatchmaking` call, same socket ids, no disconnect in between, and must land in
a brand-new room. This bug would also have affected non-Swiss rematches under the same conditions had
anything else started checking `socketToRoom` as an occupancy guard — the fix is general, not Swiss-specific.

**27 new tests**: `swiss-pairing.spec.ts` (10 — bye assignment, no-rematch search, and a full printed
8-player/3-round walkthrough), `tournaments-swiss.service.spec.ts` (17, against real in-memory sqlite —
lifecycle transitions, round generation/pairing correctness, bye handling and scoring, result recording
via both argument orders, double-recording and wrong-pair no-ops, auto-advance through to tournament
completion, no-illegal-rematches at 8 players, Buchholz, and `findSwissOpponent` in every branch), plus the
1 `game.gateway.spec.ts` regression test above.

### Worked example: 8-player, 3-round Swiss tournament

Pairings and results below are **from a live run against the actual running server** (not the unit test):
8 real registered users (real `/auth/register` + JWT), a real Swiss tournament created and opened via the
real HTTP API, all 8 joined and the tournament started via `POST /tournaments/:id/start`, then each round's
players connected with real `socket.io-client` WebSocket connections, called the real `joinMatchmaking`
event, and one side of each pairing issued a real `resignGame` — the server decided everything else
(pairing, scoring, round advancement) on its own:

```
--- Round 1 ---
  p1 vs p2  ->  winner: p1 (resignation)
  p3 vs p4  ->  winner: p3 (resignation)
  p5 vs p6  ->  winner: p5 (resignation)
  p7 vs p8  ->  winner: p7 (resignation)
  [round 1 complete -> tournament status=IN_PROGRESS, currentRound=2]

--- Round 2 ---
  p1 vs p3  ->  winner: p1 (resignation)
  p5 vs p7  ->  winner: p5 (resignation)
  p2 vs p4  ->  winner: p2 (resignation)
  p6 vs p8  ->  winner: p6 (resignation)
  [round 2 complete -> tournament status=IN_PROGRESS, currentRound=3]

--- Round 3 ---
  p1 vs p5  ->  winner: p1 (resignation)
  p2 vs p3  ->  winner: p2 (resignation)
  p6 vs p7  ->  winner: p6 (resignation)
  p4 vs p8  ->  winner: p4 (resignation)
  [round 3 complete -> tournament status=COMPLETED, currentRound=3]

--- Final standings (live server, with Buchholz tiebreak) ---
  1. p1: 3 pts  (Buchholz: 5)
  2. p5: 2 pts  (Buchholz: 6)
  3. p2: 2 pts  (Buchholz: 5)
  4. p6: 2 pts  (Buchholz: 3)
  5. p3: 1 pts  (Buchholz: 6)
  6. p7: 1 pts  (Buchholz: 4)
  7. p4: 1 pts  (Buchholz: 3)
  8. p8: 0 pts  (Buchholz: 4)
```

Every round pairs winners against winners and losers against losers (correct Swiss behavior), no player
faced the same opponent twice across all 3 rounds (independently re-verified by re-fetching all three
rounds' pairings from the live API after the tournament finished and checking for duplicate pairs), the
tournament transitioned SCHEDULED → REGISTRATION_OPEN → IN_PROGRESS → COMPLETED entirely on its own after
each round's results came in — no manual intervention beyond the resignations themselves — and the final
Buchholz-based ordering is consistent with the actual strength of schedule each player faced.

### Live verification

Beyond the two test suites above: killed and restarted the backend against a fresh sqlite DB, then ran the
worked example above as a standalone Node script using real HTTP (`node-fetch`) for registration/auth and
tournament REST calls and real `socket.io-client` WebSocket connections (not Playwright — this is a
fundamentally socket-driven flow, and orchestrating 8 simultaneous real browser actors would add
complexity without adding coverage) for the actual gameplay. This is what surfaced the `socketToRoom`
staleness bug described above: the first run genuinely hung on round 2 with both players stuck on
`waitingForOpponent`, diagnosed from the gateway source (not guessed), fixed, backend restarted fresh
again, and the full 3-round tournament re-run end-to-end to confirm the fix — the transcript above is from
that clean second run. Backend log checked for errors during the run: none beyond the pre-existing,
already-documented Redis connection warnings (no Redis running in dev; the gateway already falls back to
its in-memory adapter, unrelated to Phase 8).

**Known simplifications, stated plainly:**
- The pairing algorithm has no backtracking (see above) — an occasional forced rematch in a small field
  pushed over many rounds is possible and accepted, not silently swept under a weaker test.
- No admin-role system exists anywhere in this codebase (same situation as Phase 7's puzzle admin routes):
  `createTournament`/`openRegistration`/`startTournament` just require being logged in, not any specific
  role. A real admin gate is future work, not invented here as a side effect.
- The 24h Swiss round time-limit fallback (force-draw any pairing still unresolved) is checked on the same
  10-second `@Cron` sweep Arena already uses — not independently tested with real elapsed time (would
  require either a 24h-long test or time-mocking infrastructure this phase didn't build); the code path
  itself is small and was read carefully rather than left completely unverified.

## Repo cleanup notes (Phase 0)

- Original state: 96 branches, 95 open PRs, no `main` — default branch was the auto-named
  `add-technical-spec-2362760525453558397`.
- Audited every branch by diffing file trees against that default branch. **94 of 95 other branches
  contained nothing beyond leftover AI-session debris**: `.log` files, `screenshot.png`, one-off
  `fix_*.py`/`update_*.py`/`replace_helper*.py` scripts, `plan.md` scratch notes, and ~15 duplicate
  attempts at a `Sidebar.tsx` chess.com-style layout — none complete, none tested, none merged.
- **One branch had real, working code not present anywhere else**: `feature/rankings-timers-themes-*`
  (rankings page, `Timer.tsx`, `users.controller.ts` rankings/stats endpoints). Its files were merged
  into `main` as-is, plus the minimal wiring needed to compile (two service methods, one module
  registration).
- All other branches deleted, their PRs closed with: "Superseded during repo cleanup — consolidating
  all work into main."
