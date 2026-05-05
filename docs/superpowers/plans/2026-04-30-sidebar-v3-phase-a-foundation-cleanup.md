# Sidebar v3 — Phase A: Foundation Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up sidebar v3 chrome, names, and disabled stubs. No new features, no schema changes, no server work — just rename, drop, retag, and wire two simple things (Tag Hand, action log) so v3 stops lying about its capabilities.

**Architecture:** Pure client-side edits to `client/src/components/sidebar-v3/`. Adapter (`buildLiveData.js`) gets two small additions (priority-chained `status` + `actions_log`). Existing socket events power Tag Hand. No new endpoints. No migrations.

**Tech Stack:** React + Vite + Tailwind + Vitest + React Testing Library. Existing test file conventions in `client/src/components/sidebar-v3/__tests__/`.

**Spec:** [docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md](../specs/2026-04-30-sidebar-v3-spec.md), Phase A in Section 10.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | Tab id rename, localStorage migration, status priority chain, drop subtitle map, drop drills footer, button copy renames |
| `client/src/components/sidebar-v3/shared.jsx` | Modify | TABS id rename, StatusPill +DRILL state, drop subtitle from `Head` |
| `client/src/components/sidebar-v3/buildLiveData.js` | Modify | Priority-chained `status`, `actions_log` field |
| `client/src/components/sidebar-v3/TabSettings.jsx` | Rename → `TabSetup.jsx` | Same file new name; segment drop Players; drop SB input |
| `client/src/components/sidebar-v3/TabSetup.jsx` | Modify (post-rename) | Cut Players sub-mode + drop SB input |
| `client/src/components/sidebar-v3/TabLive.jsx` | Modify | Drop +Bot card, drop ± Adjust + × Kick per-seat buttons; rename Action Feed → Action Log + wire to data.actions_log |
| `client/src/components/sidebar-v3/TabDrills.jsx` | Modify | Drop drill stats tiles; rename "Next Spot" → "Advance Drill" |
| `client/src/components/sidebar-v3/TabReview.jsx` | Modify | Rename "Save this hand to a drill" → "Save as Drill Hand" |
| `client/src/components/sidebar-v3/LiveConfigureHand.jsx` | Modify | Drop Hybrid mode option |
| `client/src/components/sidebar-v3/TabHistory.jsx` | Modify | Drop Players sub-view (V11) |
| `client/src/components/sidebar-v3/TagDialog.jsx` | Create | New tag-picker modal for E1 (current hand only) |
| `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx` | Rename + modify | Same tests, new file name; drop Players-tab tests; drop SB-input tests |
| `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` | Create | Tab id migration; status priority chain; footer copy; drills footer absent; Tag Hand opens dialog |
| `client/src/components/sidebar-v3/__tests__/TagDialog.test.jsx` | Create | Renders existing tags, toggles, custom tag add, emits `coach:update_hand_tags` |
| `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js` | Modify | Status priority chain; actions_log surfaced |
| `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx` | Create | Asserts +Bot/Adjust/Kick buttons absent on per-seat row; Action Log renders rows when data.actions_log non-empty |

---

## Task 1: Rename tab id `settings` → `setup` (TABS constant)

**Files:**
- Modify: `client/src/components/sidebar-v3/shared.jsx` (TABS array, line 92–98)
- Test: `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` (new file)

- [ ] **Step 1.1: Create new test file with failing test**

Write `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarV3 from '../Sidebar.jsx';

const baseData = {
  gameState: { phase: 'waiting', paused: false, is_scenario: false, hand_id: null, actions: [] },
  blindLevels: { current: { sb: 10, bb: 20, ante: 0 }, presets: [] },
  seatConfig: { maxSeats: 9, seats: Array.from({ length: 9 }, (_, i) => ({ seat: i, player: null })) },
  players: [],
  session: { hands: 0 },
  review: { loaded: false, handId: null, cursor: -1, totalActions: 0, branched: false, board: [] },
  playlists: [],
  drillSession: { active: false },
  status: 'live',
  actions_log: [],
};

describe('SidebarV3 — TABS', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });

  it('renders the Setup tab with id "setup"', () => {
    render(<SidebarV3 data={baseData} />);
    const setupTab = screen.getByText('Setup');
    fireEvent.click(setupTab);
    expect(localStorage.getItem('fs.sb3.tab')).toBe('setup');
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: FAIL — `localStorage.getItem('fs.sb3.tab')` returns `'settings'`, not `'setup'`.

- [ ] **Step 1.3: Update TABS array in shared.jsx**

Edit `client/src/components/sidebar-v3/shared.jsx` lines 92–98. Change the last entry's id:

```jsx
const TABS = [
  { id: 'live',     label: 'Live' },
  { id: 'drills',   label: 'Drills' },
  { id: 'history',  label: 'History' },
  { id: 'review',   label: 'Review' },
  { id: 'setup',    label: 'Setup' },
];
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: PASS.

- [ ] **Step 1.5: Commit**

```bash
git add client/src/components/sidebar-v3/shared.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): rename Setup tab id from 'settings' to 'setup'

Tab id mismatched the user-facing label ('Setup'). Aligns code-id with
display copy. Spec T5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: localStorage migration for stale `'settings'` value

**Files:**
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (lines 12–19)
- Test: `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`

- [ ] **Step 2.1: Add failing test for localStorage migration**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` inside `describe('SidebarV3 — TABS', ...)`:

```jsx
  it('migrates legacy localStorage value "settings" to "setup" on mount', () => {
    localStorage.setItem('fs.sb3.tab', 'settings');
    render(<SidebarV3 data={baseData} />);
    expect(localStorage.getItem('fs.sb3.tab')).toBe('setup');
  });

  it('treats no localStorage value as initialTab', () => {
    localStorage.removeItem('fs.sb3.tab');
    render(<SidebarV3 data={baseData} initialTab="drills" />);
    // does NOT auto-write — only on user click
    expect(localStorage.getItem('fs.sb3.tab')).toBeNull();
  });
```

- [ ] **Step 2.2: Run test to verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: FAIL — first new test fails because legacy `'settings'` is preserved.

- [ ] **Step 2.3: Add migration in Sidebar.jsx**

Edit `client/src/components/sidebar-v3/Sidebar.jsx` lines 12–19. Replace with:

```jsx
  const [tab, setTab] = useState(() => {
    try {
      const stored = localStorage.getItem('fs.sb3.tab');
      // One-shot migration: legacy 'settings' value becomes 'setup'
      if (stored === 'settings') {
        try { localStorage.setItem('fs.sb3.tab', 'setup'); } catch { /* ignore */ }
        return 'setup';
      }
      return stored || initialTab;
    } catch {
      return initialTab;
    }
  });
  function setAndPersist(t) {
    try { localStorage.setItem('fs.sb3.tab', t); } catch { /* ignore */ }
    setTab(t);
  }
```

