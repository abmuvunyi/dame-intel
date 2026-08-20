# STATUS

Living source of truth for what's real vs. stub in dame-intel. Update this at the end of every phase.

Generated during Phase 0 repo cleanup (2026-08-09). Verified during Phase 1 (2026-08-10) by actually
running the backend test suite, type-checking both apps, and **launching both servers and driving them
with a headless browser** — not just reading code. Rules engine rebuilt test-first during Phase 2
(2026-08-10). Callers reconnected to the rebuilt engine in Phase 3 (2026-08-10). Frontend board rebuilt
in Phase 4 (2026-08-10). Real-time PvP matchmaking, server-authoritative clocks, and disconnect/reconnect
built in Phase 5 (2026-08-10). Glicko-2 rating system built in Phase 6 (2026-08-10). Puzzle solving,
rating, Storm mode, and generation pipeline built in Phase 7 (2026-08-11). Swiss-pairing tournaments built
in Phase 8 (2026-08-11). Organizer-configurable tournament settings (registration caps, game
format/duration, points system) built in Phase 8b (2026-08-12). Spectator mode and a live-games dashboard
built in Phase 9 (2026-08-13). Social features — friends, in-game/club chat moderation, clubs, and direct
challenges — built in Phase 10 (2026-08-14). Post-game analysis board (verified/extended) and automated
move-by-move review (best/good/inaccuracy/mistake/blunder classification + accuracy) built in Phase 11
(2026-08-17). Anti-cheat system — move-time anomaly + engine-correlation detection, a moderator review
queue, and graduated-response scaffolding with real login/WebSocket enforcement — built in Phase 12
(2026-08-18). See "How this was verified" below for exact method, and the per-phase sections below for each
phase specifically.

## Backend (NestJS)

