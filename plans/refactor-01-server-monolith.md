# Refactor Plan: `server/index.js` Monolith Decomposition

## 1. Current State Audit

### What is in the file (1704 lines)

`server/index.js` is a single-file monolith serving six distinct responsibilities:

**Infrastructure setup (lines 62–113)**
- Express app creation, CORS middleware, `express.json()`, HTTP logging via `log.httpMiddleware()`
- `http.createServer`, `Server` (Socket.io) instantiation with CORS
- `SESSION_SECRET` and `CORS_ORIGIN` fail-fast validation at startup

**Module-level shared state (lines 96–152)**
- `tables` — `Map<tableId, SessionManager>` — one entry per active table
- `activeHands` — `Map<tableId, { handId, sessionId }>` — tracks the DB hand ID for the in-progress hand
- `stableIdMap` — `Map<socketId, stableId>` — bridges ephemeral socket IDs to persistent UUIDs
- `reconnectTimers` — `Map<socketId, { timer, tableId, name, isCoach, configSnapshot }>` — TTL eviction state
- `ghostStacks` — `Map<stableId, stack>` — preserves chip counts across TTL expiry
- `actionTimers` — `Map<tableId, { timeout, startedAt, duration, playerId }>` — per-table countdown
- `pausedTimerRemainders` — `Map<tableId, { playerId, remainingMs }>` — pause/resume timer state

**Helper functions (lines 154–422)**
- `getOrCreateTable(tableId)` — lazy SessionManager factory
- `broadcastState(tableId, notification?)` — emits personalized `game_state` to every socket in a room
- `sendError(socket, message)` — emits `error` event to one socket
- `sendSyncError(socket, message)` — emits `sync_error` (non-fatal) to one socket
- `startActionTimer(tableId, opts)` — 30s countdown with auto-fold on expiry, pause-resume support
- `clearActionTimer(tableId, opts)` — cancels timeout, optionally saves remainder
- `_activeNonCoachCount(gm)` — counts seated non-coach players
- `_findMatchingPlaylistIndex(gm, activeCount)` — async search through playlist for player-count match
- `_advancePlaylist(tableId, gm)` — async, mutates playlist state and broadcasts
- `_loadScenarioIntoConfig(tableId, gm, handDetail, stackMode)` — maps historical hand onto live seats

**Socket.io connection handler + 38 event handlers (lines 427–1354)**
All registered inside the single `io.on('connection', socket => { ... })` closure.

**REST API routes (lines 1356–1629)**
- 6 history/player endpoints under `/api/hands` and `/api/players`
- 2 session endpoints (`/api/sessions/:id/stats`, `/api/sessions/:id/report`, `/api/sessions/current`)
- 6 playlist CRUD endpoints under `/api/playlists`
- 2 auth endpoints (`/api/auth/login`, `/api/auth/register`)
- `/health`, `/api/alpha-report`, global error middleware

**Shutdown, idle timer, static serving (lines 1631–1704)**

### Biggest pain points

1. **All shared Maps are module-level globals.** Any extracted module must receive them by reference — or they must be encapsulated — making import order implicit and testing painful.
2. **`broadcastState`, `sendError`, `startActionTimer`, and `clearActionTimer` are defined before the `io` object is bound into any module scope.** Extracted handlers must either import from a context object or be given `io` at construction time.
3. **Every socket handler is defined inside the `io.on('connection', ...)` closure**, which means they all close over the same `socket` variable. Each handler file must be a factory that receives `{ socket, io, tables, activeHands, stableIdMap, ... }`.
4. **DB calls inside socket handlers (fire-and-forget `.catch()` pattern) are mixed with game-logic calls.** There is no boundary between "what the GameManager returns" and "what gets logged to Supabase". The `place_bet` handler (lines 620–703) is the clearest example.
5. **`_loadScenarioIntoConfig` and `_advancePlaylist` are helper functions but depend on `io`, `tables`, and `HandLogger`.** They are effectively mini-services with no clear home.
6. **Auth middleware `requireAuth` (lines 116–127) is defined inline** and tightly coupled to `HandLogger.authenticateToken`.
7. **Playlist REST endpoints have no auth guard** (lines 1469–1531), while the equivalent socket operations require `isCoach`. This inconsistency should be addressed during extraction.
8. **Idle shutdown (lines 1650–1673) registers a second `io.on('connection', ...)` listener** after the main one. It should be collocated with server lifecycle code.

---

## 2. Proposed Directory Structure

