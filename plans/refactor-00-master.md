# Refactor Plan 00 — Master Integration Plan

> Status: ACTIVE — this document governs execution order and tracks progress
> Last updated: 2026-03-24
> How to use: Update checkboxes as work lands. The *how* lives in Plans 01–06. This plan records *why*, *what*, and *when*.

---

## 1. Why This Refactor Exists

The codebase was built correctly, epic by epic. Features landed reliably, tests were written, the product works. But 21 epics of organic growth have left several architectural debts that now actively increase the cost of every new change:

- **Three god objects** — `server/index.js` (1,704 lines), `HandLoggerSupabase.js` (862 lines), `CoachSidebar.jsx` (1,626 lines) — each mixing 6–11 distinct concerns. Finding where to make a change requires reading hundreds of lines that aren't relevant.
- **JWT verification lives in the database layer.** `HandLoggerSupabase.authenticateToken` calls `jwt.verify` and reads `SESSION_SECRET`. Any test that mocks the DB layer must also stub auth. Any auth change requires touching the persistence module.
- **Socket authentication happens inside a game event handler**, not at connection time. A socket that never calls `join_room` has undefined identity — and the 30 coach guards all silently pass for undefined (`!undefined === true`).
- **9 analyzers have zero unit tests.** The analysis pipeline is the most complex business logic in the system and it is entirely covered by a mock that stubs it away.
- **Three Supabase queries run sequentially on every hand-end** in the hot path of `buildAnalyzerContext`. They are independent queries. They could be one concurrent batch.
- **`activeHands.set()` runs even when `startHand` fails**, creating orphaned DB rows that corrupt every subsequent `recordAction` and `endHand` for that hand.
- **Playlist REST endpoints have no authentication.** Any unauthenticated caller can create and delete playlists — while the equivalent socket operations require coach status.

None of these individually blocks feature development. Together they compound: every sprint the cost of safe changes rises, and the test suite's isolation guarantees erode.

---

## 2. What We're Building Toward

After this refactor, the codebase should satisfy these structural properties:

**Server** (~60-line bootstrap `index.js`)
- One module per concern: auth, game state, persistence, socket handlers, REST routes
- JWT sign/verify owned by one module (`JwtService`) — zero other modules import `jsonwebtoken`
- Socket auth enforced at connection time via `io.use()` middleware, not inside an event handler
- All shared Maps (tables, activeHands, stableIdMap, etc.) encapsulated behind a `SharedState` module
- Repository pattern for DB access — each repository is independently mockable via constructor injection

**Analysis pipeline**
- `buildAnalyzerContext` runs 3 DB queries concurrently, not sequentially
- `analyzeAndTagHand` runs 9 analyzers concurrently, with independent fault boundaries per analyzer
- Every analyzer has dedicated unit tests using synthetic context objects — no Supabase mocking required
- Shared helpers (`findLastPFRaiser`, `findLastAggressorIndex`, `findNthRaiser`) live in `util.js`, not duplicated across three files

**Client**
- `useSocket.js` decomposed into 5 focused hooks — components subscribe to only the state they need
- `CoachSidebar.jsx` split into section-level components — each independently renderable and testable
- No inline component definitions inside `App.jsx`
- All playlist and session REST calls send JWT headers (verified end-to-end with server-side auth gates)

**Test coverage**
- All 9 analyzer modules have isolated unit tests
- `JwtService`, `requireAuth`, and `socketAuthMiddleware` have dedicated test files
- Repository tests use constructor-injected mock clients — no `jest.mock('../supabase')` required

---

## 3. The Six Problem Areas

A brief summary of each plan's core thesis. Details and implementation notes are in the referenced plan.

| Plan | Scope | Core Problem |
|------|-------|--------------|
| [Plan 01](refactor-01-server-monolith.md) | `server/index.js` | 1,704-line monolith mixes infrastructure, auth, game logic, and REST routes in one file. All socket handlers close over the same module-level Maps. |
| [Plan 02](refactor-02-game-engine.md) | `GameManager.js` | 1,369-line class with 12 distinct responsibilities, flat mutable state, and deep-clone undo snapshots on every action. |
| [Plan 03](refactor-03-persistence.md) | `HandLoggerSupabase.js` | 862-line god object mixing 6 concerns (writes, queries, playlists, tags, analyzer, auth). JWT verification in the DB layer. |
| [Plan 04](refactor-04-auth-security.md) | Auth across all layers | JWT split across two unrelated modules, no socket connection-level auth, 30 duplicated coach guards, unauthenticated playlist endpoints. |
| [Plan 05](refactor-05-client-architecture.md) | `client/src/` | `useSocket.js` exports 36 values from 10 mixed concerns; `CoachSidebar.jsx` has 11 sections; `App.jsx` defines 5 inline components; three duplicate `/api/hands` fetches. |
| [Plan 06](refactor-06-analysis-pipeline.md) | Tag analyzers + evaluators | 9 analyzers with zero unit tests; 3 sequential DB queries that could be concurrent; shared logic duplicated across 3 analyzer files; dead code in `HandLoggerSupabase.js`. |

