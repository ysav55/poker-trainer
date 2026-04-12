# Item 2: Game Mode Controllers

**Status**: ⬜ pending
**Blocked by**: Item 1 (TableRepository + table.mode needed)
**Blocks**: Item 9 (Tournament needs TournamentController stub)

---

## Context

All game flow goes through `gameLifecycle.js` socket handlers calling `SessionManager`/
`GameManager` directly. Coach clicks "Start Hand" → `start_game` event → `gm.startGame()`.
For `AutoController` and `TournamentController`, the *server* must trigger `startGame()`
automatically without any coach action. No `server/game/controllers/` directory exists yet.

---

## New Directory: `server/game/controllers/`

### `TableController.js` — Base class

```js
// server/game/controllers/TableController.js
export class TableController {
  constructor(tableId, gameManager, io) {
    this.tableId = tableId;
    this.gm = gameManager;
    this.io = io;
    this.active = true;
  }

  /** Called by gameLifecycle when a hand reaches showdown/completion */
  async onHandComplete(handResult) {
    throw new Error(`${this.constructor.name}.onHandComplete not implemented`);
  }

  /** Called when a player joins the table */
  async onPlayerJoin(playerId) {}

  /** Called when a player leaves the table */
  async onPlayerLeave(playerId) {}

  /** Returns the mode string for this table */
  getMode() {
    throw new Error(`${this.constructor.name}.getMode not implemented`);
  }

  /** Cleanup: called when table is closed */
  destroy() {
    this.active = false;
  }
}
```

### `CoachedController.js` — Existing flow, no auto-deal

```js
// server/game/controllers/CoachedController.js
import { TableController } from './TableController.js';

export class CoachedController extends TableController {
  getMode() { return 'coached_cash'; }

  async onHandComplete(handResult) {
    // Emit to room — coach sees result and manually clicks Start Hand
    this.io.to(this.tableId).emit('hand_complete', handResult);
  }
}
```

### `AutoController.js` — Auto-deal uncoached cash

```js
// server/game/controllers/AutoController.js
import { TableController } from './TableController.js';

const DEAL_DELAY_MS = 2000;

export class AutoController extends TableController {
  getMode() { return 'uncoached_cash'; }

  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);
    // Auto-deal after brief pause to show showdown result
    setTimeout(async () => {
      if (!this.active) return;
      const seated = this.gm.getState()?.seated ?? [];
      if (seated.length >= 2) {
        await this.gm.startGame();
      }
    }, DEAL_DELAY_MS);
  }

  // Disallowed actions: return false, emit error
  canPause()    { return false; }
  canUndo()     { return false; }
  canManualCard() { return false; }
  canReplay()   { return false; }
}
```

### `TournamentController.js` — Stub (fleshed out in Item 9)

```js
// server/game/controllers/TournamentController.js
import { AutoController } from './AutoController.js';

export class TournamentController extends AutoController {
  constructor(tableId, gm, io, config = null) {
    super(tableId, gm, io);
    this.config = config;
    // BlindSchedule initialized in Item 9
  }

  getMode() { return 'tournament'; }

  // Full implementation deferred to Item 9
  // Stub: behaves like AutoController until Item 9
}
```

### `BlindSchedule.js`

```js
// server/game/controllers/BlindSchedule.js
export class BlindSchedule {
  constructor(levels) {
    // levels: [{ level, sb, bb, ante, duration_minutes }, ...]
    this.levels = levels;
    this.currentIndex = 0;
    this.levelStartTime = null;
  }

  getCurrentLevel() {
    return this.levels[this.currentIndex] ?? null;
  }

  advance() {
    if (this.currentIndex < this.levels.length - 1) {
      this.currentIndex++;
      this.levelStartTime = Date.now();
      return this.levels[this.currentIndex];
    }
    return null; // at final level
  }

  getTimeRemainingMs() {
    if (!this.levelStartTime) return null;
    const level = this.getCurrentLevel();
    if (!level) return null;
    const elapsed = Date.now() - this.levelStartTime;
    return Math.max(0, level.duration_minutes * 60_000 - elapsed);
  }

  isAtFinalLevel() {
    return this.currentIndex === this.levels.length - 1;
  }
}
```