```
server/
  index.js                          (~60 lines — bootstrap only)

  config/
    startup.js                      (SESSION_SECRET + CORS_ORIGIN validation)

  middleware/
    requireAuth.js                  (JWT verification)
    rateLimiter.js                  (authLimiter + future limiters)

  state/
    SharedState.js                  (encapsulates all 7 Maps; singleton export)

  socket/
    index.js                        (io.on('connection') — registers all handler groups)
    helpers.js                      (broadcastState, sendError, sendSyncError,
                                     startActionTimer, clearActionTimer)
    handlers/
      joinRoom.js                   (join_room + reconnect + spectator logic)
      gameLifecycle.js              (start_game, reset_hand, start_configured_hand)
      betting.js                    (place_bet)
      coachControls.js              (manual_deal_card, undo_action, rollback_street,
                                     set_player_in_hand, toggle_pause, set_blind_levels,
                                     set_mode, force_next_street, award_pot, adjust_stack)
      handConfig.js                 (open_config_phase, update_hand_config, load_hand_scenario)
      playlists.js                  (create_playlist, get_playlists, add/remove/delete_playlist,
                                     activate_playlist, deactivate_playlist, update_hand_tags)
      replay.js                     (load_replay, replay_step_*, replay_branch,
                                     replay_unbranch, replay_exit)
      disconnect.js                 (disconnect — TTL, ghost stacks, auto-pause)
      misc.js                       (client_error)

    services/
      playlistService.js            (_advancePlaylist, _findMatchingPlaylistIndex,
                                     _activeNonCoachCount)
      scenarioService.js            (_loadScenarioIntoConfig)

  routes/
    hands.js                        (GET /api/hands, GET /api/hands/:id)
    players.js                      (GET /api/players, stats, hands, hover-stats)
    sessions.js                     (stats, report, current)
    playlists.js                    (playlist CRUD — with auth guards added)
    auth.js                         (POST /api/auth/login, /register)
    health.js                       (GET /health)
    alphaReport.js                  (GET /api/alpha-report)

  lifecycle/
    shutdown.js                     (markAllHandsIncomplete, SIGINT/SIGTERM)
    idleTimer.js                    (IDLE_TIMEOUT_MINUTES logic)
```

The slimmed `server/index.js` becomes ~60 lines:
- Import config, SharedState, app, httpServer/io
- Register socket handlers
- Register routes
- Register lifecycle hooks
- `httpServer.listen(PORT)`
- `module.exports = { app, httpServer, io, tables }`

---

## 3. Extraction Strategy

### Handler group extraction pattern

Each handler file exports a factory function:

```
// socket/handlers/betting.js
module.exports = function registerBettingHandlers(socket, ctx) {
  // ctx = { io, tables, activeHands, stableIdMap, actionTimers,
  //          pausedTimerRemainders, helpers }
  socket.on('place_bet', ({ action, amount = 0 } = {}) => { ... });
};
```

`socket/index.js` becomes:
```
io.on('connection', socket => {
  const ctx = buildContext(socket, sharedState);
  require('./handlers/joinRoom')(socket, ctx);
  require('./handlers/gameLifecycle')(socket, ctx);
  // ... etc
});
```

### Specific extractions

**`join_room` handler (lines 431–570)** → `socket/handlers/joinRoom.js`
Needs: `io`, `tables`, `stableIdMap`, `reconnectTimers`, `ghostStacks`, `HandLogger`, `log`, `broadcastState`, `sendError`

**`start_game` / `reset_hand` / `start_configured_hand`** → `socket/handlers/gameLifecycle.js`
These three share identical `allSeatedPlayers` + `nonCoachPlayers` build logic using `stableIdMap` (duplicated at lines 590–591 and ~974). Extract to `services/handDbBridge.js` as `_buildSeatedPlayerLists(gm, stableIdMap)` before extracting either handler.

**`place_bet` (lines 620–703)** → `socket/handlers/betting.js`
Most complex handler. Extraction sequence: (a) copy verbatim, (b) replace Map references with `ctx.` prefixes, (c) replace helpers with `ctx.helpers.` calls.

**`disconnect` (lines 1267–1353)** → `socket/handlers/disconnect.js`
Has most cross-cutting state access. Note: line 1289 directly mutates `gm.state.paused = true` rather than calling `gm.togglePause()` to avoid double-broadcast. Document this explicitly in the extracted file.

**Playlist helpers** → `socket/services/playlistService.js`
`_advancePlaylist` and `_findMatchingPlaylistIndex` currently close over `io`, `tables`, `HandLogger`. After extraction they accept `{ io, tableId, gm, HandLogger }` as parameters.

**`_loadScenarioIntoConfig`** → `socket/services/scenarioService.js`
The `tableId` parameter (passed at lines 346, 1010, 1150, 1345) is never read inside the function body — remove it on extraction.

