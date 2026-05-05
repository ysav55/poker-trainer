# Settings Phase 2 — Runtime Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire settings to affect runtime behavior: leaderboard sorting, table creation blinds/max_players, staking contract defaults, and platform-wide limit enforcement.

**Architecture:** Four independent wiring zones: (1) leaderboard config in `/api/players` response and dynamic sort/score, (2) GameManager respect max_players + CreateTableModal unified preset selector, (3) ContractModal pre-fill from school defaults, (4) enforcement checks at table create/join and registration.

**Tech Stack:** Node.js · Express · React · Supabase (settings table already has cascade resolvers from Phase 1)

---

## File Structure

**Backend (6 files modified + 1 method added):**
- `server/routes/players.js` — include leaderboardConfig in response
- `server/db/repositories/PlayerRepository.js` — add `countActiveTablesByUser(userId)` + optional sortBy support
- `server/game/GameManager.js` — max_players in state + seat iteration respect
- `server/game/controllers/AutoController.js` — setBlinds → setBlindLevels fix
- `server/routes/tables.js` — max_tables_per_student enforcement
- `server/socket/handlers/joinRoom.js` — max_players_per_table enforcement
- `server/routes/auth.js` — trial constants from org settings

**Frontend (3 files modified):**
- `client/src/pages/LeaderboardPage.jsx` — consume leaderboardConfig, dynamic sort + score
- `client/src/components/tables/CreateTableModal.jsx` — unified preset dropdown, max_players select, remove SB input
- `client/src/pages/admin/StakingPage.jsx` — fetch school defaults, pre-fill ContractModal

---

## Task 1: Leaderboard Backend — Extend `/api/players` Response

**Files:**
- Modify: `server/routes/players.js:30-40`
- Modify: `server/services/SettingsService.js` (verify resolveLeaderboardConfig exists from Phase 1)
- Test: `server/__tests__/routes/players.test.js`

- [ ] **Step 1: Read current players route to understand response shape**

Run: `cat server/routes/players.js | grep -A 20 "router.get('/', requireAuth"`

Expected: GET handler returns `{ players: [...], period, gameType, ... }`

- [ ] **Step 2: Write failing test for leaderboardConfig in response**

Create/update `server/__tests__/routes/players.test.js`:

```javascript
describe('GET /api/players with leaderboardConfig', () => {
  it('should include leaderboardConfig in response', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('leaderboardConfig');
    expect(res.body.leaderboardConfig).toHaveProperty('value');
    expect(res.body.leaderboardConfig).toHaveProperty('source');
    expect(['school', 'org', 'hardcoded']).toContain(res.body.leaderboardConfig.source);
  });

  it('should include primary_metric in leaderboardConfig.value', async () => {
    const res = await request(app)
      .get('/api/players')
      .set('Authorization', `Bearer ${testToken}`)
      .expect(200);

    expect(res.body.leaderboardConfig.value).toHaveProperty('primary_metric');
    expect(['net_chips', 'hands_played', 'win_rate', 'bb_per_100']).toContain(
      res.body.leaderboardConfig.value.primary_metric
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/routes/players.test.js`

Expected: FAIL — `res.body.leaderboardConfig is undefined`

- [ ] **Step 4: Verify resolveLeaderboardConfig exists in SettingsService**

Run: `grep -n "resolveLeaderboardConfig" server/services/SettingsService.js`

Expected: Method exists (from Phase 1)

- [ ] **Step 5: Implement leaderboardConfig fetch in players route**

Modify `server/routes/players.js`:

Find the GET handler (around line 30–40), locate where response is sent:

```javascript
const SettingsService = require('../services/SettingsService');

router.get('/', requireAuth, async (req, res) => {
  try {
    const period = req.query.period || 'session';
    const gameType = req.query.gameType || 'all';

    const players = await PlayerRepository.getAllPlayersWithStats({
      period,
      gameType,
      schoolId: req.user.schoolId,
    });

    // ADD THIS BLOCK:
    const leaderboardConfig = await SettingsService.resolveLeaderboardConfig(req.user.schoolId);

    return res.json({
      players,
      period,
      gameType,
      leaderboardConfig, // ADD THIS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- server/__tests__/routes/players.test.js`

Expected: PASS

- [ ] **Step 7: Run full player tests to check for regressions**