- [ ] **Step 2.4: Run tests, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: PASS for all three tests in this `describe`.

- [ ] **Step 2.5: Commit**

```bash
git add client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): migrate localStorage tab value 'settings' -> 'setup'

One-shot migration on mount. Existing coach sessions preserve their tab
selection across the rename. Spec T5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Rename `TabSettings.jsx` → `TabSetup.jsx`

**Files:**
- Rename: `client/src/components/sidebar-v3/TabSettings.jsx` → `TabSetup.jsx`
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (line 8 — import)
- Rename: `client/src/components/sidebar-v3/__tests__/TabSettings.test.jsx` → `TabSetup.test.jsx`
- Modify: `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx` (line 4 — import)

- [ ] **Step 3.1: Rename source file**

```bash
git mv client/src/components/sidebar-v3/TabSettings.jsx \
       client/src/components/sidebar-v3/TabSetup.jsx
```

- [ ] **Step 3.2: Update import in Sidebar.jsx**

Edit `client/src/components/sidebar-v3/Sidebar.jsx` line 8:

```jsx
// before
import TabSettings from './TabSettings.jsx';
// after
import TabSetup from './TabSetup.jsx';
```

Also update any usage in the same file (search for `TabSettings`) — wherever it's referenced as a component, replace with `TabSetup`.

- [ ] **Step 3.3: Rename test file**

```bash
git mv client/src/components/sidebar-v3/__tests__/TabSettings.test.jsx \
       client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx
```

- [ ] **Step 3.4: Update import + describe label in test**

Edit `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx`:

```jsx
// line 4
import TabSetup from '../TabSetup.jsx';
```

Replace every `TabSettings` reference in that file (component usages, describe labels) with `TabSetup`. Search-and-replace.

- [ ] **Step 3.5: Run all sidebar-v3 tests, verify still passing**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: all existing tests still pass.

- [ ] **Step 3.6: Commit**

```bash
git add client/src/components/sidebar-v3/TabSetup.jsx \
        client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): rename TabSettings.jsx to TabSetup.jsx

File name now matches the tab label and the (newly migrated) tab id.
Pure rename — no behavior change. Spec T5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Drop `header.subtitle`

**Files:**
- Modify: `client/src/components/sidebar-v3/shared.jsx` (Head, lines 80–90)
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (subtitle map lines 38–49 + Head invocation)
- Test: `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`

- [ ] **Step 4.1: Add failing test**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — Header', () => {
  it('does not render any subtitle text below the FeltSide logo', () => {
    const { container } = render(<SidebarV3 data={baseData} />);
    // .sb-logo wraps logo + (optional) <small>{subtitle}</small>
    const logo = container.querySelector('.sb-logo');
    expect(logo).toBeInTheDocument();
    expect(logo.querySelector('small')).toBeNull();
  });
});
```

- [ ] **Step 4.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: FAIL — `<small>` element exists with subtitle text.

- [ ] **Step 4.3: Update Head component**

Edit `client/src/components/sidebar-v3/shared.jsx` lines 80–90:

```jsx
export function Head({ status }) {
  return (
    <div className="sb-head">
      <div className="sb-logo">
        FeltSide
      </div>
      <StatusPill state={status} />
    </div>
  );
}
```

- [ ] **Step 4.4: Drop subtitle map + arg in Sidebar.jsx**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`. Remove the entire subtitle declaration (lines 38–49 in original — `reviewSubtitle` and the `subtitle` map). Also find the `<Head ... subtitle={subtitle} />` invocation in the JSX render and remove the `subtitle={subtitle}` prop. Result invocation should look like:

```jsx
<Head status={status} />
```

- [ ] **Step 4.5: Run tests, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add client/src/components/sidebar-v3/shared.jsx \
        client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): drop header subtitle

Tab name is already shown in the active pill in the tab bar; the
subtitle was visual noise. Header is now logo + status pill only. Spec X3.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Status pill — add DRILL state + priority chain

**Files:**
- Modify: `client/src/components/sidebar-v3/shared.jsx` (StatusPill, lines 27–41)
- Modify: `client/src/components/sidebar-v3/buildLiveData.js` (compute `status`)
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (use `data.status` instead of local computation)
- Test: `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`

- [ ] **Step 5.1: Failing test for priority chain**

Append to `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`:

```jsx
import { describe, it, expect } from 'vitest';
import { buildLiveData } from '../buildLiveData.js';

describe('buildLiveData — status priority chain', () => {
  function input({ paused = false, replayActive = false, drillActive = false, scenario = false } = {}) {
    return {
      hookState: {
        gameState: { phase: 'waiting', paused, is_scenario: scenario, hand_id: null, actions: [] },
        actionTimer: { secondsLeft: 0, totalSeconds: 0 },
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: replayActive, handId: null, cursor: -1, totalActions: 0, branched: false, board: [] },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: drillActive ? { playlistId: 'pl1', currentSpot: null, handsTotal: 0, handsDone: 0, results: { correct: 0, mistake: 0, uncertain: 0 } } : null },
    };
  }

  it('returns "live" when nothing else is true', () => {
    expect(buildLiveData(input()).status).toBe('live');
  });
  it('"paused" wins over "live"', () => {
    expect(buildLiveData(input({ paused: true })).status).toBe('paused');
  });
  it('"scenario" wins over "paused" and "live"', () => {
    expect(buildLiveData(input({ paused: true, scenario: true })).status).toBe('scenario');
  });
  it('"drill" wins over "scenario", "paused", "live"', () => {
    expect(buildLiveData(input({ drillActive: true, scenario: true, paused: true })).status).toBe('drill');
  });
  it('"review" wins over everything', () => {
    expect(buildLiveData(input({ replayActive: true, drillActive: true, scenario: true, paused: true })).status).toBe('review');
  });
});
```

- [ ] **Step 5.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: FAIL — `data.status` is undefined or wrong order.

- [ ] **Step 5.3: Add status computation to buildLiveData**

Edit `client/src/components/sidebar-v3/buildLiveData.js`. Inside the function, just before `return { ...fallback, ... }`, compute status:

```js
  // Status priority chain: review > drill > scenario > paused > live.
  // Spec section 3.3 / 5.3.
  const replayActive = !!hookState.replayState?.active;
  const drillActive  = !!playlist?.active;
  const scenarioOn   = !!hookState.gameState?.is_scenario;
  const isPaused     = !!hookState.gameState?.paused;
  let status = 'live';
  if      (replayActive) status = 'review';
  else if (drillActive)  status = 'drill';
  else if (scenarioOn)   status = 'scenario';
  else if (isPaused)     status = 'paused';
```