---

## 4. Shared State Problem

The seven module-level Maps are the core coupling problem. Solution: a `SharedState` singleton.

**`server/state/SharedState.js`**

```js
class SharedState {
  constructor() {
    this.tables                = new Map(); // tableId → SessionManager
    this.activeHands           = new Map(); // tableId → { handId, sessionId }
    this.stableIdMap           = new Map(); // socketId → stableId
    this.reconnectTimers       = new Map(); // socketId → { timer, tableId, name, isCoach, configSnapshot }
    this.ghostStacks           = new Map(); // stableId → stack
    this.actionTimers          = new Map(); // tableId → { timeout, startedAt, duration, playerId }
    this.pausedTimerRemainders = new Map(); // tableId → { playerId, remainingMs }
  }

  getOrCreateTable(tableId) {
    if (!this.tables.has(tableId)) {
      this.tables.set(tableId, new SessionManager(tableId));
    }
    return this.tables.get(tableId);
  }
}

module.exports = new SharedState(); // singleton
```

Tests construct a `new SharedState()` directly without module cache tricks. Node.js is single-threaded so the singleton is safe against concurrent mutations.

---

## 5. Middleware Extraction

**`server/middleware/requireAuth.js`** — extracts lines 116–127. Imports `HandLoggerSupabase` directly.

**`server/middleware/rateLimiter.js`** — extracts `authLimiter` (lines 131–137). Extend here for future per-endpoint limiters.

**HTTP logging middleware** stays in `server/logs/logger.js` as `log.httpMiddleware()`. `app.js` simply calls `app.use(log.httpMiddleware())`.

---

## 6. Helper Functions — Where They Live

All five socket-facing helpers → **`server/socket/helpers.js`**, exported as `buildHelpers(io, sharedState)`:

| Function | Dependencies |
|---|---|
| `broadcastState(tableId, notification)` | `io`, `tables` |
| `sendError(socket, message)` | `socket` only |
| `sendSyncError(socket, message)` | `socket` only |
| `startActionTimer(tableId, opts)` | `io`, `tables`, `actionTimers`, `pausedTimerRemainders` |
| `clearActionTimer(tableId, opts)` | `io`, `actionTimers`, `pausedTimerRemainders` |

`startActionTimer` calls `broadcastState` (line 253) and calls itself on auto-fold (line 257). Both are internal to helpers.js — no circular dependency.

`getOrCreateTable` moves into `SharedState` as a method.

---

## 7. Risk Analysis

### High-risk areas

**Shared state reference integrity.** If any module imports `SharedState` before it is populated (e.g., in tests), it gets an empty Map. Never reset or replace Maps — only call `.clear()`, `.set()`, `.delete()`.

**`startActionTimer` recursive auto-fold.** Line 249: `broadcastState(...)` + line 257: `startActionTimer(...)`. After extraction both must come from the same `helpers` object. Build helpers eagerly at server startup, before `io.on('connection')` is registered.

**`disconnect` handler direct state mutation.** Line 1289: `gm.state.paused = true` bypasses `gm.togglePause()` intentionally (avoids double-broadcast). Document cross-reference in `disconnect.js`. Regression test: verify `coach_disconnected` is only emitted once per disconnect.

**`reset_hand` async cascade.** Lines 887–907: `gm.resetForNextHand()` → `HandLogger.endHand(...)` → `HandLogger.analyzeAndTagHand(...)` → `_advancePlaylist(...)`. Ensure `_advancePlaylist` in the extracted handler uses the `ctx.tables` reference, not a stale closure.

**`start_game` / `start_configured_hand` code duplication.** Both build `allSeatedPlayers` / `nonCoachPlayers` with identical `stableIdMap.get(p.id) || p.id` logic. Extract `_buildSeatedPlayerLists` before extracting either handler.

**Playlist REST routes missing auth.** `GET/POST /api/playlists` and all sub-routes (lines 1469–1531) have no `requireAuth` guard. Apply consistently in `routes/playlists.js`, noting if intentionally public.

### Tests to run before and after each phase

- `server/db/__tests__/` — HandLogger integration tests (unaffected by socket restructuring)
- `server/game/__tests__/` — GameManager, HandEvaluator, HandGenerator, SessionManager unit tests (unaffected)
- Any socket integration tests — will need `require` path updates
- Manual smoke test: join → start_game → place_bet × 3 → reset_hand → verify session_stats emitted

---

## 8. Phased Approach

### Phase 0 — Pre-extraction safety (no behavior change)
1. Add Jest coverage for `broadcastState`, `startActionTimer`, `clearActionTimer` if absent
2. Document all 7 Maps with JSDoc invariants before moving them
3. Add ESLint `no-var` + `prefer-const` to catch accidental re-assignments