---

## Controller Factory in `SharedState.js`

```js
// Add to server/state/SharedState.js
import { CoachedController } from '../game/controllers/CoachedController.js';
import { AutoController } from '../game/controllers/AutoController.js';
import { TournamentController } from '../game/controllers/TournamentController.js';

const controllers = new Map(); // tableId → TableController

export function getOrCreateController(tableId, mode, gm, io) {
  if (controllers.has(tableId)) return controllers.get(tableId);
  const ctrl = _createController(mode, tableId, gm, io);
  controllers.set(tableId, ctrl);
  return ctrl;
}

export function getController(tableId) {
  return controllers.get(tableId) ?? null;
}

export function destroyController(tableId) {
  const ctrl = controllers.get(tableId);
  if (ctrl) { ctrl.destroy(); controllers.delete(tableId); }
}

function _createController(mode, tableId, gm, io) {
  switch (mode) {
    case 'uncoached_cash': return new AutoController(tableId, gm, io);
    case 'tournament':     return new TournamentController(tableId, gm, io);
    default:               return new CoachedController(tableId, gm, io);
  }
}
```

---

## `gameLifecycle.js` Changes

### On join_room — instantiate controller
```js
const tableMode = (await TableRepository.getTable(tableId))?.mode ?? 'coached_cash';
const sm = getOrCreateTable(tableId);  // existing
getOrCreateController(tableId, tableMode, sm.gm, io);  // new
```

### On hand completion — delegate to controller
```js
// Where hand_complete is currently emitted:
const ctrl = getController(tableId);
await ctrl?.onHandComplete(handResult) ?? io.to(tableId).emit('hand_complete', handResult);
```

### On start_game — check if mode allows manual start
```js
socket.on('start_game', async () => {
  const ctrl = getController(socket.data.tableId);
  if (ctrl?.getMode() === 'uncoached_cash') {
    return socket.emit('error', { message: 'Auto-deal tables start automatically' });
  }
  // ... existing start_game logic
});
```

### Emit `table_config` on join_room
```js
// After room_joined is emitted, also emit table mode so client can conditionally render CoachSidebar
socket.emit('table_config', { mode: tableMode });
```

---

## Client: Conditional CoachSidebar

In `useGameState.js`, listen for `table_config`:
```js
socket.on('table_config', ({ mode }) => setTableMode(mode));
```

In `App.jsx` (or `TablePage.jsx` after Item 5):
```jsx
{isCoach && tableMode === 'coached_cash' && <CoachSidebar ... />}
{tableMode !== 'coached_cash' && <TableInfoPanel mode={tableMode} />}
```

New component: `client/src/components/TableInfoPanel.jsx` — minimal panel showing mode,
current blind level, player count. No game controls.

---

## Key Files to Read Before Implementing

- `server/game/GameManager.js` — `startGame()` method signature
- `server/socket/handlers/gameLifecycle.js` — full hand completion flow (find where to insert `onHandComplete`)
- `server/state/SharedState.js` — existing tables Map, exports to extend
- `server/db/repositories/TableRepository.js` — from Item 1, needed for mode lookup

---

## Tests

- Unit: `CoachedController.onHandComplete` — emits `hand_complete`, does NOT call `gm.startGame`
- Unit: `AutoController.onHandComplete` — calls `gm.startGame` after 2s delay
- Unit: `AutoController.canPause/canUndo/canManualCard/canReplay` — all return false
- Unit: `BlindSchedule.advance()` — increments level, returns next level, returns null at end
- Unit: `BlindSchedule.getTimeRemainingMs()` — correct remaining time calculation
- Unit: `BlindSchedule.isAtFinalLevel()` — true when at last level
- Unit: `getOrCreateController` — returns existing or creates new by mode
- Integration: uncoached table — hand completes → server auto-deals next hand after 2s
- Integration: coached table — hand completes → no auto-deal; coach must emit `start_game`
- Integration: `start_game` on uncoached table → error emitted to socket
