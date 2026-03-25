# Refactor Plan 03 — Persistence & Database Layer

> Status: PROPOSED — not yet started
> Scope: `server/db/HandLoggerSupabase.js` (862 lines, 31 exports), `server/db/supabase.js`, `server/reports/SessionReport.js`
> Live-safe: yes — strangler-fig facade strategy preserves all callers

---

## 1. Current State Audit

`HandLoggerSupabase.js` is 862 lines and exports 31 symbols. It is a god object mixing six distinct concerns:

**Hand lifecycle writes** (`ensureSession`, `startHand`, `recordAction`, `endHand`, `markIncomplete`, `logStackAdjustment`, `markLastActionReverted`) — sequential, fire-and-forget writes called from Socket.io handlers.

**Query / read API** (`getHands`, `getHandDetail`, `getSessionStats`, `getPlayerStats`, `getAllPlayersWithStats`, `getPlayerHands`, `getPlayerHoverStats`, `getSessionReport`) — called from Express REST handlers, always awaited.

**Playlist management** (`createPlaylist`, `getPlaylists`, `getPlaylistHands`, `addHandToPlaylist`, `removeHandFromPlaylist`, `deletePlaylist`) — eight functions covering a complete CRUD resource.

**Tag operations** (`updateCoachTags`) and the full analyzer pipeline (`buildAnalyzerContext`, `analyzeAndTagHand`, `normalizeAction`, `_findBBPlayerId`) — the most complex section, ~180 lines.

**Player identity + roster auth** (`upsertPlayerIdentity`, `loginRosterPlayer`, `isRegisteredPlayer`) — reads and writes `player_profiles`.

**JWT verification** (`authenticateToken`) — 8-line function using `jsonwebtoken`. Has zero DB calls. Wrong layer entirely.

**Private position helpers** (`_computePositions`, `_findBBPlayerId`) — `_computePositions` duplicates `positions.js`'s `buildPositionMap` semantics.

The module-level `q()` helper and `parseTags()` transform are the only genuinely shared utilities.

---

## 2. Repository Pattern — Proposed Split

Each repository receives the shared `supabase` client as a constructor argument (or module-level import). The `HandLogger` name in `server/index.js` stays as an aggregate facade — callers do not break.

### HandRepository
Owns: `hands`, `hand_players`, `hand_actions`, `stack_adjustments`

Methods:
- `startHand`, `recordAction`, `endHand`, `markIncomplete`, `markLastActionReverted`
- `logStackAdjustment`
- `getHands`, `getHandDetail`

### PlayerRepository
Owns: `player_profiles`, `leaderboard` view, `session_player_stats` view

Methods:
- `upsertPlayerIdentity`, `loginRosterPlayer`, `isRegisteredPlayer`
- `getPlayerStats`, `getAllPlayersWithStats`, `getPlayerHands`, `getPlayerHoverStats`

### PlaylistRepository
Owns: `playlists`, `playlist_hands`

Methods:
- `createPlaylist`, `getPlaylists`, `getPlaylistHands`
- `addHandToPlaylist`, `removeHandFromPlaylist`, `deletePlaylist`

### TagRepository
Owns: `hand_tags`

Methods:
- `updateCoachTags`
- The insert/delete logic currently inlined in `analyzeAndTagHand`

### SessionRepository
Owns: `sessions`, `session_player_stats`

Methods:
- `ensureSession`, `getSessionStats`, `getSessionReport`

### AnalyzerService (not a repository — no direct table ownership)
Orchestrates `buildAnalyzerContext` and `analyzeAndTagHand`. Receives `HandRepository`, `TagRepository`, and `HandEvaluator` as injected dependencies. Produces tags and delegates writes back to `TagRepository`.

**This is the most important architectural win**: the analyzer logic is business logic, not persistence logic. Moving it out of the DB layer decouples hand analysis from the database module.

### AuthService (not a repository)
`authenticateToken` moves here. It wraps `jsonwebtoken.verify` and reads `process.env.SESSION_SECRET`. Has zero DB calls. The `requireAuth` middleware in `server/index.js` imports it directly, bypassing `HandLogger` entirely.

---

## 3. Query Quality

