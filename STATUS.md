# STATUS

Living source of truth for what's real vs. stub in dame-intel. Update this at the end of every phase.

Generated during Phase 0 repo cleanup (2026-08-09). Verified during Phase 1 (2026-08-10) by actually
running the backend test suite, type-checking both apps, and **launching both servers and driving them
with a headless browser** — not just reading code. Rules engine rebuilt test-first during Phase 2
(2026-08-10). Callers reconnected to the rebuilt engine in Phase 3 (2026-08-10). See "How this was
verified" below for exact method, and "Phase 2"/"Phase 3" below for those phases specifically.

## Backend (NestJS)

| Module | Exists (Y/N) | Has tests (Y/N) | Tests passing (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|---|
| Auth | Y | Y | Y | Y | Controller + service + JWT guard. 1 test only (shallow). Live-verified indirectly: unauthenticated `/profile` correctly redirects to `/login` client-side. |
| Users | Y | Y | Y | Y | `GET /users/rankings` and `/users/stats` confirmed **live** — routes registered in the running Nest app, hit by the `/rankings` page with zero failed requests. Returns correct empty-state shape (no seeded rating data in a fresh DB, not an error). Core CRUD/ELO methods have 2 tests. |
| Friends | Y | Y | Y | N | Not exercised live this pass (no UI page hits it directly in the flows tested). Test coverage still just 2 tests, happy-path only. |
| Game engine (`game/engine/engine.service.ts`) | Y | Y | Y | Y | **Rebuilt in Phase 2 (2026-08-10).** 27 tests, all passing, covering every category the plan doc requires: forced capture, maximum-capture-sequence (3 scenarios grounded in FMJD Annex 1 articles 4.13/4.14, plus a 4th covering the king "corner-turn" rule at 4.6), multi-jump chains, king promotion mid-chain (4.15), flying vs. non-flying kings, and draw detection (6.1 threefold repetition, 6.2 no-progress rule) for both variants. Two real bugs fixed: kings always flew regardless of board size (should be non-flying for 8x8 American), and men always allowed backward captures regardless of variant (American men should be forward-only). Still framework-independent (no NestJS imports). |
| Game AI (`game/ai/ai/ai.service.ts`) | Y | Y | Y | Y | **Reconnected in Phase 3.** Needed no source changes at all — it already went through `engine.getRules()`/`getLegalMoves()`/`makeMove()`, all of which kept their signatures. Verified for real, not just by reading: added a full AI-vs-AI self-play test for each variant (see "Phase 3" below) asserting every single move the AI plays is accepted by the engine's own validation. |
| Game gateway (WebSocket, matchmaking/spectate/chat) | Y | Y | Y | Y | **Reconnected in Phase 3.** Fixed 3 spots building `GameRules` object literals that no longer matched the engine's shape, and in doing so found and fixed a real latent bug: the fallback default was hardcoded `{boardSize: 8, forceMajorityCapture: true}`, which is wrong for 8x8 (majority-capture should default false there). Now resolves defaults through the engine itself. Added 2 tests confirming a requested game actually gets the right variant's rules. |
| Analysis endpoint (`game/analysis.controller.ts`) | Y | Y | Y | Y | **Bug found and fixed in Phase 3** (pre-existing, not caused by the Phase 2 rebuild): `analyze()` constructed `new DraughtsEngine()` with no rules at all, always defaulting to 8x8. Since `getLegalMoves()`'s own scan is bounded by `rules.boardSize`, any 10x10 game submitted for analysis had pieces on rows 8–9 silently invisible to move generation — not clipped, just never considered. Fixed to derive board size (and accept explicit rules) from the submitted position. Had zero test coverage before this pass; now has 3 tests, including one that fails without the fix (verified by temporarily reverting it) so this can't silently regress. |
| Anticheat | Y | Y | Y | N | Not exercised live this pass. No TODO/stub markers in source. |
| Tournaments | Y | Y | Y | Y | Live-verified: `/tournaments` page rendered real seeded data ("Weekly Beginner Arena", format, status) — not a placeholder. |
| Puzzles | Y | Y | Y | Y | Live-verified: `/puzzles` rendered real seeded data ("Puzzle #4 - Difficulty: 1 - Find the best move for Dark") — dynamic, not hardcoded. |
| History | Y | Y | Y | N | Not exercised live this pass (no game was completed/saved in the test session). |

**Test run:** `npx jest` from `backend/` → 16 suites, 51 tests, all passing, ~1.6s (up from 44 as of Phase
2 — the +7 are the AI self-play pair, the 2 gateway rules-resolution tests, and the 3 new analysis
tests, minus consolidation). `tsc --noEmit` is fully clean again as of Phase 3 (was failing on
`game.gateway.ts` as of Phase 2, expected and now resolved). No `TODO`/`FIXME`/`not implemented`/
`placeholder` markers anywhere in `backend/src`. Caveat on the remaining unbolded modules above is
unchanged from Phase 0/1: their test coverage is still thin, mostly happy-path only.

## Frontend (Next.js)

| Page/Component | Exists (Y/N) | Wired to real backend (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|
| `/` (home — hosts `GameBoard`) | Y | Y | Y | **Live-verified end-to-end**: loaded with zero console errors, showed "Connected to server", started a vs-AI game on both 8x8 and 10x10, selected a piece (legal destination correctly highlighted green), executed a move, and received a real AI response move. This is a genuinely working game loop. |
| `GameBoard.tsx` | Y | Y | Y | Confirmed via the above — not a stub. |
| `/login` | Y | Y (1 API call) | Y | Renders correctly, zero console errors. |
| `/profile` | Y | Y (5 API calls) | Y | **Correction from Phase 0's static read**: unauthenticated visits client-side redirect to `/login` rather than erroring or showing broken data — this is correct auth-guard behavior, confirmed live. |
| `/puzzles` | Y | Y (1 API call) | Y | Confirmed live, renders real dynamic puzzle data, zero console errors. |
| `/tournaments` + `/tournaments/[id]` | Y | Y (1 + 4 API calls) | Y (list only) | List view confirmed live with real seeded data. Detail view (`[id]`) not driven this pass. |
| `/analysis/[id]` | Y | Y (2 API calls) | N | Not driven live this pass (needs a real game ID). |
| `/rankings` | Y | Y (calls `/users/rankings`, `/users/stats`) | Y | **Correction from Phase 0**: this was flagged "unverified." Now live-verified — renders correctly, zero console errors, zero failed requests, correct empty state on a fresh DB. Still not linked from any nav, so a real user can't reach it without typing the URL. |
| `Timer.tsx` (game clock component) | Y | N/A (not wired) | N | Still not imported/used anywhere. Unchanged from Phase 0. |
| Site-wide nav/sidebar | N | — | — | Still doesn't exist. Unchanged from Phase 0. |

**Type check:** `npx tsc --noEmit` from `frontend/` → clean, no errors.

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