Then add `status` to the returned object:

```js
  return {
    ...fallback,
    status,
    // ...rest of existing fields
  };
```

- [ ] **Step 5.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: PASS for all 5 priority cases.

- [ ] **Step 5.5: Failing test for DRILL pill render**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — StatusPill', () => {
  it('renders DRILL state with correct label', () => {
    const drillData = { ...baseData, status: 'drill' };
    render(<SidebarV3 data={drillData} />);
    expect(screen.getByText('DRILL')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5.6: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: FAIL — DRILL label not rendered (StatusPill map has no `drill` key, falls back to LIVE).

- [ ] **Step 5.7: Add DRILL state to StatusPill**

Edit `client/src/components/sidebar-v3/shared.jsx` lines 27–41. Add `drill` to the map:

```jsx
export function StatusPill({ state }) {
  const map = {
    live:     { color: '#4ad991', label: 'LIVE' },
    paused:   { color: '#f5b25b', label: 'PAUSED' },
    scenario: { color: '#9b7cff', label: 'SCENARIO' },
    review:   { color: '#6aa8ff', label: 'REVIEW' },
    drill:    { color: '#e8c84a', label: 'DRILL' },
  };
  const { color, label } = map[state] || map.live;
  return (
    <div className="sb-status" style={{ color }}>
      <span className="dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}
```

- [ ] **Step 5.8: Replace local status calc in Sidebar.jsx with `data.status`**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`. Remove lines 33–36 (the local `let status = ...` block):

```jsx
// REMOVE these lines:
let status = 'live';
if (paused) status = 'paused';
else if (tab === 'review') status = 'review';
else if (data.gameState.is_scenario) status = 'scenario';
```

Then where `<Head status={status} />` is rendered, change to:

```jsx
<Head status={data.status || 'live'} />
```

- [ ] **Step 5.9: Run all sidebar-v3 tests**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: all green.

- [ ] **Step 5.10: Commit**

```bash
git add client/src/components/sidebar-v3/shared.jsx \
        client/src/components/sidebar-v3/buildLiveData.js \
        client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/buildLiveData.test.js \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): add DRILL status pill and priority-chained status

Status pill priority: review > drill > scenario > paused > live.
Computed once in buildLiveData and consumed via data.status — Sidebar
no longer derives status itself. Spec S5, 3.3.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire `live.action_log_card` to `gameState.actions`

**Files:**
- Modify: `client/src/components/sidebar-v3/buildLiveData.js`
- Modify: `client/src/components/sidebar-v3/TabLive.jsx` (lines 104–132 — Action Feed card)
- Test: `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`
- Test: `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx` (new file)

- [ ] **Step 6.1: Failing adapter test**

Append to `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`:

```jsx
describe('buildLiveData — actions_log', () => {
  it('returns empty array when gameState has no actions', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'waiting', paused: false, is_scenario: false, hand_id: null, actions: [] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.actions_log).toEqual([]);
  });

  it('maps gameState.actions into actions_log shape (newest first)', () => {
    const actions = [
      { street: 'preflop', player_id: 'p1', player: 'Alice', action: 'call', amount: 20 },
      { street: 'preflop', player_id: 'p2', player: 'Bob',   action: 'raise', amount: 60 },
      { street: 'flop',    player_id: 'p1', player: 'Alice', action: 'check' },
    ];
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'flop', paused: false, is_scenario: false, hand_id: 'h1', actions },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    // Newest first, so flop check is index 0
    expect(out.actions_log[0]).toMatchObject({ street: 'flop', who: 'Alice', act: 'check' });
    expect(out.actions_log[1]).toMatchObject({ street: 'preflop', who: 'Bob', act: 'raise', amt: 60 });
    expect(out.actions_log).toHaveLength(3);
  });
});
```

- [ ] **Step 6.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: FAIL — `actions_log` undefined.

- [ ] **Step 6.3: Add actions_log mapping to buildLiveData**

Edit `client/src/components/sidebar-v3/buildLiveData.js`. Inside the function, after the status block:

```js
  // actions_log: newest action first; powers live.action_log_card.
  // Spec section 4.1, 7.5.
  const rawActions = Array.isArray(hookState.gameState?.actions) ? hookState.gameState.actions : [];
  const actions_log = [...rawActions].reverse().map((a) => ({
    street:  a.street ?? 'preflop',
    who:     a.player ?? a.player_name ?? (a.player_id ? String(a.player_id).slice(0, 6) : '—'),
    act:     a.action ?? a.act ?? '—',
    amt:     a.amount ?? null,
    pending: !!a.pending,
  }));
```

Add `actions_log` to the returned object:

```js
  return {
    ...fallback,
    status,
    actions_log,
    // ...rest
  };
```

- [ ] **Step 6.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: PASS.

- [ ] **Step 6.5: Failing test for TabLive Action Log render**

Create `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabLive from '../TabLive.jsx';

function liveData(overrides = {}) {
  return {
    gameState: { phase: 'waiting', paused: false, hand_id: null },
    actionTimer: { secondsLeft: 0, totalSeconds: 0 },
    equityData: { showToPlayers: false, players: {} },
    myId: 'me',
    seatConfig: { maxSeats: 9, seats: Array.from({ length: 9 }, (_, i) => ({ seat: i, player: null })) },
    players: [],
    blindLevels: { current: { sb: 10, bb: 20 }, presets: [] },
    review: { loaded: false },
    actions_log: [],
    ...overrides,
  };
}

const noopEmit = {
  togglePause: vi.fn(), startConfiguredHand: vi.fn(),
  setPlayerInHand: vi.fn(), coachAddBot: vi.fn(),
  coachKickPlayer: vi.fn(), updateHandConfig: vi.fn(),
};

describe('TabLive — Action Log', () => {
  it('renders the section title "Action Log" (renamed from Action Feed)', () => {
    render(<TabLive data={liveData()} emit={noopEmit} />);
    expect(screen.getByText('Action Log')).toBeInTheDocument();
  });

  it('renders rows from actions_log', () => {
    const actions_log = [
      { street: 'flop', who: 'Alice', act: 'check', amt: null, pending: false },
      { street: 'preflop', who: 'Bob', act: 'raise', amt: 60, pending: false },
    ];
    render(<TabLive data={liveData({ actions_log })} emit={noopEmit} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/raise/i)).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('does NOT render the "phase 2" placeholder copy', () => {
    render(<TabLive data={liveData()} emit={noopEmit} />);
    expect(screen.queryByText(/Live action feed wires up in Phase 2/i)).toBeNull();
  });
});
```

- [ ] **Step 6.6: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: FAIL — title is "Action Feed" + "phase 2" placeholder still present.

- [ ] **Step 6.7: Update TabLive Action Log card**

Edit `client/src/components/sidebar-v3/TabLive.jsx` lines 104–132. Replace the entire `<div className="card" ...>` (Action Feed card) with:

```jsx
<div className="card" style={{ flex: 1, minHeight: 180 }}>
  <div className="card-head">
    <div className="card-title">Action Log</div>
    <div className="card-kicker">{(data.actions_log?.length || 0) + ' rows'}</div>
  </div>
  {(!data.actions_log || data.actions_log.length === 0) ? (
    <div style={{
      fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center',
      padding: '18px 8px', lineHeight: 1.5,
    }}>
      No actions yet — the log fills as the hand plays.
    </div>
  ) : (
    <div>
      {data.actions_log.map((row, i) => (
        <div key={i} className="feed-row">
          <span className="feed-phase">
            {({ preflop: 'PRE', flop: 'FLOP', turn: 'TURN', river: 'RIV', showdown: 'SD' })[row.street] || (row.street || '').slice(0, 3).toUpperCase()}
          </span>
          <span className="feed-text">
            <b>{row.who}</b> {row.act}
            {row.pending && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 10, letterSpacing: '0.1em' }}>· pending</span>}
          </span>
          <span className="feed-amt">{row.amt != null ? row.amt : ''}</span>
        </div>
      ))}
    </div>
  )}
</div>
```

Also: scan the same file for any remaining `feed` variable name from the old code (was `const feed = ...`). Replace its usages with `data.actions_log` or remove the old variable declaration if it became dead.

- [ ] **Step 6.8: Run TabLive tests, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: PASS.

- [ ] **Step 6.9: Commit**

```bash
git add client/src/components/sidebar-v3/buildLiveData.js \
        client/src/components/sidebar-v3/TabLive.jsx \
        client/src/components/sidebar-v3/__tests__/buildLiveData.test.js \
        client/src/components/sidebar-v3/__tests__/TabLive.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): wire live action log to gameState.actions

Replaces the Phase-2 placeholder copy with a real log fed from the
adapter. Newest action first. Spec section 4.1 (block restored, X4
reverted to KEEP) + 7.5 (adapter shape).

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Cut Hybrid mode option (V1)

**Files:**
- Modify: `client/src/components/sidebar-v3/LiveConfigureHand.jsx` (lines 211–227)
- Test: integrated into `TabLive.test.jsx` is too brittle; assert via direct `LiveConfigureHand` test instead

- [ ] **Step 7.1: Failing test**

Create `client/src/components/sidebar-v3/__tests__/LiveConfigureHand.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveConfigureHand from '../LiveConfigureHand.jsx';

const baseData = {
  gameState: { phase: 'waiting', hand_id: null },
  players: [],
  seatConfig: { maxSeats: 9, seats: [] },
  blindLevels: { current: { sb: 10, bb: 20 } },
};

describe('LiveConfigureHand — mode segment', () => {
  it('exposes only RNG and Manual modes (Hybrid removed)', () => {
    render(<LiveConfigureHand data={baseData} emit={{ updateHandConfig: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'RNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hybrid' })).toBeNull();
  });
});
```

- [ ] **Step 7.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/LiveConfigureHand.test.jsx`
Expected: FAIL — Hybrid button still rendered.

- [ ] **Step 7.3: Drop Hybrid from segment**

Edit `client/src/components/sidebar-v3/LiveConfigureHand.jsx` lines 211–227. Replace with:

```jsx
<div style={{ marginBottom: 10 }}>
  <Segmented
    cols={2}
    options={[
      { value: 'rng',    label: 'RNG' },
      { value: 'manual', label: 'Manual' },
    ]}
    value={mode === 'hybrid' ? 'rng' : mode}
    onChange={setMode}
  />
  <div style={{ fontSize: 10, color: 'var(--ink-faint)', marginTop: 5, lineHeight: 1.4 }}>
    {mode === 'rng' && 'All cards dealt randomly — overrides ignored.'}
    {(mode === 'manual' || mode === 'hybrid') && 'Cards & textures you set are honored; rest stay random.'}
  </div>
</div>
```

The `value={mode === 'hybrid' ? 'rng' : mode}` covers any persisted `'hybrid'` value — gracefully degrades to RNG.

- [ ] **Step 7.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/LiveConfigureHand.test.jsx`
Expected: PASS.

- [ ] **Step 7.5: Commit**

```bash
git add client/src/components/sidebar-v3/LiveConfigureHand.jsx \
        client/src/components/sidebar-v3/__tests__/LiveConfigureHand.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): drop Hybrid mode option (redundant with Manual)

Any unset card in Manual mode already falls back to RNG, which is
exactly what Hybrid promised. Two options are clearer than three.
Persisted 'hybrid' value gracefully degrades to RNG. Spec V1.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Cut Players sub-mode in TabHistory (V11)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabHistory.jsx` (lines 60–75 + PlayersHistoryView component lines 151–202)
- Test: TabHistory test (create new file)

- [ ] **Step 8.1: Failing test**

Create `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabHistory from '../TabHistory.jsx';

const data = {
  history: [],
  session: { hands: 0 },
};

describe('TabHistory — Players sub-mode (removed)', () => {
  it('does not render Players segment toggle', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Players' })).toBeNull();
  });

  it('does not render the "Table" segment toggle either (single mode now)', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    // Now only the Table view renders, no segment selector
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });
});
```

- [ ] **Step 8.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabHistory.test.jsx`
Expected: FAIL.