### N+1 — `removeHandFromPlaylist` display_order compaction
After deleting a playlist entry, one query fetches remaining `hand_id` values, then fires one `UPDATE` per remaining row to compact `display_order`. For a 50-hand playlist: 51 round trips. Fix options:
- Use a floating-point `display_order` that never needs compaction
- Replace the loop with a single PostgreSQL RPC `compact_playlist_order(playlist_id)`

### N+1 — `endHand` per-player updates
`Promise.all` over per-player `UPDATE` calls. For a 6-player table: 6 round trips. These could be collapsed into a single `UPSERT` with a batch payload (same pattern as `startHand`'s `hand_players` insert).

### Broad SELECT `*` in hot paths
`buildAnalyzerContext` calls `.select('*')` on both `hands` and `hand_players`. `getHandDetail` calls `.select('*, hand_tags(...), hand_players(*), hand_actions(*)')`. The detail read is acceptable (infrequent), but `buildAnalyzerContext` runs at the end of every hand. Enumerate only the columns the analyzers actually need.

### Missing index — `hand_actions.is_reverted`
`endHand` filters `is_reverted = false` on preflop action queries. `buildAnalyzerContext` filters `is_reverted` at the application layer after fetching all actions. A partial index `WHERE is_reverted = false` on `hand_actions` benefits both. None of migrations 001–007 add this.

### `getPlayerHands` ordering by UUID
Orders by `hand_id` (UUID v4) descending. UUID v4 ordering is not monotonic — the sort is meaningless. Should order by `hands.started_at DESC` via the join.

### `loginRosterPlayer` case sensitivity
Uses `.eq('display_name', trimmed)` — works due to schema collation, but fragile. A `.ilike()` call would be explicit and collation-independent.

---

## 4. Error Handling

The `q()` helper re-throws the Supabase error object unchanged. Supabase errors are plain objects `{ message, details, hint, code }`, not `Error` instances — they have no stack trace.

**Fire-and-forget callers** in Socket.io handlers: `startHand`, `recordAction`, `markLastActionReverted`, `upsertPlayerIdentity`, `logStackAdjustment` all `.catch(err => log.error(...))`. This is intentional. Critical failure: if `startHand` fails silently, `activeHands.set(tableId, { handId })` still runs — the hand is tracked in memory but has no DB row, so every subsequent `recordAction` and `endHand` call writes orphaned rows referencing a nonexistent `hand_id`.

**REST callers** wrap in try/catch and return `res.status(500).json({ error: err.message })`. Because Supabase errors are not `Error` instances, `err.message` is `undefined` — clients receive `{ error: undefined }`.

**`buildAnalyzerContext`** returns `null` if the hand row is missing; analyzer errors are swallowed with `console.error`. Errors do not reach the `alpha_logs` table.

### Proposed Strategy

1. **Wrap `q()` to convert Supabase errors into `Error` instances**, preserving `.code` and `.details` as custom properties. This makes every `.catch(err => err.message)` call work correctly everywhere.
2. **Introduce `DbError` subclass** so callers can distinguish DB failures from logic errors in `catch` blocks.
3. **For `startHand` failure**: do not populate `activeHands`. Log the error and emit a notification to the coach. This prevents orphaned `recordAction` writes.
4. **For analyzer errors**: route through `log.error('db', 'analyzer_failed', ...)` so they appear in `/api/alpha-report`.

---

## 5. Transaction Boundaries

`endHand` performs three sequential write groups: `hands` UPDATE → `hand_players` UPDATE × N → `analyzeAndTagHand` inserts tags. None are wrapped in a transaction.

**Current failure modes:**
- `hands` UPDATE succeeds + `hand_players` UPDATE fails → hand row has `completed_normally = true` with stale player stats.
- `endHand` completes + `analyzeAndTagHand` fails → hand has no auto/mistake tags (though `analyzeAndTagHand` is designed to be re-run idempotently: it deletes existing tags before inserting).
- Tag DELETE succeeds + INSERT fails → hand ends up with zero auto tags.

**Supabase limitation**: The REST API does not expose multi-statement transactions. Correct approach:

1. Move `endHand` stats + `hand_players` updates into a PostgreSQL RPC `complete_hand(hand_id, players_json)` invoked via `.rpc()`. This makes stats writes atomic at the DB level.
2. Keep `analyzeAndTagHand` as a separate, idempotent post-processing step. On failure, log the `hand_id` to a `pending_analysis` table (single `hand_id text` column) and re-attempt on next server start.
3. The `updateCoachTags` delete+insert sequence should be wrapped in a single RPC that uses `DELETE ... INSERT` within PL/pgSQL.

---

## 6. The `analyzeAndTagHand` Flow

The 9 analyzers run sequentially in a `for...of` loop. Each analyzer is a synchronous `.analyze(ctx)` call — they do no I/O. The context is fetched once before the loop.

**Parallelism**: Because all analyzers are synchronous CPU work on the same pre-fetched context, `Promise.all` over synchronous functions is not faster. The sequential loop is correct.

**Partial tagging**: An analyzer throwing does not stop subsequent analyzers — the `try/catch` inside the loop continues. This is good. Partial results are acceptable.

**Missing fast path**: No guard for hands with zero actions (walks, abandoned hands). `buildAnalyzerContext` still queries the DB and all 9 analyzers run as no-ops. A check `if (ctx.allActions.length === 0) return []` before the loop skips 9 useless passes.

**Return value**: `analyzeAndTagHand` returns `tagRows`. The `.then()` chain in `server/index.js` line 892 ignores this. Consider dropping the return value or documenting its intended use.

---

## 7. `buildAnalyzerContext` — Incremental Construction Proposal

`buildAnalyzerContext` currently fires 3 DB queries after the hand ends:
1. `SELECT * FROM hands WHERE hand_id = ?`
2. `SELECT * FROM hand_actions WHERE hand_id = ? ORDER BY id`
3. `SELECT * FROM hand_players WHERE hand_id = ?`

**Alternative**: `GameManager` or `SessionManager` maintains a `HandContext` object populated incrementally:
- At `startHand`: store dealer_seat, big_blind, players, positions
- At each `recordAction`: append to in-memory `actions[]` with `pot_at_action` and `stack_at_action` from live game state
- At `endHand`: attach board and hole_cards

Pass the `HandContext` object directly to `analyzeAndTagHand` instead of fetching from DB. This eliminates 3 queries per hand-end.

**Tradeoff**: Couples the analyzer to the server's in-memory state, making it harder to re-analyze historical hands. The current architecture supports re-running `analyzeAndTagHand(handId)` on any past hand — valuable for migration backfills (e.g., migration 006 needed to backfill tags).

**Recommended compromise**: Keep `buildAnalyzerContext(handId)` for historical re-analysis. Add a second entry point `buildAnalyzerContextFromMemory(handContext)` for live hands. `analyzeAndTagHand` accepts either a `handId` or a pre-built context object.

---

## 8. Authentication Coupling

`authenticateToken` is 8 lines of `jsonwebtoken.verify` with no DB access. Living in the DB module causes:
- `requireAuth` middleware imports all 31 `HandLogger` exports solely for this function
- Integration test mocks include `authenticateToken` as a mock returning a hardcoded payload
- Any JWT claims change requires touching the DB module

**Proposed location**: `server/auth/tokenAuth.js`, alongside `PlayerRoster.js`.
- Exports: `verifyToken(token) → payload | null`
- `requireAuth` middleware imports from `server/auth/tokenAuth.js` instead of `HandLogger`
- Login handler in `server/index.js` already calls `jwt.sign` directly (line 1568–1572) — consistent

---

## 9. Test Coverage

### Currently Tested

- `Phase6.test.js`: `_computePositions` thoroughly (heads-up through 7-player tables, edge cases). Validates `recordAction` receives `stack_at_action`, `pot_at_action`, `decision_time_ms`, `position` fields via mock capture.
- `REST.api.test.js`: All 12 REST endpoints including 401/404 paths. Mocks `HandLogger` wholesale — no actual DB code exercised.
- `socket.integration.test.js`: Socket.io event flow. Mocks `HandLoggerSupabase` at module level — actual DB functions not tested.

### Coverage Gaps

| Function | Status |
|---|---|
| `buildAnalyzerContext` | Zero coverage — context assembly, street grouping, `potByStreet` fallback, `evaluateAt` closure all untested |
| `analyzeAndTagHand` | Only the mock is tested — deduplication, delete+insert sequence, `ANALYZER_REGISTRY` interaction untested |
| `endHand` VPIP/PFR loop | Untested |
| `loginRosterPlayer` | First-login vs returning-player branch untested |
| `getSessionReport` | `tagSummary`/`mistakeSummary` aggregation logic untested |
| `removeHandFromPlaylist` | display_order compaction loop untested |
| `getPlayerHands` ordering | Incorrect ordering untested |

### Why Tests Are Hard Now

`HandLoggerSupabase.js` imports `supabase` at module scope — no injection point. All tests must `jest.mock('../supabase', ...)` at the top, requiring deep knowledge of the Supabase chaining API. The mock in `Phase6.test.js` (65 lines) misses `.ilike()`, `.not()`, `.gte()` — any new query using those operators would cause method-not-found errors.

After repository split with constructor injection: each repository accepts a supabase client as a parameter, making it trivially mockable or replaceable with a test-DB client. `AnalyzerService` receives `HandRepository` and `TagRepository` as constructor arguments — tests pass stubs without mocking the Supabase module.

---

## 10. Migration Strategy — Refactor Without Breaking Callers

15+ call sites in `server/index.js` use the `HandLogger` alias. Safest path: **strangler-fig facade**.

### Phase 0 — Structural extraction (no behavior change, safe to ship)

1. Create `server/db/repositories/` directory
2. Extract each repository: `HandRepository.js`, `PlayerRepository.js`, `PlaylistRepository.js`, `TagRepository.js`, `SessionRepository.js`
3. Create `server/db/index.js` that imports all five and re-exports the same flat symbol list as `HandLoggerSupabase.js`
4. Rename `HandLoggerSupabase.js` to a thin shim: `module.exports = require('./index')`
5. `server/index.js` changes nothing — `require('./db/HandLoggerSupabase')` still resolves

### Phase 1 — Extract AuthService (independent, zero risk)

- Move `authenticateToken` to `server/auth/tokenAuth.js`
- Update `requireAuth` middleware import
- Remove from `HandLoggerSupabase` exports
- Update mock in `REST.api.test.js`

### Phase 2 — Extract AnalyzerService (most impactful)

- Move `buildAnalyzerContext`, `analyzeAndTagHand`, `normalizeAction`, `_findBBPlayerId` to `server/game/AnalyzerService.js`
- `server/index.js` imports `AnalyzerService` directly for the `.then(() => AnalyzerService.analyzeAndTagHand(...))` call (line 892)
- `HandLogger` facade re-exports `analyzeAndTagHand` for backward compatibility during transition

### Phase 3 — Fix `q()` error wrapping (independent)

- Wrap Supabase errors into `Error` instances inside `q()`
- Add `DbError` class
- Run full test suite to verify no test relied on raw Supabase error shape

### Phase 4 — Address N+1 patterns (requires DB migrations)

- Replace `removeHandFromPlaylist` compaction loop with PostgreSQL RPC
- Replace `endHand` per-player updates with batch upsert
- New migration files: 008, 009
- Add missing `hand_actions.is_reverted` partial index

### Phase 5 — Add test coverage

- Create `server/db/__tests__/HandRepository.test.js`, `AnalyzerService.test.js`, etc.
- Use constructor injection — no Supabase module mocking required
- Cover: `buildAnalyzerContext`, `analyzeAndTagHand`, `endHand` VPIP loop, `loginRosterPlayer`, `getSessionReport` aggregations

Phases 0–3 carry zero regression risk. Phases 4–5 require care because they touch SQL.

---

## Critical Files for Implementation

| File | Role |
|---|---|
| `server/db/HandLoggerSupabase.js` | God object to be split; all repository extractions start here |
| `server/index.js` | 15+ call sites; facade shim must preserve every exported symbol |
| `server/db/__tests__/REST.api.test.js` | Mock must be updated when symbols move; `authenticateToken` extraction is the most impactful |
| `supabase/migrations/001_initial_schema.sql` | Schema reference for index additions and new RPC functions |
| `server/auth/PlayerRoster.js` | Target home directory for `tokenAuth.js`; understand existing auth module pattern first |
