# Playlist → Table Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire playlists and scenarios into live `coached_cash` tables by adding a hero-seat-aware `ScenarioDealer` on top of the existing `PlaylistExecutionService` (drill_sessions lifecycle), extending `drill_sessions` with hero mode + auto-advance, and replacing `PlaylistsSection` with a dedicated `ScenarioLaunchPanel`.

**Architecture:** Reuse existing drill-session infrastructure from migration 028. Add three new server modules (`mapScenarioToTable` pure rotation fn, `ScenarioDealer` game-engine bridge, `drillSession` socket handler), extend `PlaylistExecutionService` and the `/drill` REST routes with three hero fields, and hook `CoachedController` so the dealer arms a scenario when `openConfigPhase` fires and restores per-hand stacks on `hand_complete`. Legacy `playlist_mode` socket flow is untouched.

**Tech Stack:** Node.js · Express · Socket.io · Supabase/Postgres · React · Vite · Tailwind · Vitest

**Spec:** `docs/superpowers/specs/2026-04-13-playlist-table-launch-design.md`

---

## Phase 1 — Foundation

### Task 1.1: Migration 053 — extend `drill_sessions`

**Files:**
- Create: `supabase/migrations/053_drill_session_hero_mode.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 053: add hero_mode, hero_player_id, auto_advance to drill_sessions.
-- Drives the new ScenarioDealer: which player receives scenario hole cards,
-- under what cadence, and whether the table auto-advances between hands.

ALTER TABLE drill_sessions
  ADD COLUMN IF NOT EXISTS hero_mode TEXT NOT NULL DEFAULT 'sticky'
    CHECK (hero_mode IN ('sticky', 'per_hand', 'rotate')),
  ADD COLUMN IF NOT EXISTS hero_player_id UUID
    REFERENCES player_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_advance BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Apply to staging**

```bash
# Apply via Supabase MCP or psql against staging database.
# Expected: migration runs clean, three new columns present on drill_sessions.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/053_drill_session_hero_mode.sql
git commit -m "feat(db): 053 — drill_sessions hero mode + auto_advance"
```

---

### Task 1.2: `mapScenarioToTable` pure function

**Files:**
- Create: `server/game/mapScenarioToTable.js`
- Create: `server/game/__tests__/mapScenarioToTable.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/game/__tests__/mapScenarioToTable.test.js
'use strict';
const { describe, it, expect } = require('vitest');
const { mapScenarioToTable } = require('../mapScenarioToTable');

function scenario({ seats, heroSeat = null, dealerSeat = null }) {
  return {
    hero_seat: heroSeat,
    dealer_seat: dealerSeat,
    seat_configs: seats.map(s => ({ seat: s.seat, cards: s.cards ?? ['As', 'Kd'], stack: s.stack ?? 100 })),
  };
}