- [ ] **Step 8.3: Drop the segment + Players branch**

Edit `client/src/components/sidebar-v3/TabHistory.jsx`. Replace lines 60–75 (the segment + conditional render) with the always-table render:

```jsx
<TableHistoryView data={tabData} loading={loading} isLive={!!liveHistory} onLoadReview={onLoadReview} />
```

Remove the surrounding `{showPlayersTab && ... }` block and the `view`/`setView` state if they become unused. Also delete the entire `function PlayersHistoryView(...) { ... }` (originally lines 151–202) and remove its import line if any.

Search the file for any remaining `view` / `setView` / `showPlayersTab` references and remove them.

- [ ] **Step 8.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabHistory.test.jsx`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabHistory.jsx \
        client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): cut History Players sub-mode (V11)

Players sub-mode was hidden in live mode anyway; the only data it
showed came from fixtures. Live coaches saw nothing useful.
Single Table view from now on. Spec V11.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Cut drill stats tiles (V15)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabDrills.jsx` (lines 363–379 — the stats tiles + progress bar)
- Test: `client/src/components/sidebar-v3/__tests__/TabDrills.test.jsx` (new file)

- [ ] **Step 9.1: Failing test**

Create `client/src/components/sidebar-v3/__tests__/TabDrills.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabDrills from '../TabDrills.jsx';

const activeDrillData = {
  playlists: [{ id: 'pl1', name: 'Bluff catching', count: 5, description: '' }],
  drillSession: {
    active: true,
    playlistId: 'pl1',
    scenarioName: 'AKo OOP',
    currentSpot: 'flop · 7s 7d 2c',
    handsDone: 2, handsTotal: 5,
    results: { correct: 1, mistake: 1, uncertain: 0 },
  },
};

describe('TabDrills — stats tiles (removed)', () => {
  it('does not render Correct/Mistake/Unsure tiles in active session', () => {
    render(<TabDrills data={activeDrillData} emit={{ deactivatePlaylist: vi.fn() }} />);
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Mistake')).toBeNull();
    expect(screen.queryByText('Unsure')).toBeNull();
  });
});
```