Run: `npm test -- server/__tests__/routes/players.test.js`

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add server/routes/players.js server/__tests__/routes/players.test.js
git commit -m "feat: include leaderboardConfig in GET /api/players response"
```

---

## Task 2: Leaderboard Frontend — Dynamic Sort and Score Display

**Files:**
- Modify: `client/src/pages/LeaderboardPage.jsx:60-120`
- Test: `client/src/__tests__/pages/LeaderboardPage.test.jsx` (or integration test)

- [ ] **Step 1: Read LeaderboardPage to understand current sort/score logic**

Run: `head -n 150 client/src/pages/LeaderboardPage.jsx | tail -n 80`

Expected: Understand where `filtered` memo sorts, where score column computes value

- [ ] **Step 2: Write failing test for dynamic sort**

Update or create `client/src/__tests__/pages/LeaderboardPage.test.jsx`:

```javascript
describe('LeaderboardPage', () => {
  it('should sort by primary_metric from leaderboardConfig', () => {
    const mockPlayers = [
      { id: '1', total_net_chips: 1000, total_hands: 50, total_wins: 10 },
      { id: '2', total_net_chips: 500, total_hands: 100, total_wins: 20 },
    ];
    
    const mockConfig = {
      value: {
        primary_metric: 'hands_played',
        secondary_metric: 'win_rate',
      },
      source: 'org',
    };

    // Mock /api/players to return config
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          players: mockPlayers,
          leaderboardConfig: mockConfig,
        }),
      })
    );

    const { getByText } = render(<LeaderboardPage />);
    
    // Expect players sorted by total_hands (hands_played metric)
    // Player 2 (100 hands) should appear before Player 1 (50 hands)
    expect(getByText('Player 2')).toBeLessThanOrEqual(getByText('Player 1'));
  });

  it('should compute score column using secondary_metric', () => {
    const mockPlayers = [
      { id: '1', total_net_chips: 1000, total_hands: 100, total_wins: 20 },
    ];
    
    const mockConfig = {
      value: {
        primary_metric: 'net_chips',
        secondary_metric: 'win_rate',
      },
      source: 'school',
    };

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          players: mockPlayers,
          leaderboardConfig: mockConfig,
        }),
      })
    );

    const { getByText } = render(<LeaderboardPage />);
    
    // Score for win_rate: 20 / 100 = 20%
    expect(getByText('20%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- client/src/__tests__/pages/LeaderboardPage.test.jsx`

Expected: FAIL — leaderboardConfig not fetched or sort/score not dynamic

- [ ] **Step 4: Implement dynamic sort and score in LeaderboardPage**

Modify `client/src/pages/LeaderboardPage.jsx`:

Locate the component and find where `filtered` memo sorts. Update:

```javascript
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api';

export default function LeaderboardPage() {
  const [players, setPlayers] = useState([]);
  const [leaderboardConfig, setLeaderboardConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('session');
  const [gameType, setGameType] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await apiFetch(`/api/players?period=${period}&gameType=${gameType}`);
        setPlayers(data.players);
        setLeaderboardConfig(data.leaderboardConfig);
      } catch (err) {
        console.error('Failed to fetch leaderboard:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [period, gameType]);

  // Metric to field mapping
  const metricFieldMap = {
    net_chips: 'total_net_chips',
    hands_played: 'total_hands',
    win_rate: (p) => (p.total_hands > 0 ? p.total_wins / p.total_hands : 0),
    bb_per_100: (p) => (p.total_hands > 0 ? (p.total_net_chips / p.total_hands) * 100 : 0),
  };

  const computeScoreForMetric = (metric, player) => {
    const field = metricFieldMap[metric];
    if (typeof field === 'function') return field(player);
    return player[field] ?? 0;
  };

  const filtered = useMemo(() => {
    if (!leaderboardConfig || !players.length) return [];

    const primaryMetric = leaderboardConfig.value.primary_metric || 'net_chips';
    const primaryField = metricFieldMap[primaryMetric];

    return [...players].sort((a, b) => {
      const aValue = typeof primaryField === 'function' ? primaryField(a) : a[primaryField];
      const bValue = typeof primaryField === 'function' ? primaryField(b) : b[primaryField];
      return bValue - aValue; // Descending
    });
  }, [players, leaderboardConfig]);

  if (loading) return <div>Loading...</div>;
  if (!leaderboardConfig) return <div>No leaderboard config available</div>;

  const secondaryMetric = leaderboardConfig.value.secondary_metric || 'net_chips';
  const scoreColumnLabel = {
    net_chips: 'Net Chips',
    hands_played: 'Hands',
    win_rate: 'Win Rate %',
    bb_per_100: 'BB/100',
  }[secondaryMetric];

  return (
    <div>
      {/* Period and gameType filters — unchanged */}
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Primary ({leaderboardConfig.value.primary_metric})</th>
            <th>{scoreColumnLabel}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((player, idx) => {
            const scoreValue = computeScoreForMetric(secondaryMetric, player);
            const scoreDisplay =
              secondaryMetric === 'win_rate'
                ? `${(scoreValue * 100).toFixed(1)}%`
                : secondaryMetric === 'bb_per_100'
                ? scoreValue.toFixed(2)
                : Math.round(scoreValue);

            return (
              <tr key={player.id}>
                <td>{idx + 1}</td>
                <td>{player.display_name}</td>
                <td>{computeScoreForMetric(leaderboardConfig.value.primary_metric, player)}</td>
                <td>{scoreDisplay}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- client/src/__tests__/pages/LeaderboardPage.test.jsx`

Expected: PASS

- [ ] **Step 6: Manual browser test**

1. Navigate to Leaderboard page
2. In Settings > Platform Defaults, set primary_metric to `hands_played`
3. Reload Leaderboard page
4. Verify players are sorted by hand count, not net chips
5. Verify score column shows secondary metric

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/LeaderboardPage.jsx client/src/__tests__/pages/LeaderboardPage.test.jsx
git commit -m "feat: wire leaderboard to use cascaded config for dynamic sort and score"
```

---

## Task 3: GameManager — Add max_players State and Seat Respect

**Files:**
- Modify: `server/game/GameManager.js:50-60, 150-165, 180-195`
- Test: `server/__tests__/game/GameManager.test.js`

- [ ] **Step 1: Read GameManager to locate _initState, _nextAvailableSeat, _nextAvailableSeatForCoach**

Run: `grep -n "_initState\|_nextAvailableSeat\|_nextAvailableSeatForCoach" server/game/GameManager.js | head -n 10`

Expected: Find line numbers for these methods

- [ ] **Step 2: Write failing test for max_players clamping**

Update `server/__tests__/game/GameManager.test.js`:

```javascript
describe('GameManager max_players', () => {
  it('should initialize state.max_players from config, clamped to 9', () => {
    const config = {
      bb: 50,
      sb: 25,
      max_players: 6,
      stack: 1000,
    };
    
    const gm = new GameManager(config);
    gm._initState();
    
    expect(gm.state.max_players).toBe(6);
  });

  it('should clamp max_players to 9 if config exceeds 9', () => {
    const config = {
      bb: 50,
      sb: 25,
      max_players: 15,
      stack: 1000,
    };
    
    const gm = new GameManager(config);
    gm._initState();
    
    expect(gm.state.max_players).toBe(9);
  });

  it('should default to 9 if max_players not provided', () => {
    const config = {
      bb: 50,
      sb: 25,
      stack: 1000,
    };
    
    const gm = new GameManager(config);
    gm._initState();
    
    expect(gm.state.max_players).toBe(9);
  });

  it('should not assign seats beyond max_players', () => {
    const config = {
      bb: 50,
      sb: 25,
      max_players: 2,
      stack: 1000,
    };
    
    const gm = new GameManager(config);
    gm._initState();
    
    gm.addPlayer({ id: 'p1', displayName: 'Player 1' });
    const seat1 = gm._nextAvailableSeat();
    expect(seat1).toBe(0);
    
    gm.addPlayer({ id: 'p2', displayName: 'Player 2' });
    const seat2 = gm._nextAvailableSeat();
    expect(seat2).toBe(1);
    
    // Third player should not get a seat
    const seat3 = gm._nextAvailableSeat();
    expect(seat3).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/game/GameManager.test.js -- --testNamePattern="max_players"`

Expected: FAIL — max_players not in state or not clamped

- [ ] **Step 4: Implement max_players in _initState**

Modify `server/game/GameManager.js` in `_initState()` method:

```javascript
_initState() {
  this.state = {
    gameId: this.gameId,
    gameType: this.config.gameType || 'uncoached_cash',
    bb: this.config.bb || 10,
    sb: this.config.sb || 5,
    ante: this.config.ante || 0,
    stack: this.config.stack || 1000,
    max_players: Math.min(this.config.max_players ?? 9, 9), // ADD THIS LINE
    button: 0,
    players: [],
    currentStreet: 'preflop',
    pot: 0,
    // ... rest of state
  };
}
```

- [ ] **Step 5: Implement max_players respect in _nextAvailableSeat**

Modify `_nextAvailableSeat()`:

```javascript
_nextAvailableSeat() {
  for (let i = 0; i < this.state.max_players; i++) { // CHANGE: use max_players instead of 9
    if (!this.state.players.find(p => p.seat === i)) {
      return i;
    }
  }
  return null; // No seat available
}
```

- [ ] **Step 6: Implement max_players respect in _nextAvailableSeatForCoach**

Modify `_nextAvailableSeatForCoach()`:

```javascript
_nextAvailableSeatForCoach() {
  for (let i = this.state.max_players - 1; i >= 0; i--) { // CHANGE: start from max_players - 1
    if (!this.state.players.find(p => p.seat === i)) {
      return i;
    }
  }
  return null;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- server/__tests__/game/GameManager.test.js -- --testNamePattern="max_players"`

Expected: PASS

- [ ] **Step 8: Run full GameManager tests to check regressions**

Run: `npm test -- server/__tests__/game/GameManager.test.js`

Expected: All tests pass, especially existing seat assignment tests

- [ ] **Step 9: Commit**

```bash
git add server/game/GameManager.js server/__tests__/game/GameManager.test.js
git commit -m "feat: GameManager respects max_players state for seat assignment"
```

---

## Task 4: AutoController — Fix setBlinds to setBlindLevels

**Files:**
- Modify: `server/game/controllers/AutoController.js:40-50`
- Test: `server/__tests__/game/controllers/AutoController.test.js`

- [ ] **Step 1: Read AutoController to locate setBlinds call**

Run: `grep -n "setBlinds\|setBlindLevels" server/game/controllers/AutoController.js`

Expected: Find the broken `setBlinds` call

- [ ] **Step 2: Write failing test for correct setBlindLevels call**

Update `server/__tests__/game/controllers/AutoController.test.js`:

```javascript
describe('AutoController setBlinds fix', () => {
  it('should call setBlindLevels with sb and bb', () => {
    const gm = new GameManager({ bb: 100, sb: 50, stack: 1000 });
    gm._initState();
    
    // Mock setBlindLevels
    const setBlindLevelsSpy = jest.spyOn(gm, 'setBlindLevels');
    
    const cfg = { sb: 50, bb: 100 };
    const controller = new AutoController(gm, cfg);
    
    // Trigger the method that calls setBlindLevels
    controller.start();
    
    // Verify correct method was called
    expect(setBlindLevelsSpy).toHaveBeenCalledWith(50, 100);
    
    setBlindLevelsSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/game/controllers/AutoController.test.js -- --testNamePattern="setBlindLevels"`

Expected: FAIL — setBlindLevels not called or called with wrong arguments

- [ ] **Step 4: Fix setBlinds to setBlindLevels in AutoController**

Modify `server/game/controllers/AutoController.js`:

Find the line with `this.gm.setBlinds?.(cfg.sb, cfg.bb);` and change to:

```javascript
// BEFORE:
// this.gm.setBlinds?.(cfg.sb, cfg.bb);

// AFTER:
this.gm.setBlindLevels?.(cfg.sb, cfg.bb);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/__tests__/game/controllers/AutoController.test.js -- --testNamePattern="setBlindLevels"`

Expected: PASS

- [ ] **Step 6: Run full AutoController tests to check regressions**

Run: `npm test -- server/__tests__/game/controllers/AutoController.test.js`

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/game/controllers/AutoController.js server/__tests__/game/controllers/AutoController.test.js
git commit -m "fix: AutoController call setBlindLevels instead of non-existent setBlinds"
```

---

## Task 5: CreateTableModal — Unified Preset Dropdown and max_players Select

**Files:**
- Modify: `client/src/components/tables/CreateTableModal.jsx` (large refactor)
- Test: `client/src/__tests__/components/CreateTableModal.test.jsx`

- [ ] **Step 1: Read CreateTableModal to understand current structure**

Run: `head -n 100 client/src/components/tables/CreateTableModal.jsx`

Expected: Understand current "Load Preset" dropdown and SB/BB inputs

- [ ] **Step 2: Write failing test for unified preset dropdown**

Update `client/src/__tests__/components/CreateTableModal.test.jsx`:

```javascript
describe('CreateTableModal', () => {
  it('should render unified preset dropdown with optgroups', async () => {
    // Mock API calls
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/table-presets')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            presets: [{ id: '1', label: '6-Max NL50', sb: 25, bb: 50, stack: 1000 }],
          }),
        });
      }
      if (url.includes('/api/settings/school/blind-structures')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            structures: [
              { id: 'org1', label: 'NL50', bb: 50, max_players: 6, source: 'school' },
              { id: 'org2', label: 'NL100', bb: 100, max_players: 9, source: 'org' },
            ],
          }),
        });
      }
    });

    const { getByText, getByRole } = render(<CreateTableModal onClose={() => {}} />);

    // Wait for dropdown to load
    await waitFor(() => {
      const select = getByRole('combobox', { name: /preset/i });
      expect(select).toBeInTheDocument();
    });

    // Verify optgroups exist
    expect(getByText('My Presets')).toBeInTheDocument();
    expect(getByText('School Blinds')).toBeInTheDocument();
    expect(getByText('Platform Blinds')).toBeInTheDocument();
  });

  it('should remove SB input and only show BB', () => {
    const { queryByLabelText, getByLabelText } = render(<CreateTableModal onClose={() => {}} />);

    expect(queryByLabelText(/SB|Small Blind/i)).not.toBeInTheDocument();
    expect(getByLabelText(/BB|Big Blind/i)).toBeInTheDocument();
  });

  it('should show max_players select with options', () => {
    const { getByLabelText } = render(<CreateTableModal onClose={() => {}} />);

    const maxPlayersSelect = getByLabelText(/max players|table size/i);
    expect(maxPlayersSelect).toBeInTheDocument();

    // Options: 2, 6, 8, 9
    const options = maxPlayersSelect.querySelectorAll('option');
    expect(options.length).toBeGreaterThanOrEqual(4);
  });

  it('should pre-fill BB and max_players when blind structure selected', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/settings/school/blind-structures')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            structures: [
              { id: 'b1', label: 'NL100 6-Max', bb: 100, max_players: 6, source: 'school' },
            ],
          }),
        });
      }
    });

    const { getByRole, getByDisplayValue } = render(<CreateTableModal onClose={() => {}} />);

    const presetSelect = getByRole('combobox', { name: /preset/i });
    fireEvent.change(presetSelect, { target: { value: 'b1' } });

    await waitFor(() => {
      expect(getByDisplayValue('100')).toHaveValue('100'); // BB field
      expect(getByDisplayValue('6')).toHaveValue('6'); // max_players field
    });
  });

  it('should fill full config when personal preset selected', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/table-presets')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            presets: [
              { id: 'p1', label: 'My Preset', sb: 25, bb: 50, stack: 500 },
            ],
          }),
        });
      }
    });

    const { getByRole, getByDisplayValue } = render(<CreateTableModal onClose={() => {}} />);

    const presetSelect = getByRole('combobox', { name: /preset/i });
    fireEvent.change(presetSelect, { target: { value: 'p1' } });

    await waitFor(() => {
      // Personal preset should fill: sb, bb, stack (no max_players)
      expect(getByDisplayValue('25')).toHaveValue('25'); // SB
      expect(getByDisplayValue('50')).toHaveValue('50'); // BB
      expect(getByDisplayValue('500')).toHaveValue('500'); // Stack
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- client/src/__tests__/components/CreateTableModal.test.jsx`

Expected: FAIL — unified dropdown not implemented, SB still present, max_players missing

- [ ] **Step 4: Implement unified preset dropdown and max_players in CreateTableModal**

Modify `client/src/components/tables/CreateTableModal.jsx`:

```javascript
import { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';

export default function CreateTableModal({ onClose }) {
  const [personalPresets, setPersonalPresets] = useState([]);
  const [blindStructures, setBlindStructures] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [bb, setBb] = useState(50);
  const [maxPlayers, setMaxPlayers] = useState(9);
  const [stack, setStack] = useState(1000);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const [personalRes, blindRes] = await Promise.all([
          apiFetch('/api/table-presets'),
          apiFetch('/api/settings/school/blind-structures'),
        ]);
        setPersonalPresets(personalRes.presets || []);
        setBlindStructures(blindRes.structures || []);
      } catch (err) {
        console.error('Failed to fetch presets:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPresets();
  }, []);

  const handlePresetChange = (presetId) => {
    if (!presetId) return;

    // Check if it's a blind structure (starts with blind- prefix or source='school'/'org')
    const blindStructure = blindStructures.find(b => b.id === presetId);
    if (blindStructure) {
      // Blind structure preset: only fill bb + max_players
      setBb(blindStructure.bb);
      setMaxPlayers(blindStructure.max_players || 9);
      return;
    }

    // Personal preset: fill full config
    const personalPreset = personalPresets.find(p => p.id === presetId);
    if (personalPreset) {
      setBb(personalPreset.bb);
      setStack(personalPreset.stack);
      // Note: personalPreset has sb, but we don't expose SB input anymore
      // SB will be computed as bb/2 on the backend
    }
  };

  const handleCreateTable = async () => {
    try {
      const response = await apiFetch('/api/tables', {
        method: 'POST',
        body: JSON.stringify({
          gameType: 'uncoached_cash',
          bb,
          sb: bb / 2, // Always compute from BB
          stack,
          max_players: maxPlayers,
        }),
      });
      onClose(response);
    } catch (err) {
      console.error('Failed to create table:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="modal">
      <h2>Create Table</h2>

      {/* Unified Preset Dropdown */}
      <div className="form-group">
        <label htmlFor="preset-select">Load Preset</label>
        <select id="preset-select" onChange={(e) => handlePresetChange(e.target.value)}>
          <option value="">— Select a preset —</option>

          {/* My Presets */}
          {personalPresets.length > 0 && (
            <optgroup label="My Presets">
              {personalPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          )}

          {/* School Blinds */}
          {blindStructures.some((b) => b.source === 'school') && (
            <optgroup label="School Blinds">
              {blindStructures
                .filter((b) => b.source === 'school')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} — BB {b.bb}, {b.max_players}-Max
                  </option>
                ))}
            </optgroup>
          )}

          {/* Platform Blinds */}
          {blindStructures.some((b) => b.source === 'org') && (
            <optgroup label="Platform Blinds">
              {blindStructures
                .filter((b) => b.source === 'org')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label} — BB {b.bb}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* BB Input (SB removed) */}
      <div className="form-group">
        <label htmlFor="bb-input">Big Blind</label>
        <input
          id="bb-input"
          type="number"
          value={bb}
          onChange={(e) => setBb(parseInt(e.target.value, 10))}
        />
      </div>

      {/* max_players Select */}
      <div className="form-group">
        <label htmlFor="max-players-select">Table Size (Max Players)</label>
        <select
          id="max-players-select"
          value={maxPlayers}
          onChange={(e) => setMaxPlayers(parseInt(e.target.value, 10))}
        >
          <option value={2}>2 (Heads-Up)</option>
          <option value={6}>6 (6-Max)</option>
          <option value={8}>8 (8-Handed)</option>
          <option value={9}>9 (Full Ring)</option>
        </select>
      </div>

      {/* Stack Input */}
      <div className="form-group">
        <label htmlFor="stack-input">Starting Stack</label>
        <input
          id="stack-input"
          type="number"
          value={stack}
          onChange={(e) => setStack(parseInt(e.target.value, 10))}
        />
      </div>

      <button onClick={handleCreateTable}>Create Table</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- client/src/__tests__/components/CreateTableModal.test.jsx`

Expected: PASS

- [ ] **Step 6: Manual browser test**

1. Open Create Table modal
2. Verify no SB input visible
3. Verify max_players select with 4 options
4. Verify unified preset dropdown with optgroups
5. Select a school blind structure preset
6. Verify BB and max_players pre-fill
7. Select a personal preset
8. Verify full config (stack) pre-fills, max_players stays

- [ ] **Step 7: Commit**

```bash
git add client/src/components/tables/CreateTableModal.jsx client/src/__tests__/components/CreateTableModal.test.jsx
git commit -m "feat: CreateTableModal unified preset dropdown, max_players select, remove SB input"
```

---

## Task 6: StakingPage — Pre-fill ContractModal from School Defaults

**Files:**
- Modify: `client/src/pages/admin/StakingPage.jsx` and/or `ContractModal` component
- Test: `client/src/__tests__/pages/admin/StakingPage.test.jsx`

- [ ] **Step 1: Locate ContractModal and understand its current structure**

Run: `grep -r "ContractModal" client/src/pages/admin/ | head -n 5`

Expected: Find where ContractModal is imported/used in StakingPage

- [ ] **Step 2: Read ContractModal to understand props**

Run: `head -n 50 client/src/components/ContractModal.jsx`

Expected: Understand what props it accepts and how pre-fill works

- [ ] **Step 3: Write failing test for pre-fill behavior**

Update or create `client/src/__tests__/components/ContractModal.test.jsx`:

```javascript
describe('ContractModal pre-fill from school defaults', () => {
  it('should pre-fill fields from school staking defaults when creating new contract', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('/api/settings/school')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            staking_defaults: {
              value: {
                coach_split_pct: 60,
                makeup_policy: 'carries',
                bankroll_cap: 5000,
              },
              source: 'school',
            },
          }),
        });
      }
    });

    const { getByDisplayValue } = render(
      <ContractModal contract={null} onClose={() => {}} onSave={() => {}} />
    );

    await waitFor(() => {
      expect(getByDisplayValue('60')).toHaveValue('60'); // coach_split_pct
      expect(getByDisplayValue('carries')).toHaveValue('carries'); // makeup_policy
      expect(getByDisplayValue('5000')).toHaveValue('5000'); // bankroll_cap
    });
  });

  it('should not pre-fill when editing existing contract', async () => {
    const existingContract = {
      id: '1',
      coach_split_pct: 50,
      makeup_policy: 'open',
      bankroll_cap: 3000,
    };

    const { getByDisplayValue, queryByDisplayValue } = render(
      <ContractModal contract={existingContract} onClose={() => {}} onSave={() => {}} />
    );

    // Should show contract's actual values, not defaults
    expect(getByDisplayValue('50')).toHaveValue('50');
    expect(getByDisplayValue('open')).toHaveValue('open');
    expect(getByDisplayValue('3000')).toHaveValue('3000');
  });

  it('should use fallback defaults if school settings not set', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          staking_defaults: null,
        }),
      })
    );

    const { getByDisplayValue } = render(
      <ContractModal contract={null} onClose={() => {}} onSave={() => {}} />
    );

    await waitFor(() => {
      // Fallback: coach_split_pct=50, makeup_policy='carries', bankroll_cap=''
      expect(getByDisplayValue('50')).toHaveValue('50');
      expect(getByDisplayValue('carries')).toHaveValue('carries');
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- client/src/__tests__/components/ContractModal.test.jsx`

Expected: FAIL — pre-fill not implemented

- [ ] **Step 5: Implement pre-fill in ContractModal**

Modify ContractModal component (likely in `client/src/components/staking/ContractModal.jsx` or similar):

```javascript
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

export default function ContractModal({ contract, onClose, onSave }) {
  const [formData, setFormData] = useState({
    coach_split_pct: 50,
    makeup_policy: 'carries',
    bankroll_cap: '',
    end_date: '',
  });

  useEffect(() => {
    // Only pre-fill if creating new contract (contract === null)
    if (contract !== null) {
      // Editing existing contract: populate from contract data
      setFormData({
        coach_split_pct: contract.coach_split_pct,
        makeup_policy: contract.makeup_policy,
        bankroll_cap: contract.bankroll_cap || '',
        end_date: contract.end_date || '',
      });
      return;
    }

    // New contract: fetch school defaults
    const fetchDefaults = async () => {
      try {
        const data = await apiFetch('/api/settings/school');
        const defaults = data.staking_defaults?.value;

        if (defaults) {
          setFormData({
            coach_split_pct: defaults.coach_split_pct ?? 50,
            makeup_policy: defaults.makeup_policy ?? 'carries',
            bankroll_cap: defaults.bankroll_cap ?? '',
            end_date: defaults.end_date ?? '',
          });
        }
        // Otherwise use hardcoded fallback in initial state
      } catch (err) {
        console.error('Failed to fetch school defaults:', err);
        // Use fallback
      }
    };

    fetchDefaults();
  }, [contract]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onSave(formData);
  };

  return (
    <div className="modal">
      <h2>{contract ? 'Edit' : 'New'} Staking Contract</h2>

      <div className="form-group">
        <label>Coach Split %</label>
        <input
          type="number"
          value={formData.coach_split_pct}
          onChange={(e) => handleChange('coach_split_pct', parseInt(e.target.value, 10))}
        />
      </div>

      <div className="form-group">
        <label>Makeup Policy</label>
        <select
          value={formData.makeup_policy}
          onChange={(e) => handleChange('makeup_policy', e.target.value)}
        >
          <option value="carries">Carries</option>
          <option value="open">Open</option>
        </select>
      </div>

      <div className="form-group">
        <label>Bankroll Cap</label>
        <input
          type="number"
          value={formData.bankroll_cap}
          onChange={(e) => handleChange('bankroll_cap', parseInt(e.target.value, 10) || '')}
        />
      </div>

      <div className="form-group">
        <label>End Date</label>
        <input
          type="date"
          value={formData.end_date}
          onChange={(e) => handleChange('end_date', e.target.value)}
        />
      </div>

      <button onClick={handleSave}>Save</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- client/src/__tests__/components/ContractModal.test.jsx`

Expected: PASS

- [ ] **Step 7: Manual browser test**

1. Navigate to Staking page (admin)
2. Click "Create New Contract"
3. Verify coach_split_pct, makeup_policy, bankroll_cap are pre-filled from school settings
4. Open existing contract for editing
5. Verify form shows existing contract values, not school defaults

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/admin/StakingPage.jsx client/src/components/staking/ContractModal.jsx client/src/__tests__/components/ContractModal.test.jsx
git commit -m "feat: ContractModal pre-fills from school staking defaults on create"
```

---

## Task 7: TableRepository — Add countActiveTablesByUser Method

**Files:**
- Modify: `server/db/repositories/TableRepository.js`
- Test: `server/__tests__/db/repositories/TableRepository.test.js`

- [ ] **Step 1: Read TableRepository to understand structure**

Run: `head -n 30 server/db/repositories/TableRepository.js`

Expected: Understand class structure and existing methods

- [ ] **Step 2: Write failing test for countActiveTablesByUser**

Update `server/__tests__/db/repositories/TableRepository.test.js`:

```javascript
describe('TableRepository.countActiveTablesByUser', () => {
  it('should count active tables created by a user', async () => {
    // Insert test data
    await supabase.from('tables').insert([
      { id: 't1', created_by: 'user1', status: 'active' },
      { id: 't2', created_by: 'user1', status: 'active' },
      { id: 't3', created_by: 'user1', status: 'closed' },
      { id: 't4', created_by: 'user2', status: 'active' },
    ]);

    const count = await TableRepository.countActiveTablesByUser('user1');

    expect(count).toBe(2); // Only active tables by user1
  });

  it('should return 0 if user has no active tables', async () => {
    const count = await TableRepository.countActiveTablesByUser('nonexistent-user');
    expect(count).toBe(0);
  });

  it('should not count closed tables', async () => {
    await supabase.from('tables').insert([
      { id: 't1', created_by: 'user1', status: 'closed' },
      { id: 't2', created_by: 'user1', status: 'closed' },
    ]);

    const count = await TableRepository.countActiveTablesByUser('user1');
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/db/repositories/TableRepository.test.js -- --testNamePattern="countActiveTablesByUser"`

Expected: FAIL — method does not exist

- [ ] **Step 4: Implement countActiveTablesByUser**

Modify `server/db/repositories/TableRepository.js`, add method to the class:

```javascript
static async countActiveTablesByUser(userId) {
  const { count, error } = await supabase
    .from('tables')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .neq('status', 'closed');

  if (error) throw error;
  return count || 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/__tests__/db/repositories/TableRepository.test.js -- --testNamePattern="countActiveTablesByUser"`

Expected: PASS

- [ ] **Step 6: Run full TableRepository tests to check regressions**

Run: `npm test -- server/__tests__/db/repositories/TableRepository.test.js`

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/db/repositories/TableRepository.js server/__tests__/db/repositories/TableRepository.test.js
git commit -m "feat: TableRepository.countActiveTablesByUser(userId) for platform limit enforcement"
```

---

## Task 8: Platform Limits — Enforce max_tables_per_student at Table Creation

**Files:**
- Modify: `server/routes/tables.js:40-60`
- Test: `server/__tests__/routes/tables.test.js`

- [ ] **Step 1: Read tables route POST handler**

Run: `grep -A 30 "router.post('/', requireAuth" server/routes/tables.js | head -n 40`

Expected: Understand current table creation flow and where to add check

- [ ] **Step 2: Write failing test for table limit enforcement**

Update `server/__tests__/routes/tables.test.js`:

```javascript
describe('POST /api/tables — max_tables_per_student enforcement', () => {
  it('should return 403 when user exceeds max_tables_per_student limit', async () => {
    // Mock SettingsService to return limit of 1
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      max_tables_per_student: 1,
    });

    // Mock TableRepository to return user already has 1 active table
    jest.spyOn(TableRepository, 'countActiveTablesByUser').mockResolvedValue(1);

    const res = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        gameType: 'uncoached_cash',
        bb: 50,
        sb: 25,
        stack: 1000,
      })
      .expect(403);

    expect(res.body).toEqual({ error: 'table_limit_reached' });
  });

  it('should allow table creation when under limit', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      max_tables_per_student: 4,
    });

    jest.spyOn(TableRepository, 'countActiveTablesByUser').mockResolvedValue(2);

    jest.spyOn(TableRepository, 'create').mockResolvedValue({ id: 't1' });

    const res = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        gameType: 'uncoached_cash',
        bb: 50,
        sb: 25,
        stack: 1000,
      })
      .expect(201);

    expect(res.body).toHaveProperty('id');
  });

  it('should use fallback limit of 4 if org settings not set', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue(null);
    jest.spyOn(TableRepository, 'countActiveTablesByUser').mockResolvedValue(4);

    const res = await request(app)
      .post('/api/tables')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        gameType: 'uncoached_cash',
        bb: 50,
        sb: 25,
        stack: 1000,
      })
      .expect(403);

    expect(res.body).toEqual({ error: 'table_limit_reached' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/routes/tables.test.js -- --testNamePattern="max_tables_per_student"`

Expected: FAIL — limit check not implemented

- [ ] **Step 4: Implement max_tables_per_student check in tables route**

Modify `server/routes/tables.js`, in the POST handler after `canCreateTable` check:

```javascript
const SettingsService = require('../services/SettingsService');
const TableRepository = require('../db/repositories/TableRepository');

router.post('/', requireAuth, async (req, res) => {
  try {
    // Existing canCreateTable check
    if (!canCreateTable(req)) {
      return res.status(403).json({ error: 'cannot_create_table' });
    }

    // ADD THIS BLOCK:
    const limits = await SettingsService.getOrgSetting('org.platform_limits');
    const activeTables = await TableRepository.countActiveTablesByUser(req.user.id);
    const maxTables = limits?.max_tables_per_student ?? 4;

    if (activeTables >= maxTables) {
      return res.status(403).json({ error: 'table_limit_reached' });
    }

    // Continue with existing table creation logic
    const table = await TableRepository.create({
      gameType: req.body.gameType,
      bb: req.body.bb,
      sb: req.body.sb,
      stack: req.body.stack,
      max_players: req.body.max_players,
      created_by: req.user.id,
      school_id: req.user.schoolId,
    });

    res.status(201).json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/__tests__/routes/tables.test.js -- --testNamePattern="max_tables_per_student"`

Expected: PASS

- [ ] **Step 6: Run full tables tests to check regressions**

Run: `npm test -- server/__tests__/routes/tables.test.js`

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/routes/tables.js server/__tests__/routes/tables.test.js
git commit -m "feat: enforce max_tables_per_student limit at table creation"
```

---

## Task 9: Platform Limits — Enforce max_players_per_table at Socket Join

**Files:**
- Modify: `server/socket/handlers/joinRoom.js:20-40`
- Test: `server/__tests__/socket/handlers/joinRoom.test.js`

- [ ] **Step 1: Read joinRoom handler to locate addPlayer call**

Run: `grep -n "addPlayer\|gm.state.players" server/socket/handlers/joinRoom.js | head -n 10`

Expected: Find where player is added to game

- [ ] **Step 2: Write failing test for max_players_per_table enforcement**

Update `server/__tests__/socket/handlers/joinRoom.test.js`:

```javascript
describe('join_room handler — max_players_per_table enforcement', () => {
  it('should reject join when seated players reach max_players_per_table limit', async () => {
    const mockSocket = createMockSocket();
    const mockGm = createMockGameManager();

    // Mock: 9 seated players already
    mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      seat: i,
      isCoach: false,
      isSpectator: false,
    }));

    // Mock SettingsService to return limit of 9
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      max_players_per_table: 9,
    });

    const joinRoomHandler = require('../../../server/socket/handlers/joinRoom');

    await joinRoomHandler(mockSocket, {
      tableId: 't1',
      playerId: 'p10',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Table is full',
    });
  });

  it('should allow join when under limit', async () => {
    const mockSocket = createMockSocket();
    const mockGm = createMockGameManager();

    // Mock: 8 seated players
    mockGm.state.players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i}`,
      seat: i,
      isCoach: false,
      isSpectator: false,
    }));

    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      max_players_per_table: 9,
    });

    const joinRoomHandler = require('../../../server/socket/handlers/joinRoom');

    await joinRoomHandler(mockSocket, {
      tableId: 't1',
      playerId: 'p9',
    });

    // Should call gm.addPlayer (not emit error)
    expect(mockGm.addPlayer).toHaveBeenCalled();
  });

  it('should not count coaches and spectators toward limit', async () => {
    const mockSocket = createMockSocket();
    const mockGm = createMockGameManager();

    // Mock: 1 coach + 1 spectator + 9 seated regular players = 11 total
    mockGm.state.players = [
      { id: 'coach1', isCoach: true, isSpectator: false },
      { id: 'spec1', isCoach: false, isSpectator: true },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `p${i}`,
        seat: i,
        isCoach: false,
        isSpectator: false,
      })),
    ];

    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      max_players_per_table: 9,
    });

    const joinRoomHandler = require('../../../server/socket/handlers/joinRoom');

    await joinRoomHandler(mockSocket, {
      tableId: 't1',
      playerId: 'p10',
    });

    // Should reject because 9 seated players already
    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Table is full',
    });
  });

  it('should use fallback limit of 9 if org settings not set', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue(null);

    const mockSocket = createMockSocket();
    const mockGm = createMockGameManager();

    mockGm.state.players = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      seat: i,
      isCoach: false,
      isSpectator: false,
    }));

    const joinRoomHandler = require('../../../server/socket/handlers/joinRoom');

    await joinRoomHandler(mockSocket, {
      tableId: 't1',
      playerId: 'p10',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', {
      message: 'Table is full',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/socket/handlers/joinRoom.test.js -- --testNamePattern="max_players_per_table"`

Expected: FAIL — check not implemented

- [ ] **Step 4: Implement max_players_per_table check in joinRoom handler**

Modify `server/socket/handlers/joinRoom.js`:

```javascript
const SettingsService = require('../../services/SettingsService');

module.exports = async (socket, data) => {
  const { tableId, playerId } = data;

  try {
    const table = SharedState.tables.get(tableId);
    if (!table) {
      return socket.emit('error', { message: 'Table not found' });
    }

    const gm = table.gm;

    // ADD THIS BLOCK (before gm.addPlayer):
    const limits = await SettingsService.getOrgSetting('org.platform_limits');
    const seated = gm.state.players.filter(p => !p.isCoach && !p.isSpectator).length;
    const maxPlayers = limits?.max_players_per_table ?? 9;

    if (seated >= maxPlayers) {
      return socket.emit('error', { message: 'Table is full' });
    }

    // Existing addPlayer logic
    gm.addPlayer({
      id: playerId,
      displayName: socket.data.displayName,
    });

    // ... rest of handler
  } catch (err) {
    socket.emit('error', { message: err.message });
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/__tests__/socket/handlers/joinRoom.test.js -- --testNamePattern="max_players_per_table"`

Expected: PASS

- [ ] **Step 6: Run full joinRoom tests to check regressions**

Run: `npm test -- server/__tests__/socket/handlers/joinRoom.test.js`

Expected: All tests pass, especially existing join tests

- [ ] **Step 7: Commit**

```bash
git add server/socket/handlers/joinRoom.js server/__tests__/socket/handlers/joinRoom.test.js
git commit -m "feat: enforce max_players_per_table limit at socket join"
```

---

## Task 10: Trial Constants — Replace Hardcoded with Org Settings

**Files:**
- Modify: `server/routes/auth.js:80-110` (POST /api/auth/register)
- Test: `server/__tests__/routes/auth.test.js`

- [ ] **Step 1: Locate hardcoded TRIAL_DAYS and TRIAL_HANDS in auth route**

Run: `grep -n "TRIAL_DAYS\|TRIAL_HANDS" server/routes/auth.js`

Expected: Find constant definitions and usage

- [ ] **Step 2: Write failing test for trial constants from org settings**

Update `server/__tests__/routes/auth.test.js`:

```javascript
describe('POST /api/auth/register — trial constants from org settings', () => {
  it('should use org settings trial_days and trial_hand_limit', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue({
      trial_days: 14,
      trial_hand_limit: 50,
    });

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'solo_student',
      })
      .expect(201);

    const user = await supabase.from('users').select('*').eq('id', res.body.id).single();

    const trialExpires = new Date(user.trial_expires_at).getTime();
    const now = Date.now();
    const expectedDays = 14 * 24 * 60 * 60 * 1000; // 14 days in ms
    const diff = trialExpires - now;

    expect(diff).toBeCloseTo(expectedDays, -4); // Within ~16 seconds
    expect(user.trial_hands_remaining).toBe(50);
  });

  it('should use fallback constants if org settings not available', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'solo_student',
      })
      .expect(201);

    const user = await supabase.from('users').select('*').eq('id', res.body.id).single();

    const trialExpires = new Date(user.trial_expires_at).getTime();
    const now = Date.now();
    const expectedDays = 7 * 24 * 60 * 60 * 1000; // 7 days fallback
    const diff = trialExpires - now;

    expect(diff).toBeCloseTo(expectedDays, -4);
    expect(user.trial_hands_remaining).toBe(20); // fallback
  });

  it('should log error and use fallback if org settings fetch fails', async () => {
    jest.spyOn(SettingsService, 'getOrgSetting').mockRejectedValue(new Error('DB error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test Student',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'solo_student',
      })
      .expect(201);

    expect(consoleSpy).toHaveBeenCalled();
    const user = await supabase.from('users').select('*').eq('id', res.body.id).single();
    expect(user.trial_hands_remaining).toBe(20); // fallback
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- server/__tests__/routes/auth.test.js -- --testNamePattern="trial constants"`

Expected: FAIL — fetch from org settings not implemented

- [ ] **Step 4: Implement trial constants fetch in POST /api/auth/register**

Modify `server/routes/auth.js`:

Find the POST /api/auth/register handler and locate where `trial_expires_at` and `trial_hands_remaining` are set:

```javascript
const SettingsService = require('../services/SettingsService');

// BEFORE:
// const TRIAL_DAYS = 7;
// const TRIAL_HANDS = 20;

router.post('/register', async (req, res) => {
  try {
    // ... existing validation ...

    // ADD THIS BLOCK:
    let trialDays = 7; // fallback
    let trialHandLimit = 20; // fallback

    try {
      const limits = await SettingsService.getOrgSetting('org.platform_limits');
      if (limits) {
        trialDays = limits.trial_days ?? 7;
        trialHandLimit = limits.trial_hand_limit ?? 20;
      }
    } catch (err) {
      console.error('Failed to fetch org trial limits, using fallback:', err);
      // Use fallback values already set
    }

    const now = new Date();
    const trialExpiresAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    // Create user with trial settings
    const user = await supabase
      .from('users')
      .insert({
        email: req.body.email,
        password_hash: hashedPassword,
        display_name: req.body.name,
        role: 'solo_student',
        trial_active: true,
        trial_expires_at: trialExpiresAt.toISOString(),
        trial_hands_remaining: trialHandLimit,
      })
      .select()
      .single();

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- server/__tests__/routes/auth.test.js -- --testNamePattern="trial constants"`

Expected: PASS

- [ ] **Step 6: Run full auth tests to check regressions**

Run: `npm test -- server/__tests__/routes/auth.test.js`

Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add server/routes/auth.js server/__tests__/routes/auth.test.js
git commit -m "feat: replace hardcoded trial constants with org settings (fallback to 7d/20h)"
```

---

## Summary of Tasks

| Task | What | Files | Complexity |
|------|------|-------|-----------|
| 1 | Leaderboard: /api/players returns config | players.js, SettingsService | Low |
| 2 | Leaderboard: dynamic sort + score | LeaderboardPage.jsx | Medium |
| 3 | GameManager: max_players state + seat respect | GameManager.js | Medium |
| 4 | AutoController: setBlinds → setBlindLevels | AutoController.js | Low |
| 5 | CreateTableModal: unified presets, max_players | CreateTableModal.jsx | High |
| 6 | StakingPage: pre-fill from school defaults | ContractModal.jsx | Medium |
| 7 | TableRepository: countActiveTablesByUser | TableRepository.js | Low |
| 8 | Platform limits: max_tables_per_student | tables.js | Medium |
| 9 | Platform limits: max_players_per_table | joinRoom.js | Medium |
| 10 | Trial constants from org settings | auth.js | Low |

---

## Regression Targets (Verification Checklist)

- Existing personal table presets still load correctly in CreateTableModal
- `coached_cash` tables still work (coach manually sets blinds via socket)
- `uncoached_cash` tables now correctly apply stored blinds (was broken, now fixed)
- Tournament blind preset system (`TournamentSetup.jsx`) untouched
- Trial registration still works when `org.platform_limits` is not set (uses 7d/20h fallback)
- Staking contract creation still works with no school settings (uses 50/carries/empty defaults)
- Table creation still works when `org.platform_limits` not set (fallback to 4)
- Position mapping unaffected (buildPositionMap uses seated.length)
- Replay/scenario loading unaffected (ReplayEngine never calls addPlayer/_nextAvailableSeat)
- Drill sessions unaffected (playlist code never calls addPlayer/_nextAvailableSeat)
- All server tests pass: `npm test` from `server/` directory
