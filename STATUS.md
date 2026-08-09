# STATUS

Living source of truth for what's real vs. stub in dame-intel. Update this at the end of every phase.

Generated during Phase 0 repo cleanup (2026-08-09), consolidating ~85 abandoned branches / 91 open PRs
into a single `main`. Verification here is a first pass (compiled + tests run), not the full audit —
that's Phase 1's job.

## Backend (NestJS)

| Module | Exists (Y/N) | Has tests (Y/N) | Tests passing (Y/N) | Notes |
|---|---|---|---|---|
| Auth | Y | Y | Y | Controller + service + JWT guard. 1 test only (shallow). |
| Users | Y | Y | Y | Rankings/stats endpoints (`GET /users/rankings`, `/users/stats`) newly merged from a branch during this cleanup — **not wired to any frontend nav, not covered by tests**. Core CRUD/ELO methods have 2 tests. |
| Friends | Y | Y | Y | Controller + service + entity. 2 tests total (service + controller), happy-path only. |
| Game engine (`game/engine/engine.service.ts`) | Y | Y | Y | **Highest-risk module — flagged for Phase 2 rebuild.** Code supports configurable `boardSize` (8/10) and has max-capture-sequence filtering logic, but the spec file only has 4 tests covering: engine construction, initial board setup, rejecting a move by the wrong color, and one basic move. **Zero test coverage for**: mandatory capture, maximum-capture-sequence enforcement, multi-jump chains, king promotion, flying vs. non-flying kings, win/draw detection, or the 8x8/10x10 variant switch itself. This is exactly the gap the plan doc calls out — looks farther along in the code than the tests prove. |
| Game AI (`game/ai/ai/ai.service.ts`) | Y | Y | Y | 3 tests. |
| Game gateway (WebSocket, matchmaking/spectate/chat) | Y | Y | Y | 1 test (shallow). This is real, not mocked — frontend's `GameBoard.tsx` connects to it via `socket.io-client` for matchmaking, vs-AI, and spectator flows. |
| Anticheat | Y | Y | Y | 1 test (shallow). No TODO/stub markers found in source. |
| Tournaments | Y | Y | Y | Service + controller + 2 entities. 2 tests total, happy-path only. |
| Puzzles | Y | Y | Y | Service + controller + entity. 2 tests total, happy-path only. |
| History | Y | Y | Y | Service + controller + entity. 1 test (shallow). |

**Test run:** `npx jest` from `backend/` → 15 suites, 21 tests, all passing, 1.7s. TypeScript compiles clean
(`tsc --noEmit`). No `TODO`/`FIXME`/`not implemented`/`placeholder` markers found anywhere in `backend/src`.
Caveat: 21 tests across 10 modules is thin — most files have exactly 1 test and check only the happy path,
so "tests passing" should not be read as "verified correct," only "doesn't crash on the one case checked."

## Frontend (Next.js)

| Page/Component | Exists (Y/N) | Wired to real backend (Y/N) | Notes |
|---|---|---|---|
| `/` (home — hosts `GameBoard`) | Y | Y | Real gameplay: connects via Socket.IO to the game gateway for matchmaking, vs-AI, and spectating. Not a mock. |
| `GameBoard.tsx` | Y | Y | 432 lines, live socket connection, not a stub. |
| `/login` | Y | Y (1 API call) | |
| `/profile` | Y | Y (5 API calls) | |
| `/puzzles` | Y | Y (1 API call) | |
| `/tournaments` + `/tournaments/[id]` | Y | Y (1 + 4 API calls) | |
| `/analysis/[id]` | Y | Y (2 API calls) | |
| `/rankings` | Y | Y (calls `/users/rankings`, `/users/stats`) | **Newly merged from a branch during this cleanup, not linked from any nav — unreachable by a user unless they type the URL directly. Backend endpoints exist and compile but are untested.** |
| `Timer.tsx` (game clock component) | Y | N/A (not wired) | **Newly merged from a branch during this cleanup. Component exists and type-checks but is not imported/used anywhere yet (not wired into `GameBoard.tsx` or any timed-game flow).** |
| Site-wide nav/sidebar | N | — | No layout nav component exists. ~15 separate branches each reinvented a `Sidebar.tsx` chess.com-style layout; none were merged — all were AI-session scratch work (see cleanup notes below). |

**Type check:** `npx tsc --noEmit` from `frontend/` → clean, no errors, including after the rankings/timer merge.

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
  registration) — but it is **unverified and unwired into navigation**, flagged above.
- All other branches deleted, their PRs closed with: "Superseded during repo cleanup — consolidating
  all work into main."