- [ ] **Step 9.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabDrills.test.jsx`
Expected: FAIL — tiles rendered.

- [ ] **Step 9.3: Remove the stats block**

Edit `client/src/components/sidebar-v3/TabDrills.jsx` lines 363–379. Delete the entire block (the progress bar + the 3-column stat grid). Also remove any local variables that become dead (e.g., `correct`, `mistake`, `uncertain`, `total` — search for their declarations and remove if unused).

- [ ] **Step 9.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabDrills.test.jsx`
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabDrills.jsx \
        client/src/components/sidebar-v3/__tests__/TabDrills.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): drop drill stats tiles (V15)

Tiles displayed zeros because the server has no results store.
Better to remove than mislead — re-add when the data exists.
Spec V15.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Cut separate SB input (V14)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabSetup.jsx` (BlindsSection, lines 28–114 in original `TabSettings.jsx`)
- Modify: `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx` (drop SB-input tests, add BB-only test)

- [ ] **Step 10.1: Failing test for BB-only UX**

Edit `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx`. Replace the existing `describe('TabSettings — Blinds', ...)` block contents with:

```jsx
describe('TabSetup — Blinds', () => {
  it('shows only one numeric input (BB), with SB derived as BB/2', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(1);
  });

  it('Apply emits setBlindLevels(bb/2, bb) using BB only', () => {
    const emit = makeEmit();
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={emit} />);
    const bbInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(bbInput, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply 25\/50/i }));
    expect(emit.setBlindLevels).toHaveBeenCalledWith(25, 50);
  });

  it('Apply is disabled when BB is invalid (non-positive integer)', () => {
    render(<TabSetup data={makeData({ sb: 10, bb: 20 })} emit={makeEmit()} />);
    const bbInput = screen.getAllByRole('spinbutton')[0];
    fireEvent.change(bbInput, { target: { value: '0' } });
    expect(screen.getByText(/BB must be a positive integer/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabSetup.test.jsx`
Expected: FAIL — there are still 2 inputs.

- [ ] **Step 10.3: Replace BlindsSection with BB-only**

Edit `client/src/components/sidebar-v3/TabSetup.jsx` (originally `TabSettings.jsx`) — replace the entire `BlindsSection` function with:

```jsx
function BlindsSection({ data, emit }) {
  const liveBb = data.blindLevels.current.bb;
  const [bb, setBb] = useState(liveBb);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setBb(liveBb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBb]);

  const sb = Math.max(1, Math.floor(bb / 2));
  const dirty = bb !== liveBb;
  const valid = Number.isInteger(bb) && bb > 1;

  function applyBlinds() {
    if (!emit?.setBlindLevels || !valid || !dirty) return;
    emit.setBlindLevels(sb, bb);
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Current Level</div>
          <div className="card-kicker">SB / BB (auto)</div>
        </div>
        <div>
          <span className="lbl">Big Blind</span>
          <input
            className="field"
            type="number"
            value={bb}
            onChange={(e) => setBb(parseInt(e.target.value, 10) || 0)}
            min={2}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginTop: 4 }}>
            SB auto-set to {sb}
          </div>
        </div>
        {dirty && !valid && (
          <div style={{ fontSize: 10, color: 'var(--bad)', marginTop: 6 }}>
            BB must be a positive integer greater than 1.
          </div>
        )}
        <button
          className="btn primary full"
          style={{ marginTop: 10 }}
          onClick={applyBlinds}
          disabled={!emit?.setBlindLevels || !dirty || !valid}
        >
          {applied ? '✓ Applied' : dirty ? `Apply ${sb}/${bb}` : 'Already current'}
        </button>
      </div>
```

(Continue with the existing presets section after this — leave that part untouched.)

- [ ] **Step 10.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabSetup.test.jsx`
Expected: PASS for the 3 new Blinds tests.

- [ ] **Step 10.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabSetup.jsx \
        client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): drop separate SB input, auto-derive as BB/2

Cash games use SB = BB/2 universally. The separate SB input added a
decision burden with no real-world value. Server still receives both
values via setBlindLevels(sb, bb). Spec V14.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Cut Players sub-mode in TabSetup (V12 cascade)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabSetup.jsx` (Segmented options at original lines 9–18; PlayersSection function at original lines 253–346)
- Modify: `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx`

- [ ] **Step 11.1: Failing test**

Append to `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx`:

```jsx
describe('TabSetup — sub-mode segment', () => {
  it('exposes only Blinds and Seats sub-modes (Players removed)', () => {
    render(<TabSetup data={makeData()} emit={makeEmit()} />);
    expect(screen.getByRole('button', { name: 'Blinds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seats' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Players' })).toBeNull();
  });
});
```

- [ ] **Step 11.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabSetup.test.jsx`
Expected: FAIL.

- [ ] **Step 11.3: Drop Players sub-mode**

Edit `client/src/components/sidebar-v3/TabSetup.jsx`. Find the `Segmented` configuration (lines 9–18 in original) and remove the `players` option:

```jsx
<Segmented
  cols={2}
  options={[
    { value: 'blinds', label: 'Blinds' },
    { value: 'seats',  label: 'Seats' },
  ]}
  value={section}
  onChange={setSection}
/>
```

Also delete the entire `function PlayersSection(...) { ... }` (originally lines 253–346) and the conditional render that mounts it (search for `section === 'players'` and remove that branch).

If `useState` initial value is `'players'`, change to `'blinds'`. Search the file for stale references (e.g., `setSection('players')`) and remove.

- [ ] **Step 11.4: Run all TabSetup tests, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabSetup.test.jsx`
Expected: PASS. Existing Players tests in this file may fail — DELETE those test blocks (the `describe('TabSetup — Players', ...)` block if present in the rename).

- [ ] **Step 11.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabSetup.jsx \
        client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): drop Setup Players sub-mode (V12 cascade)

Setup tab now has Blinds and Seats only. Players sub-mode was a
separate-but-redundant view of the same data; Seats is the canonical
home for sit/kick/adjust/add-bot. Phase D will refine Seats further.
Spec V12.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Remove Live `seats_card` stubs (D2/D3/D4 → setup-only)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabLive.jsx` (lines 162–189 — +Bot picker; lines 216–225 — per-seat ± / × buttons)
- Modify: `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx`

- [ ] **Step 12.1: Failing test**

Append to `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx`:

```jsx
describe('TabLive — seat-card buttons (Setup-only verbs removed)', () => {
  function withSeat(overrides = {}) {
    return liveData({
      seatConfig: {
        maxSeats: 9,
        seats: [
          { seat: 0, playerId: 'p1', player: 'Alice', stack: 1000, status: 'active', isHero: false, isBot: false },
          ...Array.from({ length: 8 }, (_, i) => ({ seat: i + 1, player: null })),
        ],
      },
      ...overrides,
    });
  }

  it('does NOT render the +Bot button on Live tab', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    expect(screen.queryByRole('button', { name: /\+ Bot$/ })).toBeNull();
  });

  it('does NOT render the per-seat Adjust (±) button', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    expect(screen.queryByRole('button', { name: /Adjust stack/i })).toBeNull();
  });

  it('does NOT render the per-seat Kick (×) button', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    expect(screen.queryByRole('button', { name: /Kick player/i })).toBeNull();
  });

  it('still renders the Sit-out / Sit-in toggle', () => {
    render(<TabLive data={withSeat()} emit={noopEmit} />);
    // Title is "Sit out" when player is active
    expect(screen.getByRole('button', { name: /Sit (in|out)/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 12.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: FAIL — buttons present.

- [ ] **Step 12.3: Drop +Bot card from TabLive**

Edit `client/src/components/sidebar-v3/TabLive.jsx`. Find the entire card-kicker block containing `+ Bot` (originally lines 165–174) and remove the `<span style={{ marginLeft: 8 }}>...</span>` wrapper that contains the `+ Bot` button. The kicker should now only display `{filled.length}/{data.seatConfig.maxSeats} seats`:

```jsx
<div className="card-kicker">
  {filled.length}/{data.seatConfig.maxSeats} seats
</div>
```

Then remove the entire `{showAddBotPicker && (...)} ` block (originally lines 175–189). Also remove `useState` for `showAddBotPicker` and `addBotDifficulty`, and the `onAddBot` callback if it's only used here. Search the file for any remaining references and clean up.

- [ ] **Step 12.4: Drop ± Adjust and × Kick from per-seat row**

In the same file, find the per-seat row (originally lines 216–225) — the `<div style={{ display: 'flex', gap: 3 }}>` containing 3 `<SeatBtn>` elements. Replace with only the sit-out toggle:

```jsx
<div style={{ display: 'flex', gap: 3 }}>
  <SeatBtn title={sitting ? 'Sit in' : 'Sit out'} onClick={() => onToggleSitout(s)}>
    {sitting ? '▶' : '❚❚'}
  </SeatBtn>
</div>
```

Also remove `onKick` callback if it's only used here.

- [ ] **Step 12.5: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: PASS.

- [ ] **Step 12.6: Commit**

```bash
git add client/src/components/sidebar-v3/TabLive.jsx \
        client/src/components/sidebar-v3/__tests__/TabLive.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): remove Setup-only verbs from Live seats card

Live tab is now read-mostly for seats. Add-bot, kick, and adjust-stack
all live in Setup. Sit-out toggle stays — coaches use it constantly
during the hand. Spec D2/D3/D4 + section 4.1.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update button copy (C1, C2, C3, C5, C6, C7)

**Files:**
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (footer renders, lines 51–125)
- Modify: `client/src/components/sidebar-v3/TabReview.jsx` (line ~365 — Save Branch button copy)
- Modify: `client/src/components/sidebar-v3/TabDrills.jsx` (Next Spot → Advance Drill — find via search)
- Test: extend `Sidebar.test.jsx` and `TabReview.test.jsx` (create if missing)

- [ ] **Step 13.1: Failing test for Sidebar footer copy**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — footer copy', () => {
  it('Live footer says "Deal Next Hand →" (C1)', () => {
    const data = { ...baseData, gameState: { ...baseData.gameState, phase: 'waiting' } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /Deal Next Hand →/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next Hand →$/ })).toBeNull();
  });

  it('History footer says "Open in Review →" (C5)', () => {
    render(<SidebarV3 data={baseData} initialTab="history" />);
    expect(screen.getByRole('button', { name: /Open in Review →/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review Selected →/ })).toBeNull();
  });

  it('Review footer shows "← Back" and "Back to Live" (C6, C7)', () => {
    render(<SidebarV3 data={baseData} initialTab="review" />);
    expect(screen.getByRole('button', { name: /← Back$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Live/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exit Replay → Live/ })).toBeNull();
  });
});
```

- [ ] **Step 13.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: 3 new tests fail.

- [ ] **Step 13.3: Update Sidebar.jsx footer copy**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`. In the `Foot` function:

- Live tab footer — change `Next Hand →` to `Deal Next Hand →`:
  ```jsx
  >Deal Next Hand →</button>
  ```

- History tab footer — change `Review Selected →` to `Open in Review →`:
  ```jsx
  >Open in Review →</button>
  ```

- Review tab footer — change `← History` to `← Back`:
  ```jsx
  >← Back</button>
  ```
  And change `Exit Replay → Live` to `Back to Live`:
  ```jsx
  >Back to Live</button>
  ```

- [ ] **Step 13.4: Update TabReview Save Branch copy (C3)**

Edit `client/src/components/sidebar-v3/TabReview.jsx`. Find:

```jsx
>Save this hand to a drill</button>
```

Replace with:

```jsx
>Save as Drill Hand</button>
```

- [ ] **Step 13.5: Update TabDrills Next Spot copy (C2)**

Search `client/src/components/sidebar-v3/TabDrills.jsx` for `Next Spot` — change to `Advance Drill`. (Title attribute can stay as-is or echo the same string.)

- [ ] **Step 13.6: Run all sidebar-v3 tests**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: green.

- [ ] **Step 13.7: Commit**

```bash
git add client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/TabReview.jsx \
        client/src/components/sidebar-v3/TabDrills.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): update button copy per spec (C1, C2, C3, C5, C6, C7)

- Next Hand → Deal Next Hand (distinguishes from drill spot)
- Next Spot → Advance Drill (matches user vocab)
- Save this hand to a drill → Save as Drill Hand (shorter)
- Review Selected → Open in Review (clearer verb)
- ← History → ← Back (unambiguous)
- Exit Replay → Live → Back to Live (shorter)

Other copy renames (C8, C9, C11) ship in later phases when their
features land. Spec section 2.3.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Drop Drills tab footer (E3 + E4 → footer removed entirely)

**Files:**
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (Foot function, drills branch)
- Test: `Sidebar.test.jsx`

- [ ] **Step 14.1: Failing test**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — Drills footer removed', () => {
  it('Drills tab has no Clear button', () => {
    render(<SidebarV3 data={baseData} initialTab="drills" />);
    expect(screen.queryByRole('button', { name: /^Clear$/ })).toBeNull();
  });
  it('Drills tab has no Launch Hand button', () => {
    render(<SidebarV3 data={baseData} initialTab="drills" />);
    expect(screen.queryByRole('button', { name: /Launch Hand →/ })).toBeNull();
  });
});
```

