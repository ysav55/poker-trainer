# Sidebar v3 — Phase D: Missing-Feature Ports + Restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan sub-PR by sub-PR. Each sub-PR (D.1 through D.10) is independently shippable to staging. Within each sub-PR, follow TDD discipline: failing test → run/fail → implement → run/pass → commit.

**Goal:** Port the missing coaching features from the old sidebar into v3 and complete the structural changes the spec calls for, so v3 reaches functional parity (and exceeds it on multiple axes) before Phase E cutover.

**Architecture:** Most work is client-only — new components, new hooks, wired to existing socket events. Three sub-PRs touch the server: hand library search route (`GET /api/hands/library`), exports route (`GET /api/exports/hands`), and the manual-advance-spot socket event for Drills.

**Tech Stack:** React + Vite + Vitest. Express + Supabase (`exceljs` new dep for Excel export). Server tests in Jest.

**Spec:** [docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md](../specs/2026-04-30-sidebar-v3-spec.md), Phase D in Section 10.

**Prereq:** Phase A merged. Phase B + Phase C ideally merged first (less rebase pressure).

---

## Sub-PR Map

Phase D ships as **10 independent sub-PRs**. Each is independently mergeable, has its own file-structure section, and lists tasks at TDD-step granularity. Branches: `feat/ui-redesign-v1` (continue accumulating), or open a sub-branch per sub-PR if conflicts arise.

| Sub-PR | Topic | Scope | Risk | Dependencies |
|---|---|---|---|---|
| **D.1** | Sidebar collapse (A1) | Chrome-level collapse/expand button + `localStorage['fs.sb3.collapsed']` | Low | none |
| **D.2** | Equity toggles (G1, G2) | `live.equity_toggles` row in equity card | Low | none |
| **D.3** | Share Range modal (G4) | Modal port from old `GameControlsSection`; `coach:share_range` socket event | Medium | D.2 (toggle row hosts the button) |
| **D.4** | Live footer: Undo / Rollback / Reset (B3, H1, H2) | Wire existing socket events; possible footer overflow `⋯` menu | Low–Medium | none |
| **D.5** | Replay scrubber + autoplay + speed (K2/K3/K4) | `ScrubberStrip.jsx` inside `review.replay_controls` | Medium | none |
| **D.6** | History toolbar (J4) + inline detail expand (J2) | Refresh button; ephemeral inline expand on `history.hand_strip` cards | Low–Medium | none |
| **D.7** | Setup Seats final shape | Visual seat grid + editor (V12 final per Section 4.5) | Medium | Phase A's V12 sub-mode drop |
| **D.8** | Drills tab restructure | 3-segment `[Playlists \| Hands \| Session]`; LaunchPanel; PlaylistAdmin; CountdownBanner; EventLog; CoachRoleToggle; `coach:manual_advance_spot` server event | Medium–High | none (Hands sub-mode delivered by D.9) |
| **D.9** | Hand Library inside Drills (I1/I2/I3/I4) | `HandsLibrary.jsx`; `GET /api/hands/library` server route | Medium | D.8 (3-segment chassis) |
| **D.10** | Export CSV + Excel (E2) | `ExportDialog.jsx`; `server/routes/exports.js`; `exceljs` dep | Medium | none |

Recommended execution order: **D.1 → D.2 → D.3 → D.4 → D.5 → D.6 → D.7 → D.8 → D.9 → D.10**. D.1–D.5 are mostly independent; D.7 is best done alongside D.8 since they share Setup/Drills mental space; D.9 depends on D.8 chassis.

---

# Sub-PR D.1 — Sidebar Collapse (A1)

**Goal:** Chrome-level collapse/expand button on the left edge of the sidebar. Persisted in `localStorage['fs.sb3.collapsed']`. Spec section 5.2.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | Add `collapsed` state + edge button + localStorage persistence + conditional render of body/footer |
| `client/src/styles/sidebar-v3.css` | Modify | Add `.sb-collapse-btn` and `.sb-collapsed` styles + 200ms ease transition |
| `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` | Modify | Add `describe('SidebarV3 — collapse')` block |

## Tasks

### Task D.1.1: Failing test for collapse toggle