---

## 4. Dependency Map

### Hard conflicts — two plans propose changes to the same lines

**`requireAuth` location** (Plans 01 & 04)
Plan 01 proposes `server/middleware/requireAuth.js`. Plan 04 proposes `server/auth/requireAuth.js`. These must agree on a single home before either plan touches the function.
→ **Decision:** use `server/auth/requireAuth.js` (Plan 04's location). Plan 01's `server/middleware/` directory is replaced by `server/auth/` as the auth module home.

**`AnalyzerService` extraction vs. pipeline restructure** (Plans 03 & 06)
Plan 03 Phase 2 moves `buildAnalyzerContext` and `analyzeAndTagHand` to `server/game/AnalyzerService.js`. Plan 06 restructures those same functions internally (parallel queries, `Promise.allSettled`, memoization). If done in separate steps, whoever goes second has to find the functions in their new location.
→ **Decision:** do both together in Phase 3 of this master plan. The move and the restructure are a single commit sequence.

### Sequencing dependencies — plan A must land before plan B can start

**1. `authenticateToken` removal unlocks everything downstream**
`HandLoggerSupabase.authenticateToken` is the root coupling that causes Plans 01, 03, and 04 to all need to update the same two test files (`REST.api.test.js`, `socket.integration.test.js`). Until it moves, the mock stubs in those files are wrong for any plan that restructures `HandLoggerSupabase`. This is the first real change to make.
→ Plan 04 Phase 1 before Plan 03 Phase 0.

**2. Coach guard consolidation must precede socket handler extraction**
There are 30 `if (!socket.data.isCoach)` guards in `server/index.js`. Plan 04 consolidates them into a single `requireCoach()` helper — a mechanical find-and-replace while they're all in one file. Plan 01 then extracts the handlers into separate files. If the extraction happens first, the 30 guards scatter across 10+ files and the consolidation becomes a multi-file surgery.
→ Plan 04 Phase 3 before Plan 01 handler extraction.

**3. Socket auth middleware must be established before handler extraction**
Plan 04 registers `io.use(socketAuthMiddleware)` to enforce auth at connection time. Plan 01 decomposes the `io.on('connection', ...)` block into `server/socket/index.js`. The middleware registration belongs in that new file. Both changes must land together — there's no valid intermediate state where handlers are extracted but the middleware hasn't been registered yet.
→ Plan 04 Phase 2 and Plan 01 socket extraction are a single coordinated step.

**4. `activeHands` failure guard must track wherever `activeHands.set()` moves**
Plan 03 §4 identifies that `activeHands.set()` must not run if `startHand` fails (otherwise orphaned DB rows are created). Plan 01 encapsulates `activeHands` into `SharedState.js`. The guard fix must be applied wherever the `.set()` call lands after Plan 01's encapsulation — not patched in the old location and then moved.
→ Apply Plan 03 §4 fix during (not before) Plan 01 state encapsulation.

**5. Playlist auth gates must land before client playlist code is restructured**
Plan 04 Phase 4 adds `requireAuth + requireRole('coach')` to the playlist REST endpoints. Plan 05 restructures the client's playlist calls into a `usePlaylistManager` hook. The client already uses `apiFetch` for playlists (which sends JWT headers), so the server-side gate just enforces what the client already sends. But if the client restructure moves playlist calls to raw `fetch` during the migration, requests will start failing with 401.
→ Verify `apiFetch` usage is preserved in Plan 05 before Plan 04 Phase 4 is in production.

### Soft touch-point coordination — same file, different sections

**Three dead/duplicate helpers in `HandLoggerSupabase.js`** (Plans 03 & 06)
Plan 03 §1 flags `_computePositions` as duplicating `positions.js`. Plan 06 §3 separately flags `normalizeAction` (dead copy of `util.js`) and `_findBBPlayerId` (duplicates an inline closure). All three must be removed before either plan restructures the file, or they'll be accidentally preserved in the new repository/service files.

**`endHand → analyzeAndTagHand` chain** (Plans 03 & 06)
Plan 03 §5 proposes wrapping `endHand` writes in a PostgreSQL RPC for atomicity. Plan 06 §10 proposes self-contained error isolation inside `analyzeAndTagHand`. These touch adjacent parts of the same call chain. The error isolation (Plan 06) is internal to `analyzeAndTagHand`; the RPC (Plan 03) changes how `endHand` itself is called. They are independent and can be sequenced in either order.

**Shared test files touched by three plans** (Plans 03, 04, 06)
`REST.api.test.js` and `socket.integration.test.js` both have a `HandLoggerSupabase` mock that stubs `authenticateToken`. Plans 03, 04, and 06 all update these mocks for different reasons. Update them once — when `authenticateToken` is deleted in Plan 04 Phase 1 — and don't touch them again until each subsequent plan's changes require it.

---

## 5. The Journey

### Phase 0 — Dead Code Purge
**What:** Remove code that is already wrong, already duplicated, or already abandoned. No behavior change. No tests to update.
**Why first:** Dead code gets accidentally preserved when files are split. Removing it first means every subsequent extraction starts from a clean state.

- Dead `normalizeAction` copy in `HandLoggerSupabase.js` (Plan 06 §5)
- Dead `_findBBPlayerId` copy in `HandLoggerSupabase.js` (Plan 06 §3)
- Dead `_computePositions` helper in `HandLoggerSupabase.js` (Plan 03 §1)
- Abandoned first-draft `generateHand` function in `HandGenerator.js` lines 181–363 (Plan 06 §7)

---

### Phase 1 — Auth Layer Consolidation
**What:** Create the canonical JWT module (`JwtService.js`), extract `requireAuth.js` into `server/auth/`, delete `authenticateToken` from `HandLoggerSupabase.js`, and update the two test files once.
**Why now:** This is the root coupling that makes Plans 01, 03, and 04 all need to update the same test mocks. Resolving it first means every subsequent plan works with clean test fixtures. It also resolves the naming conflict between Plans 01 and 04 on `requireAuth` location.

- Create `server/auth/JwtService.js` with `sign()` and `verify()` (Plan 04 §2.1)
- Create `server/auth/requireAuth.js` importing only `JwtService` (Plan 04 §2.2)
- Create `server/auth/requireRole.js` RBAC factory (Plan 04 §2.3)
- Update `server/index.js` login handler to use `JwtService.sign()` — remove direct `jwt.sign()` call (Plan 04 §3)
- Update `server/index.js` `requireAuth` to import from `server/auth/requireAuth.js` (Plan 01 pain point #6, Plan 04 §3)
- Delete `authenticateToken` from `HandLoggerSupabase.js` — both the function and the export (Plan 04 §3, Plan 03 §8)
- Remove `authenticateToken` stub from `REST.api.test.js` mock (Plans 03, 04, 06 — do once, here)
- Remove `authenticateToken` stub from `socket.integration.test.js` mock (Plans 03, 04, 06 — do once, here)
- Write `server/auth/__tests__/JwtService.test.js` (Plan 04 §9.3)

---

### Phase 2 — Coach Guard Consolidation
**What:** Replace the 30 repeated `if (!socket.data.isCoach)` blocks in `server/index.js` with a single `requireCoach()` helper. Zero behavior change.
**Why now:** The 30 guards are all in one file. Plan 01 will scatter them across 10+ handler files. Consolidating while they are co-located is a mechanical single-file find-and-replace. After extraction, it becomes a multi-file refactor.

- Create `server/auth/socketGuards.js` with `requireCoach(socket, action)` (Plan 04 §5)
- Replace all 30 `if (!socket.data.isCoach) return sendError(...)` instances in `server/index.js` (Plan 04 §5)
- Write `server/auth/__tests__/requireRole.test.js` and `socketGuards` tests (Plan 04 §9.3)

---

### Phase 3 — Persistence Layer Split + Pipeline Restructure
**What:** Split `HandLoggerSupabase.js` into focused repositories AND restructure `buildAnalyzerContext` / `analyzeAndTagHand` into `AnalyzerService.js` — done together as a single logical step.
**Why together:** Plan 03 Phase 2 moves the analyzer functions. Plan 06 restructures them internally. Doing both together means the functions are moved and improved in one cut, not moved-then-improved (which would require a second read of the new location). The strangler-fig facade (`HandLoggerSupabase.js` becomes a thin re-export shim) ensures zero caller breakage during the transition.

- **Sub-phase 3a — Repository extraction** (Plan 03 Phase 0)
  - Create `server/db/repositories/HandRepository.js` (Plan 03 §2)
  - Create `server/db/repositories/PlayerRepository.js` (Plan 03 §2)
  - Create `server/db/repositories/PlaylistRepository.js` (Plan 03 §2)
  - Create `server/db/repositories/TagRepository.js` (Plan 03 §2)
  - Create `server/db/repositories/SessionRepository.js` (Plan 03 §2)
  - Create `server/db/index.js` re-exporting all symbols (Plan 03 §10 Phase 0)
  - Make `HandLoggerSupabase.js` a thin shim pointing to `./index` (Plan 03 §10 Phase 0)
  - Fix `q()` to wrap Supabase errors into real `Error` instances; add `DbError` class (Plan 03 §4, Phase 3)

- **Sub-phase 3b — AnalyzerService extraction + pipeline improvements** (Plan 03 Phase 2 + Plan 06 §2–6)
  - Create `server/game/AnalyzerService.js` — move `buildAnalyzerContext` and `analyzeAndTagHand` here (Plan 03 Phase 2)
  - While creating the file, apply: parallel DB queries in `buildAnalyzerContext` (Plan 06 §3)
  - While creating the file, apply: `Promise.allSettled` loop in `analyzeAndTagHand` (Plan 06 §2)
  - While creating the file, apply: `evaluateAt` memoization (Plan 06 §3)
  - While creating the file, apply: `TagResult` shape validation before insert (Plan 06 §4)
  - While creating the file, apply: self-contained error handling around `buildAnalyzerContext` (Plan 06 §10)
  - Extract `findLastPFRaiser`, `findLastAggressorIndex`, `findNthRaiser`, `isAggressive` to `util.js` (Plan 06 §5)
  - Update `postflop.js`, `positional.js`, `mistakes.js`, `handStrength.js` to import from `util.js` (Plan 06 §5)
  - Fix `handStrength.js` tier constants to import `HAND_RANKS` from `HandEvaluator.js` (Plan 06 §6)
  - Add JSDoc `@typedef TagResult` and `@typedef Analyzer` to `tagAnalyzers/index.js` (Plan 06 §4)
  - Update `server/index.js` to import `AnalyzerService` directly for the `.then(analyzeAndTagHand)` call (Plan 03 Phase 2)

- **Sub-phase 3c — `startHand` failure guard** (Plan 03 §4)
  - Ensure `activeHands.set()` is skipped when `startHand` rejects (apply to the call site in `server/index.js` before it moves in Phase 4)

---

### Phase 4 — Socket Auth Middleware + Server Decomposition
**What:** Establish connection-level auth via `io.use()`, then extract all socket handlers and shared state out of `server/index.js`. This is the largest structural change in the server.
**Why together:** The socket auth middleware must exist before handlers are extracted — it sets `socket.data.isCoach`, `socket.data.stableId`, etc. that every extracted handler will read. Handlers can't safely be extracted until auth is guaranteed at connection time.

- **Sub-phase 4a — Socket auth middleware** (Plan 04 Phase 2)
  - Create `server/auth/socketAuthMiddleware.js` (Plan 04 §4)
  - Register `io.use(socketAuthMiddleware)` before `io.on('connection', ...)` in `server/index.js` (Plan 04 §4)
  - Simplify `join_room`: remove inline `HandLogger.authenticateToken` call, trust `socket.data.*` from middleware (Plan 04 §4)
  - Update client `useSocket.js` to pass `{ auth: { token } }` in Socket.io constructor options (Plan 04 §4)
  - Write `server/auth/__tests__/socketAuthMiddleware.test.js` (Plan 04 §9.3)

- **Sub-phase 4b — Server decomposition** (Plan 01)
  - Create `server/state/SharedState.js` encapsulating all 7 Maps (Plan 01 §1)
  - Apply Plan 03 §4 `activeHands` failure guard to `SharedState.js` (Plans 03 & 01 coordination)
  - Create `server/socket/helpers.js` — `broadcastState`, `sendError`, `sendSyncError`, `startActionTimer`, `clearActionTimer` (Plan 01 §2)
  - Extract socket handler groups into `server/socket/handlers/*.js` (Plan 01 §2)
  - Create `server/socket/index.js` — registers middleware + all handler groups (Plan 01 §2)
  - Extract REST routes into `server/routes/*.js` (Plan 01 §2)
  - Create `server/config/startup.js` — `SESSION_SECRET`/`CORS_ORIGIN` validation (Plan 01 §2)
  - Reduce `server/index.js` to ~60-line bootstrap (Plan 01)
  - Relocate idle shutdown into `server/config/startup.js` or `server/socket/index.js` (Plan 01 §1 pain point #8)

---

### Phase 5 — Playlist Auth Gates
**What:** Add `requireAuth` and `requireRole('coach')` to the playlist and session REST endpoints that currently have no auth guard.
**Why here:** The server decomposition in Phase 4 extracted the routes — now each route file is the right place to add middleware. Doing this before extraction would require editing `server/index.js` again.
**Pre-condition:** Verify `client/src/lib/api.js` `apiFetch` is still the call path for all playlist and session fetches in Plan 05's `usePlaylistManager` hook (Plan 04/05 coordination).

- Add `requireAuth` to `GET /api/sessions/current` (Plan 04 §8.6)
- Add `requireAuth + requireRole('coach')` to `POST /api/playlists`, `DELETE /api/playlists/:id`, `PUT /api/playlists/:id/hands` (Plan 04 §8.6 Phase 4)
- Update `REST.api.test.js` for the new 401 paths on playlist endpoints (Plan 04 §9.2)

---

### Phase 6 — Game Engine
**What:** Decompose `GameManager.js` (1,369 lines, 12 responsibilities) and clean up related modules.
**Why here (not earlier):** The game engine is functionally independent — it has no coupling to the auth layer, the DB layer, or the client. Its 918-test suite gives strong regression coverage. It can be done in parallel with Phases 4–5, or sequentially here. The main risk is the test surface area; doing it after the infrastructure changes are stable reduces simultaneous churn.

- Separate internal state keys from display keys (leading-underscore audit) (Plan 02 §1.2)
- Extract `ReplayManager` from `GameManager` (Plan 02)
- Extract `BettingRound` logic from `GameManager` (Plan 02)
- Extract `ShowdownResolver` from `GameManager` (Plan 02)
- Clean up `is_replay_branch` / `replay_mode.branched` duplication (Plan 02 §1.2)
- Evaluate `SessionManager` coupling points post-extraction (Plan 02)
- Address ISS items flagged in Plan 02 (positions, side pot, `_computePositions` already removed in Phase 0)

---

### Phase 7 — Test Coverage
**What:** Fill the test gaps that have accumulated. Many of these only become feasible once the structural refactors in Phases 1–6 are done (constructor injection, isolated modules).
**Why last (for analyzer tests):** Analyzer unit tests are only trivial to write after Phase 3 creates `AnalyzerService` with the `TagResult` typedef and `util.js` helpers. Writing them before the restructure means testing code that's about to move.

- Write analyzer unit tests — all 9 modules (Plan 06 §11)
  - `MistakeAnalyzer` (highest priority — most logic, most likely to regress)
  - `HandStrengthAnalyzer` (second — `evaluateAt` integration)
  - `PostflopAnalyzer` + `PositionalAnalyzer` (C-bet logic overlap)
  - `PreflopAnalyzer`, `SizingAnalyzer`, `StreetAnalyzer`, `BoardAnalyzer`, `PotTypeAnalyzer`
- Write repository unit tests using constructor-injected mock clients (Plan 03 §9 Phase 5)
  - `HandRepository`, `PlayerRepository`, `PlaylistRepository`, `TagRepository`, `SessionRepository`
- Write `AnalyzerService` context-assembly tests (Plan 03 §9, Plan 06 §11)
- Write `server/auth/__tests__/requireAuth.test.js` (Plan 04 §9.3)
- Cover `loginRosterPlayer` first-vs-returning-player branch (Plan 03 §9)
- Cover `getSessionReport` aggregation logic (Plan 03 §9)
- Cover `endHand` VPIP/PFR loop (Plan 03 §9)
- Document and test `hole_cards_combos` in `HandGenerator.js` (Plan 06 §7)
- Add `RangeParser` silent-failure tests (unrecognized tokens, wrong-order suited-connector ranges) (Plan 06 §8)

---

### Phase 8 — Client Architecture
**What:** Decompose `useSocket.js`, `App.jsx`, and `CoachSidebar.jsx`. This is independent of all server changes.
**Why last:** Client changes are the most user-visible and carry the most risk of introducing UI regressions. Doing them after the server is stable means the API surface is settled.

- Decompose `useSocket.js` into 5 focused hooks (Plan 05 §2)
  - `useConnectionManager`, `useGameState`, `useReplay`, `usePlaylistManager`, `useCoachActions`
- Extract `JoinScreen` from `App.jsx` (Plan 05)
- Extract `TopBar`, `TagHandPill`, `ErrorToast`, `NotificationToast` from `App.jsx` (Plan 05)
- Eliminate the `emit` bundle object — replace with stable callbacks (Plan 05 §1)
- Split `CoachSidebar.jsx` into section-level components (Plan 05)
  - `GameControls`, `BlindControls`, `PlayerList`, `PlaylistPanel`, `HandLibrary`, `HistoryPanel`, `SessionStats`
- Eliminate duplicate `/api/hands` fetches — single shared data source (Plan 05 §1)
- Verify `apiFetch` remains the call path for all authenticated REST calls post-decomposition (Plan 04/05 coordination)

---

### Phase 9 — DB Optimizations (requires migrations)
**What:** Fix N+1 query patterns and add missing indexes. Deferred because all require new Supabase migrations and some require PL/pgSQL RPCs.
**Why last:** These are correctness and performance improvements, not architecture changes. They can be addressed incrementally once the codebase structure is stable and the risks of simultaneous schema changes are lower.

- Replace `removeHandFromPlaylist` compaction loop with PostgreSQL RPC (Plan 03 §3, Phase 4)
- Replace `endHand` per-player UPDATE loop with batch upsert (Plan 03 §3, Phase 4)
- Add partial index on `hand_actions.is_reverted = false` (Plan 03 §3)
- Fix `getPlayerHands` ordering from UUID to `started_at DESC` (Plan 03 §3)
- Consider `complete_hand` RPC to make `endHand` writes atomic (Plan 03 §5)
- Consider `updateCoachTags` delete+insert RPC (Plan 03 §5)
- Enumerate columns in `buildAnalyzerContext` queries — replace `SELECT *` (Plan 03 §3)

---

## 6. Master Checklist

> Mark `[x]` when landed in a commit. Add commit SHA in the trailing comment if useful.

### Phase 0 — Dead Code Purge
- [ ] Remove dead `normalizeAction` copy from `HandLoggerSupabase.js` (Plan 06 §5)
- [ ] Remove dead `_findBBPlayerId` copy from `HandLoggerSupabase.js` (Plan 06 §3)
- [ ] Remove dead `_computePositions` helper from `HandLoggerSupabase.js` (Plan 03 §1)
- [ ] Remove abandoned first-draft function from `HandGenerator.js` lines 181–363 (Plan 06 §7)

### Phase 1 — Auth Layer Consolidation
- [ ] Create `server/auth/JwtService.js` — `sign()`, `verify()`, `JWT_EXPIRY`, `JWT_ALGORITHM` (Plan 04 §2.1)
- [ ] Create `server/auth/requireAuth.js` — Express middleware, imports only `JwtService` (Plan 04 §2.2)
- [ ] Create `server/auth/requireRole.js` — RBAC middleware factory (Plan 04 §2.3)
- [ ] Update login handler in `server/index.js` — replace `jwt.sign()` with `JwtService.sign()` (Plan 04 §3)
- [ ] Update `requireAuth` in `server/index.js` — import from `server/auth/requireAuth.js` (Plan 04 §3)
- [ ] Remove `const jwt = require('jsonwebtoken')` from `server/index.js` (Plan 04 §3)
- [ ] Delete `authenticateToken` function and its export from `HandLoggerSupabase.js` (Plan 04 §3)
- [ ] Remove `authenticateToken` stub from `REST.api.test.js` `HandLoggerSupabase` mock (Plans 03/04/06 — once)
- [ ] Remove `authenticateToken` stub from `socket.integration.test.js` mock (Plans 03/04/06 — once)
- [ ] All tests pass after Phase 1

### Phase 2 — Coach Guard Consolidation
- [ ] Create `server/auth/socketGuards.js` with `requireCoach(socket, action)` (Plan 04 §5)
- [ ] Replace all 30 `if (!socket.data.isCoach)` guards in `server/index.js` with `requireCoach()` (Plan 04 §5)
- [ ] All tests pass after Phase 2

### Phase 3a — Repository Extraction
- [ ] Create `server/db/repositories/HandRepository.js` (Plan 03 §2)
- [ ] Create `server/db/repositories/PlayerRepository.js` (Plan 03 §2)
- [ ] Create `server/db/repositories/PlaylistRepository.js` (Plan 03 §2)
- [ ] Create `server/db/repositories/TagRepository.js` (Plan 03 §2)
- [ ] Create `server/db/repositories/SessionRepository.js` (Plan 03 §2)
- [ ] Create `server/db/index.js` re-exporting all symbols as flat list (Plan 03 §10 Phase 0)
- [ ] Make `HandLoggerSupabase.js` a thin shim: `module.exports = require('./index')` (Plan 03 §10 Phase 0)
- [ ] Wrap `q()` to convert Supabase errors into real `Error` instances; add `DbError` class (Plan 03 §4)
- [ ] All tests pass after Phase 3a

### Phase 3b — AnalyzerService Extraction + Pipeline Restructure
- [ ] Create `server/game/AnalyzerService.js` — move `buildAnalyzerContext` and `analyzeAndTagHand` (Plan 03 Phase 2)
- [ ] Parallelize the 3 DB queries in `buildAnalyzerContext` with `Promise.all` (Plan 06 §3)
- [ ] Replace `for...of` loop in `analyzeAndTagHand` with `Promise.allSettled` (Plan 06 §2)
- [ ] Add `evaluateAt` memoization in `buildAnalyzerContext` (Plan 06 §3)
- [ ] Add `TagResult` shape validation before the DB insert step (Plan 06 §4)
- [ ] Wrap `buildAnalyzerContext` in try/catch inside `analyzeAndTagHand` (Plan 06 §10)
- [ ] Extract `findLastPFRaiser` to `util.js`; update `postflop.js` and `positional.js` (Plan 06 §5)
- [ ] Extract `findLastAggressorIndex` to `util.js`; update `postflop.js` and `handStrength.js` (Plan 06 §5)
- [ ] Extract `findNthRaiser` to `util.js`; update `positional.js` and `mistakes.js` (Plan 06 §5)
- [ ] Add `isAggressive` helper to `util.js` (Plan 06 §5)
- [ ] Fix `handStrength.js` tier constants to use `HAND_RANKS` from `HandEvaluator.js` (Plan 06 §6)
- [ ] Add JSDoc `@typedef TagResult` and `@typedef Analyzer` to `tagAnalyzers/index.js` (Plan 06 §4)
- [ ] Update `server/index.js` call site to import `AnalyzerService` directly (Plan 03 Phase 2)
- [ ] All tests pass after Phase 3b

### Phase 3c — `startHand` Failure Guard
- [ ] `activeHands.set()` does not run when `startHand` rejects — error logged, coach notified (Plan 03 §4)

### Phase 4a — Socket Auth Middleware
- [ ] Create `server/auth/socketAuthMiddleware.js` (Plan 04 §4)
- [ ] Register `io.use(socketAuthMiddleware)` before `io.on('connection', ...)` (Plan 04 §4)
- [ ] Simplify `join_room` — remove inline `HandLogger.authenticateToken` call, trust `socket.data.*` (Plan 04 §4)
- [ ] Update client `useSocket.js` socket constructor to pass `{ auth: { token } }` (Plan 04 §4)
- [ ] Write `server/auth/__tests__/socketAuthMiddleware.test.js` (Plan 04 §9.3)
- [ ] All tests pass after Phase 4a

### Phase 4b — Server Decomposition
- [ ] Create `server/state/SharedState.js` — encapsulate all 7 Maps (Plan 01 §1)
- [ ] Apply `activeHands` failure guard to `SharedState.js` (Plan 03 §4 + Plan 01 coordination)
- [ ] Create `server/socket/helpers.js` — `broadcastState`, `sendError`, `sendSyncError`, `startActionTimer`, `clearActionTimer` (Plan 01 §2)
- [ ] Extract socket handler groups to `server/socket/handlers/` (Plan 01 §2)
- [ ] Create `server/socket/index.js` — registers middleware + all handler groups (Plan 01 §2)
- [ ] Extract REST routes to `server/routes/` (Plan 01 §2)
- [ ] Create `server/config/startup.js` — `SESSION_SECRET`/`CORS_ORIGIN` validation + idle shutdown (Plan 01 §2)
- [ ] Reduce `server/index.js` to ~60-line bootstrap (Plan 01)
- [ ] All tests pass after Phase 4b

### Phase 5 — Playlist Auth Gates
- [ ] Confirm all client playlist calls go through `apiFetch` (Plan 04/05 coordination check)
- [ ] Add `requireAuth` to `GET /api/sessions/current` (Plan 04 §8.6)
- [ ] Add `requireAuth + requireRole('coach')` to `POST /api/playlists` (Plan 04 §8.6)
- [ ] Add `requireAuth + requireRole('coach')` to `DELETE /api/playlists/:id` (Plan 04 §8.6)
- [ ] Add `requireAuth + requireRole('coach')` to playlist mutation endpoints (Plan 04 §8.6)
- [ ] Update `REST.api.test.js` for new 401 paths (Plan 04 §9.2)
- [ ] All tests pass after Phase 5

### Phase 6 — Game Engine
- [ ] Audit and fix internal vs display key naming (`_full_board` consistency) (Plan 02 §1.2)
- [ ] Resolve `is_replay_branch` / `replay_mode.branched` duplication (Plan 02 §1.2)
- [ ] Extract `ReplayManager` from `GameManager` (Plan 02)
- [ ] Extract `BettingRound` logic from `GameManager` (Plan 02)
- [ ] Extract `ShowdownResolver` from `GameManager` (Plan 02)
- [ ] Review `SessionManager` coupling after extraction (Plan 02)
- [ ] All 918+ tests pass after Phase 6

### Phase 7 — Test Coverage
- [ ] Write `MistakeAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `HandStrengthAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `PostflopAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `PositionalAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `PreflopAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `SizingAnalyzer.test.js` with boundary values (Plan 06 §11)
- [ ] Write `StreetAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `BoardAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `PotTypeAnalyzer.test.js` (Plan 06 §11)
- [ ] Write `HandRepository.test.js` using constructor-injected mock client (Plan 03 §9)
- [ ] Write `PlayerRepository.test.js` (Plan 03 §9)
- [ ] Write `PlaylistRepository.test.js` (Plan 03 §9)
- [ ] Write `SessionRepository.test.js` (Plan 03 §9)
- [ ] Write `AnalyzerService.test.js` — context assembly, street grouping, `evaluateAt` (Plan 03 §9, Plan 06)
- [ ] Write `server/auth/__tests__/requireAuth.test.js` (Plan 04 §9.3)
- [ ] Cover `loginRosterPlayer` first-login vs returning-player branch (Plan 03 §9)
- [ ] Cover `getSessionReport` `tagSummary`/`mistakeSummary` aggregation (Plan 03 §9)
- [ ] Cover `endHand` VPIP/PFR loop (Plan 03 §9)
- [ ] Document and add test for `hole_cards_combos` in `HandGenerator.js` (Plan 06 §7)
- [ ] Add `RangeParser` silent-failure tests (Plan 06 §8)
- [ ] Write `ANALYZER_AUTHORING.md` contribution guide (Plan 06 §9)

### Phase 8 — Client Architecture
- [ ] Create `useConnectionManager.js` hook (Plan 05 §2)
- [ ] Create `useGameState.js` hook (Plan 05 §2)
- [ ] Create `useReplay.js` hook (Plan 05 §2)
- [ ] Create `usePlaylistManager.js` hook — verify uses `apiFetch` (Plan 05 §2 + Plan 04/05 coordination)
- [ ] Create `useCoachActions.js` hook (Plan 05 §2)
- [ ] Make `useSocket.js` a thin composition layer over the 5 hooks (Plan 05 §2)
- [ ] Extract `JoinScreen` from `App.jsx` (Plan 05)
- [ ] Extract `TopBar`, `TagHandPill`, `ErrorToast`, `NotificationToast` from `App.jsx` (Plan 05)
- [ ] Replace `emit` bundle object with stable callbacks (Plan 05 §1)
- [ ] Split `CoachSidebar.jsx` into `GameControls`, `BlindControls`, `PlayerList`, `PlaylistPanel`, `HandLibrary`, `HistoryPanel`, `SessionStats` (Plan 05)
- [ ] Eliminate duplicate `/api/hands` fetches — single shared data source (Plan 05 §1)
- [ ] Manual regression test: full game flow (join → play → end hand → replay) (Plan 05)

### Phase 9 — DB Optimizations
- [ ] Replace `removeHandFromPlaylist` compaction loop with PostgreSQL RPC `compact_playlist_order` — migration 008 (Plan 03 §3)
- [ ] Replace `endHand` per-player UPDATE loop with batch upsert — migration 009 (Plan 03 §3)
- [ ] Add partial index `hand_actions.is_reverted = false` — migration 010 (Plan 03 §3)
- [ ] Fix `getPlayerHands` ordering from UUID to `started_at DESC` (Plan 03 §3)
- [ ] Enumerate columns in `buildAnalyzerContext` queries — replace `SELECT *` (Plan 03 §3)
- [ ] Evaluate `complete_hand` RPC for `endHand` atomicity (Plan 03 §5)
- [ ] Evaluate `updateCoachTags` delete+insert RPC (Plan 03 §5)