- [ ] **Step 14.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: FAIL.

- [ ] **Step 14.3: Return null for the drills tab branch**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`. In the `Foot` function, change:

```jsx
if (tab === 'drills') {
  return (
    <>
      <button className="btn ghost" style={{ flex: 1 }} disabled title="Phase 3">Clear</button>
      <button className="btn primary" style={{ flex: 1.6 }} disabled title="Phase 3">Launch Hand →</button>
    </>
  );
}
```

To:

```jsx
if (tab === 'drills') {
  return null;
}
```

Also: in the JSX where `<Foot />` is rendered, ensure that returning `null` collapses the footer cleanly (no empty padding bar). If the footer wrapper is always rendered, wrap the call so it's hidden when null:

```jsx
{Foot() && <div className="sb-foot">{Foot()}</div>}
```

(Only do this if the existing pattern doesn't already handle null returns gracefully — check the existing render and adapt.)

- [ ] **Step 14.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: PASS.

- [ ] **Step 14.5: Commit**

```bash
git add client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
refactor(sidebar-v3): remove Drills tab footer (E3 + E4 dropped)

Library mode has Load per row, Session has End Drill + Advance Drill —
the footer just duplicated those verbs in disabled stubs. Cleaner with
no footer at all. Spec E3, E4, section 4.2.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Tag Hand dialog (E1) — `TagDialog.jsx` + footer wiring

**Files:**
- Create: `client/src/components/sidebar-v3/TagDialog.jsx`
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (footer Live: replace disabled Tag Hand with onClick → setTagDialogOpen)
- Test: `client/src/components/sidebar-v3/__tests__/TagDialog.test.jsx` (new)
- Test: `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` (verify integration)

- [ ] **Step 15.1: Failing TagDialog test**

Create `client/src/components/sidebar-v3/__tests__/TagDialog.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TagDialog from '../TagDialog.jsx';

const sampleTags = ['BLUFF', 'VALUE_BET', 'BAD_FOLD'];

describe('TagDialog', () => {
  it('renders existing tags as toggleable chips', () => {
    render(<TagDialog open availableTags={sampleTags} initialTags={[]} onSubmit={vi.fn()} onClose={vi.fn()} />);
    sampleTags.forEach((t) => expect(screen.getByRole('button', { name: t })).toBeInTheDocument());
  });

  it('Save calls onSubmit with selected tag list', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={['BLUFF']} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'VALUE_BET' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(['BLUFF', 'VALUE_BET']);
    expect(onClose).toHaveBeenCalled();
  });

  it('Custom tag input adds a new tag on Add button', () => {
    const onSubmit = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={[]} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/custom tag/i), { target: { value: 'HERO_CALL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(['HERO_CALL']);
  });

  it('Cancel calls onClose without onSubmit', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<TagDialog open availableTags={sampleTags} initialTags={['BLUFF']} onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('returns null when open is false', () => {
    const { container } = render(<TagDialog open={false} availableTags={sampleTags} initialTags={[]} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 15.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TagDialog.test.jsx`
Expected: FAIL — file does not exist.

- [ ] **Step 15.3: Create TagDialog component**

Create `client/src/components/sidebar-v3/TagDialog.jsx`:

```jsx
import React, { useState } from 'react';

export default function TagDialog({ open, availableTags = [], initialTags = [], onSubmit, onClose }) {
  const [selected, setSelected] = useState(new Set(initialTags));
  const [custom, setCustom] = useState('');

  if (!open) return null;

  function toggle(tag) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  function addCustom() {
    const t = custom.trim().toUpperCase();
    if (!t) return;
    setSelected((prev) => new Set([...prev, t]));
    setCustom('');
  }

  function save() {
    onSubmit?.([...selected]);
    onClose?.();
  }

  return (
    <div
      role="dialog"
      aria-label="Tag this hand"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8,
          padding: 16, minWidth: 320, maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-title" style={{ marginBottom: 8 }}>Tag this hand</div>
        <div className="lbl" style={{ marginBottom: 4 }}>Choose tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {availableTags.map((t) => (
            <button
              key={t}
              className={'chip' + (selected.has(t) ? ' active' : '')}
              onClick={() => toggle(t)}
            >{t}</button>
          ))}
        </div>
        <div className="lbl" style={{ marginBottom: 4 }}>Custom tag</div>
        <div className="row" style={{ gap: 5, marginBottom: 12 }}>
          <input
            className="field"
            placeholder="Custom tag (e.g. BLUFF_RAISE)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={addCustom} disabled={!custom.trim()}>Add</button>
        </div>
        <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 15.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TagDialog.test.jsx`
Expected: PASS for all 5 cases.