describe('mapScenarioToTable', () => {
  it('returns null when scenario count does not match active count', () => {
    const s = scenario({ seats: [{ seat: 1 }, { seat: 2 }, { seat: 3 }] });
    const result = mapScenarioToTable(s, [4, 6], 4);
    expect(result).toBeNull();
  });

  it('anchors hero at chosen real seat (3-handed)', () => {
    const s = scenario({
      seats: [{ seat: 3, cards: ['2c', '2d'] }, { seat: 4, cards: ['As', 'Kd'] }, { seat: 5, cards: ['9h', '9s'] }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    const hero = result.seatAssignments.find(a => a.isHero);
    expect(hero.realSeat).toBe(5);
    expect(hero.cards).toEqual(['As', 'Kd']);
  });

  it('rotates remaining seats preserving circular order', () => {
    const s = scenario({
      seats: [{ seat: 3, cards: ['2c', '2d'] }, { seat: 4, cards: ['As', 'Kd'] }, { seat: 5, cards: ['9h', '9s'] }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    const bySeat = Object.fromEntries(result.seatAssignments.map(a => [a.realSeat, a.cards]));
    expect(bySeat[7]).toEqual(['9h', '9s']);
    expect(bySeat[1]).toEqual(['2c', '2d']);
  });

  it('places dealer button at the real seat derived from scenario.dealer_seat', () => {
    const s = scenario({
      seats: [{ seat: 3 }, { seat: 4 }, { seat: 5 }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    expect(result.dealerSeat).toBe(1);
  });

  it('falls back to first filled seat when hero_seat is null', () => {
    const s = scenario({
      seats: [
        { seat: 2, cards: [null, null] },
        { seat: 4, cards: ['As', 'Kd'] },
        { seat: 6, cards: ['9h', '9s'] },
      ],
      heroSeat: null,
      dealerSeat: 2,
    });
    const result = mapScenarioToTable(s, [0, 3, 8], 3);
    const hero = result.seatAssignments.find(a => a.isHero);
    expect(hero.cards).toEqual(['As', 'Kd']);
  });

  it('falls back dealer to seat right of hero when dealer_seat is null', () => {
    const s = scenario({
      seats: [{ seat: 1 }, { seat: 3 }, { seat: 5 }],
      heroSeat: 3,
      dealerSeat: null,
    });
    const result = mapScenarioToTable(s, [2, 4, 6], 4);
    expect(result.dealerSeat).toBe(6);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9])('generalizes for %i-player tables', (n) => {
    const seats = Array.from({ length: n }, (_, i) => ({ seat: i, cards: [`${i}c`, `${i}d`], stack: 100 }));
    const real  = Array.from({ length: n }, (_, i) => i + 1);
    const s = scenario({ seats, heroSeat: 0, dealerSeat: 0 });
    const result = mapScenarioToTable(s, real, real[0]);
    expect(result.seatAssignments).toHaveLength(n);
    const heroes = result.seatAssignments.filter(a => a.isHero);
    expect(heroes).toHaveLength(1);
    expect(heroes[0].realSeat).toBe(real[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run game/__tests__/mapScenarioToTable.test.js`
Expected: FAIL — module `../mapScenarioToTable` not found.

- [ ] **Step 3: Implement the function**

```js
// server/game/mapScenarioToTable.js
'use strict';

function mapScenarioToTable(scenario, activeSeats, chosenHeroRealSeat) {
  const configs = scenario.seat_configs || [];
  if (configs.length !== activeSeats.length) return null;

  const templateSeats = configs.map(c => c.seat).slice().sort((a, b) => a - b);
  const realSeats     = activeSeats.slice().sort((a, b) => a - b);
  const n = realSeats.length;

  const firstFilled = configs.find(c => Array.isArray(c.cards) && c.cards[0] && c.cards[1]);
  const heroTemplateSeat =
    scenario.hero_seat != null
      ? scenario.hero_seat
      : (firstFilled ? firstFilled.seat : templateSeats[0]);

  const heroTemplateIndex = templateSeats.indexOf(heroTemplateSeat);
  const heroRealIndex     = realSeats.indexOf(chosenHeroRealSeat);

  const seatAssignments = templateSeats.map((tSeat, i) => {
    const cfg = configs.find(c => c.seat === tSeat);
    const realSeat = realSeats[(heroRealIndex + (i - heroTemplateIndex) + n) % n];
    return {
      realSeat,
      cards: cfg.cards,
      stack: cfg.stack,
      isHero: tSeat === heroTemplateSeat,
    };
  });

  const dealerTemplateSeat =
    scenario.dealer_seat != null
      ? scenario.dealer_seat
      : templateSeats[(heroTemplateIndex + 1) % n];
  const dealerIndex = templateSeats.indexOf(dealerTemplateSeat);
  const dealerSeat  = realSeats[(heroRealIndex + (dealerIndex - heroTemplateIndex) + n) % n];

  return { seatAssignments, dealerSeat };
}

module.exports = { mapScenarioToTable };
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd server && npx vitest run game/__tests__/mapScenarioToTable.test.js`
Expected: PASS — all 14 assertions green.

- [ ] **Step 5: Commit**

```bash
git add server/game/mapScenarioToTable.js server/game/__tests__/mapScenarioToTable.test.js
git commit -m "feat(game): mapScenarioToTable — hero-anchored seat rotation"
```

---

### Task 1.3: Extend `PlaylistExecutionService` with hero + auto_advance fields

**Files:**
- Modify: `server/services/PlaylistExecutionService.js`
- Create: `server/services/__tests__/PlaylistExecutionService.hero.test.js`
- Modify: `server/db/repositories/ScenarioBuilderRepository.js` (extend `createDrillSession` / `updateDrillSession` to forward new fields)

- [ ] **Step 1: Write the failing test**

```js
// server/services/__tests__/PlaylistExecutionService.hero.test.js
'use strict';
const { describe, it, expect, vi, beforeEach } = require('vitest');

vi.mock('../../db/repositories/ScenarioBuilderRepository');
vi.mock('../../db/HandLoggerSupabase');

const repo = require('../../db/repositories/ScenarioBuilderRepository');
const HandLogger = require('../../db/HandLoggerSupabase');
const svc = require('../PlaylistExecutionService');

beforeEach(() => {
  vi.resetAllMocks();
  HandLogger.getPlaylists = vi.fn().mockResolvedValue([
    { playlist_id: 'p1', ordering: 'sequential' },
  ]);
  repo.getActiveDrillSession = vi.fn().mockResolvedValue(null);
  repo.getPausedDrillSession = vi.fn().mockResolvedValue(null);
  repo.getPlaylistItems = vi.fn().mockResolvedValue([
    { id: 'i1', scenario: { id: 's1', player_count: 3 } },
  ]);
  repo.createDrillSession = vi.fn().mockImplementation(async (args) => ({
    id: 'ds1',
    current_position: 0,
    items_total: 1,
    status: 'active',
    ...args,
  }));
  repo.updateDrillSession = vi.fn().mockImplementation(async (_id, patch) => ({ id: 'ds1', ...patch }));
});

describe('PlaylistExecutionService.start with hero fields', () => {
  it('persists heroMode, heroPlayerId, autoAdvance when provided', async () => {
    await svc.start({
      tableId:       't1',
      playlistId:    'p1',
      coachId:       'c1',
      optedInPlayers: ['u1', 'u2', 'u3'],
      seatedCount:    3,
      heroMode:      'rotate',
      heroPlayerId:  'u2',
      autoAdvance:   true,
    });
    expect(repo.createDrillSession).toHaveBeenCalledWith(
      expect.objectContaining({
        heroMode: 'rotate',
        heroPlayerId: 'u2',
        autoAdvance: true,
      }),
    );
  });

  it('defaults heroMode=sticky, autoAdvance=false when omitted', async () => {
    await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1'], seatedCount: 3,
    });
    expect(repo.createDrillSession).toHaveBeenCalledWith(
      expect.objectContaining({ heroMode: 'sticky', autoAdvance: false }),
    );
  });

  it('returns { resumable: true } when a paused session exists and forceRestart is falsy', async () => {
    repo.getPausedDrillSession = vi.fn().mockResolvedValue({
      id: 'ds_old', playlist_id: 'p1', current_position: 5, items_total: 10, status: 'paused',
    });
    const out = await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1', 'u2', 'u3'], seatedCount: 3,
    });
    expect(out.resumable).toBe(true);
    expect(out.priorSessionId).toBe('ds_old');
    expect(repo.createDrillSession).not.toHaveBeenCalled();
  });

  it('overrides paused session when forceRestart is true', async () => {
    repo.getPausedDrillSession = vi.fn().mockResolvedValue({
      id: 'ds_old', playlist_id: 'p1', status: 'paused',
    });
    await svc.start({
      tableId: 't1', playlistId: 'p1', coachId: 'c1',
      optedInPlayers: ['u1', 'u2', 'u3'], seatedCount: 3,
      forceRestart: true,
    });
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds_old', { status: 'cancelled' });
    expect(repo.createDrillSession).toHaveBeenCalled();
  });
});

describe('PlaylistExecutionService.updateHeroPlayer', () => {
  it('updates hero_player_id on the active session', async () => {
    repo.getActiveDrillSession = vi.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    await svc.updateHeroPlayer('t1', 'u3');
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds1', { heroPlayerId: 'u3' });
  });
});

describe('PlaylistExecutionService.updateMode', () => {
  it('updates heroMode and autoAdvance on the active session', async () => {
    repo.getActiveDrillSession = vi.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    await svc.updateMode('t1', { heroMode: 'per_hand', autoAdvance: true });
    expect(repo.updateDrillSession).toHaveBeenCalledWith('ds1', {
      heroMode: 'per_hand', autoAdvance: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run services/__tests__/PlaylistExecutionService.hero.test.js`
Expected: FAIL — `updateHeroPlayer is not a function`, and `createDrillSession` assertions fail because the new keys are not forwarded.

- [ ] **Step 3: Extend the service**

Edit `server/services/PlaylistExecutionService.js`:

Replace the `start` function signature and body with:

```js
async function start({
  tableId, playlistId, coachId,
  optedInPlayers = [], optedOutPlayers = [], seatedCount,
  heroMode = 'sticky', heroPlayerId = null, autoAdvance = false,
  forceRestart = false,
}) {
  const paused = await repo.getPausedDrillSession(tableId, playlistId);
  if (paused && !forceRestart) {
    return { resumable: true, priorSessionId: paused.id, priorPosition: paused.current_position, priorTotal: paused.items_total };
  }
  if (paused && forceRestart) {
    await repo.updateDrillSession(paused.id, { status: 'cancelled' });
  }
  const existingActive = await repo.getActiveDrillSession(tableId);
  if (existingActive) {
    await repo.updateDrillSession(existingActive.id, { status: 'cancelled' });
  }

  const allItems = await repo.getPlaylistItems(playlistId);
  if (allItems.length === 0) throw new Error('Playlist is empty');

  const playlists = await HandLogger.getPlaylists();
  const playlist = playlists.find(p => p.playlist_id === playlistId);
  const ordering = playlist?.ordering ?? 'sequential';

  const effectiveCount = seatedCount ?? optedInPlayers.length;
  const eligible = effectiveCount > 0
    ? allItems.filter(item => (item.scenario?.player_count ?? 0) === effectiveCount)
    : allItems;
  if (eligible.length === 0) {
    const session = await repo.createDrillSession({
      tableId, playlistId, coachId,
      itemsTotal: allItems.length,
      optedInPlayers, optedOutPlayers,
      heroMode, heroPlayerId, autoAdvance,
    });
    return { session, currentScenario: null, items: [], fitCount: 0 };
  }

  const orderedItems = ordering === 'random' ? shuffled(eligible) : eligible;
  const session = await repo.createDrillSession({
    tableId, playlistId, coachId,
    itemsTotal: orderedItems.length,
    optedInPlayers, optedOutPlayers,
    heroMode, heroPlayerId, autoAdvance,
  });

  return { session, currentScenario: orderedItems[0]?.scenario ?? null, items: orderedItems, fitCount: eligible.length };
}
```

Append two new exported helpers at the bottom of the file (before `module.exports`):

```js
async function updateHeroPlayer(tableId, heroPlayerId) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  return repo.updateDrillSession(session.id, { heroPlayerId });
}

async function updateMode(tableId, { heroMode, autoAdvance } = {}) {
  const session = await repo.getActiveDrillSession(tableId);
  if (!session) throw new Error('No active drill session at this table');
  const patch = {};
  if (heroMode !== undefined) patch.heroMode = heroMode;
  if (autoAdvance !== undefined) patch.autoAdvance = autoAdvance;
  return repo.updateDrillSession(session.id, patch);
}
```

And update the `module.exports` line to:

```js
module.exports = {
  start, getStatus, advance, pause, resume, pick, setParticipation, cancel,
  getNextScenario, updateHeroPlayer, updateMode,
};
```

- [ ] **Step 4: Add repo plumbing for new fields**

Edit `server/db/repositories/ScenarioBuilderRepository.js`. Locate `createDrillSession` and add `heroMode`, `heroPlayerId`, `autoAdvance` to the insert object:

```js
// inside createDrillSession(...)
async function createDrillSession({
  tableId, playlistId, coachId,
  itemsTotal, optedInPlayers = [], optedOutPlayers = [],
  heroMode = 'sticky', heroPlayerId = null, autoAdvance = false,
}) {
  return q(supabase.from('drill_sessions').insert({
    table_id:           tableId,
    playlist_id:        playlistId,
    coach_id:           coachId,
    items_total:        itemsTotal,
    opted_in_players:   optedInPlayers,
    opted_out_players:  optedOutPlayers,
    hero_mode:          heroMode,
    hero_player_id:     heroPlayerId,
    auto_advance:       autoAdvance,
  }).select('*').single());
}
```

Locate `updateDrillSession` and ensure it maps `heroMode`, `heroPlayerId`, `autoAdvance` to their snake_case columns:

```js
// inside updateDrillSession — extend the fieldMap
const fieldMap = {
  status: 'status', currentPosition: 'current_position', itemsDealt: 'items_dealt',
  pausedAt: 'paused_at', completedAt: 'completed_at',
  optedInPlayers: 'opted_in_players', optedOutPlayers: 'opted_out_players',
  heroMode: 'hero_mode', heroPlayerId: 'hero_player_id', autoAdvance: 'auto_advance',
};
```

Add a new lookup helper `getPausedDrillSession(tableId, playlistId)` next to `getActiveDrillSession`:

```js
async function getPausedDrillSession(tableId, playlistId) {
  const row = await q(
    supabase.from('drill_sessions')
      .select('*')
      .eq('table_id', tableId)
      .eq('playlist_id', playlistId)
      .eq('status', 'paused')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  return row ?? null;
}
```

And export it alongside `getActiveDrillSession`.

- [ ] **Step 5: Run tests and verify all pass**

Run: `cd server && npx vitest run services/__tests__/PlaylistExecutionService.hero.test.js`
Expected: PASS — 5 assertions green.

- [ ] **Step 6: Commit**

```bash
git add server/services/PlaylistExecutionService.js \
        server/services/__tests__/PlaylistExecutionService.hero.test.js \
        server/db/repositories/ScenarioBuilderRepository.js
git commit -m "feat(svc): PlaylistExecutionService hero + resume support"
```

---

## Phase 2 — Game engine bridge

### Task 2.1: `ScenarioDealer` arming and completion

**Files:**
- Create: `server/game/ScenarioDealer.js`
- Create: `server/game/__tests__/ScenarioDealer.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/game/__tests__/ScenarioDealer.test.js
'use strict';
const { describe, it, expect, vi, beforeEach } = require('vitest');

vi.mock('../../services/PlaylistExecutionService');
const svc = require('../../services/PlaylistExecutionService');
const { ScenarioDealer } = require('../ScenarioDealer');

function makeGm({ seats }) {
  return {
    state: {
      players: seats.map(s => ({ id: s.id, seat: s.seat, is_coach: false, disconnected: false, stack: s.stack ?? 100 })),
      dealer_seat: 0,
    },
    adjustStack: vi.fn(),
    openConfigPhase: vi.fn().mockReturnValue({}),
    updateHandConfig: vi.fn().mockReturnValue({}),
  };
}

const io = { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ScenarioDealer.armIfActive', () => {
  it('no-ops when no active session', async () => {
    svc.getStatus = vi.fn().mockResolvedValue(null);
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(gm.updateHandConfig).not.toHaveBeenCalled();
  });

  it('arms a scenario when counts match and hero is seated', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({
      status: 'active', hero_mode: 'sticky', hero_player_id: 'u2',
    });
    svc.getNextScenario = vi.fn().mockResolvedValue({
      id: 'sc1',
      hero_seat: 4, dealer_seat: 3,
      seat_configs: [
        { seat: 3, cards: ['2c', '2d'], stack: 80 },
        { seat: 4, cards: ['As', 'Kd'], stack: 120 },
        { seat: 5, cards: ['9h', '9s'], stack: 100 },
      ],
    });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(true);
    expect(gm.openConfigPhase).toHaveBeenCalledOnce();
    expect(gm.updateHandConfig).toHaveBeenCalledWith(expect.objectContaining({ mode: 'hybrid' }));
    expect(gm.adjustStack).toHaveBeenCalledWith('u2', 120);
    expect(gm.state.dealer_seat).toBe(1);
  });

  it('emits scenario:skipped and advances when count does not match, then retries', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = vi.fn()
      .mockResolvedValueOnce({
        id: 'sc_bad',
        seat_configs: [{ seat: 0 }, { seat: 1 }, { seat: 2 }, { seat: 3 }],
        hero_seat: 0, dealer_seat: 0,
      })
      .mockResolvedValueOnce({
        id: 'sc_ok',
        seat_configs: [
          { seat: 0, cards: ['Ah', 'Ac'], stack: 100 },
          { seat: 1, cards: ['Kh', 'Kc'], stack: 100 },
          { seat: 2, cards: ['Qh', 'Qc'], stack: 100 },
        ],
        hero_seat: 0, dealer_seat: 0,
      });
    svc.advance = vi.fn().mockResolvedValue({ completed: false });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(svc.advance).toHaveBeenCalledOnce();
    expect(result.armed).toBe(true);
    expect(result.scenarioId).toBe('sc_ok');
  });

  it('emits scenario:exhausted when no eligible scenarios remain', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = vi.fn().mockResolvedValue(null);
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(result.exhausted).toBe(true);
  });

  it('fails with hero_absent error when sticky hero is not seated', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'ghost' });
    svc.getNextScenario = vi.fn().mockResolvedValue({
      id: 'sc1', hero_seat: 0, dealer_seat: 0,
      seat_configs: [{ seat: 0 }, { seat: 1 }, { seat: 2 }],
    });
    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [{ id: 'u1', seat: 1 }, { id: 'u2', seat: 5 }, { id: 'u3', seat: 7 }] });
    const result = await dealer.armIfActive('t1', gm);
    expect(result.armed).toBe(false);
    expect(result.error).toBe('hero_absent');
  });
});

describe('ScenarioDealer.completeIfActive', () => {
  it('restores pre-hand stacks and calls service.advance', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({ status: 'active', hero_mode: 'sticky', hero_player_id: 'u2' });
    svc.getNextScenario = vi.fn().mockResolvedValue({
      id: 'sc1', hero_seat: 4, dealer_seat: 3,
      seat_configs: [
        { seat: 3, cards: ['2c', '2d'], stack: 80 },
        { seat: 4, cards: ['As', 'Kd'], stack: 120 },
        { seat: 5, cards: ['9h', '9s'], stack: 100 },
      ],
    });
    svc.advance = vi.fn().mockResolvedValue({ completed: false });

    const dealer = new ScenarioDealer(io);
    const gm = makeGm({ seats: [
      { id: 'u1', seat: 1, stack: 500 },
      { id: 'u2', seat: 5, stack: 500 },
      { id: 'u3', seat: 7, stack: 500 },
    ]});
    await dealer.armIfActive('t1', gm);
    gm.adjustStack.mockClear();

    await dealer.completeIfActive('t1', gm);
    expect(gm.adjustStack).toHaveBeenCalledWith('u1', 500);
    expect(gm.adjustStack).toHaveBeenCalledWith('u2', 500);
    expect(gm.adjustStack).toHaveBeenCalledWith('u3', 500);
    expect(svc.advance).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run game/__tests__/ScenarioDealer.test.js`
Expected: FAIL — module `../ScenarioDealer` not found.

- [ ] **Step 3: Implement `ScenarioDealer`**

```js
// server/game/ScenarioDealer.js
'use strict';

const svc = require('../services/PlaylistExecutionService');
const { mapScenarioToTable } = require('./mapScenarioToTable');

const MAX_SKIP_ATTEMPTS = 64;

class ScenarioDealer {
  constructor(io) {
    this.io = io;
    this.snapshots = new Map(); // tableId → Map<playerId, preHandStack>
    this.armedScenarios = new Map(); // tableId → scenarioId
  }

  async armIfActive(tableId, gm) {
    const session = await svc.getStatus(tableId);
    if (!session || session.status !== 'active') return { armed: false };

    const activePlayers = gm.state.players.filter(p => !p.is_coach && p.seat >= 0 && !p.disconnected);
    const activeSeats   = activePlayers.map(p => p.seat);
    const activeCount   = activeSeats.length;

    const heroPlayer = this._pickHero(session, activePlayers);
    if (!heroPlayer) {
      this._emit(tableId, 'scenario:error', { code: 'hero_absent' });
      return { armed: false, error: 'hero_absent' };
    }

    for (let attempt = 0; attempt < MAX_SKIP_ATTEMPTS; attempt++) {
      const scenario = await svc.getNextScenario(tableId, activeCount);
      if (!scenario) {
        this._emit(tableId, 'scenario:exhausted', {});
        return { armed: false, exhausted: true };
      }
      const mapping = mapScenarioToTable(scenario, activeSeats, heroPlayer.seat);
      if (!mapping) {
        this._emit(tableId, 'scenario:skipped', { scenarioId: scenario.id, reason: 'count_mismatch' });
        await svc.advance(tableId);
        continue;
      }
      this._applyMapping(tableId, gm, scenario, mapping, heroPlayer.id);
      return { armed: true, scenarioId: scenario.id, mapping };
    }
    this._emit(tableId, 'scenario:exhausted', {});
    return { armed: false, exhausted: true };
  }

  async completeIfActive(tableId, gm) {
    const snapshot = this.snapshots.get(tableId);
    if (!snapshot) return { restored: false };
    for (const [playerId, stack] of snapshot.entries()) {
      gm.adjustStack(playerId, stack);
    }
    this.snapshots.delete(tableId);
    this.armedScenarios.delete(tableId);
    await svc.advance(tableId);
    this._emit(tableId, 'scenario:progress', {});
    return { restored: true };
  }

  _pickHero(session, activePlayers) {
    const optedIn = activePlayers.filter(p => {
      const outSet = new Set(session.opted_out_players || []);
      return !outSet.has(p.id);
    });
    if (optedIn.length === 0) return null;

    if (session.hero_mode === 'sticky') {
      return optedIn.find(p => p.id === session.hero_player_id) || null;
    }
    if (session.hero_mode === 'rotate') {
      const lastIdx = optedIn.findIndex(p => p.id === session.hero_player_id);
      return optedIn[(lastIdx + 1) % optedIn.length];
    }
    // per_hand: requires explicit hero_player_id set this hand
    return optedIn.find(p => p.id === session.hero_player_id) || null;
  }

  _applyMapping(tableId, gm, scenario, mapping, heroPlayerId) {
    const snapshot = new Map(
      gm.state.players.filter(p => !p.is_coach).map(p => [p.id, p.stack]),
    );
    this.snapshots.set(tableId, snapshot);
    this.armedScenarios.set(tableId, scenario.id);

    const holeCards = {};
    for (const a of mapping.seatAssignments) {
      const player = gm.state.players.find(p => p.seat === a.realSeat);
      if (!player) continue;
      holeCards[player.id] = a.cards;
      if (a.stack != null) gm.adjustStack(player.id, a.stack);
    }

    const board = [
      ...(scenario.board_flop  || []),
      scenario.board_turn  || null,
      scenario.board_river || null,
    ];
    while (board.length < 5) board.push(null);

    gm.openConfigPhase();
    gm.updateHandConfig({ mode: 'hybrid', hole_cards: holeCards, board });
    gm.state.dealer_seat = mapping.dealerSeat;

    this._emit(tableId, 'scenario:armed', {
      scenarioId: scenario.id,
      seatAssignments: mapping.seatAssignments,
      dealerSeat: mapping.dealerSeat,
      heroPlayerId,
    });
  }

  _emit(tableId, event, payload) {
    this.io.to(tableId).emit(event, payload);
  }
}

module.exports = { ScenarioDealer };
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd server && npx vitest run game/__tests__/ScenarioDealer.test.js`
Expected: PASS — 6 assertions green.

- [ ] **Step 5: Commit**

```bash
git add server/game/ScenarioDealer.js server/game/__tests__/ScenarioDealer.test.js
git commit -m "feat(game): ScenarioDealer — arm/complete/skip/exhaust"
```

---

### Task 2.2: Wire `ScenarioDealer` into `CoachedController`

**Files:**
- Modify: `server/game/controllers/CoachedController.js`
- Modify: `server/socket/handlers/handConfig.js` (call dealer on `open_config_phase`)
- Create: `server/game/controllers/__tests__/CoachedController.scenario.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/game/controllers/__tests__/CoachedController.scenario.test.js
'use strict';
const { describe, it, expect, vi, beforeEach } = require('vitest');
const { CoachedController } = require('../CoachedController');

vi.mock('../../ScenarioDealer', () => {
  const armIfActive    = vi.fn().mockResolvedValue({ armed: false });
  const completeIfActive = vi.fn().mockResolvedValue({ restored: false });
  return { ScenarioDealer: vi.fn().mockImplementation(() => ({ armIfActive, completeIfActive })) };
});
const { ScenarioDealer } = require('../../ScenarioDealer');

beforeEach(() => vi.clearAllMocks());

describe('CoachedController scenario hooks', () => {
  it('exposes a dealer instance', () => {
    const io = { to: () => ({ emit: () => {} }) };
    const ctrl = new CoachedController('t1', {}, io);
    expect(ctrl.dealer).toBeDefined();
  });

  it('onHandComplete calls dealer.completeIfActive before broadcasting', async () => {
    const emit = vi.fn();
    const io = { to: vi.fn().mockReturnValue({ emit }) };
    const ctrl = new CoachedController('t1', { state: { players: [] } }, io);
    await ctrl.onHandComplete({ winner: 'u1' });
    expect(ctrl.dealer.completeIfActive).toHaveBeenCalledWith('t1', ctrl.gm);
    expect(emit).toHaveBeenCalledWith('hand_complete', { winner: 'u1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run game/controllers/__tests__/CoachedController.scenario.test.js`
Expected: FAIL — `ctrl.dealer` is undefined; `completeIfActive` not called.

- [ ] **Step 3: Extend `CoachedController`**

Replace the body of `server/game/controllers/CoachedController.js`:

```js
'use strict';

const { TableController } = require('./TableController');
const { ScenarioDealer }  = require('../ScenarioDealer');

class CoachedController extends TableController {
  constructor(tableId, gameManager, io) {
    super(tableId, gameManager, io);
    this.dealer = new ScenarioDealer(io);
  }

  getMode() { return 'coached_cash'; }

  async onHandComplete(handResult) {
    await this.dealer.completeIfActive(this.tableId, this.gm);
    this.io.to(this.tableId).emit('hand_complete', handResult);
  }
}

module.exports = { CoachedController };
```

- [ ] **Step 4: Hook `armIfActive` into `open_config_phase`**

Edit `server/socket/handlers/handConfig.js`. After the existing `broadcastState` call inside the `open_config_phase` handler, call `controller.dealer.armIfActive(tableId, gm)` when the controller is a coached controller. Replacement block (matching the existing style):

```js
// open_config_phase — replace the existing handler body
socket.on('open_config_phase', async () => {
  if (requireCoach(socket, 'open config phase')) return;
  const tableId = socket.data.tableId;
  const gm = tables.get(tableId);
  if (!gm) return sendSyncError(socket, 'Table not found');
  if (gm.state.phase === 'replay') return sendSyncError(socket, 'Cannot open config phase during replay — exit replay first');

  const ocResult = gm.openConfigPhase();
  if (ocResult.error) return sendSyncError(socket, ocResult.error);
  broadcastState(tableId, { type: 'config_phase', message: 'Coach opened hand configuration' });

  const SharedState = require('../../state/SharedState');
  const controller  = SharedState.getController(tableId);
  if (controller?.dealer) {
    await controller.dealer.armIfActive(tableId, gm);
    broadcastState(tableId);
  }
});
```

- [ ] **Step 5: Run tests and verify all pass**

Run:
```bash
cd server && npx vitest run game/controllers/__tests__/CoachedController.scenario.test.js \
                            game/__tests__/ScenarioDealer.test.js \
                            game/__tests__/mapScenarioToTable.test.js
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add server/game/controllers/CoachedController.js \
        server/game/controllers/__tests__/CoachedController.scenario.test.js \
        server/socket/handlers/handConfig.js
git commit -m "feat(game): wire ScenarioDealer into CoachedController + open_config_phase"
```

---

### Task 2.3: Extend `/drill` REST route with hero + resume fields

**Files:**
- Modify: `server/routes/scenarioBuilder.js`
- Create: `server/routes/__tests__/drillHeroFields.test.js`

- [ ] **Step 1: Write the failing test**

```js
// server/routes/__tests__/drillHeroFields.test.js
'use strict';
const { describe, it, expect, vi, beforeEach } = require('vitest');
const request = require('supertest');
const express = require('express');

vi.mock('../../services/PlaylistExecutionService');
vi.mock('../../auth/requirePermission', () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));
vi.mock('../../auth/requireAuth', () => ({
  requireAuth: (req, _res, next) => { req.user = { id: 'c1', role: 'coach' }; next(); },
}));

const svc = require('../../services/PlaylistExecutionService');
const router = require('../scenarioBuilder');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(router);
  return app;
}

beforeEach(() => vi.resetAllMocks());

describe('POST /api/tables/:tableId/drill hero fields', () => {
  it('forwards hero_mode, hero_player_id, auto_advance to the service', async () => {
    svc.start = vi.fn().mockResolvedValue({ session: { id: 'ds1' }, currentScenario: null, items: [], fitCount: 0 });
    const app = makeApp();
    await request(app)
      .post('/tables/t1/drill')
      .send({
        playlist_id: 'p1',
        opted_in_players: ['u1','u2','u3'],
        hero_mode: 'rotate',
        hero_player_id: 'u2',
        auto_advance: true,
      })
      .expect(200);
    expect(svc.start).toHaveBeenCalledWith(expect.objectContaining({
      heroMode: 'rotate', heroPlayerId: 'u2', autoAdvance: true,
    }));
  });

  it('returns 409 with resumable payload when service reports resumable', async () => {
    svc.start = vi.fn().mockResolvedValue({
      resumable: true, priorSessionId: 'ds_old', priorPosition: 5, priorTotal: 10,
    });
    const app = makeApp();
    const res = await request(app).post('/tables/t1/drill').send({ playlist_id: 'p1' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ resumable: true, prior_session_id: 'ds_old', prior_position: 5 });
  });

  it('forwards force_restart=true to the service', async () => {
    svc.start = vi.fn().mockResolvedValue({ session: { id: 'ds1' }, currentScenario: null, items: [], fitCount: 0 });
    const app = makeApp();
    await request(app).post('/tables/t1/drill').send({ playlist_id: 'p1', force_restart: true }).expect(200);
    expect(svc.start).toHaveBeenCalledWith(expect.objectContaining({ forceRestart: true }));
  });

  it('surfaces hero + auto_advance fields on GET /drill', async () => {
    svc.getStatus = vi.fn().mockResolvedValue({
      id: 'ds1', status: 'active', hero_mode: 'per_hand', hero_player_id: 'u2', auto_advance: true,
    });
    const app = makeApp();
    const res = await request(app).get('/tables/t1/drill').expect(200);
    expect(res.body).toMatchObject({ hero_mode: 'per_hand', hero_player_id: 'u2', auto_advance: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run routes/__tests__/drillHeroFields.test.js`
Expected: FAIL — new fields not forwarded.

- [ ] **Step 3: Update the route handler**

Edit `server/routes/scenarioBuilder.js`. Replace the existing `POST /tables/:tableId/drill` handler with:

```js
router.post('/tables/:tableId/drill', canManage, async (req, res) => {
  const {
    playlist_id,
    opted_in_players = [], opted_out_players = [],
    hero_mode = 'sticky', hero_player_id = null, auto_advance = false,
    force_restart = false,
  } = req.body || {};
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id is required' });

  try {
    const out = await PlaylistExecutionService.start({
      tableId:         req.params.tableId,
      playlistId:      playlist_id,
      coachId:         req.user.id,
      optedInPlayers:  opted_in_players,
      optedOutPlayers: opted_out_players,
      heroMode:        hero_mode,
      heroPlayerId:    hero_player_id,
      autoAdvance:     auto_advance,
      forceRestart:    force_restart,
    });
    if (out.resumable) {
      return res.status(409).json({
        resumable: true,
        prior_session_id: out.priorSessionId,
        prior_position:   out.priorPosition,
        prior_total:      out.priorTotal,
      });
    }
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd server && npx vitest run routes/__tests__/drillHeroFields.test.js`
Expected: PASS — 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add server/routes/scenarioBuilder.js server/routes/__tests__/drillHeroFields.test.js
git commit -m "feat(api): /drill route — hero fields + resumable 409"
```

---

## Phase 3 — Socket live-update layer

### Task 3.1: `drillSession` socket handler

**Files:**
- Create: `server/socket/handlers/drillSession.js`
- Create: `server/socket/handlers/__tests__/drillSession.test.js`
- Modify: `server/socket/index.js` (register new handler)

- [ ] **Step 1: Write the failing test**

```js
// server/socket/handlers/__tests__/drillSession.test.js
'use strict';
const { describe, it, expect, vi, beforeEach } = require('vitest');

vi.mock('../../../services/PlaylistExecutionService');
const svc = require('../../../services/PlaylistExecutionService');
const registerDrillSession = require('../drillSession');

function makeSocket({ isCoach = true, tableId = 't1' } = {}) {
  const handlers = {};
  const on = (ev, fn) => { handlers[ev] = fn; };
  const emit = vi.fn();
  return {
    on, emit, data: { isCoach, tableId, userId: 'c1' }, _handlers: handlers,
  };
}

const ctx = {
  io: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) },
  requireCoach: (socket) => { if (!socket.data.isCoach) { socket.emit('scenario:error', { code: 'forbidden' }); return true; } return false; },
};

beforeEach(() => vi.resetAllMocks());

describe('scenario:set_hero', () => {
  it('rejects non-coach', async () => {
    const socket = makeSocket({ isCoach: false });
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_hero']({ tableId: 't1', playerId: 'u2' });
    expect(socket.emit).toHaveBeenCalledWith('scenario:error', { code: 'forbidden' });
  });
  it('calls updateHeroPlayer on the service and broadcasts scenario:progress', async () => {
    svc.updateHeroPlayer = vi.fn().mockResolvedValue({ id: 'ds1', hero_player_id: 'u2' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_hero']({ tableId: 't1', playerId: 'u2' });
    expect(svc.updateHeroPlayer).toHaveBeenCalledWith('t1', 'u2');
    expect(ctx.io.to).toHaveBeenCalledWith('t1');
  });
});

describe('scenario:set_mode', () => {
  it('forwards heroMode and autoAdvance to the service', async () => {
    svc.updateMode = vi.fn().mockResolvedValue({ id: 'ds1' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:set_mode']({ tableId: 't1', heroMode: 'per_hand', autoAdvance: true });
    expect(svc.updateMode).toHaveBeenCalledWith('t1', { heroMode: 'per_hand', autoAdvance: true });
  });
});

describe('scenario:request_resume', () => {
  it('calls resume on the service when mode=resume', async () => {
    svc.resume = vi.fn().mockResolvedValue({ id: 'ds1', status: 'active' });
    const socket = makeSocket();
    registerDrillSession(socket, ctx);
    await socket._handlers['scenario:request_resume']({ tableId: 't1', playlistId: 'p1', mode: 'resume' });
    expect(svc.resume).toHaveBeenCalledWith('t1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run socket/handlers/__tests__/drillSession.test.js`
Expected: FAIL — module `../drillSession` not found.

- [ ] **Step 3: Implement the handler**

```js
// server/socket/handlers/drillSession.js
'use strict';

const svc = require('../../services/PlaylistExecutionService');

module.exports = function registerDrillSession(socket, ctx) {
  const { io, requireCoach } = ctx;

  socket.on('scenario:set_hero', async ({ tableId, playerId } = {}) => {
    if (requireCoach(socket, 'set drill hero')) return;
    if (!tableId || !playerId) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      await svc.updateHeroPlayer(tableId, playerId);
      io.to(tableId).emit('scenario:progress', { heroPlayerId: playerId });
    } catch (err) {
      socket.emit('scenario:error', { code: 'update_failed', message: err.message });
    }
  });

  socket.on('scenario:set_mode', async ({ tableId, heroMode, autoAdvance } = {}) => {
    if (requireCoach(socket, 'set drill mode')) return;
    if (!tableId) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      await svc.updateMode(tableId, { heroMode, autoAdvance });
      io.to(tableId).emit('scenario:progress', { heroMode, autoAdvance });
    } catch (err) {
      socket.emit('scenario:error', { code: 'update_failed', message: err.message });
    }
  });

  socket.on('scenario:request_resume', async ({ tableId, mode } = {}) => {
    if (requireCoach(socket, 'resume drill')) return;
    if (!tableId || !mode) return socket.emit('scenario:error', { code: 'bad_request' });
    try {
      if (mode === 'resume') {
        await svc.resume(tableId);
      } else if (mode === 'restart') {
        await svc.cancel(tableId);
      }
      io.to(tableId).emit('scenario:progress', { resumed: mode });
    } catch (err) {
      socket.emit('scenario:error', { code: 'resume_failed', message: err.message });
    }
  });
};
```

- [ ] **Step 4: Register the handler**

Edit `server/socket/index.js`. Locate the `registerX(socket, ctx)` call list and add:

```js
const registerDrillSession = require('./handlers/drillSession');
// ...inside the on('connection') body, alongside other register calls:
registerDrillSession(socket, ctx);
```

- [ ] **Step 5: Run tests and verify all pass**

Run: `cd server && npx vitest run socket/handlers/__tests__/drillSession.test.js`
Expected: PASS — 5 assertions green.

- [ ] **Step 6: Commit**

```bash
git add server/socket/handlers/drillSession.js \
        server/socket/handlers/__tests__/drillSession.test.js \
        server/socket/index.js
git commit -m "feat(socket): drillSession — set_hero / set_mode / request_resume"
```

---

## Phase 4 — Client panel

### Task 4.1: `useDrillSession` hook

**Files:**
- Create: `client/src/hooks/useDrillSession.js`
- Create: `client/src/__tests__/useDrillSession.test.js`

- [ ] **Step 1: Write the failing test**

```js
// client/src/__tests__/useDrillSession.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDrillSession } from '../hooks/useDrillSession';

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '../lib/api';

const listeners = new Map();
const socket = {
  emit: vi.fn(),
  on: (ev, fn) => listeners.set(ev, fn),
  off: (ev) => listeners.delete(ev),
};

beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
});

describe('useDrillSession', () => {
  it('launches via POST /drill and stores session', async () => {
    apiFetch.mockResolvedValueOnce({ session: { id: 'ds1', status: 'active' }, fitCount: 3 });
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      await result.current.launch({ playlistId: 'p1', heroPlayerId: 'u2', heroMode: 'sticky', autoAdvance: false });
    });
    expect(apiFetch).toHaveBeenCalledWith('/api/tables/t1/drill', expect.objectContaining({
      method: 'POST',
    }));
    expect(result.current.session).toEqual(expect.objectContaining({ id: 'ds1' }));
    expect(result.current.fitCount).toBe(3);
  });

  it('surfaces resumable on 409 response', async () => {
    apiFetch.mockRejectedValueOnce({ status: 409, body: { resumable: true, prior_position: 5, prior_total: 10 } });
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      await result.current.launch({ playlistId: 'p1' });
    });
    expect(result.current.resumable).toMatchObject({ priorPosition: 5, priorTotal: 10 });
  });

  it('setHero emits scenario:set_hero', () => {
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    act(() => result.current.setHero('u9'));
    expect(socket.emit).toHaveBeenCalledWith('scenario:set_hero', { tableId: 't1', playerId: 'u9' });
  });

  it('appends scenario:skipped events to the log, capped at 10', async () => {
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      for (let i = 0; i < 12; i++) listeners.get('scenario:skipped')({ scenarioId: `s${i}`, reason: 'count_mismatch' });
    });
    await waitFor(() => expect(result.current.log).toHaveLength(10));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/useDrillSession.test.js`
Expected: FAIL — module `../hooks/useDrillSession` not found.

- [ ] **Step 3: Implement the hook**

```js
// client/src/hooks/useDrillSession.js
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

const LOG_CAP = 10;

export function useDrillSession({ socket, tableId }) {
  const [session, setSession]       = useState(null);
  const [fitCount, setFitCount]     = useState(null);
  const [resumable, setResumable]   = useState(null);
  const [log, setLog]               = useState([]);
  const [error, setError]           = useState(null);

  useEffect(() => {
    if (!socket) return;
    const onArmed    = (p) => setLog((l) => [{ kind: 'armed',    ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onSkipped  = (p) => setLog((l) => [{ kind: 'skipped',  ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onProgress = (p) => setLog((l) => [{ kind: 'progress', ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onError    = (p) => setError(p);
    socket.on('scenario:armed', onArmed);
    socket.on('scenario:skipped', onSkipped);
    socket.on('scenario:progress', onProgress);
    socket.on('scenario:error', onError);
    return () => {
      socket.off('scenario:armed', onArmed);
      socket.off('scenario:skipped', onSkipped);
      socket.off('scenario:progress', onProgress);
      socket.off('scenario:error', onError);
    };
  }, [socket]);

  const launch = useCallback(async ({
    playlistId, heroPlayerId = null, heroMode = 'sticky', autoAdvance = false, forceRestart = false,
    optedInPlayers = [], optedOutPlayers = [],
  }) => {
    try {
      const out = await apiFetch(`/api/tables/${tableId}/drill`, {
        method: 'POST',
        body: JSON.stringify({
          playlist_id:       playlistId,
          opted_in_players:  optedInPlayers,
          opted_out_players: optedOutPlayers,
          hero_mode:         heroMode,
          hero_player_id:    heroPlayerId,
          auto_advance:      autoAdvance,
          force_restart:     forceRestart,
        }),
      });
      setSession(out.session);
      setFitCount(out.fitCount ?? null);
      setResumable(null);
      return out;
    } catch (err) {
      if (err.status === 409 && err.body?.resumable) {
        setResumable({ priorPosition: err.body.prior_position, priorTotal: err.body.prior_total, priorSessionId: err.body.prior_session_id });
        return err.body;
      }
      throw err;
    }
  }, [tableId]);

  const pause    = useCallback(() => apiFetch(`/api/tables/${tableId}/drill/pause`,   { method: 'PATCH' }), [tableId]);
  const resume   = useCallback(() => socket.emit('scenario:request_resume', { tableId, mode: 'resume' }),   [socket, tableId]);
  const restart  = useCallback(() => socket.emit('scenario:request_resume', { tableId, mode: 'restart' }),  [socket, tableId]);
  const advance  = useCallback(() => apiFetch(`/api/tables/${tableId}/drill/advance`, { method: 'PATCH' }), [tableId]);
  const cancel   = useCallback(() => apiFetch(`/api/tables/${tableId}/drill/cancel`,  { method: 'PATCH' }), [tableId]);
  const setHero  = useCallback((playerId) => socket.emit('scenario:set_hero', { tableId, playerId }),       [socket, tableId]);
  const setMode  = useCallback((patch)    => socket.emit('scenario:set_mode', { tableId, ...patch }),       [socket, tableId]);

  return { session, fitCount, resumable, log, error,
           launch, pause, resume, restart, advance, cancel, setHero, setMode };
}
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd client && npx vitest run src/__tests__/useDrillSession.test.js`
Expected: PASS — 4 assertions green.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useDrillSession.js client/src/__tests__/useDrillSession.test.js
git commit -m "feat(client): useDrillSession hook"
```

---

### Task 4.2: `ScenarioLaunchPanel` component

**Files:**
- Create: `client/src/components/sidebar/ScenarioLaunchPanel.jsx`
- Create: `client/src/__tests__/ScenarioLaunchPanel.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// client/src/__tests__/ScenarioLaunchPanel.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScenarioLaunchPanel from '../components/sidebar/ScenarioLaunchPanel';

const baseProps = {
  playlists: [
    { playlist_id: 'p1', name: 'AK wet board', color: '#ff0' },
    { playlist_id: 'p2', name: 'BB defense',   color: '#0ff' },
  ],
  activePlayers: [
    { id: 'u1', name: 'Alice', seat: 1 },
    { id: 'u2', name: 'Bob',   seat: 5 },
  ],
  drill: {
    session: null, fitCount: null, resumable: null, log: [],
    launch: vi.fn(), pause: vi.fn(), resume: vi.fn(), restart: vi.fn(),
    advance: vi.fn(), cancel: vi.fn(), setHero: vi.fn(), setMode: vi.fn(),
  },
};

describe('ScenarioLaunchPanel idle state', () => {
  it('renders playlist + hero dropdowns', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    expect(screen.getByLabelText('Playlist')).toBeInTheDocument();
    expect(screen.getByLabelText('Hero')).toBeInTheDocument();
  });

  it('disables Launch until playlist + hero picked', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    const launchBtn = screen.getByRole('button', { name: /^Launch$/ });
    expect(launchBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Playlist'), { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Hero'),     { target: { value: 'u2' } });
    expect(launchBtn).toBeEnabled();
  });

  it('calls drill.launch with chosen fields on click', () => {
    render(<ScenarioLaunchPanel {...baseProps} />);
    fireEvent.change(screen.getByLabelText('Playlist'),   { target: { value: 'p1' } });
    fireEvent.change(screen.getByLabelText('Hero'),       { target: { value: 'u2' } });
    fireEvent.click(screen.getByLabelText('per_hand'));
    fireEvent.click(screen.getByRole('button', { name: /^Launch$/ }));
    expect(baseProps.drill.launch).toHaveBeenCalledWith(expect.objectContaining({
      playlistId: 'p1', heroPlayerId: 'u2', heroMode: 'per_hand',
    }));
  });

  it('shows zero-match warning when fitCount is 0', () => {
    const props = { ...baseProps, drill: { ...baseProps.drill, fitCount: 0 } };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByText(/no scenarios fit/i)).toBeInTheDocument();
  });
});

describe('ScenarioLaunchPanel resume state', () => {
  it('renders Resume and Restart buttons when resumable is set', () => {
    const props = { ...baseProps, drill: { ...baseProps.drill, resumable: { priorPosition: 5, priorTotal: 10 } } };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByRole('button', { name: /Resume from 5/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restart/i })).toBeInTheDocument();
  });
});

describe('ScenarioLaunchPanel running state', () => {
  it('renders pause + advance + swap when a session is active', () => {
    const props = {
      ...baseProps,
      drill: { ...baseProps.drill, session: { id: 'ds1', status: 'active', current_position: 2, items_total: 10, auto_advance: false } },
    };
    render(<ScenarioLaunchPanel {...props} />);
    expect(screen.getByRole('button', { name: /Pause/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Advance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Swap/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/__tests__/ScenarioLaunchPanel.test.jsx`
Expected: FAIL — module `../components/sidebar/ScenarioLaunchPanel` not found.

- [ ] **Step 3: Implement the panel**

```jsx
// client/src/components/sidebar/ScenarioLaunchPanel.jsx
import React, { useState } from 'react';
import { Play, Pause, ChevronRight, RefreshCw, CircleAlert } from 'lucide-react';
import { colors } from '../../lib/colors';

export default function ScenarioLaunchPanel({ playlists = [], activePlayers = [], drill }) {
  const [playlistId, setPlaylistId] = useState('');
  const [heroPlayerId, setHeroPlayerId] = useState('');
  const [heroMode, setHeroMode] = useState('sticky');
  const [ordering, setOrdering] = useState('sequential');
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [allowZeroMatch, setAllowZeroMatch] = useState(false);

  if (drill.resumable) {
    const { priorPosition, priorTotal } = drill.resumable;
    return (
      <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
        <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>Resume playlist?</div>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
          Paused at position {priorPosition} / {priorTotal}.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={drill.resume}  style={btnGold}>Resume from {priorPosition}</button>
          <button onClick={drill.restart} style={btnGhost}>Restart</button>
        </div>
      </div>
    );
  }

  if (drill.session) {
    const s = drill.session;
    return (
      <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
        <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 4 }}>Scenario Active</div>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>
          {s.current_position} / {s.items_total} · {s.hero_mode} · auto: {s.auto_advance ? 'on' : 'off'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={drill.pause}   style={btnGhost}><Pause size={14} /> Pause</button>
          <button onClick={drill.advance} style={btnGhost}><ChevronRight size={14} /> Advance</button>
          <button onClick={drill.cancel}  style={btnGhost}><RefreshCw size={14} /> Swap</button>
        </div>
        <ul style={{ marginTop: 12, fontSize: 12, color: colors.textMuted, listStyle: 'none', padding: 0 }}>
          {drill.log.slice(0, 3).map((e, i) => (
            <li key={i}>{e.kind}: {e.scenarioId ?? e.reason ?? ''}</li>
          ))}
        </ul>
      </div>
    );
  }

  const launchDisabled = !playlistId || !heroPlayerId || (drill.fitCount === 0 && !allowZeroMatch);

  return (
    <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
      <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>Scenario Launch</div>

      <label htmlFor="pl" style={label}>Playlist</label>
      <select id="pl" aria-label="Playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} style={input}>
        <option value="">— choose —</option>
        {playlists.map(p => <option key={p.playlist_id} value={p.playlist_id}>{p.name}</option>)}
      </select>

      <label htmlFor="hero" style={label}>Hero</label>
      <select id="hero" aria-label="Hero" value={heroPlayerId} onChange={(e) => setHeroPlayerId(e.target.value)} disabled={!playlistId} style={input}>
        <option value="">— choose —</option>
        {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <fieldset style={{ border: 'none', padding: 0, margin: '8px 0' }}>
        <legend style={{ ...label, marginBottom: 4 }}>Hero mode</legend>
        {['sticky', 'per_hand', 'rotate'].map(m => (
          <label key={m} style={{ marginRight: 10, color: colors.textMuted, fontSize: 13 }}>
            <input type="radio" name="mode" aria-label={m} value={m} checked={heroMode === m} onChange={() => setHeroMode(m)} /> {m}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: 'none', padding: 0, margin: '8px 0' }}>
        <legend style={{ ...label, marginBottom: 4 }}>Order</legend>
        {['sequential', 'random'].map(o => (
          <label key={o} style={{ marginRight: 10, color: colors.textMuted, fontSize: 13 }}>
            <input type="radio" name="order" value={o} checked={ordering === o} onChange={() => setOrdering(o)} /> {o}
          </label>
        ))}
      </fieldset>

      <label style={{ display: 'block', marginBottom: 8, color: colors.textMuted, fontSize: 13 }}>
        <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} /> Auto-advance
      </label>

      {drill.fitCount === 0 && (
        <div style={{ color: colors.warning, fontSize: 13, margin: '8px 0' }}>
          <CircleAlert size={14} style={{ verticalAlign: 'middle' }} /> No scenarios fit current seat count.
          <label style={{ display: 'block', marginTop: 4 }}>
            <input type="checkbox" checked={allowZeroMatch} onChange={(e) => setAllowZeroMatch(e.target.checked)} /> Launch anyway — wait for count
          </label>
        </div>
      )}

      <button
        onClick={() => drill.launch({ playlistId, heroPlayerId, heroMode, autoAdvance })}
        disabled={launchDisabled}
        style={{ ...btnGold, opacity: launchDisabled ? 0.4 : 1 }}
      >
        <Play size={14} /> Launch
      </button>
    </div>
  );
}

const label = { display: 'block', fontSize: 12, color: colors.textMuted, marginTop: 8 };
const input = { width: '100%', padding: '4px 6px', background: colors.bgSurfaceRaised, color: colors.textPrimary, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, marginTop: 4 };
const btnGold  = { padding: '6px 10px', background: colors.gold, color: '#000', border: 'none', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnGhost = { padding: '6px 10px', background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 };
```

- [ ] **Step 4: Run tests and verify all pass**

Run: `cd client && npx vitest run src/__tests__/ScenarioLaunchPanel.test.jsx`
Expected: PASS — all 6 render assertions green.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/sidebar/ScenarioLaunchPanel.jsx \
        client/src/__tests__/ScenarioLaunchPanel.test.jsx
git commit -m "feat(client): ScenarioLaunchPanel idle/running/resume states"
```

---

### Task 4.3: Slot the panel into `CoachSidebar`

**Files:**
- Modify: `client/src/components/CoachSidebar.jsx`

- [ ] **Step 1: Locate the current `<PlaylistsSection />` usage**

Run: `grep -n "PlaylistsSection" client/src/components/CoachSidebar.jsx`
Expected: one or two matches (import + JSX usage).

- [ ] **Step 2: Replace the usage**

Replace the `<PlaylistsSection ... />` JSX with:

```jsx
<ScenarioLaunchPanel
  playlists={playlists}
  activePlayers={gameState?.players?.filter(p => !p.is_coach && p.seat >= 0) || []}
  drill={drill}
/>
```

Update the imports:

```js
import ScenarioLaunchPanel from './sidebar/ScenarioLaunchPanel';
import { useDrillSession } from '../hooks/useDrillSession';
```

And instantiate the hook inside `CoachSidebar` alongside other hooks:

```js
const drill = useDrillSession({ socket, tableId });
```

Do NOT delete `PlaylistsSection.jsx`; leave the file in place for any non-CoachSidebar callers.

- [ ] **Step 3: Run full client suite**

Run: `cd client && npx vitest run`
Expected: PASS — full suite green; previously-passing snapshot/other tests unchanged.

- [ ] **Step 4: Manually verify at a 3-handed coached table**

In a dev environment:
1. Start server + client.
2. Log in as a coach, open a `coached_cash` table, seat two bot/test players.
3. Ensure a playlist exists with at least one 3-player scenario (use HandBuilder if needed).
4. Open the sidebar — `ScenarioLaunchPanel` renders idle.
5. Pick playlist + hero + hero mode + Launch.
6. Click New Hand → scenario hole cards and board should be pre-filled matching the scenario; dealer button should match the scenario-mapped seat.
7. Finish the hand → cursor advances; stacks restored to pre-hand values.
8. Pause → leave table → re-launch same playlist → resume prompt renders.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/CoachSidebar.jsx
git commit -m "feat(client): slot ScenarioLaunchPanel into CoachSidebar"
```

---

## Phase 5 — Final integration check

### Task 5.1: Run full test suite + build

- [ ] **Step 1: Full server test run**

Run: `cd server && npx vitest run`
Expected: PASS — all tests green, including the 45–55 new ones added in this plan.

- [ ] **Step 2: Full client test run**

Run: `cd client && npx vitest run`
Expected: PASS — 1100+ tests green (1065 baseline + new panel/hook tests).

- [ ] **Step 3: Client production build**

Run: `cd client && npm run build`
Expected: Build completes with no errors. Only the pre-existing chunk-size warning is acceptable.

- [ ] **Step 4: Commit any trailing fixes**

If step 1–3 surfaced issues, fix inline and commit with a descriptive message. Otherwise no commit needed.

---

## Cross-cutting notes

- **Legacy `PlaylistsSection.jsx`** is intentionally left in place. Delete only if all callers are verified gone in a follow-up commit, never as part of this feature.
- **Legacy `playlist_mode` socket flow** (`advancePlaylist`, `findMatchingPlaylistIndex`, `loadScenarioIntoConfig`) is untouched. Both flows coexist; only one is active per table at a time because `drill_sessions` and `playlist_mode` share no state.
- **`scenario:armed` payload** includes `seatAssignments` and `dealerSeat` already; client derives BTN/SB/BB via existing `buildPositionMap`. No new position logic needed.
- **Memory file updates**: After Phase 4 ships, append one line to `/docs/memory/backend.md` under "Services" describing `ScenarioDealer`, and one line to `/docs/memory/frontend.md` under "Sidebar" describing `ScenarioLaunchPanel`. Keep each entry under 120 characters.

---

## Spec coverage matrix

| Spec section | Task(s) implementing it |
|---|---|
| 4 Architecture — ScenarioDealer / mapScenarioToTable | 1.2, 2.1 |
| 4 Architecture — CoachedController hook | 2.2 |
| 4 Architecture — PlaylistExecutionService extension | 1.3 |
| 4 Architecture — drillSession socket handler | 3.1 |
| 4 Architecture — ScenarioLaunchPanel / useDrillSession | 4.1, 4.2, 4.3 |
| 5 Data model — migration 053 | 1.1 |
| 6 Seat rotation algorithm | 1.2 |
| 7 REST extension | 2.3 |
| 7 Socket events | 3.1 |
| 8 Client UI | 4.2, 4.3 |
| 9 Edge cases — skip loop / exhaust | 2.1 |
| 9 Edge cases — hero_absent / persist_error | 2.1, 3.1 |
| 9 Edge cases — stack snapshot / restore | 2.1 |
| 9 Edge cases — zero-match override | 4.2 |
| 10 Testing strategy | 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 4.1, 4.2 |
| 11 Phasing | This plan, 4 phases + final verification |
