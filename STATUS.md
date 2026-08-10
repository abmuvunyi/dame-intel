# STATUS

Living source of truth for what's real vs. stub in dame-intel. Update this at the end of every phase.

Generated during Phase 0 repo cleanup (2026-08-09). Verified during Phase 1 (2026-08-10) by actually
running the backend test suite, type-checking both apps, and **launching both servers and driving them
with a headless browser** — not just reading code. See "How this was verified" below for exact method.

## Backend (NestJS)

| Module | Exists (Y/N) | Has tests (Y/N) | Tests passing (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|---|
| Auth | Y | Y | Y | Y | Controller + service + JWT guard. 1 test only (shallow). Live-verified indirectly: unauthenticated `/profile` correctly redirects to `/login` client-side. |
| Users | Y | Y | Y | Y | `GET /users/rankings` and `/users/stats` confirmed **live** — routes registered in the running Nest app, hit by the `/rankings` page with zero failed requests. Returns correct empty-state shape (no seeded rating data in a fresh DB, not an error). Core CRUD/ELO methods have 2 tests. |
| Friends | Y | Y | Y | N | Not exercised live this pass (no UI page hits it directly in the flows tested). Test coverage still just 2 tests, happy-path only. |
| Game engine (`game/engine/engine.service.ts`) | Y | Y | Y | **Partially** | **Still the highest-risk module.** Live-verified: legal-move highlighting, a real move, and an AI response all worked correctly for both 8x8 and 10x10 boards (see below). **NOT verified, live or in tests**: mandatory-capture enforcement, maximum-capture-sequence selection, multi-jump chains, king promotion, flying kings, win/draw detection. The one live move I drove was a simple non-capture opening move — the actual highest-risk rule (max-capture) was not exercised. This is Phase 2's job. |
| Game AI (`game/ai/ai/ai.service.ts`) | Y | Y | Y | Y | Live-verified: AI opponent responded with a legal-looking move immediately after the player's move, for both variants, with no errors. |
| Game gateway (WebSocket, matchmaking/spectate/chat) | Y | Y | Y | Y | Live-verified: real Socket.IO connection ("Connected to server"), vs-AI game creation, live move exchange. Not mocked. |
| Anticheat | Y | Y | Y | N | Not exercised live this pass. No TODO/stub markers in source. |
| Tournaments | Y | Y | Y | Y | Live-verified: `/tournaments` page rendered real seeded data ("Weekly Beginner Arena", format, status) — not a placeholder. |
| Puzzles | Y | Y | Y | Y | Live-verified: `/puzzles` rendered real seeded data ("Puzzle #4 - Difficulty: 1 - Find the best move for Dark") — dynamic, not hardcoded. |
| History | Y | Y | Y | N | Not exercised live this pass (no game was completed/saved in the test session). |

**Test run:** `npx jest` from `backend/` → 15 suites, 21 tests, all passing, ~1.7s. `tsc --noEmit` clean.
No `TODO`/`FIXME`/`not implemented`/`placeholder` markers anywhere in `backend/src`. Same result as Phase 0 —
nothing regressed. Caveat unchanged: 21 tests across 10 modules is thin, mostly happy-path only.

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