- [ ] **Step 15.5: Failing test for footer wiring**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — Tag Hand wiring', () => {
  it('clicking Tag Hand opens the dialog when a current hand exists', () => {
    const data = {
      ...baseData,
      gameState: { ...baseData.gameState, hand_id: 'h-current', phase: 'flop' },
      availableHandTags: ['BLUFF', 'VALUE'],
    };
    const updateHandTags = vi.fn();
    render(<SidebarV3 data={data} emit={{ updateHandTags, togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /Tag Hand/i }));
    expect(screen.getByRole('dialog', { name: /Tag this hand/i })).toBeInTheDocument();
  });

  it('Tag Hand button is disabled when no current hand_id', () => {
    const data = { ...baseData, gameState: { ...baseData.gameState, hand_id: null } };
    render(<SidebarV3 data={data} emit={{ updateHandTags: vi.fn(), togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /Tag Hand/i })).toBeDisabled();
  });

  it('Save inside dialog emits updateHandTags(handId, tags)', () => {
    const data = {
      ...baseData,
      gameState: { ...baseData.gameState, hand_id: 'h-x' },
      availableHandTags: ['BLUFF'],
    };
    const updateHandTags = vi.fn();
    render(<SidebarV3 data={data} emit={{ updateHandTags, togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /Tag Hand/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BLUFF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateHandTags).toHaveBeenCalledWith('h-x', ['BLUFF']);
  });
});
```

- [ ] **Step 15.6: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: 3 new tests fail (button is disabled, dialog doesn't exist).

- [ ] **Step 15.7: Wire dialog into Sidebar.jsx**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`:

1. Add import at top:
   ```jsx
   import TagDialog from './TagDialog.jsx';
   ```

2. Add state in `SidebarV3` component (near the existing `selectedHandId` state):
   ```jsx
   const [tagDialogOpen, setTagDialogOpen] = useState(false);
   ```

3. In the Live footer branch, replace the disabled Tag Hand button:

   Before:
   ```jsx
   <button className="btn" style={{ flex: 1 }} disabled title="Tag dialog wires in Phase 2">⚑ Tag Hand</button>
   ```

   After:
   ```jsx
   <button
     className="btn"
     style={{ flex: 1 }}
     disabled={!data.gameState?.hand_id || !emit?.updateHandTags}
     onClick={() => setTagDialogOpen(true)}
     title={data.gameState?.hand_id ? 'Tag this hand' : 'No active hand to tag'}
   >⚑ Tag Hand</button>
   ```

4. Just before the closing tag of the sidebar root (after `<Foot />` render or wherever the body closes), add the dialog:
   ```jsx
   <TagDialog
     open={tagDialogOpen}
     availableTags={data.availableHandTags || []}
     initialTags={data.gameState?.coach_tags || []}
     onSubmit={(tags) => emit?.updateHandTags?.(data.gameState.hand_id, tags)}
     onClose={() => setTagDialogOpen(false)}
   />
   ```

- [ ] **Step 15.8: Run all sidebar-v3 tests**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: green.

- [ ] **Step 15.9: Commit**

```bash
git add client/src/components/sidebar-v3/TagDialog.jsx \
        client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/TagDialog.test.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): wire Tag Hand dialog (E1)

Tag Hand button on Live footer now opens a tag-picker dialog. Reuses
existing server-side coach:update_hand_tags socket event — no server
changes. Coach can toggle existing tags + add custom ones, scoped to
the current hand_id. Spec E1, section 5.4.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Final regression sweep

- [ ] **Step 16.1: Run all sidebar-v3 tests**

Run: `cd client && npx vitest run src/components/sidebar-v3/`
Expected: all green. No skipped or pending.

- [ ] **Step 16.2: Run full client test suite**

Run: `cd client && npx vitest run`
Expected: all green. No new failures from Phase A edits in unrelated areas.

- [ ] **Step 16.3: Run full server test suite (sanity, no server changes expected)**

Run: `cd server && npx jest`
Expected: 2884/2884 pass (per memory baseline).

- [ ] **Step 16.4: Build the client bundle**

Run: `cd client && npm run build`
Expected: build succeeds, no TypeScript or lint errors introduced.

- [ ] **Step 16.5: Manual staging walkthrough (deploy + sanity)**

```bash
flyctl deploy --config fly.staging.toml --remote-only
```

Then visit `https://poker-trainer-staging.fly.dev/table/<some-coached-cash-table>?sidebarV3=1` as Idopeer (coach):

1. Sidebar opens to last-used tab (or Live).
2. Header shows logo + status pill (no subtitle).
3. Tab bar: Live · Drills · History · Review · Setup.
4. Setup tab loads with [Blinds | Seats] only (no Players sub-mode).
5. Setup → Blinds shows ONE input (BB), with "SB auto-set to N" hint.
6. Live → seats card shows seat rows with sit-out toggle only (no +Bot, no ×, no ±).
7. Live → action log says "Action Log" header (not "Action Feed", not "phase 2 placeholder").
8. Live → Tag Hand button enabled mid-hand → opens dialog → Save emits to server.
9. Live → footer says "Deal Next Hand →" (not "Next Hand →").
10. Drills tab → no footer (no Clear, no Launch Hand).
11. Drills mid-session → no Correct/Mistake/Unsure tiles.
12. History → no Players sub-mode toggle.
13. History footer → "Open in Review →".
14. Review footer → "← Back" + "Back to Live".
15. Hand-config card → only RNG / Manual modes (no Hybrid).
16. localStorage migration: set `fs.sb3.tab=settings` in DevTools, reload → tab loads as Setup, localStorage now reads `setup`.

- [ ] **Step 16.6: If walkthrough catches any regression, fix and re-test**

For any issue, write the failing test first (matching the regression), then fix, then commit.

---

## Self-Review checklist

- [ ] **Spec coverage** — every Phase A item in spec section 10 has a task above:
  - tab id rename → Tasks 1, 2, 3 ✓
  - drop subtitle → Task 4 ✓
  - status pill DRILL state + priority chain → Task 5 ✓
  - action_log_card wiring → Task 6 ✓
  - Hybrid mode cut → Task 7 ✓
  - History Players sub-mode cut → Task 8 ✓
  - drill stats tiles cut → Task 9 ✓
  - separate SB input cut → Task 10 ✓
  - Setup Players sub-mode cut → Task 11 ✓
  - Live seats_card stubs removed → Task 12 ✓
  - button copy renames C1/C2/C3/C5/C6/C7 → Task 13 ✓
  - Drills footer dropped → Task 14 ✓
  - Tag Hand dialog (E1) → Task 15 ✓
  - DrillBuild stays hidden (E9 deferred) → no task needed (already hidden)
  - Adjust Stack on Live (E6) dropped → Task 12 covers it
- [ ] **Placeholder scan** — no TBD, TODO, "implement later", "similar to Task N" without code shown.
- [ ] **Type consistency** — `data.actions_log`, `data.status`, `emit.updateHandTags`, `data.availableHandTags`, `data.gameState.hand_id`, `data.gameState.coach_tags` referenced consistently across tasks.
- [ ] **C8/C9/C11 deferred** — Apply at Next Hand (C8), Discard Pending (C9), 📝 Notes (C11) ship in Phases B/C/D respectively. Not in Phase A. Plan correctly defers them.

---

**End of Phase A plan.**