```jsx
describe('SidebarV3 — collapse', () => {
  beforeEach(() => { try { localStorage.clear(); } catch {} });

  it('renders an edge collapse button', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    expect(screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i })).toBeInTheDocument();
  });

  it('collapsing hides the body and footer', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(screen.queryByText(/Live/)).toBeNull();  // tab bar hidden
  });

  it('collapsed state persists to localStorage', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem('fs.sb3.collapsed')).toBe('1');
  });

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem('fs.sb3.collapsed', '1');
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    expect(screen.queryByRole('tab', { name: /Live/ })).toBeNull();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });
});
```

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`. Expect FAIL.

### Task D.1.2: Implement collapse state in Sidebar.jsx

Add to `SidebarV3` component:

```jsx
const [collapsed, setCollapsed] = useState(() => {
  try { return localStorage.getItem('fs.sb3.collapsed') === '1'; }
  catch { return false; }
});

function toggleCollapse() {
  setCollapsed((v) => {
    const next = !v;
    try { localStorage.setItem('fs.sb3.collapsed', next ? '1' : '0'); } catch {}
    return next;
  });
}
```

Render the edge button OUTSIDE the existing layout (so it's always visible), and gate everything else behind `!collapsed`:

```jsx
<aside className={'sidebar-v3' + (collapsed ? ' sb-collapsed' : '')}>
  <button
    className="sb-collapse-btn"
    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    onClick={toggleCollapse}
  >{collapsed ? '›' : '‹'}</button>
  {!collapsed && (
    <>
      <Head status={data.status || 'live'} />
      <TabBar tab={tab} onTabChange={setAndPersist} />
      <div className="sb-body">
        {/* existing tab body */}
      </div>
      {tab !== 'drills' && (
        <div className="sb-foot">
          <Foot />
        </div>
      )}
    </>
  )}
  {/* TagDialog renders regardless, but won't be visible when collapsed since open=false anyway */}
</aside>
```

### Task D.1.3: Add collapse styles to sidebar-v3.css

```css
.sidebar-v3 {
  width: 360px;
  transition: width 200ms ease;
}
.sidebar-v3.sb-collapsed {
  width: 24px;
}
.sb-collapse-btn {
  position: absolute;
  left: 0; top: 0;
  width: 24px; height: 60px;
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-left: none;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
  z-index: 10;
}
```

### Task D.1.4: Run tests, verify all 4 pass

`cd client && npx vitest run src/components/sidebar-v3/`

### Task D.1.5: Commit

```bash
git commit -m "feat(sidebar-v3): chrome-level collapse/expand with localStorage persistence (A1)"
```

---

# Sub-PR D.2 — Equity Toggles (G1, G2)

**Goal:** Two pill toggles in `live.equity_card` header — "Show Coach" / "Show Players". Plus a "Share Range" button slot that D.3 wires up. Spec section 4.1, 5.4.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/EquityToggleRow.jsx` | Create | Two toggle pills + Share Range button (button stub here, dialog wired in D.3) |
| `client/src/components/sidebar-v3/TabLive.jsx` | Modify | Mount EquityToggleRow inside the equity card head |
| `client/src/hooks/useGameState.js` | Modify | Add `setEquityVisibilityCoach(visible)` and `setEquityVisibilityPlayers(visible)` emit helpers |
| `client/src/components/sidebar-v3/__tests__/EquityToggleRow.test.jsx` | Create | Per-toggle on/off + emit |
| `server/socket/handlers/coachControls.js` | Modify | Add `coach:set_equity_visibility_coach` and `coach:set_equity_visibility_players` handlers (or reuse existing `coach:toggle_equity_display` if compatible — see spec Section 12 open item 1) |

## Tasks (TDD)

### D.2.1: Audit existing `coach:toggle_equity_display` event

Read `server/socket/handlers/coachControls.js` and `server/state/SharedState.js`. Determine:
- Does the existing event take a per-table or global flag?
- Does it apply only to "showToPlayers" or both coach+player visibility?

**If existing event covers per-table both flags**, extend payload (`{tableId, audience: 'coach'|'players', visible: boolean}`) and reuse. **Else**, add the two new events as spec'd.