### Phase 1 — Extract middleware and config (independent, zero risk)
Targets: `config/startup.js`, `middleware/requireAuth.js`, `middleware/rateLimiter.js`
No runtime state dependencies. Extract, require back, behavior identical.

### Phase 2 — Extract REST routes (independent of socket layer)
Order: `routes/auth.js` → `routes/health.js` → `routes/alphaReport.js` → `routes/hands.js` → `routes/players.js` → `routes/sessions.js` → `routes/playlists.js` (add auth guards here).
Each route module is a factory: `module.exports = function buildRouter(deps) { ... }`.
Socket layer untouched in this phase.

### Phase 3 — Create SharedState and extract helpers
1. Create `server/state/SharedState.js`
2. Replace 7 `const` Map declarations in `index.js` with `const sharedState = require('./state/SharedState')`
3. Extract `server/socket/helpers.js` with `buildHelpers(io, sharedState)`
4. Run all tests

### Phase 4 — Extract socket services
Extract `socket/services/scenarioService.js` and `socket/services/playlistService.js` first — these are called from handlers, not socket event handlers themselves. Reduces complexity for Phase 5.

### Phase 5 — Extract socket handlers (highest risk)
Recommended order (least-coupled first):
1. `misc.js` — `client_error` (trivial)
2. `replay.js` — 7 replay handlers
3. `coachControls.js` — 10 handlers, uniform pattern
4. `handConfig.js` — 3 handlers
5. `playlists.js` — 9 handlers
6. `betting.js` — `place_bet` (most complex; last of the player-facing handlers)
7. `gameLifecycle.js` — `start_game`, `reset_hand`, `start_configured_hand`
8. `disconnect.js` — most state-crossing
9. `joinRoom.js` — initializes all per-socket state; extract last

After each file: replace its `socket.on(...)` block in `index.js` with the factory call. Do not extract all handlers simultaneously.

### Phase 6 — Slim index.js and extract lifecycle
Extract `lifecycle/shutdown.js` and `lifecycle/idleTimer.js`. Move static file serving into `app.js`. Result: `index.js` is ~60 lines.

---

## 9. Code Quality Improvements

### Coach guard deduplication
`if (!socket.data.isCoach) return sendError(socket, '...')` appears verbatim at 26 locations (lines 574, 707, 725, 744, 763, 775, 807, 824, 845, 867, 912, 931, 962, 1000, 1028, 1065, 1085, 1098, 1107, 1121, 1165, 1175, 1191, 1201, 1213, 1225, 1235, 1247).
Extract to `server/utils/validate.js` as `requireCoach(socket, sendError)` — reduces each occurrence to a one-liner.

### Input validation pattern
Each handler validates ad-hoc (e.g., line 432: `if (!name || typeof name !== 'string' || name.trim().length === 0)`).
Extract `server/utils/validate.js` with `requireString(value, fieldName)` → `{ error }` or `{ value: trimmed }`.

### Safe async handler wrapper
Several `async` socket handlers have no top-level try/catch (e.g., `create_playlist`, line 1065). Add `safeHandler(fn)` wrapper during extraction: catches uncaught rejections and emits `sendError` rather than failing silently.

### Consistent async/await convention
- `await` all DB calls that can fail in a user-visible way (`startHand`, `getHandDetail`)
- `.catch(err => log.error(...))` for non-blocking writes (`recordAction`, `markLastActionReverted`, `upsertPlayerIdentity`)
- No mixing of the two patterns within a single handler

### Remove unused `tableId` from `_loadScenarioIntoConfig`
Parameter passed at lines 346, 1010, 1150, 1345 but never read inside the function body.

### Fix `GET /api/sessions/current` hardcoded table name
Line 1456: `tables.get('main-table')`. Add `tableId` query parameter with `'main-table'` as default.

### Action message grammar fix
Line 696: final branch `'s'` applies to both `'fold'` (correct) and any unknown action type (silent bug). Fix when extracting `betting.js`.

---

## Critical Files for Implementation

| File | Role |
|---|---|
| `server/index.js` | Primary target; all 1704 lines must be read before any extraction |
| `server/game/SessionManager.js` | Public API all extracted handlers call; understand before cutting |
| `server/db/HandLoggerSupabase.js` | All DB calls originate here; `authenticateToken` is auth layer debt |
| `server/logs/logger.js` | `log.httpMiddleware()`, `log.trackSocket()` must survive extraction |
| `server/auth/PlayerRoster.js` | Used exclusively by `routes/auth.js` post-extraction |
