# Item 9: Tournament Mode

**Status**: ⬜ pending
**Blocked by**: Item 1 (TableRepository + table.mode), Item 2 (TournamentController stub + BlindSchedule)
**Blocks**: nothing

---

## Context

After Item 2, `TournamentController` is a stub that extends `AutoController` (auto-deal
but no blind advancement or elimination). This item delivers the full implementation:
blind level timer, elimination logic, tournament end detection, and tournament UI.

---

## Migration 012 — Tournament Tables

```sql
-- supabase/migrations/012_tournament.sql

CREATE TABLE tournament_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id TEXT REFERENCES tables(id) ON DELETE CASCADE,
  blind_schedule JSONB NOT NULL DEFAULT '[]',
  -- e.g. [{"level":1,"sb":25,"bb":50,"ante":0,"duration_minutes":20}, ...]
  starting_stack INT NOT NULL DEFAULT 10000,
  rebuy_allowed BOOLEAN DEFAULT false,
  rebuy_level_cap INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tournament_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id TEXT REFERENCES tables(id) ON DELETE CASCADE,
  player_id UUID REFERENCES player_profiles(id),
  finish_position INT,
  chips_at_elimination INT,
  eliminated_at TIMESTAMPTZ,
  prize NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tournament_standings_table ON tournament_standings (table_id, finish_position);
```

---

## New Repository: `server/db/repositories/TournamentRepository.js`

```js
export const TournamentRepository = {
  async createConfig({ tableId, blindSchedule, startingStack, rebuyAllowed, rebuyLevelCap }) {
    const { data } = await supabase.from('tournament_configs').insert({
      table_id: tableId,
      blind_schedule: blindSchedule,
      starting_stack: startingStack,
      rebuy_allowed: rebuyAllowed,
      rebuy_level_cap: rebuyLevelCap,
    }).select('id').single();
    return data.id;
  },

  async getConfig(tableId) {
    const { data } = await supabase
      .from('tournament_configs')
      .select('*')
      .eq('table_id', tableId)
      .single();
    return data;
  },

  async recordElimination({ tableId, playerId, position, chipsAtElimination = 0 }) {
    await supabase.from('tournament_standings').upsert({
      table_id: tableId,
      player_id: playerId,
      finish_position: position,
      chips_at_elimination: chipsAtElimination,
      eliminated_at: new Date().toISOString(),
    }, { onConflict: 'table_id,player_id' });
  },

  async getStandings(tableId) {
    const { data } = await supabase
      .from('tournament_standings')
      .select('*, player_profiles(display_name)')
      .eq('table_id', tableId)
      .order('finish_position', { ascending: true });
    return data ?? [];
  },
};
```

---

## Full `TournamentController.js` Implementation

Replace the stub from Item 2:

```js
// server/game/controllers/TournamentController.js
import { AutoController } from './AutoController.js';
import { BlindSchedule } from './BlindSchedule.js';
import { TournamentRepository } from '../../db/repositories/TournamentRepository.js';
import { TableRepository } from '../../db/repositories/TableRepository.js';

export class TournamentController extends AutoController {
  constructor(tableId, gm, io, config = null) {
    super(tableId, gm, io);
    this.config = config;
    this.blindSchedule = config ? new BlindSchedule(config.blind_schedule) : null;
    this.levelTimer = null;
  }

  getMode() { return 'tournament'; }

  async start(config) {
    this.config = config;
    this.blindSchedule = new BlindSchedule(config.blind_schedule);
    const firstLevel = this.blindSchedule.getCurrentLevel();
    await this.gm.setBlindLevels({ sb: firstLevel.sb, bb: firstLevel.bb });
    this.blindSchedule.levelStartTime = Date.now();
    this._startLevelTimer();
    await this.gm.startGame();
  }

  _startLevelTimer() {
    const level = this.blindSchedule.getCurrentLevel();
    if (!level) return;
    const ms = level.duration_minutes * 60_000;

    this.io.to(this.tableId).emit('tournament:time_remaining', {
      level: level.level, remainingMs: ms
    });

    this.levelTimer = setTimeout(async () => {
      await this._advanceLevel();
    }, ms);
  }

  async _advanceLevel() {
    const next = this.blindSchedule.advance();
    if (!next) {
      this.io.to(this.tableId).emit('tournament:final_level', {
        level: this.blindSchedule.getCurrentLevel()
      });
      return;
    }
    await this.gm.setBlindLevels({ sb: next.sb, bb: next.bb });
    this.io.to(this.tableId).emit('tournament:blind_up', next);
    this._startLevelTimer();
  }

  async onHandComplete(handResult) {
    // 1. Detect eliminations (stack reached 0 after this hand)
    const seatedBefore = handResult.players ?? [];
    for (const p of seatedBefore) {
      if (p.stackAfter <= 0) {
        await this._eliminatePlayer(p.id, p.stackAfter);
      }
    }

    // 2. Check if tournament is over
    const activePlayers = this.gm.getState().seated.filter(p => p.stack > 0);
    if (activePlayers.length <= 1) {
      const winnerId = activePlayers[0]?.id ?? null;
      await this._endTournament(winnerId);
      return;
    }

    // 3. Auto-deal next hand (via AutoController)
    await super.onHandComplete(handResult);
  }

  async _eliminatePlayer(playerId, chipsAtElimination) {
    const remaining = this.gm.getState().seated.filter(p => p.stack > 0).length;
    const position = remaining + 1; // player finishing in position = remaining active + 1

    await TournamentRepository.recordElimination({
      tableId: this.tableId,
      playerId,
      position,
      chipsAtElimination,
    });

    this.io.to(this.tableId).emit('tournament:elimination', {
      playerId,
      position,
      playerCount: remaining,
    });

    // Remove from active game (sit out / mark as eliminated)
    await this.gm.setPlayerInHand(playerId, false);
  }

  async _endTournament(winnerId) {
    clearTimeout(this.levelTimer);

    if (winnerId) {
      await TournamentRepository.recordElimination({
        tableId: this.tableId,
        playerId: winnerId,
        position: 1,
        chipsAtElimination: this.gm.getState().seated.find(p => p.id === winnerId)?.stack ?? 0,
      });
    }

    await TableRepository.closeTable(this.tableId);

    const standings = await TournamentRepository.getStandings(this.tableId);
    this.io.to(this.tableId).emit('tournament:ended', { winnerId, standings });
  }

  destroy() {
    clearTimeout(this.levelTimer);
    super.destroy();
  }
}
```

---

## New Admin API: `server/routes/admin/tournaments.js`

| Method | Path | Auth | Action |
|--------|------|------|--------|
| POST | /api/admin/tournaments | requirePermission('tournament:manage') | Create tournament table + config |
| GET | /api/tables/:id/tournament | requireAuth | Get tournament status + standings |
| POST | /api/tables/:id/tournament/start | requirePermission('tournament:manage') | Start tournament |

```js
// POST /api/admin/tournaments
router.post('/', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
  const { name, blindSchedule, startingStack, rebuyAllowed, rebuyLevelCap } = req.body;
  const tableId = `tournament-${Date.now()}`;

  await TableRepository.createTable({
    id: tableId, name, mode: 'tournament', createdBy: req.user.id,
    config: { starting_stack: startingStack },
  });
  const configId = await TournamentRepository.createConfig({
    tableId, blindSchedule, startingStack, rebuyAllowed, rebuyLevelCap,
  });

  res.status(201).json({ tableId, configId });
});

// POST /api/tables/:id/tournament/start
router.post('/:id/tournament/start', requireAuth, requirePermission('tournament:manage'), async (req, res) => {
  const config = await TournamentRepository.getConfig(req.params.id);
  if (!config) return res.status(404).json({ error: 'Tournament config not found' });

  const ctrl = getController(req.params.id); // from SharedState
  if (!ctrl || ctrl.getMode() !== 'tournament') {
    return res.status(400).json({ error: 'Table is not a tournament table' });
  }

  await ctrl.start(config);
  res.json({ started: true });
});
```