Report findings before writing code (this is the spec's Section 12 open item).

### D.2.2: Server: add per-table equity visibility state

In `server/state/SharedState.js`, add:
```js
const equityVisibility = new Map(); // tableId -> { coach: boolean, players: boolean }
```

Default `{ coach: true, players: false }` per spec.

### D.2.3: Server: socket handlers (or extension)

Implement based on D.2.1 audit. Either add 2 new events or extend the existing one.

### D.2.4: Server: surface per-table visibility on `gameState.equity_visibility`

Extend `getPublicState()` to include `equity_visibility: { coach, players }` for the table.

### D.2.5: Client: `EquityToggleRow.jsx` component

```jsx
export default function EquityToggleRow({ visibility, emit, onShareRange }) {
  return (
    <div className="row" style={{ gap: 4, marginBottom: 6 }}>
      <button
        className={'chip' + (visibility?.coach ? ' active' : '')}
        onClick={() => emit?.setEquityVisibilityCoach?.(!visibility?.coach)}
      >Show Coach</button>
      <button
        className={'chip' + (visibility?.players ? ' active' : '')}
        onClick={() => emit?.setEquityVisibilityPlayers?.(!visibility?.players)}
      >Show Players</button>
      <button
        className="chip"
        onClick={onShareRange}
        style={{ marginLeft: 'auto' }}
      >⬡ Share Range</button>
    </div>
  );
}
```

### D.2.6: Wire into TabLive equity card

Mount `<EquityToggleRow />` at the top of the equity card. Pass `visibility={data.equity_visibility}`, `emit`, and `onShareRange={() => setShareRangeOpen(true)}` (D.3 will add the dialog state).

### D.2.7: Tests for EquityToggleRow + Sidebar integration

Standard: render with `visibility.coach=true`, click → emit called with false; same for players; Share Range click triggers callback.

### D.2.8: Commit

```bash
git commit -m "feat(sidebar-v3): equity visibility toggles (G1, G2) + Share Range button slot"
```

---

# Sub-PR D.3 — Share Range Modal (G4)

**Goal:** Modal triggered by the Share Range button (placed by D.2). Coach picks a label + selects RangeMatrix combos → broadcasts to non-coach sockets. Spec section 5.4.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/ShareRangeDialog.jsx` | Create | Modal (uses same Esc/backdrop pattern as TagDialog) with label input + RangeMatrix |
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | Mount `<ShareRangeDialog />` + state `shareRangeOpen` |
| `client/src/components/sidebar-v3/TabLive.jsx` | Modify | Pass `onShareRange={() => setShareRangeOpen(true)}` to `EquityToggleRow` |
| `client/src/hooks/useGameState.js` | Modify | `shareRange(groups, label)` emit helper |
| `server/socket/handlers/coachControls.js` | Modify | Add `coach:share_range { tableId, groups, label }` handler |
| `server/state/SharedState.js` | Modify | `tableSharedRanges: Map<tableId, { groups, label, broadcastedAt }>` |
| `server/game/GameManager.js` | Modify | Clear shared range on hand reset |
| `client/src/components/sidebar-v3/__tests__/ShareRangeDialog.test.jsx` | Create | Render, toggle combos, broadcast button enabled, emit on submit |

## Tasks (TDD)

### D.3.1: Server in-memory state + event

Add `tableSharedRanges` Map. Add `coach:share_range` handler. Broadcast `range_shared` event to all sockets in room with `socket.data.role !== 'coach'` (verify per spec Section 12 open item 5).

### D.3.2: Server: hand reset clears shared range

In `GameManager.resetHand`, call `SharedState.tableSharedRanges.delete(this.tableId)` if present.

### D.3.3: Client: `ShareRangeDialog.jsx`

Reuse the modal pattern from `TagDialog.jsx` (overlay, Esc close, backdrop close, primary/ghost buttons). Body = label input + `<RangeMatrix selected={groups} onToggle={...} colorMode="selected" />`.

### D.3.4: Wire into Sidebar.jsx

Add `shareRangeOpen` state; mount the dialog at sidebar root. `onSubmit={(groups, label) => emit?.shareRange?.(groups, label)}`.

### D.3.5: Tests + commit

```bash
git commit -m "feat(sidebar-v3): port Share Range modal from old sidebar (G4)"
```

---

# Sub-PR D.4 — Live Footer: Undo / Rollback / Reset (B3, H1, H2)

**Goal:** Wire three new buttons in `footer.live` to existing server events.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | Live footer: add Undo + Reset buttons (Rollback Street goes in overflow menu if footer too crowded) |
| `client/src/hooks/useGameState.js` | Modify | Add `undoAction()`, `rollbackStreet()`, `resetHand()` emit helpers (verify existing names) |
| `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx` | Modify | Per-button click → emit assertion |

## Tasks

### D.4.1: Verify server-side events exist

Grep for `coach:undo_action`, `coach:rollback_street`, `coach:reset_hand` in `server/`. All should already exist (per Phase A audit). Note exact event names.

### D.4.2: Add emit helpers to useGameState

```js
undoAction: () => socket.emit('coach:undo_action', { tableId }),
rollbackStreet: () => socket.emit('coach:rollback_street', { tableId }),
resetHand: () => socket.emit('coach:reset_hand', { tableId }),
```

### D.4.3: Footer layout decision

Live footer is now: `[Pause] [⚑ Tag] [📝 Notes] [↶ Undo] [↺ Reset] [Deal Next Hand →]` — 6 items. If layout looks cramped, collapse Tag/Notes/Undo/Rollback/Reset into a `⋯` overflow menu and keep Pause + Deal Next Hand as primaries. Implementation may go either way — judge after rendering.

### D.4.4: Tests + commit

Tests: each new button enabled when appropriate (e.g., Undo disabled when `data.gameState.actions.length === 0`); each emits the correct event. Commit:

```bash
git commit -m "feat(sidebar-v3): wire Undo/Rollback/Reset to existing server events (B3, H1, H2)"
```

---

# Sub-PR D.5 — Replay Scrubber + Autoplay + Speed (K2/K3/K4)

**Goal:** New `ScrubberStrip.jsx` with draggable timeline, play/pause toggle, 4 speed buttons (0.5×/1×/2×/4×). Mounted inside `review.replay_controls`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/ScrubberStrip.jsx` | Create | The strip component |
| `client/src/components/sidebar-v3/TabReview.jsx` | Modify | Mount inside replay controls |
| `client/src/components/sidebar-v3/__tests__/ScrubberStrip.test.jsx` | Create | Drag, play, speed selection |

## Tasks

### D.5.1: ScrubberStrip component

```jsx
const SPEEDS = [
  { label: '0.5×', ms: 2000 },
  { label: '1×',   ms: 1000 },
  { label: '2×',   ms: 500 },
  { label: '4×',   ms: 250 },
];

export default function ScrubberStrip({ cursor, totalActions, onJumpTo, onStepBack, onStepForward }) {
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  // useEffect: when playing, step forward at SPEEDS[speedIdx].ms intervals; auto-stop at end
  // ...
  return (
    <div className="scrubber">
      <button onClick={onStepBack} disabled={cursor <= -1}>◀</button>
      <button onClick={() => setPlaying(p => !p)} disabled={cursor >= totalActions - 1 && !playing}>
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        type="range" min={0} max={totalActions} value={cursor + 1}
        onChange={(e) => onJumpTo(parseInt(e.target.value, 10) - 1)}
      />
      <button onClick={onStepForward} disabled={cursor >= totalActions - 1}>▶</button>
      <div style={{ display: 'flex', gap: 4 }}>
        {SPEEDS.map((s, i) => (
          <button
            key={s.label}
            className={'chip' + (i === speedIdx ? ' active' : '')}
            onClick={() => setSpeedIdx(i)}
          >{s.label}</button>
        ))}
      </div>
    </div>
  );
}
```

### D.5.2: Wire into TabReview

Inside `review.replay_controls` block, mount `<ScrubberStrip cursor={r.cursor} totalActions={r.totalActions} onJumpTo={replay.replayJumpTo} onStepBack={replay.replayStepBack} onStepForward={replay.replayStepForward} />`.

### D.5.3: Tests

- Drag scrubber → emits `replayJumpTo` with correct index.
- Click play → after `SPEEDS[speedIdx].ms` ms (use `vi.useFakeTimers`), `onStepForward` called.
- Speed button → next play cycle uses new ms.
- Auto-stop at end → playing state goes false when cursor reaches totalActions-1.

### D.5.4: Commit

```bash
git commit -m "feat(sidebar-v3): replay scrubber + autoplay + speed control (K2/K3/K4)"
```

---

# Sub-PR D.6 — History Toolbar Refresh + Inline Detail Expand (J4, J2)

**Goal:** Manual refresh button in History toolbar; click a hand card → inline detail expand (board, players, actions). Ephemeral (no URL sync per Q-6.6.6 → a).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/TabHistory.jsx` | Modify | Add refresh button beside filter chips; add expanded-card state + detail render |
| `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx` | Modify | Refresh click triggers re-fetch; click card → inline expand visible |

## Tasks

### D.6.1: Add refresh button

Beside filter chips, render a `↻` icon button. Wires to existing history-fetch hook (likely `useHistory` or via `data.history` invalidation).

### D.6.2: Inline detail expand

State: `expandedHandId` (single, exclusive — clicking another card replaces). Click card → `setExpandedHandId(hand.hand_id)`. Click again → null.

Detail content: full board cards, players table (name, hole cards, start/end stack, peak EV), actions table (street, player, action, amount).

The detail data may need a fetch — if `useHandDetail(handId)` exists, use it. Else, the existing TabHistory hand list may already have enough. Check before implementing.

### D.6.3: Tests + commit

```bash
git commit -m "feat(sidebar-v3): history refresh button + inline hand detail expand (J4, J2)"
```

---

# Sub-PR D.7 — Setup Seats Final Shape (V12)

**Goal:** Visual seat grid (3-col × 3-row, 9 cells) with click-to-select; selected cell pops the editor below. Editor: empty cell → bot picker + Add Bot; occupied → Edit Stack / Sit / Kick. Spec section 4.5.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/TabSetup.jsx` | Modify | Replace simple seats list with grid + editor pattern |
| `client/src/components/sidebar-v3/__tests__/TabSetup.test.jsx` | Modify | Cell click selects; empty editor; occupied editor |

## Tasks

### D.7.1: Failing tests

```jsx
describe('TabSetup — Seats grid', () => {
  it('renders 9 cells in a 3-column grid', () => { /* ... */ });
  it('clicking an empty cell shows the bot picker', () => { /* ... */ });
  it('clicking an occupied cell shows Edit Stack / Sit / Kick', () => { /* ... */ });
  it('+ Add Bot to seat N emits coachAddBot', () => { /* ... */ });
});
```

### D.7.2: Refactor SeatsSection

Replace existing seat rendering with the grid + editor pattern from spec section 4.5. Grid cell renders seat#, player name, stack, badge, dashed border for empty. `selected` state tracks which cell is open.

### D.7.3: Commit

```bash
git commit -m "feat(sidebar-v3): visual seats grid + editor in Setup tab (V12)"
```

---

# Sub-PR D.8 — Drills Tab Restructure

**Goal:** Drills tab gains 3-segment `[Playlists | Hands | Session]` (Hands sub-mode is shipped by D.9). Add LaunchPanel, PlaylistAdmin, CountdownBanner, EventLog, CoachRoleToggle. Server-side `coach:manual_advance_spot`. Spec section 4.2.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/TabDrills.jsx` | Modify | 3-segment chassis; mount new sub-components |
| `client/src/components/sidebar-v3/PlaylistAdmin.jsx` | Create | + New Playlist input + per-row ⋯ menu (rename/delete) |
| `client/src/components/sidebar-v3/LaunchPanel.jsx` | Create | Pre-launch config (hero mode, order, auto-advance, allow zero match) |
| `client/src/components/sidebar-v3/CountdownBanner.jsx` | Create | Auto-start countdown + Cancel + Resume |
| `client/src/components/sidebar-v3/EventLog.jsx` | Create | Last-3 events ring buffer |
| `client/src/components/sidebar-v3/CoachRoleToggle.jsx` | Create | Play / Monitor toggle |
| `client/src/hooks/useGameState.js` | Modify | `manualAdvanceSpot()` emit helper |
| `server/socket/handlers/coachControls.js` | Modify | `coach:manual_advance_spot` handler with guards |
| `server/game/PlaylistExecutionService.js` (or equivalent) | Modify | Expose `advance(tableId)` if not already |

## Tasks

### D.8.1: Audit `PlaylistExecutionService.advance` API

Read `server/game/PlaylistExecutionService.js` (or wherever drill advancement lives). Ensure `advance(tableId)` is callable from a socket handler. Spec section 12 open item 4.

### D.8.2: Server: `coach:manual_advance_spot` handler

Guards:
- Coach-only.
- Drill must be active (`playlist_mode.active === true`).
- `auto_advance` must be `false`.
- Phase must be `waiting`.

Reject with `{error: 'auto_advance_on'}` etc.

### D.8.3: Client: 3-segment chassis

Replace existing `[Library | Session]` with `[Playlists | Hands | Session]`. Default to `Playlists`. Hands mode renders an empty placeholder for now (D.9 fills it).

### D.8.4: PlaylistAdmin component

Header on `Playlists` mode: `[+ New Playlist]` button (opens inline input) + per-row `⋯` menu (rename / delete). Wire to existing `coach:create_playlist` and `coach:delete_playlist` events; new `coach:rename_playlist` if missing — verify with grep.

### D.8.5: LaunchPanel component

Below the playlist roster, when a row is selected: hero mode segment (sticky/per_hand/rotate), order radio (sequential/random), auto-advance checkbox, allow-zero-match checkbox (when `drill.fitCount === 0`). `[Launch →]` button → calls `emit.activatePlaylist(playlistId, config)`.

### D.8.6: CountdownBanner

Top of Session mode when `autoStartCountdown !== null`: `▶ Auto-starting next hand in {N}s [Cancel]`. When paused: `[Resume Drill]`. State managed locally with `setInterval` decrement.

### D.8.7: EventLog

Inside `drills.session.runner`. Subscribes to existing socket emits (`hand_started`, `hand_ended`, `playlist_advanced`, etc.) via a small hook or context; keeps last 3 in a ring buffer.

### D.8.8: CoachRoleToggle

Inside `drills.session.runner` header. Two pills: `[Play]` and `[Monitor 👁]`. Click → `emit.setPlayerInHand(myId, isPlayMode)`.

### D.8.9: Wire `Advance Drill →` to `coach:manual_advance_spot`

Inside `drills.session.runner`, the existing button (renamed in Phase A) gets onClick → `emit.manualAdvanceSpot()`. Disabled when `auto_advance === true`.

### D.8.10: Tests + commit

Per-component tests + integration test for advance-spot guard. Commit:

```bash
git commit -m "feat(sidebar-v3): drills tab restructure (3-segment, LaunchPanel, PlaylistAdmin, CountdownBanner, EventLog, CoachRoleToggle, manual_advance_spot)"
```

---

# Sub-PR D.9 — Hand Library inside Drills (I1/I2/I3/I4)

**Goal:** New `Hands` sub-mode in Drills tab: search, range filter, load-as-scenario (keep/historical), add to playlist. Spec section 4.2.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/HandsLibrary.jsx` | Create | Search bar + range filter + hand list with Load menu |
| `client/src/components/sidebar-v3/TabDrills.jsx` | Modify | Mount `<HandsLibrary />` in `mode === 'hands'` branch |
| `client/src/hooks/useHandsLibrary.js` | Create | REST hook for `GET /api/hands/library` |
| `server/routes/hands.js` | Modify | Add `GET /api/hands/library` route |
| `server/db/repositories/HandRepository.js` | Modify | Add `searchLibrary({ schoolId, query, rangeFilter, limit, offset })` |
| `server/tests/handsLibrary.routes.test.js` | Create | Auth, school-scope, filter combinations |
| `client/src/components/sidebar-v3/__tests__/HandsLibrary.test.jsx` | Create | Search debounced, range filter, Load menu |

## Tasks

### D.9.1: Server: `searchLibrary` repo method

Filters: text matches winner name / hand_id / auto_tag tags; range filter matches hands where any in-hand player has a hole-card combo group in the filter set. Joins from `hands` ↔ `hand_players` ↔ `hand_tags`. School-scoped via the coach's `school_id`.

### D.9.2: Server: route + tests

`GET /api/hands/library?q=...&range=AKo,QQ&limit=20&offset=0` → `{ hands, total }`. `requireAuth + requireRole('coach') + requireSchool` (Phase B middleware).

### D.9.3: Client: `useHandsLibrary` hook

```js
useHandsLibrary({ q, range, limit, offset }) → { hands, total, loading, error }
```

Debounce `q` 300ms (per spec 6.7).

### D.9.4: Client: `HandsLibrary.jsx`

```jsx
<>
  <SearchBar query={q} onChange={setQ} />
  <RangeFilterToggle range={range} onChange={setRange} />
  <HandList hands={hands} onLoad={onLoad} onAddToPlaylist={onAdd} />
</>
```

Per row Load menu: `Load (Keep Stacks)` / `Load (Historical Stacks)` / `Add to Playlist…`.

### D.9.5: Wire emit helpers

Existing `coach:loadHandScenario(hand_id, stack_mode)` and `coach:add_to_playlist(playlist_id, hand_id)`.

### D.9.6: Tests + commit

```bash
git commit -m "feat(sidebar-v3): hand library inside Drills tab (I1/I2/I3/I4)"
```

---

# Sub-PR D.10 — Export CSV + Excel (E2)

**Goal:** Format-picker modal on History tab footer. CSV = per-hand rows. Excel = 4-sheet aggregated workbook.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `client/src/components/sidebar-v3/ExportDialog.jsx` | Create | Format radio (CSV / Excel) + Export button |
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | History footer: `[↓ Export ▾]` opens dialog |
| `server/routes/exports.js` | Create | `GET /api/exports/hands?tableId=...&format=csv\|xlsx` |
| `server/lib/csvExport.js` | Create | CSV stream generation |
| `server/lib/xlsxExport.js` | Create | exceljs streaming workbook |
| `server/package.json` | Modify | Add `exceljs` dep |
| `server/tests/exports.routes.test.js` | Create | CSV + Excel + RBAC + auto-tag breakdown sheet |

## Tasks

### D.10.1: Add `exceljs` dep

```bash
cd server && npm install exceljs --save
```

Verify [server/package.json](server/package.json) updated. Confirm not already present per spec Section 12 open item 3.

### D.10.2: CSV generator (`csvExport.js`)

Stream-based: header row + one row per hand. Columns: `hand_id, started_at, phase_ended, winner, pot, board, action_count, auto_tags`.

### D.10.3: Excel generator (`xlsxExport.js`)

`exceljs.stream.xlsx.WorkbookWriter`. 4 sheets:
- **Hands** — same columns as CSV
- **Stats** — per-player VPIP/PFR/W$SD/hands/net P&L
- **Auto-tag breakdown** — tag → count, sorted desc
- **Players** — name, hands played, net, biggest pot, peak EV

Use `worksheet.commit()` after each row for memory efficiency.

### D.10.4: Route handler

```js
app.get('/api/exports/hands', requireAuth, requireRole('coach'), requireSchool, async (req, res) => {
  const { tableId, format } = req.query;
  // ...validate tableId belongs to school
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hands-${tableId}.xlsx"`);
    await streamXlsx(res, tableId, req.user.school_id);
  } else {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="hands-${tableId}.csv"`);
    await streamCsv(res, tableId, req.user.school_id);
  }
});
```

### D.10.5: Client `ExportDialog.jsx`

Reuse modal pattern from TagDialog. Format radio: CSV / Excel report. Submit → triggers download via `window.location` or `<a download>` redirect to `/api/exports/hands?tableId=...&format=...` with auth header.

### D.10.6: Tests

- Server: parse CSV response → expected columns. Parse XLSX response via `exceljs.read` → 4 sheets. Non-coach 403. Auto-tag breakdown matches actual `hand_tags` counts.
- Client: format radio, download triggered.

### D.10.7: Commit

```bash
git commit -m "feat(sidebar-v3): CSV + Excel hand export (E2) — exceljs streaming"
```

---

## Phase D — Final Regression Sweep

After D.1–D.10 land:

1. `cd client && npx vitest run` — full client green.
2. `cd server && npx jest` — full server green.
3. `cd client && npm run build` — clean bundle.
4. Staging deploy + manual walkthrough covering every sub-PR feature.
5. Coach happy path E2E (per spec Section 9.3 — `e2e/sidebar-v3.coach-happy.spec.ts`).
6. If any Phase D sub-PR introduced flakes or regressions, fix forward — don't merge Phase E until clean.

---

## Self-Review Checklist (Phase D as a whole)

- [ ] Spec coverage: every Phase D item from spec section 10 maps to a sub-PR (D.1–D.10).
- [ ] Sub-PRs are independently mergeable — no cross-PR API surface drift.
- [ ] Server-side state additions (equity_visibility, tableSharedRanges) cleaned up in `tableCleanup.js` (extend Phase C's cleanup task).
- [ ] All new socket events wrapped by `requireCoach` guard.
- [ ] All new REST endpoints behind `requireAuth + requireRole('coach') + requireSchool`.
- [ ] No Phase A regressions (sidebar-v3 baseline tests stay green throughout).

**End of Phase D plan.**