| Module | Exists (Y/N) | Has tests (Y/N) | Tests passing (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|---|
| Auth | Y | Y | Y | Y | Controller + service + JWT guard. 1 test only (shallow). Live-verified indirectly: unauthenticated `/profile` correctly redirects to `/login` client-side. |
| Users | Y | Y | Y | Y | `GET /users/rankings` and `/users/stats` confirmed **live** — routes registered in the running Nest app, hit by the `/rankings` page with zero failed requests. Returns correct empty-state shape (no seeded rating data in a fresh DB, not an error). Core CRUD/ELO methods have 2 tests. **Phase 12** adds `applyModeration()`/`isCurrentlyBanned()` — the only place `moderationStatus` is ever written, and the single source of truth for "is this ban actually in effect right now" (a `TEMP_BANNED` user whose ban already expired reads as not-banned without the status itself being auto-cleared). 7 new tests against real in-memory sqlite. |
| Friends (`friends.service.ts`/`friends.controller.ts`) | Y | Y | Y | Y | **Extended in Phase 10 (2026-08-14)**, not rebuilt — send/accept already existed. Added `decline` (deletes the request outright rather than a permanent 'DECLINED' status, so a fresh request can be sent again later) and a live `online` field per friend, backed by the new `PresenceService`. 10 tests against real in-memory sqlite (was 1 trivial "should be defined" stub). Live-verified end-to-end, including real online-status flips as a real socket connects/disconnects. |
| `presence/presence.service.ts` | Y | Y | Y | Y | **New in Phase 10.** Minimal in-memory online-status registry — `GameGateway` marks a user online/offline on real connect/disconnect (with the same "still their current socket?" guard used elsewhere for reconnect races), `FriendsService` reads it for the friends list. 4 tests, plus 3 gateway-integration tests. |
| Clubs (`clubs.service.ts`/`clubs.controller.ts` + `Club`/`ClubMembership`/`ClubPost` entities) | Y | Y | Y | Y | **New in Phase 10.** Create/join/leave, member list, and a basic flat (no threading) club-only discussion feed — posting/reading both gated on real membership, not just being logged in. Reuses `chat-filter.ts`'s profanity filter for posts. 21 tests against real in-memory sqlite. A real (minor) ordering bug found and fixed: the feed originally sorted by `createdAt`, but sqlite's datetime column is only second-precision, so two posts made within the same second could tie and return in either order — fixed by sorting on `id` instead, which is strictly monotonic with insertion order. |
| Game engine (`game/engine/engine.service.ts`) | Y | Y | Y | Y | **Rebuilt in Phase 2 (2026-08-10).** 27 tests, all passing, covering every category the plan doc requires: forced capture, maximum-capture-sequence (3 scenarios grounded in FMJD Annex 1 articles 4.13/4.14, plus a 4th covering the king "corner-turn" rule at 4.6), multi-jump chains, king promotion mid-chain (4.15), flying vs. non-flying kings, and draw detection (6.1 threefold repetition, 6.2 no-progress rule) for both variants. Two real bugs fixed: kings always flew regardless of board size (should be non-flying for 8x8 American), and men always allowed backward captures regardless of variant (American men should be forward-only). Still framework-independent (no NestJS imports). |
| Game AI (`game/ai/ai/ai.service.ts`) | Y | Y | Y | Y | **Reconnected in Phase 3.** Needed no source changes at all — it already went through `engine.getRules()`/`getLegalMoves()`/`makeMove()`, all of which kept their signatures. Verified for real, not just by reading: added a full AI-vs-AI self-play test for each variant (see "Phase 3" below) asserting every single move the AI plays is accepted by the engine's own validation. |
| Game gateway (WebSocket, matchmaking/spectate/chat) | Y | Y | Y | Y | **Reconnected in Phase 3; matchmaking/clocks/reconnect built in Phase 5; spectator mode completed and load-tested in Phase 9; chat moderation + presence + challenge UI wiring in Phase 10** — see "Phase 5", "Phase 9", and "Phase 10" below for the full breakdowns. |
| `game/chat-filter.ts` (profanity + spam filter) | Y | Y | Y | Y | **New in Phase 10.** Pure, framework-independent (same pattern as the engine/matchmaking) — word-boundary wordlist censor plus a sliding-window rate limit. 13 unit tests plus 5 gateway-integration tests proving it's actually wired into `sendMessage`. Reused as-is for club discussion posts. |
| Direct challenges (`challengePlayer`/`respondToChallenge`) | Y | N (pre-existing) | — | Y | **Backend built in Phase 5, frontend UI built in Phase 10.** No new backend tests added this phase (mechanism itself untouched) — live-verified instead, including the full real two-browser accept flow. See "Phase 10" below. |
| `matchmaking.ts` (rating-band seek pairing) | Y | Y | Y | Y | **New in Phase 5.** Pure, framework-independent pairing logic (same design pattern as the engine) — 15 tests. |
| `time-control.ts` | Y | N (data only) | — | Y | **New in Phase 5.** Bullet/blitz/rapid/correspondence bands; exercised indirectly through the gateway/matchmaking tests. |
| Analysis endpoint (`game/analysis.controller.ts`) | Y | Y | Y | Y | **Bug found and fixed in Phase 3** (pre-existing, not caused by the Phase 2 rebuild): `analyze()` constructed `new DraughtsEngine()` with no rules at all, always defaulting to 8x8. Since `getLegalMoves()`'s own scan is bounded by `rules.boardSize`, any 10x10 game submitted for analysis had pieces on rows 8–9 silently invisible to move generation — not clipped, just never considered. Fixed to derive board size (and accept explicit rules) from the submitted position. Had zero test coverage before this pass; now has 3 tests, including one that fails without the fix (verified by temporarily reverting it) so this can't silently regress. **Reused live in Phase 11** as the exact engine query the automated review's replay pass is built on. |
| Anticheat (`anticheat.service.ts`) | Y | Y | Y | Y | **Real bug found and fixed in Phase 11**, discovered while building the near-identical post-game review replay pass: `analyzeGameForCheating()` had the *exact same* "no rules passed, silently defaults to 8x8" bug Phase 3 already fixed in `analysis.controller.ts` — just never caught here. Confirmed directly (not assumed): for a 10x10 game, the very first recorded move already fails to apply on the wrong-sized engine, freezing the "replay" at the initial position for the whole game. Fixed by accepting an optional `rules` parameter (backward compatible) and passing `room.rules` from the gateway call site. New regression test proves a real 10x10 self-play replay tracks genuinely distinct positions move-to-move with rules passed, versus staying frozen (well under the move count) without them. **Phase 12** rebuilt detection on top of this: engine-correlation now restricted to critical positions (see below), plus a new move-timing anomaly detector. Both only ever create `CheatFlag` rows — see "Phase 12" below for the full moderator-review/graduated-response design and the exact thresholds. |
| `anticheat/move-timing-stats.ts` | Y | Y | Y | Y | **New in Phase 12.** Pure, framework-independent (same pattern as the engine/matchmaking/chat-filter/move-classification modules) — coefficient-of-variation-based think-time consistency check. 10 tests. |
| Moderator review queue (`GET/POST /anticheat/admin/*`) | Y | Y | Y | Y | **New in Phase 12.** No admin-role system exists in this codebase (same documented simplification as Phase 7's puzzle admin routes and Phase 8b's tournament lifecycle routes) — lists flags, and applies a moderator's decision. Explicitly the *only* code path that can ever write `User.moderationStatus` — the detection methods themselves never do. |
| Graduated response (`User.moderationStatus`/`tempBanUntil`) | Y | Y | Y | Y | **New in Phase 12.** WARNED/RATING_RESET_FLAGGED/TEMP_BANNED/PERMA_BANNED states, settable only via the moderator endpoint above. Real enforcement wired at both `AuthService.signIn` (login rejected) and `GameGateway.handleConnection` (WebSocket authentication rejected) — live-verified end-to-end, not just scaffolding that sits unused. |
| `game/review/move-classification.ts` | Y | Y | Y | Y | **New in Phase 11.** Pure, framework-independent (same pattern as the engine/matchmaking/chat-filter) — explicit, documented eval-delta thresholds classify each move as BEST/GOOD/INACCURACY/MISTAKE/BLUNDER, plus a simple credit-weighted accuracy-percentage formula. 14 tests covering every threshold boundary on both sides and the accuracy formula's edge cases. See "Phase 11" below for the exact thresholds and their reasoning. |
| `game/review/game-review.service.ts` + `GameReview` entity | Y | Y | Y | Y | **New in Phase 11.** The actual "automated post-game review" — replays a completed game's real recorded moves on a real engine, queries `AiService.analyzePosition()` at every position (the same call `analysis.controller.ts` already exposes), classifies each move, and persists per-move classifications plus per-player accuracy so a viewer never triggers a recompute. Triggered fire-and-forget from `game.gateway.ts`'s `handleGameOver` — same established "don't block the gateway, it's CPU intensive" pattern already used for anti-cheat, for every completed game including vs-AI (unlike anti-cheat, which only applies between two humans). 13 tests against real in-memory sqlite + a real (not mocked) `AiService`, including a genuine worked example (one deliberately suboptimal move among several best-play moves) and a separate mocked suite proving a mid-analysis failure is recorded as `FAILED` with the error message, not silently swallowed. |
| `GET /game-review/:gameId` | Y | Y (via service tests) | Y | Y | **New in Phase 11.** Returns the stored review instantly, or an explicit `NOT_STARTED`/`PENDING` status while the async pass hasn't finished — never recomputes on a GET. |
| Tournaments (Arena — pre-existing) | Y | Y | Y | Y | Live-verified: `/tournaments` page rendered real seeded data ("Weekly Beginner Arena", format, status) — not a placeholder. Untouched by Phase 8; its exact original code paths (`updateTournamentScore` inline in `game.gateway.ts`, the `@Cron` auto-start logic) remain as-is. |
| Tournaments — Swiss (`tournaments.service.ts` lifecycle/pairing methods) | Y | Y | Y | Y | **New in Phase 8 (2026-08-11).** Full SCHEDULED → REGISTRATION_OPEN → IN_PROGRESS → COMPLETED lifecycle, automatic round generation/advancement, Buchholz tiebreak standings. See "Phase 8" below. |
| `tournaments/swiss-pairing.ts` | Y | Y | Y | Y | **New in Phase 8.** Pure, framework-independent pairing algorithm (same pattern as `matchmaking.ts`/`glicko2.ts`) — greedy score-sorted pairing, bye to the lowest score without one yet, avoids rematches where a fresh opponent exists in the pool. 10 tests, including a full printed 8-player/3-round walkthrough. Documented limitation: no backtracking, so a small field pushed over many rounds can occasionally be forced into a rematch — see "Phase 8" below. |
| `SwissRound` / `SwissPairingRecord` entities | Y | Y (via service tests) | Y | Y | **New in Phase 8.** Persist each round and its pairings/results against real relational queries in `tournaments-swiss.service.spec.ts` (in-memory sqlite, not mocked repos). |
| Tournament organizer settings (`Tournament.maxParticipants`/`timeControlName`/`boardSize`/`ruleVariant`/`pointsWin`/`pointsDraw`/`pointsLoss`) | Y | Y | Y | Y | **New in Phase 8b (2026-08-12).** Registration caps, per-tournament board variant + time control (overrides any individual player's request for a Swiss game), and a fully configurable points system. See "Phase 8b" below — including a real pre-existing scoring bug (drawn games always recorded 0 points instead of 0.5) found and fixed along the way. |
| Puzzles (`puzzles.service.ts` + entity) | Y | Y | Y | Y | **Rebuilt in Phase 7 (2026-08-11)** — real engine-validated solving, its own Glicko-2 rating pool, Storm mode, and a generation pipeline. See "Phase 7" below for the full breakdown, including a real bug fixed: the previous version sent the puzzle's solution straight to the client and validated moves with a client-side coordinate comparison, meaning it could be read out of the network tab and solved without knowing draughts at all. |
| History | Y | Y | Y | Y | **Live-verified in Phase 7**: a real PvP game's resignation correctly produced a `GameHistory` row, confirmed by querying `/history/player/:id` on the running server. **Phase 12** adds `moveTimings` — per-move think-time in ms, parallel-indexed to `moves`, nullable for pre-existing rows — the raw data move-time anomaly detection is built on. |
| `rating/glicko2.ts` | Y | Y | Y | Y | **New in Phase 6.** Pure Glicko-2 implementation, verified against the algorithm's own published worked example (exact match) plus 7 property tests. Reused as-is for puzzle ratings in Phase 7. See "Phase 6" below. |
| `rating/rating.service.ts` + entities (`PlayerRating`, `RatingHistoryEntry`) | Y | Y | Y | Y | **New in Phase 6.** Per-(variant, time control) rating pools, provisional status, rating history. 7 tests against a real in-memory sqlite DB. |
| `GET /rating/:userId`, `GET /rating/:userId/history` | Y | Y | Y | Y | **New in Phase 6.** Live-verified against a real completed PvP game — see "Phase 6" below for the actual before/after numbers. |
| `puzzles/puzzle-generator.service.ts` | Y | Y | Y | Y | **New in Phase 7.** Scans completed games for a missed 2+-piece capture; flags `pending` candidates for review. See "Phase 7" below for the worked example. |
| `GET/POST /puzzles/admin/*` (pending/approve/reject/generate) | Y | Y | Y | Y | **New in Phase 7.** No admin-role system exists in this codebase (no `isAdmin` flag) — these just require being logged in, same bar as the rest of the app; documented as a known simplification, not invented as a side effect of this phase. |
| `puzzles/puzzle-rush.service.ts` (Puzzle Storm) | Y | Y | Y | Y | **New in Phase 7.** Server-authoritative timing (same principle as Phase 5's game clocks), streak, score. |

**Test run:** `npx jest` from `backend/` → 33 suites, 283 tests, all passing, ~1s (up from 237 as of
Phase 11 — the +46 are Phase 12's `move-timing-stats.spec.ts` (10 new), `anticheat-review.service.spec.ts`
(14 new, real in-memory sqlite — engine-correlation, timing detection, and the full moderator review queue
end to end), `anticheat.controller.spec.ts` (7 new), `users.service.spec.ts` (+7, graduated-response
persistence), `auth.service.spec.ts` (+5, ban enforcement at login), and 3 new tests in `game.gateway.spec.ts`
(anti-cheat call-argument wiring + banned-connection rejection) — see "Phase 12" below). `tsc --noEmit`
clean across the whole backend. No `TODO`/`FIXME`/`not implemented`/
`placeholder` markers anywhere in `backend/src`. Caveat on the remaining unbolded modules above is
unchanged from Phase 0/1: their test coverage is still thin, mostly happy-path only.

## Frontend (Next.js)

| Page/Component | Exists (Y/N) | Wired to real backend (Y/N) | Verified (Y/N) | Notes |
|---|---|---|---|---|
| `/` (home — hosts `GameBoard`) | Y | Y | Y | **Board rebuilt in Phase 4 (2026-08-10).** Live-verified end-to-end for both variants and both interaction modes — see "Phase 4" below for the full breakdown. Also handles spectating via `?watch=<roomId>` as of Phase 9, and (Phase 10) shows a live "Friends Online" list with a Challenge button, plus a challenge-received banner. |
| `GameBoard.tsx` | Y | Y | Y | **Rebuilt in Phase 4** as a thinner orchestrator (socket/game-state logic only) composing 4 new sub-components. **Phase 9** fixed a real pre-existing bug: it read `window.location.search` by hand instead of Next's reactive `useSearchParams()`, which could permanently lock in a stale (empty) query-param value when arriving via a client-side route transition rather than a full page load — affected both the new `?watch=` spectate flow and the pre-existing Phase 5 `?tournamentId=` flow identically. Now wrapped in `Suspense` and uses `useSearchParams()`, which doesn't have this problem. **Phase 10** adds the first real UI for Phase 5's direct-challenge mechanism, deliberately placed here (not a separate page) because `respondToChallenge` creates the game room from the exact socket connection present when the challenge is issued/accepted — it has to be the same long-lived socket that then plays the game. |
| `/watch` (live games dashboard) | Y | Y | Y | **New in Phase 9 (2026-08-13).** Lists every active game with both players' usernames, ratings, variant, board size, time control, and current spectator count; "Watch" navigates to `/?watch=<roomId>`. |
| `/clubs` + `/clubs/[id]` | Y | Y | Y | **New in Phase 10.** List/create/join on the index page; detail page shows member list, join/leave, and the club-only discussion feed (only rendered/postable once membership is confirmed against the real `GET /clubs/:id/posts` — a 400 there is treated as "not a member yet", not an error). |
| `Board.tsx` | Y | Y | Y | **New in Phase 4.** Board rendering, orientation/flip, drag-and-drop + click-click move input, move animation. Never computes legal moves itself — only ever filters the `legalMoves` array the server sends. |
| `MoveList.tsx` | Y | Y | Y | **New in Phase 4.** Real move history in FMJD-style square-numbering notation. |
| `CapturedTray.tsx` | Y | Y | Y | **New in Phase 4.** Per-side captured-piece tally, derived from the actual captured piece data at the moment of capture (not guessed after the fact). |
| `ConnectionStatus.tsx` | Y | Y | Y | **New in Phase 4.** Reflects real socket connect/disconnect events. |
| `/login` | Y | Y (1 API call) | Y | Renders correctly, zero console errors. |
| `/profile` | Y | Y (5 API calls) | Y | Unauthenticated visits client-side redirect to `/login` — correct auth-guard behavior, confirmed live (Phase 1). **Phase 10** extended the existing Friends tab (per the brief: "verify and extend rather than rebuild") with a Decline button and a live green/gray online-status dot per friend. **Phase 11** adds a per-game accuracy badge to the Match History list, fetched from the already-computed review (never recomputed client-side). |
| `/puzzles` | Y | Y | Y | **Rebuilt in Phase 7.** Reuses `Board.tsx` (Phase 4) instead of its own bespoke board — real drag/click, real legal-move highlighting fetched from `GET /puzzles/:id/legal-moves`, moves validated via `POST /puzzles/:id/attempt`. Confirmed live: the solution never appears in any network response (checked every `/puzzles/*` response body across a full solve), zero console errors. |
| `/puzzles/rush` (Puzzle Storm) | Y | Y | Y | **New in Phase 7.** Live-verified: real countdown, score, and streak UI backed by the server-authoritative rush session. |
| `/tournaments` + `/tournaments/[id]` | Y | Y (1 + 4 API calls) | Y (list only) | List view confirmed live with real seeded data. Detail view (`[id]`) not driven live this pass. |
| `/analysis/[id]` | Y | Y (2 API calls, +1 in Phase 11) | Y | **Board/replay verified and extended in Phase 11** (was un-driven-live before): the existing step-forward/back board and on-demand "Run Engine" query both confirmed working; new accuracy summary panel, a per-move classification badge, and a clickable move-by-move classification strip, all backed by `GET /game-review/:id` (polls every 3s only while the review is still PENDING). Live-verified with Playwright against a real completed review. |
| `/rankings` | Y | Y (calls `/users/rankings`, `/users/stats`) | Y | Live-verified — renders correctly, zero console errors, correct empty state on a fresh DB. Still not linked from any nav. |
| `Timer.tsx` | Y | Y | Y | Wired in during Phase 4 (was orphaned since Phase 0); **as of Phase 5, genuinely server-authoritative** — it's fed a live-computed snapshot of the backend's real clock/turnStartedAt on every move, not a fixed cosmetic constant. See "Phase 5" below. |
| Site-wide nav/sidebar | N | — | — | Still doesn't exist. Unchanged from Phase 0. Not in scope for Phases 4 or 5. |
| Direct-challenge-by-user-ID UI | Y | Y | Y | **Built in Phase 10** (the gap this row tracked since Phase 5) — "Friends Online" list + Challenge button on `/`, an incoming-challenge banner with Accept/Decline, wired to the existing `challengePlayer`/`challengeReceived`/`respondToChallenge` events. Live-verified with two real browser tabs (see "Phase 10" below). |
| `/moderation` (moderator review queue) | Y | Y | Y | **New in Phase 12.** Lists real unreviewed `CheatFlag` rows with user/reason/score/sample size, a link to the supporting game where one exists, and Dismiss/Warn/Rating-Reset/Temp-Ban/Perma-Ban actions. Not linked from any nav — same "no admin-role system, just requires login" simplification as the backend endpoints it calls. Live-verified with Playwright against a real flag, including the toggle to reveal reviewed flags. |

**Type check:** `npx tsc --noEmit` from `frontend/` → clean, no errors. **Production build** (`npm run build`,
not just the type-check) → succeeds, all 14 routes generated (Phase 12 adds `/moderation`), zero build
errors.

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

## Phase 8b: organizer-configurable tournament settings (2026-08-12)

User feedback on Phase 8's initial report: a real Swiss tournament organizer needs to control more than
just round count — who can register (and how many), what format the games themselves are played in, and
how tournament points are awarded. Scoped deliberately smaller than "build full multi-stage tournaments"
(group stages → knockout, etc.) — that's a materially different, much larger undertaking (essentially the
Arena/Knockout work the Phase 8 brief explicitly deferred) and was consciously left for its own future
phase rather than folded in here. This phase adds organizer knobs to the Swiss format that already exists.

**1. Registration caps.** `Tournament.maxParticipants` (nullable — `null` means unlimited, preserving
Phase 8's original unlimited behavior for any tournament that doesn't set it). `joinTournament()` counts
current registrations and throws `BadRequestException('Tournament is full')` once the cap is reached —
deliberately a thrown exception rather than the silent `null` return the existing "wrong lifecycle stage"
check uses, since "full" is a distinct, actionable condition worth its own message to the client. Re-joining
an already-registered player is still a no-op and never counts twice against the cap.

**2. Game format and duration.** `Tournament.boardSize` / `ruleVariant` (International 10x10 vs. American
8x8 — reuses `engine.service.ts`'s existing `GameRules.variant`) and `timeControlName` (reuses Phase 5's
`time-control.ts` bands). Previously, `tryJoinSwissPairing()` in `game.gateway.ts` built each Swiss game's
rules from whatever the *connecting client* happened to pass in its `joinMatchmaking` call — meaning two
different players in the same tournament could, in principle, request different formats, and neither was
actually deciding for anyone but themselves. Now it derives the game entirely from the tournament's own
configured settings and ignores whatever the client requests: the organizer sets the format once at
creation, and it governs every single game in the event, live-verified below.

**3. Configurable points system.** `Tournament.pointsWin` / `pointsDraw` / `pointsLoss` (defaults 1 / 0.5 / 0
— Phase 8's original hardcoded values, so any unconfigured tournament scores identically to before).
`updateTournamentScore()` now looks these up per-tournament instead of using literal constants.

**4. `createTournament()` signature.** Extended to accept an options object (`CreateTournamentOptions`) for
all of the above, while still accepting the original bare `totalRounds` number as a second, backward-
compatible overload — every one of Phase 8's 17 existing service tests, and the gateway's Swiss integration,
needed zero changes.

**A real, pre-existing bug found and fixed, not introduced by this phase's own code.** Writing a test that
asserted a drawn game's points landed correctly surfaced this: `TournamentPlayer.score` had no explicit
`'float'` column type, so TypeORM's sqlite driver silently treated it as `integer` — confirmed directly by
inspecting the actual generated table DDL (`"score" integer NOT NULL DEFAULT (0)`). Every drawn game, in
Arena or Swiss, in every phase back to whenever the tournament system was first built, has been recording
**0 points instead of 0.5** for both players — the `+= 0.5` in `updateTournamentScore` was executing
correctly, but sqlite truncated the value on write. This predates Phase 8 entirely; it was never caught
because no prior test round-tripped a fractional score through an actual database (only through in-memory
JS objects, or with test setups that happened not to produce a draw). Every other fractional-value entity
in this codebase — `PlayerRating`, `RatingHistoryEntry`, `PlayerPuzzleRating`, `Puzzle`'s own rating fields
— already used `'float'` correctly (established in Phase 6); this one column was simply missed. Fixed by
adding `'float'` to both `TournamentPlayer.score` and the three new `pointsWin`/`pointsDraw`/`pointsLoss`
columns, confirmed with a standalone before/after repro script and a permanent regression test
(`tournaments-swiss.service.spec.ts`: "awards exactly 0.5 points to both players in a drawn game, not 0").

**11 new tests**: `tournaments-organizer-settings.service.spec.ts` (8, real in-memory sqlite — default
values, the options object, the legacy bare-number call, registration-cap enforcement including the
no-double-counting-a-rejoin case, and custom points including bye scoring), 2 new `game.gateway.spec.ts`
tests (a Swiss game uses the tournament's configured 8x8/american/rapid format even when both connecting
clients explicitly request 10x10/international/bullet; a Swiss `joinMatchmaking` call never falls through
to the generic rating-band queue), and the 1 drawn-game regression test above.

### Live verification

Restarted the backend against a fresh sqlite DB and ran three scenarios as standalone Node scripts against
the real running server (real HTTP registration/auth, real tournament REST calls, real `socket.io-client`
WebSocket connections):

- **Registration cap**: created a tournament with `maxParticipants: 2`, joined 2 real registered users
  successfully, the 3rd real user's join was rejected live with `400 {"message":"Tournament is full"}`.
- **Custom points**: created a "football rules" tournament (`pointsWin: 3, pointsDraw: 1, pointsLoss: 0`),
  played a real game to a real resignation over a real WebSocket connection, confirmed the winner's live
  standings entry read exactly `3` (not the old hardcoded `1`) and the loser's read `0`.
- **Organizer-configured format overrides the client**: created an 8x8 American / rapid-clock tournament,
  had both connecting players' `joinMatchmaking` calls explicitly request the *opposite* — 10x10
  International / bullet — and confirmed the real `gameStart` payload both players received actually
  contained an 8-row board and `timeControl: 'rapid'`, proving the client's request was genuinely ignored
  in favor of the tournament's own setting, not just untested.
- Re-ran Phase 8's original 8-player/3-round Swiss walkthrough end-to-end afterwards to confirm no
  regression in the default (fully-unconfigured) path — identical correct output to Phase 8's report.
- Backend log checked for errors during all of the above: none beyond the pre-existing, already-documented
  Redis connection warnings.

**Known simplifications, stated plainly:**
- Settings are fixed at creation and cannot be edited afterwards (no `PATCH` endpoint) — same treatment as
  Phase 8's `totalRounds`. An organizer who wants to change the cap or points system after creating the
  tournament has to create a new one; editing mid-registration is a reasonable follow-up, not built here.
- This phase intentionally does **not** touch tournament *format* variety (group stages, knockout brackets,
  multi-stage progression) — only makes the Swiss format that exists more configurable. Multi-stage formats
  remain out of scope, per the same boundary the Phase 8 brief itself drew around Arena/Knockout.
- Arena tournaments now technically have the same points/format columns available on `Tournament` (for
  schema simplicity, one shared entity) but nothing reads them for Arena — its scoring and format stay
  exactly as hardcoded in `game.gateway.ts`'s Arena branch, untouched.

## Phase 9: spectator mode and a live-games dashboard (2026-08-13)

Checked existing scaffolding first, per the established pattern — and unlike most phases, this one wasn't
starting from a stub: `getActiveGames`, `joinSpectator`, and read-only move rejection for non-players all
already existed and worked, along with a minimal inline "Live Games" list on the homepage. This phase
completed and hardened what was there rather than building spectator mode from scratch — enriching the
dashboard data, giving it a real dedicated page, and specifically load-testing the one claim that had never
actually been verified: that broadcast fan-out to many spectators doesn't cost the players anything.

**1. Live-games dashboard.** `getActiveGames` used to return only `roomId`/two usernames/`spectatorsCount`.
Now every entry also carries both players' ratings, the variant (`international`/`american`), board size,
time control, and whether it's a vs-AI game — everything `GameRules`/`TimeControl` already tracked on the
room, just not exposed. New `/watch` page (Next.js) polls this every 4s over its own socket connection (no
auth required, matching `joinSpectator`'s existing no-auth-required design) and renders it as a real
dashboard — not just the homepage's compact inline list, which still exists unchanged alongside it.

**2. Spectating.** `joinSpectator` already joined the spectator into the exact same socket.io room the two
players are in (`client.join(room.roomId)`), so every `server.to(roomId).emit(...)` — `gameState`,
`gameOver`, chat — was already reaching them in real time; `makeMove` already rejected non-players outright
(`{ error: 'Not a player in this game' }`, verified by a new test that also confirms the engine's actual
board state is untouched by a rejected move, not just that an error came back). What was missing was a way
to *reach* a specific game to spectate without already being on the homepage with it in view: clicking
"Watch" on `/watch` now navigates to `/?watch=<roomId>`, and `GameBoard.tsx` auto-joins as a spectator on
connect when that param is present, reusing 100% of the existing spectator rendering path (no color, no
legal moves, read-only) rather than building a second board component.

**Two real bugs found while verifying this, not introduced by it:**

- **Spectator count never decremented.** `handleJoinSpectator` broadcast an updated `spectatorJoined` count
  on arrival; nothing broadcast one when a spectator's socket disconnected — `room.spectators` shrank
  correctly, the count everyone was shown just silently never reflected it. Fixed in `handleDisconnect`,
  covered by a regression test asserting the count goes back down, not just up.
- **Stale search params across a client-side route transition.** This is the one that actually blocked
  `/watch`'s "Watch" button from working at all during verification. `GameBoard.tsx` read
  `window.location.search` by hand during render and captured it in a `useEffect` with an empty dependency
  array. On a full page load this is fine; on a client-side transition (`router.push` from another page —
  exactly what clicking "Watch" does), React can commit the component's first render while
  `window.location` still reflects the *previous* URL, and since the effect only ever runs once, whatever
  it saw at that moment is what it's stuck with — even though later renders correctly compute the right
  value (confirmed directly: added a temporary debug log showing `roomIdToSpectate` was `null` on the first
  render and correct on every render after, while the effect had already locked in `null`). Traced by
  instrumenting the actual browser console during a failing Playwright run, not guessed. This is not a new
  bug: `?tournamentId=` (wired in Phase 5, reached via `router.push` from `/tournaments/[id]`) reads from
  the exact same hand-parsed `searchParams` in the exact same component and was equally exposed the whole
  time — it just never had a test that clicked through via a client-side transition instead of a direct URL
  load. Fixed by switching to Next.js's `useSearchParams()` (which is driven by the router's own resolved
  state, not raw `window.location`, so it's already correct on the very first render) and wrapping
  `GameBoard` in a `Suspense` boundary, which `useSearchParams()` requires. Fixes both the new `?watch=` path
  and the pre-existing `?tournamentId=` path with the same change — not verified with a second dedicated
  live test for `?tournamentId=` specifically, since it's the identical hook in the identical component; the
  `?watch=` live test below exercises the same mechanism.

**7 new tests**, all in `game.gateway.spec.ts`: 2 for the enriched `getActiveGames` payload (ratings,
variant, board size, time control, live spectator count), 5 for spectator mode (read-only enforcement with
engine-state-unchanged verification, joining the correct broadcast room, and the count-decrements
regression above).

### Live verification: does spectator fan-out cost the players anything?

This was the actual point of the phase, so it got a dedicated live load test rather than a unit test (unit
tests can prove correctness, not real socket I/O timing under concurrency) — a standalone Node script using
real `socket.io-client` connections against the real running server:

1. Two real players play 20 real alternating moves (10 each) in a fresh game with **zero spectators**,
   measuring real round-trip latency (`makeMove` emitted → `gameState` received back) for every move.
2. A fresh game is created, then **300 real spectator sockets** connect and join it for real.
3. The same two players play another 20 real moves in that game, measured the same way — while a 10-socket
   sample of the 300 spectators is independently checked to confirm every single one of them actually
   received every single `gameState` broadcast in real time (not just connected and silent).

```
--- Comparison ---
  0 spectators:                 avg=0.23ms  median=0.26ms  p95=0.26ms  max=0.26ms
  300 spectators:  avg=0.53ms  median=0.39ms  p95=0.90ms  max=0.90ms
  median delta: +0.13ms
```

All 30/30 sampled spectator-move broadcast receipts landed (10 spectators × 20 moves live sample), and the
move round-trip latency the two actual players experienced was statistically indistinguishable with 300
concurrent spectators versus none — a fraction of a millisecond of difference on a single dev machine, not
a measurable degradation. This confirms `server.to(roomId).emit(...)`'s room-broadcast fan-out is exactly
what it looks like from the code: a synchronous loop writing to each connected socket's transport, not
something that blocks or serializes behind the authoritative game loop. Also separately live-verified with
Playwright: a real browser navigating `/watch` → clicking "Watch" → landing in a genuine real-time spectator
view (board, live move list updating the instant a real move was made server-side, no Resign/Offer Draw
buttons shown), zero browser console errors throughout.

Backend log checked for errors during both live runs: none beyond the pre-existing, already-documented
Redis connection warnings.

**Known simplifications, stated plainly:**
- `/watch` re-polls `getActiveGames` every 4 seconds rather than the server pushing list changes — simple
  and sufficient for a first dashboard; a server-push model (e.g. broadcasting on every game start/end)
  would make it feel more instantaneous but wasn't necessary to satisfy the brief.
- The load test used a single dev machine and a single Node process driving all 300 spectator connections
  (not 300 separate real clients across a network) — representative of the server-side broadcast cost, but
  not a full distributed-load/production-network test.
- Spectator sockets never authenticate and aren't rate-limited per IP; watching is intentionally as open as
  the rest of the app's anonymous read paths (e.g. `/tournaments` standings), not a new gap introduced here.

## Phase 10: social — friends, clubs, chat moderation, direct challenges (2026-08-14)

Per the brief, "a friends module already exists — verify and extend rather than rebuild if it's sound." It
was sound: `sendFriendRequest`/`acceptFriendRequest`/`getFriendsList` all worked correctly and already had a
real (if thin) `/profile` UI. This phase extended what was there — decline, online status, a chat filter,
the challenge UI that never got built in Phase 5 — and added Clubs from scratch, since nothing like it
existed at all.

**1. Friends: decline + online status.** `declineFriendRequest()` deletes the request row outright rather
than marking it some 'DECLINED' status — `sendFriendRequest`'s existing duplicate check doesn't filter by
status, so a kept 'DECLINED' row would have silently blocked either side from ever sending a fresh request
again. New `presence/presence.service.ts`: a minimal in-memory `Set<userId>`, updated by `GameGateway` on
real connect/disconnect (reusing the exact same "is this socket still their current one?" guard already
built for the reconnect-grace-period logic, so a stale disconnect event from an old socket can't flicker
someone offline right after they've reconnected under a new one). `FriendsService.getFriendsList()` now
reads it directly — "online" always means "has a live socket right now," nothing persisted, nothing that
could go stale across a server restart because there's nothing to restore.

**2. In-game chat: profanity + spam filtering.** New `game/chat-filter.ts` — pure and framework-independent,
same pattern as the engine/matchmaking/swiss-pairing modules. `filterMessage()` censors wordlist matches
with word-boundary regex (so "shit" gets caught but "Shitake" doesn't), `isRateLimited()`/
`pruneAndRecordTimestamp()` implement a sliding 10-second/5-message window. The actual per-socket timestamp
history is real mutable gateway state (like `disconnectTimers`); only the threshold *decision* is the pure,
independently-tested part. Wired into `sendMessage`: a rate-limited sender gets a `chatError` back and
nothing is broadcast; everyone else's messages get filtered before broadcasting, never after (spectators
included, as before — chat was never restricted to just the two players, and this phase didn't add that
restriction). Reused as-is for club discussion posts (see below) — no spam limit there since a REST-posted
feed doesn't have the same rapid-fire failure mode a live chat does.

**3. Clubs — new from scratch.** `Club` (name, description, creator), `ClubMembership`, `ClubPost` (a flat,
unthreaded feed — "full forums can come later" per the brief). Creating a club auto-enrolls the creator;
joining/leaving are idempotent/harmless no-ops when already in the requested state (same convention as
`joinTournament`). Posting and reading the feed are both gated on real membership — attempting either as a
non-member is a `400`, verified by both a service test and a live check that a real non-member gets refused,
joins, and is then let in. A real (minor) bug surfaced by a test: the feed originally sorted by `createdAt`,
but sqlite's datetime column is only second-precision, so two posts made within the same second could tie
and come back in either order — fixed by sorting on `id`, which is strictly monotonic with insertion order
regardless of timestamp resolution.

**4. Direct challenges — the frontend that never got built.** The mechanism (`challengePlayer` /
`challengeReceived` / `respondToChallenge`) has existed since Phase 5; STATUS.md tracked "no frontend UI for
it yet" ever since. Built now, deliberately on `/` (`GameBoard.tsx`) rather than as part of `/profile` or a
new page: `respondToChallenge` creates the game room using the *exact socket connection* present at the
moment of issuing/accepting, so whoever's involved has to stay on the same long-lived connection all the way
through into the game itself — the same constraint that shaped Phase 9's spectate-by-URL design. The lobby
shows a live "Friends Online" list (polled from `GET /friends` every 5s, same simple-polling pattern as
`/watch`) with a Challenge button per online friend; an incoming challenge shows a fixed banner with
Accept/Decline, rendered above whichever view is active (lobby or mid-game) since a challenge can arrive at
either time.

**33 new/rebuilt backend tests**: `chat-filter.spec.ts` (11), `presence.service.spec.ts` (4),
`clubs.service.spec.ts` (15), `clubs.controller.spec.ts` (6), plus `friends.service.spec.ts` and
`friends.controller.spec.ts` — both previously single "should be defined" stubs with zero real coverage —
rebuilt into 10 and 5 real tests respectively against real in-memory sqlite. Plus 8 new gateway-integration
tests (presence on connect/disconnect including the reconnect-race guard; profanity censoring and spam
blocking actually wired into `sendMessage`, not just correct in isolation).

### Live verification

Two full passes against the real running server, not just the test suite:

- **API/socket script** (real HTTP registration/auth + real `socket.io-client` connections, 3 real users):
  sent → declined → re-sent → accepted a real friend request (confirming decline doesn't block a fresh one);
  watched a friend's `online` field flip true/false as their real socket connected and disconnected; issued
  a real challenge, had it accepted, and confirmed both sides landed in the same real game room; sent a
  profane real chat message and confirmed the broadcast both players received was censored; sent 6 rapid
  real messages and confirmed the 6th was rejected with a real `chatError`; created a real club, confirmed a
  non-member's post attempt was refused, had them join, post (profanity-filtered, same as game chat), and be
  read by the other member, then leave and be refused again.
- **Playwright, real browser(s)**: logged in as one user, declined a real incoming request and confirmed it
  disappeared from a real re-fetch of `/profile`; opened a **second real browser tab** logged in as the
  friend, confirmed the online dot flipped live; from the first tab's homepage, clicked a real "Friends
  Online" → Challenge button; confirmed the **second tab** showed a real incoming-challenge banner naming
  the correct challenger; clicked Accept in the second tab and confirmed **both real tabs** independently
  landed on "Game Room" — the full direct-challenge flow, end to end, across two actual browser contexts.
  Separately created a real club through the UI and confirmed a profanity-filtered post appeared in the real
  feed, attributed to the real logged-in user. Zero browser console errors across the entire flow.
- Backend log checked for errors during both runs: none beyond the pre-existing, already-documented Redis
  connection warnings.

**Known simplifications, stated plainly:**
- No club roles/ownership beyond the informational `createdBy` field — any member can post, anyone can join
  or leave, per the brief's "keep this simple for now." Owner-only moderation (removing a member, deleting a
  post) is a reasonable follow-up, not built here.
- The profanity wordlist is small and starter-sized, exactly as asked ("a simple wordlist filter is fine for
  now") — not a production moderation system, and not locale-aware.
- The spam rate limit (5 messages / 10s) is a single fixed global threshold, not configurable per room or
  user, and isn't shared between game chat and club posts (club posts have no rate limit at all — see above).
- Presence is a single in-memory `Set` on one Node process — correct for this deployment shape (matches how
  `activeGames`/`waitingPlayers`/etc. already work in the gateway) but wouldn't survive horizontal scaling
  across multiple server instances without a shared store (e.g. Redis) behind it.
- The friends list ("Friends Online" on the homepage, and `/profile`'s tab) is polled on a timer rather than
  server-pushed on presence change — same trade-off `/watch` already made for live games, for the same
  reason: simple and sufficient, not the most instantaneous possible design.

## Phase 11: post-game analysis board and automated review (2026-08-17)

Per the brief, "an analysis controller exists per STATUS.md — verify and extend." It did, and it was more
complete than most of this codebase's "existing scaffolding" has been going into a phase: a working
step-forward/back board, on-demand engine evaluation via `POST /analysis`, and a best-move highlight — all
already live. What was actually missing was requirement 2 and 3: an *automated*, *stored* review that runs
once per game rather than a manual per-position query the viewer has to trigger themselves.

**1. Analysis board (verified, not rebuilt).** Confirmed the existing board/replay/on-demand-evaluation flow
genuinely works end-to-end against the real server (previously marked "not driven live this pass" in
STATUS.md) rather than assuming it from Phase 3's original build. No changes needed to the replay mechanics
themselves.

**2. Automated post-game review.** New `game/review/move-classification.ts` — pure, framework-independent,
same pattern as the engine/matchmaking/chat-filter modules. Explicit, documented thresholds (the brief's own
requirement), expressed in `AiService.evaluateBoard()`'s own units (`WEIGHT_MAN = 10`, `WEIGHT_KING = 25`),
since that's what an "eval delta" actually is here — not a chess-style centipawn scale:

| Eval delta (points worse than the engine's best move) | Classification |
|---|---|
| 0 (matches the engine's own top choice) | **Best** |
| 0 – 3 | **Good** |
| 3 – 10 | **Inaccuracy** |
| 10 – 25 | **Mistake** |
| > 25 | **Blunder** |

Accuracy per player is a simple, explicitly-documented credit-weighted average (Best=100, Good=90,
Inaccuracy=70, Mistake=40, Blunder=0) — deliberately simpler than lichess/chess.com's win-probability-based
model, matching this phase's own "simple wordlist filter is fine for now"-style scoping from Phase 10.

New `GameReviewService.analyzeCompletedGame(gameId)` replays a completed game's real recorded moves on a
real `DraughtsEngine`, calls `AiService.analyzePosition()` at every position (the exact same call
`analysis.controller.ts`'s existing endpoint already exposes) to get every legal move's evaluation, matches
the actually-played move against the engine's own legal-move list (same defense-in-depth principle as
`handleMakeMove`'s `exactLegalMove` — never trusts the recorded move's coordinates blindly), and classifies
the delta between the best available move and the one actually played. Triggered fire-and-forget from
`game.gateway.ts`'s `handleGameOver` — reusing the exact "don't await this, it's CPU intensive, don't block
the gateway" pattern Phase 5-era anti-cheat already established, not a new async convention. Runs for every
completed game including vs-AI (unlike anti-cheat, which only makes sense between two humans).

**3. Storage — "don't recompute on every view".** New `GameReview` entity: one row per game, `status`
('PENDING' while the async pass hasn't finished, 'COMPLETED', or 'FAILED' with an `errorMessage` if the
analysis itself threw), a `simple-json` array of per-move classifications, and both players' accuracy.
`GET /game-review/:gameId` just reads this row — genuinely instant, never triggers analysis itself. A
PENDING row is persisted *before* the expensive replay loop starts, specifically so a viewer who opens the
game right after it ends sees "analysis in progress" rather than nothing at all.

**A real bug found and fixed, not introduced by this phase.** Building `GameReviewService`'s replay loop —
which is nearly identical in shape to `AnticheatService.analyzeGameForCheating`'s own replay — led to
re-reading that existing code, which turned out to have the *exact same* bug Phase 3 already found and fixed
in `analysis.controller.ts`: `new DraughtsEngine()` constructed with no rules at all, silently defaulting to
8x8. Confirmed directly, not assumed (see the regression test): for a 10x10 game, the very first recorded
move already fails to apply against the wrong-sized engine — not a crash, just a silent no-op — freezing the
"replay" at the initial position for the rest of the loop. Anti-cheat has likely never correctly analyzed a
single 10x10 game since it was built. Fixed by adding an optional `rules` parameter (defaults to the old 8x8
behavior when omitted, so this is backward compatible) and passing `room.rules` from the gateway call site.

**24 new tests**: `move-classification.spec.ts` (14 — every threshold boundary on both sides, the five bands
proven contiguous/exhaustive across a swept range, and the accuracy formula's edge cases including
monotonicity), `game-review.service.spec.ts` (7, against real in-memory sqlite **and a real, non-mocked
`AiService`** — not existence-only tests: a real short game with one deliberately-suboptimal move correctly
classified as worse than the surrounding best-play moves, a lower accuracy for the side that played it, the
PENDING→COMPLETED transition observed mid-flight, idempotency via a spy proving `analyzePosition` isn't
called again on a second pass, and a separately-mocked suite proving a mid-analysis exception is recorded as
FAILED with its message rather than silently swallowed), `anticheat.service.spec.ts` (+1, the wrong-sized-
engine regression above), and 2 new `game.gateway.spec.ts` tests proving `handleGameOver` actually calls
`analyzeCompletedGame` with the right game id — including for a vs-AI game, unlike anti-cheat.

### Worked example (live, against the real running server)

A real two-player game via real WebSocket connections, where every move was the engine's own top choice
(queried live through the real `POST /analysis` endpoint — the same one the frontend's "Run Engine" button
calls) **except one deliberately picked as the engine's worst-rated legal option**, injected at the first
position that actually offered a real choice (best ≠ worst) rather than a fixed move number, so the "mistake"
couldn't coincidentally land on a forced single-legal-move position and tie with best by default:

```
move 0 (Light): INACCURACY  eval delta: 4   <-- the deliberate mistake
move 1 (Dark):  BEST        eval delta: 0
move 2 (Light): BEST        eval delta: 0
move 3 (Dark):  BEST        eval delta: 0
move 4 (Light): BEST        eval delta: 0
move 5 (Dark):  BEST        eval delta: 0
move 6 (Light): BEST        eval delta: 0
move 7 (Dark):  BEST        eval delta: 0
move 8 (Light): BEST        eval delta: 0
move 9 (Dark):  BEST        eval delta: 0
move 10 (Light): BEST       eval delta: 0
move 11 (Dark):  BEST       eval delta: 0
move 12 (Light): BEST       eval delta: 0
move 13 (Dark):  BEST       eval delta: 0

Light accuracy: 95.7%
Dark accuracy: 100%
```

The one deliberately-injected mistake was correctly classified as INACCURACY (not BEST); all 13 other moves
— every one of them the engine's own actual top choice at that position — were correctly classified as
exactly BEST. Dark, which never deviated from best play, scored a perfect 100%; Light's one inaccuracy
brought it down to 95.7%, exactly the credit-weighted formula's documented behavior.

Also live-verified, separately: a real short game (3 real plies) played with fully random move selection —
which turned out to be its own small finding (see below) — confirmed the review pipeline completes and is
queryable within the same flow end-to-end on a much shorter, more typical quick-resignation game; a real
browser (Playwright) loading `/analysis/[id]` for the worked-example game above and confirming the accuracy
panel, the per-move classification badge, and the clickable classification-dot strip (jumping straight to
move 14 when clicked) all render correctly against the real stored review, zero console errors.

**A genuine finding from live verification, not a bug**: fully random move selection under American
checkers' *mandatory*-capture rule ends a game remarkably fast — typically 3–6 plies — because random,
lookahead-free play walks straight into forced capture cascades far more often than intuition suggests.
Confirmed by direct investigation (several repeated runs, explicit turn/color tracking to rule out a test-
script bug) before accepting it as real behavior rather than assuming a server-side problem. Not a defect;
just informed the worked example above to use engine-guided play (via the real `/analysis` endpoint) instead
of random moves, to get a game long enough to be a meaningful demonstration.

Backend log checked for errors during all of the above: none beyond the pre-existing, already-documented
Redis connection warnings.

**Known simplifications, stated plainly:**
- The review runs as a background *pass* on the same Node process (yielding via `setImmediate` between
  moves, same technique anti-cheat already used), not a background *process* — no separate worker/job queue
  (BullMQ, etc.) exists in this codebase. A very long game's review could still take a noticeable moment;
  the PENDING-row-first design means a viewer always sees an honest "in progress" state rather than
  appearing broken.
- Classification thresholds and the accuracy-credit weights are explicit, documented, hand-picked constants
  tied to this specific evaluation function's scale (`WEIGHT_MAN = 10`) — not statistically calibrated
  against real game outcomes the way lichess/chess.com's models are. Revisit if `AiService`'s weights ever
  change.
- Search depth for review is 4 (matching the existing manual-analysis default) — deep enough to catch real
  tactical swings without making a full game's review noticeably slow, but not as strong as the deepest
  difficulty levels available elsewhere in the app (up to depth 9).
- If the recorded move ever isn't found among the engine's own legal moves at that exact position (would
  only happen for a corrupted/foreign move history — every game actually played through this gateway only
  ever records engine-validated moves), that move is skipped from classification rather than guessed at; the
  replay still continues correctly for the rest of the game.

## Phase 12: anti-cheat — detection, moderator review queue, graduated response (2026-08-18)

Per the brief, "a basic anti-cheat module exists — verify and extend." It did (engine-correlation, built in
Phase 5, extended and bug-fixed in Phase 11) — this phase refines that detection, adds the second detection
method the brief asks for, and builds everything downstream of "a flag exists": the review queue and the
graduated response it can lead to.

**1. Move-time anomaly detection.** New `anticheat/move-timing-stats.ts` — pure, framework-independent, same
pattern as every other statistics/threshold module in this codebase. Uses the **coefficient of variation**
(CV = standard deviation ÷ mean) of a player's own think-time, not raw variance — CV is scale-invariant, so
a fast bullet player and a slow correspondence player can both look perfectly natural at their own pace;
comparing raw millisecond variance across different players would be meaningless. Exact thresholds, and why:

| Constant | Value | Reasoning |
|---|---|---|
| `MIN_MEANINGFUL_THINK_MS` | 200ms | Below this, a "move" is UI lag or a genuinely forced position, not a real think — including it would deflate variance for every player alike. A simplification: this is an absolute floor, not a replay-verified "was this actually forced" check (that would mean re-running the engine per historical move at flag-computation time — accepted as future work, see below). |
| `MIN_SAMPLE_SIZE` | 30 samples | Below this, a low CV is as likely to be a lucky streak as a bot. Deliberately requires *more than one game's worth* of moves, matching the brief's own "across many games/moves" framing rather than judging from a single game. |
| `MAX_NATURAL_CV` | 0.15 | Real human think-time is highly skewed (fast obvious moves, occasional long thinks) — CV comfortably above 0.4 in practice. A fixed-delay script typically shows CV under 0.1–0.15. 0.15 leaves deliberate margin toward *fewer* false positives, since a false positive here only costs a moderator a look (see "no automatic bans" below), never a wrongly-banned player. |

New `GameRoom.moveTimings: number[]` (parallel-indexed to `moves`) captures `Date.now() - turnStartedAt` at
the moment each move is accepted (both PvP and vs-AI, so the two arrays never drift apart), persisted onto
`GameHistory.moveTimings`. `AnticheatService.analyzeMoveTimingForPlayer()` aggregates a player's own
think-times (filtered to their own color — Light moves on even indices, Dark on odd) across their recent
game history **plus** the game that was just completed, and flags if the combined sample clears both
thresholds.

**2. Engine-correlation, refined to "complex/critical positions rather than forced/obvious ones".** This was
the brief's explicit ask, and a real weakness in the pre-existing check: matching the engine in a position
with only one legal move (or where every option scores about the same) proves nothing — anyone, cheating or
not, "matches" there. `analyzeEngineCorrelation()` now only counts a position if it had more than one legal
move **and** the gap between the engine's best and worst-rated option exceeded `CLASSIFICATION_THRESHOLDS.GOOD_MAX`
(reusing Phase 11's own "a real, non-cosmetic difference existed" threshold rather than inventing a second
arbitrary number for the same underlying question). Requires **10+ such critical positions** and a **≥90%**
match rate within them to flag — both intentionally strict: even strong human players deviate from
engine-optimal regularly, especially under a real clock, so sustained >90% agreement specifically in
positions that actually had a meaningful alternative is far beyond normal play.

**3. Moderator review queue.** New `AnticheatController` (`/anticheat/admin/*` — no admin-role system exists
anywhere in this codebase, same documented simplification as Phase 7's puzzle admin routes and Phase 8b's
tournament lifecycle routes): lists flags (filterable by reviewed status), a single flag, or all flags for a
user, and a review endpoint that applies a moderator's decision. `CheatFlag` now records `flagType`,
`gameId` (the specific supporting game, for engine-correlation flags — null for timing flags, which
aggregate across many games with no single "supporting game" to point at), `sampleSize`, and a full audit
trail (`reviewedByUserId`, `moderatorNote`, `moderatorAction`, `reviewedAt`).

**4. Graduated response — and the "no automatic bans" guarantee, structurally, not just by convention.**
New `User.moderationStatus` (`NONE → WARNED → RATING_RESET_FLAGGED → TEMP_BANNED/PERMA_BANNED`) and
`tempBanUntil`. The critical design point, directly answering this phase's STOP AND REPORT requirement:
**`UsersService.applyModeration()` — the only method anywhere in the codebase that writes
`moderationStatus` — is called from exactly one place**, `AnticheatService.applyModeratorAction()`, which
is itself only reachable via the `POST /anticheat/admin/flags/:id/review` endpoint. Neither detection method
(`analyzeEngineCorrelation`, `analyzeMoveTimingForPlayer`) calls it, imports it, or has any path to it —
they only ever call `flagUser()`, which does nothing but insert a `CheatFlag` row. This isn't just tested
behavior, it's structurally true from the module's own dependency shape; a test proves flags accumulate
freely while `moderationStatus` stays `'NONE'` throughout (see below), but the real guarantee is that there
is no code path from detection to consequence that doesn't pass through a human hitting the review endpoint.

Real enforcement, not just a status field sitting unused: `AuthService.signIn()` now rejects login for a
currently-banned user (`UsersService.isCurrentlyBanned()` — true for `PERMA_BANNED`, or `TEMP_BANNED` with
a `tempBanUntil` still in the future; a `TEMP_BANNED` user whose ban already expired reads as not-banned
without the status itself being auto-cleared, since that would itself be an automated status change).
`GameGateway.handleConnection()` performs the same check before attaching a JWT-verified identity to a
socket — a still-valid token from before the ban doesn't grant a live authenticated session, even if the
raw WebSocket connection itself isn't dropped (an anonymous, unauthenticated connection is harmless on its
own — see known simplifications below for what this doesn't yet cover).

**46 new tests**: `move-timing-stats.spec.ts` (10 — CV boundary behavior, the trivial-move filter, realistic
human-shaped timing correctly NOT flagged), `anticheat-review.service.spec.ts` (14, real in-memory sqlite —
engine-correlation restricted to critical positions including the "100% match but zero critical positions"
case, timing detection aggregated across multiple real games, the full moderator action set including
rejection of a second review and a missing `tempBanDays`, and a direct proof that `moderationStatus` never
moves no matter how many flags accumulate), `anticheat.controller.spec.ts` (7), `users.service.spec.ts`
(+7 — `applyModeration`/`isCurrentlyBanned` including the expired-temp-ban edge case), `auth.service.spec.ts`
(+5, real bcrypt — correct password + ban still rejects, wrong password never even reaches the ban check),
and 3 new `game.gateway.spec.ts` tests (exact call-argument wiring into `analyzeGameForCheating`, and
banned-connection rejection).

### Live verification

A real end-to-end run against the real running server, not just the test suite: real users played several
real games via real WebSocket connections, where one side ("alice") submitted a fixed ~900ms delay before
every move while the other ("bob", the control) played with fully randomized, highly variable delays.

```
--- Polling the real admin flags endpoint ---
  ✓ at least one real unreviewed flag exists for alice (found 1)
  ✓ real MOVE_TIMING flag: score(CV)=0.011090131376108254, sampleSize=30
  ✓ at least one of the two detection methods actually fired for real
  ✓ the random-play control (bob) was NOT flagged (found 0 flags)

--- Confirming no automatic ban happened — alice can still log in normally right now ---
  ✓ alice can still log in — flags alone never ban anyone automatically

--- Applying a real moderator action (TEMP_BAN) through the real endpoint ---
  ✓ moderator action applied (flag 1 -> TEMP_BAN)
  ✓ the flag itself is now marked reviewed
  ✓ reviewing the same flag twice is rejected

--- Confirming real enforcement now that a moderator actually banned the account ---
  ✓ login now rejected (401): "This account is temporarily banned until 2026-08-18T15:59:51.677Z."
  ✓ WebSocket authentication also rejected: "This account is banned and cannot authenticate."

--- Confirming bob (never flagged) logs in completely normally ---
  ✓ bob logs in fine — the ban only ever affects the specific reviewed account
```

The real coefficient of variation landed at 0.011 — two orders of magnitude tighter than the 0.15 threshold,
exactly what a fixed-delay pattern should look like, confirmed against a real network round trip (not a
synthetic timestamp array). Engine-correlation didn't happen to cross its own threshold in this particular
run (20 plies/game wasn't always enough to accumulate 10+ critical positions on an 8x8 board) — a fair,
unforced result rather than one engineered to guarantee both detectors fire, and the timing detector alone
was sufficient to demonstrate the full pipeline. Also live-verified with Playwright: a real logged-in
"moderator" (just a regular account — no role system) opening `/moderation`, seeing a real flag with its
real reason text, dismissing it with a note, confirming it disappears from the default unreviewed view, and
reappears correctly labeled once "show reviewed" is toggled on. Zero console errors. Backend log checked for
errors throughout: none beyond the pre-existing, already-documented Redis connection warnings.

One incidental, real observation from this run: because `analyzeGameForCheating` re-runs its full aggregate
timing analysis after *every* completed game (not just once), a persistent pattern can generate multiple
independent `CheatFlag` rows over time rather than being deduplicated into one — confirmed directly (a
second flag for the same account, same `flagType`, larger `sampleSize`, appeared after further games in the
same live run). This is arguably a feature, not a bug, for a review queue — more corroborating evidence
for a moderator, not less — but it's real, undocumented-until-now behavior worth naming plainly rather than
leaving as a surprise.

**Known simplifications, stated plainly:**
- The `MIN_MEANINGFUL_THINK_MS` filter for "was this move actually forced" is a flat time floor, not a
  replay-verified check of how many legal moves were actually available at that exact position (which would
  mean re-running the engine per historical move at flag-computation time, not just once per completed
  game). A fast genuine move and a genuinely-forced one aren't perfectly distinguished — a documented,
  deliberate trade-off, not an oversight.
- Detection flags are not deduplicated across repeated triggers for the same underlying pattern (see above)
  — each completed game's analysis pass stands alone. A real production system might collapse these into
  one evolving flag; this phase's queue just shows every one, which a moderator can still make sense of.
- Ban enforcement covers new login sessions and new authenticated WebSocket connections — it does not
  forcibly disconnect or downgrade an *already-connected, already-authenticated* socket the instant a ban is
  applied (that socket's session simply expires/reconnects normally later, at which point the ban takes
  effect). A genuinely real-time "kick immediately" mechanism is a reasonable follow-up, not built here.
- Thresholds (`MAX_NATURAL_CV`, `ENGINE_MATCH_THRESHOLD`, `MIN_CRITICAL_POSITIONS`, etc.) are explicit,
  documented, reasoned constants — not statistically calibrated against a labeled dataset of confirmed
  cheaters vs. clean players, which this project has no access to. Exactly the same honest caveat Phase 11's
  move-classification thresholds already carry.

## Phase 13: monetization — Stripe subscriptions and notifications (2026-08-18)

**Credentials disclosure, up front, per explicit instruction.** No real Stripe account or transactional email
provider account was available in this environment. I raised this before writing any code; told to proceed
with "build it, skip live webhook/email verification entirely" — build the full integration with genuine unit
test coverage, but do not attempt a live or simulated Stripe-CLI test-mode event pass, and do not attempt to
actually send an email. Everything below reflects that: extensive tests using hand-constructed payloads shaped
exactly like Stripe's own documented event schema, but never run through Stripe's real test-mode
infrastructure, and no email ever actually delivered anywhere. **Directly answering this phase's own STOP AND
REPORT requirement: webhook handling was NOT tested with Stripe's real test-mode events** — this is a real gap
against the brief's ask, disclosed rather than glossed over. What follows is what full-strength coverage
without that piece actually looks like.

**1. What's gated behind Premium — a single feature-flag check, per the brief.** `User.membershipTier`
(`'FREE' | 'PREMIUM'`) is the one field every gated feature reads, always through `UsersService.hasPremium()`
— never a scattered ad-hoc `user.membershipTier === 'PREMIUM'` inline check. Two real features gated, at
every layer they can be reached from, not just the obvious one:
- **Engine analysis depth** (`analysis.controller.ts`): FREE/anonymous capped at depth 4 (the endpoint's
  pre-existing default — an unauthenticated or free caller who never asks for more than that sees
  byte-for-byte unchanged behavior), PREMIUM up to depth 8. The response now reports back
  `{ evaluations, depthUsed, depthCapped, maxDepth }` instead of a bare array, so a capped caller can be told
  why, not just served a shallower line silently.
- **Exclusive puzzles** (`Puzzle.isPremium`): gated at all three reachable points — random-serve
  (`getRandomPuzzle` filters premium puzzles out of the pool entirely for non-premium callers, not just
  after-the-fact), direct legal-moves fetch, and the solve/attempt endpoint — specifically so a premium
  puzzle can't be reached by guessing or already knowing its numeric id once one of the three were missed.

**2. Stripe integration — hosted flow only, by construction.** `StripeService` wraps the SDK with the same
graceful-degradation shape `main.ts`'s Redis-adapter fallback already established: no `STRIPE_SECRET_KEY` set
→ the app still boots, and only a checkout/portal/webhook call at request time returns a clear 503, not a
boot-time crash. Checkout Sessions and Billing Portal Sessions are the only two things it ever creates — the
brief's "do not store any raw payment card data" requirement is satisfied by construction, not by care: no
code path anywhere in this app accepts, parses, or touches a card number: Stripe's hosted pages own that
entirely. `SubscriptionsController`'s three authenticated endpoints (`GET /subscriptions/me`,
`POST /subscriptions/checkout`, `POST /subscriptions/portal`) all require a logged-in user;
`POST /subscriptions/webhook` deliberately does not (Stripe calls it directly, with no user session at all)
and instead trusts only a verified signature over the **exact raw request body** — `main.ts` now boots Nest
with `{ rawBody: true }` specifically so `req.rawBody` survives alongside the normal JSON-parsed body, since
Stripe's signature check would break on a `JSON.parse` → reserialize round trip even if the parsed content
looks identical.

**3. Webhook lifecycle handling.** `SubscriptionsService.handleWebhookEvent` switches on four event types:
`checkout.session.completed` (links `stripeCustomerId` to the right user via `client_reference_id`, set when
the Checkout Session was created — doesn't touch membership tier itself), `customer.subscription.created` /
`.updated` (maps Stripe's subscription `status` through a small pure function, `mapStripeSubscriptionStatus`
in `subscription-status.ts` — `active`/`trialing` → `PREMIUM`/`ACTIVE`, `past_due` → `PREMIUM`/`PAST_DUE`
(kept usable during Stripe's own dunning/retry window, not instantly downgraded), `canceled`/`unpaid`/
`incomplete_expired` → `FREE`/`CANCELED`, anything else → `FREE`/`NONE`), `customer.subscription.deleted`
(hard reset: tier, status, `stripeSubscriptionId`, and `membershipRenewsAt` all cleared), and
`invoice.payment_failed` (status forced to `PAST_DUE` while the existing tier and subscription id are left
alone — a payment failure is a grace-period signal, not an instant downgrade; Stripe's own subscription
`.updated` event handles the eventual downgrade if the retries all fail). Every other Stripe event type this
app doesn't act on is silently ignored, not an error. Exactly one method writes membership fields —
`UsersService.applyMembershipUpdate()` — called only from these four webhook handlers, the same
detection-can't-reach-consequence structural guarantee Phase 12 established for `moderationStatus`.

**4. Notifications — one entry point, four real trigger points, in-app plus email together.**
`NotificationsService.notify(userId, type, message, data)` is the single method every trigger calls: it always
persists a `Notification` row first, then best-effort sends a matching email via `EmailService` (same
graceful-fallback shape as Stripe — no `RESEND_API_KEY` configured in this environment, so every email this
phase "sent" landed in a console log, never an inbox; a real key would make it a genuine Resend API POST with
no code change). A failed or skipped email never blocks or rolls back the in-app notification, which is
already saved by the time the email is attempted. Four real triggers wired, not stubs:
- **Friend request** — `FriendsService.sendFriendRequest`, notifies the recipient (not the sender).
- **Challenge received** — `GameGateway.handleChallengePlayer`, alongside the pre-existing live
  `challengeReceived` socket event (this is the persisted/emailed record that survives even if the recipient
  is online but not looking, or checks back later).
- **Tournament starting** — both tournament formats' actual start paths: Arena's cron-driven auto-start
  (`TournamentsService.handleTournamentState`) and Swiss's explicit `startTournament`, both fanning out to
  every registered player.
- **Correspondence-game turn reminder** — new `GameGateway.checkCorrespondenceReminders()`, swept hourly.
  Reminds the *current mover* once their turn has run 12+ hours (half of correspondence's 24h-per-move bank —
  generous lead time, not naggy) without a move, tracked via the turn's own `turnStartedAt` timestamp rather
  than a plain sent/unsent flag, so a fresh turn is automatically eligible for its own reminder with no
  explicit reset needed anywhere a move gets made. Reads the mover's identity from `playerProfiles`, which
  (unlike the live-socket-only `socketToUser` map) survives disconnects — the whole point for a format whose
  players are expected to be away from the board between moves.

**5. Frontend.** New `/membership` page: current tier/status/renewal date, upgrade buttons (redirect to a
real Stripe-hosted Checkout Session URL), a "Manage Billing" button once a Stripe customer exists (redirects
to a real Billing Portal Session), and handles the `?checkout=success`/`?checkout=cancelled` redirect Stripe
sends back to. New `NotificationBell` component (bell icon + unread badge, polls every 30s, dropdown lists
recent notifications, click-to-mark-read, mark-all-read) — wired into the home page and profile page headers,
renders nothing at all for a logged-out visitor, same convention as the rest of the app's auth-gated UI.
**Fixed a real regression this phase's own backend change introduced**: `/analysis/[id]/page.tsx` (built in
Phase 11) expected `POST /analysis`'s response to be a bare evaluations array; this phase's depth-capping
change made it `{ evaluations, depthUsed, depthCapped, maxDepth }` instead, which would have silently broken
the existing analysis board had it shipped unnoticed. Fixed to read `res.data.evaluations`, and the capped
state is now surfaced in the UI ("Free tier is capped at depth 4 — Upgrade to Premium for deeper analysis").

**~60 new tests added across this phase, 343 total across 37 suites, all passing; `tsc --noEmit` clean.**
New or changed:
`subscription-status.spec.ts` (9, pure mapping function), `subscriptions.service.spec.ts` (13 — real
in-memory sqlite + real `UsersService` so membership persistence is genuinely exercised, StripeService itself
mocked; webhook payloads hand-built to match Stripe's documented event schema field-for-field), 6 new
"analysis-depth gate" tests in `analysis.controller.spec.ts`, 6 new "premium puzzle gating" tests in
`puzzles.service.spec.ts`, `email.service.spec.ts` (6), `notifications.service.spec.ts` (9 — **found and
fixed a real bug**: `getForUser`'s `ORDER BY createdAt DESC` alone ties on sqlite's second-resolution
timestamp for notifications created in the same second, e.g. a tournament-starting fan-out to many players at
once, and returns them in unspecified order; fixed by adding `id DESC` as a tiebreak), plus new/updated tests
across `friends.service.spec.ts`, `tournaments-swiss.service.spec.ts` (Swiss start + Arena auto-start
notification wiring, both directions), and `game.gateway.spec.ts` (7 new — 2 for challenge notification
wiring, and 5 dedicated to the correspondence-reminder sweep: fires past threshold, doesn't fire before it, fires only
once per turn not once per sweep tick, fires again on a fresh turn, and never fires for a slot with no
attached user profile such as an AI opponent).

### Live verification

Real running backend + frontend, real registered users, real WebSocket connections, a real headless-Chromium
Playwright pass — everything that doesn't require actual Stripe/email infrastructure. 22/22 checks passed:

```
--- REST: friend-request notification, subscriptions/me, FREE-tier analysis capping ---
  ✓ friend request creates a real PENDING friendship
  ✓ recipient receives a persisted FRIEND_REQUEST notification
  ✓ unread count reflects it; markRead flips it to read
  ✓ subscriptions/me returns FREE/NONE by default for a fresh user
  ✓ FREE and anonymous analysis requests both capped at depth 4

--- REST: DB-flipped PREMIUM tier (no real Stripe purchase possible — see disclosure above) ---
  ✓ subscriptions/me reflects PREMIUM/ACTIVE once the DB row is flipped
  ✓ PREMIUM analysis reaches depth 8, uncapped
  ✓ admin set-premium marks a real puzzle premium-only
  ✓ FREE user refused direct access to it (403); PREMIUM user granted (200)

--- Real WebSocket connections (socket.io-client), two real authenticated users ---
  ✓ target receives the live challengeReceived socket event
  ✓ target also has a persisted CHALLENGE_RECEIVED notification

--- Playwright, real headless Chromium, real registration through the actual login UI ---
  ✓ home page renders the notification bell for a logged-in user
  ✓ membership page renders Free plan + upgrade buttons
  ✓ clicking Upgrade surfaces a graceful, readable error (Stripe unconfigured) — no crash
  ✓ analysis page renders "Depth 4" — confirms the fixed response-shape regression above
  ✓ zero unexpected browser console errors across the whole run
```

The DB-level PREMIUM flip (direct `UPDATE user SET membershipTier='PREMIUM'`) stands in for a real Stripe
purchase specifically because a real one isn't possible in this environment — genuinely exercises the *read*
side of every gate (analysis depth, puzzle access, `/subscriptions/me`) even though the *write* side
(`applyMembershipUpdate`, only reachable from a real webhook) is covered by unit tests alone. Both the FREE
and PREMIUM DB states were reverted to their original values after verification.

**Known simplifications and honest gaps, stated plainly:**
- **Webhook handling was not tested with Stripe's real test-mode events** (Stripe CLI event triggering, or a
  schema-accurate simulated replay pass) — per the explicit instruction covering this phase. Coverage is
  hand-constructed unit-test payloads shaped like Stripe's documented schema, run directly against
  `handleWebhookEvent`, never through Stripe's actual test-mode infrastructure or signature-verification path
  end-to-end.
- No email was ever actually delivered anywhere in this phase — `RESEND_API_KEY` was never configured, so
  every notification's email landed in a console log via `EmailService`'s fallback path, by design (same
  reasoning as above).
- `User.email` is a real, honestly-nullable field — no registration-flow UI exists yet to collect it, so no
  user in this dev environment actually has one on file; a synthesized fake address was deliberately avoided.
- Correspondence turn-reminders are checked hourly, not instantly at the 12-hour mark — a reminder can arrive
  up to ~1 hour late relative to the threshold. Fine for a 24-hour-per-move format; not appropriate to reuse
  as-is for a tighter deadline.
- No push notifications — explicitly deferred to the mobile app phase per the brief itself.
- Ban/moderation status (Phase 12) and membership tier (this phase) are deliberately separate fields with
  separate write paths; a banned PREMIUM user still shows as PREMIUM in `/subscriptions/me` (login itself is
  refused instead, per Phase 12's enforcement) — not a gap, just worth naming since both phases touch `User`.

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