---

## New Socket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `tournament:blind_up` | server→client | `{ level, sb, bb, ante, duration_minutes }` |
| `tournament:time_remaining` | server→client | `{ level, remainingMs }` |
| `tournament:final_level` | server→client | `{ level }` |
| `tournament:elimination` | server→client | `{ playerId, position, playerCount }` |
| `tournament:ended` | server→client | `{ winnerId, standings }` |

---

## New Frontend Components

### `client/src/components/TournamentInfoPanel.jsx`

Replaces `CoachSidebar` for tournament mode tables (per Item 2 conditional render):

```jsx
export function TournamentInfoPanel() {
  const { gameState } = useTable();
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [currentLevel, setCurrentLevel] = useState(null);
  const [eliminations, setEliminations] = useState([]);

  // Listen to tournament socket events
  useEffect(() => {
    socket.on('tournament:time_remaining', ({ level, remainingMs }) => {
      setCurrentLevel(level);
      setTimeRemaining(remainingMs);
    });
    socket.on('tournament:blind_up', (level) => setCurrentLevel(level));
    socket.on('tournament:elimination', (e) => setEliminations(prev => [e, ...prev].slice(0, 5)));
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!timeRemaining) return;
    const interval = setInterval(() => setTimeRemaining(t => Math.max(0, t - 1000)), 1000);
    return () => clearInterval(interval);
  }, [timeRemaining]);

  return (
    <div className="tournament-panel p-4">
      <div>Level {currentLevel?.level} — {currentLevel?.sb}/{currentLevel?.bb}</div>
      <div>Time: {formatMs(timeRemaining)}</div>
      <div>Players: {gameState?.seated?.filter(p => p.stack > 0).length ?? 0}</div>
      <div>Recent eliminations: {eliminations.map(e => <span key={e.playerId}>#{e.position}</span>)}</div>
    </div>
  );
}
```

### `client/src/pages/admin/TournamentSetup.jsx`

Form to create a tournament:
- Name input
- Blind schedule editor: add/remove/reorder level rows (level, SB, BB, ante, duration)
- Starting stack input
- Rebuy toggle + level cap
- "Create Tournament" button → POST `/api/admin/tournaments` → redirect to `/table/:tableId`

### Lobby Tournament Widget (in `MainLobby.jsx` from Item 5)

Separate section below cash tables: "Active Tournaments". Shows tournament tables with
current level, player count, time remaining (if available).

---

## Key Files to Read Before Implementing

- `server/game/controllers/AutoController.js` — Item 2, base class to extend
- `server/game/controllers/BlindSchedule.js` — Item 2, used by TournamentController
- `server/game/GameManager.js` — confirm `setBlindLevels()`, `setPlayerInHand()` methods exist
- `server/db/repositories/TableRepository.js` — Item 1, needed for `closeTable()`
- `server/state/SharedState.js` — `getController()` export from Item 2

---

## Tests

- Unit: `BlindSchedule` — full cycle through levels, final level returns null on advance
- Unit: `TournamentController.start()` — sets blinds, starts level timer, starts game
- Unit: `TournamentController._advanceLevel()` — emits `tournament:blind_up`, updates gm blinds
- Unit: `TournamentController._eliminatePlayer()` — records standing, emits event, calls setPlayerInHand
- Unit: `TournamentController.onHandComplete()` — detects elimination when stack ≤ 0
- Unit: `TournamentController._endTournament()` — records winner, closes table, emits standings
- Unit: `TournamentController.destroy()` — clears levelTimer
- Integration: Full lifecycle — create → start → 3 hands → player eliminated → 1 remaining → tournament:ended
- Integration: Blind level advances after duration_minutes → new blinds applied to game
