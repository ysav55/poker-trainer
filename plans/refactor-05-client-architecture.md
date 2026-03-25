# Refactor Plan 05 — Client Architecture

> Status: PROPOSED — not yet started
> Scope: `client/src/hooks/useSocket.js`, `App.jsx`, `CoachSidebar.jsx` (1,626 lines), all components
> Live-safe: yes — incremental migration preserving reconnect pattern

---

## 1. Current State Audit

### File sizes

| File | Lines | Assessment |
|---|---|---|
| `CoachSidebar.jsx` | 1,626 | Critically oversized — 11 sections, local state, REST calls, countdown timer, inline sub-components |
| `App.jsx` | 802 | Large — 5 inline component definitions plus root App |
| `HandConfigPanel.jsx` | 785 | Appropriately sized — self-contained config panel with complex range logic |
| `PokerTable.jsx` | 633 | Moderate — seat layout math + rendering |
| `StatsPanel.jsx` | 556 | Moderate — REST fetching, tag rendering, self-contained |
| `PlayerSeat.jsx` | 465 | Moderate — hover-stats fetch, timer ring |
| `BettingControls.jsx` | 381 | Well-bounded — pure betting UI |
| `useSocket.js` | 421 | Deceptively small — 17 socket events, 26 emit helpers, 12 state variables |

### useSocket.js — 10 concerns in one hook

1. **Connection lifecycle**: socket creation, `connect`/`disconnect`, auto-rejoin via `joinParamsRef`, global error capture (`window.addEventListener`)
2. **Identity and session**: `myId`, `isCoach`, `isSpectator`, `coachDisconnected`, `joinRoom`, `leaveRoom`
3. **Game state**: `gameState`, `syncError` — clears `activeHandId` on phase transition to `waiting`
4. **Notifications and errors**: `errors`, `notifications`, `addError`, `addNotification`, two timer ref maps (`errorTimersRef`, `notifTimersRef`), auto-dismiss
5. **Replay**: `loadReplay`, `replayStepFwd`, `replayStepBack`, `replayJumpTo`, `replayBranch`, `replayUnbranch`, `replayExit`
6. **Playlists**: `playlists`, `createPlaylist`, `getPlaylists`, `addToPlaylist`, `removeFromPlaylist`, `deletePlaylist`, `activatePlaylist`, `deactivatePlaylist`
7. **Preferences**: `bbView`, `toggleBBView` (localStorage-backed)
8. **Hand tagging**: `activeHandId`, `handTagsSaved`, `updateHandTags`, listeners for `hand_started` and `hand_tags_saved`
9. **Misc coach actions**: `startGame`, `placeBet`, `manualDealCard`, `undoAction`, `rollbackStreet`, `togglePause`, `setMode`, `forceNextStreet`, `awardPot`, `resetHand`, `adjustStack`, `openConfigPhase`, `updateHandConfig`, `startConfiguredHand`, `loadHandScenario`, `setBlindLevels`, `setPlayerInHand`
10. **Action timer**: `actionTimer`, one socket listener

All 12 state variables and 26 emit callbacks are exported in one return object. Any component calling `useSocket()` re-renders whenever any of the 12 states change.

### App.jsx — 5 inline component definitions

- `ConnectionDot` — display only, trivial
- `AuthInput` — styled input, trivial
- `JoinScreen` — full auth form with `useState`, login fetch, validation (~160 lines)
- `TopBar` — navigation bar with 8 props (~110 lines)
- `TagHandPill` — floating tag picker with `useState`, `useEffect`, complex UI (~120 lines)
- `ErrorToast` / `NotificationToast` — ~30 lines each

Root `App` destructures 36 values from `useSocket()`, builds an `emit` bundle (plain object literal — re-created every render), manages `cardPickerTarget`, `dismissedErrorIds`, `sidebarOpen`, `statsOpen`, `currentHandTags`, runs a debounced `updateHandTags` effect, and computes `usedCards` inline during CardPicker render.

### CoachSidebar.jsx — 11 sections, deep local state

11 collapsible sections: GAME CONTROLS, BLIND LEVELS, UNDO CONTROLS, PLAYERS, PLAYLISTS, HAND LIBRARY, ADJUST STACKS, HISTORY, SESSION STATS.

Local state: `mode`, `stackAdjustTarget`, `stackAdjustValue`, `blindBB`, `newPlaylistName`, `activePlaylistId`, `coachPlaylistMode`, `autoStartCountdown`, `prevConfigPhaseRef`, `scenarioSearch`, `selectedPlaylistForAdd`, `scenarioHands`, `scenarioStackMode`.

Calls `apiFetch('/api/hands?limit=50')` directly in a `useEffect` on mount — a REST call that duplicates data already fetched by `useHistory` and `StatsPanel`.

Inline sub-components defined inside the file: `Divider`, `CollapsibleSection`, `PhaseBadge`, `ActionBadge`, `CardSlot`, `CardCode`, `PhasedEndedTag`, `HandHistoryRow`, `HandDetailPanel`.

### Prop-drilling assessment

The primary vector is the `emit` object: `useSocket` → `App` → `PokerTable`/`BettingControls`, and `useSocket` → `App` → `CoachSidebar` → `HandConfigPanel`. The `emit` bundle is a plain object literal rebuilt on every render — all consuming components see a new reference every time any socket state changes, defeating `React.memo`.

`gameState` threads: `App` → `PokerTable` → `PlayerSeat`, `BettingControls`, `BoardCards`, `GhostSeat`. `PokerTable` also reads `myId`, `isCoach`, `coachDisconnected`, `actionTimer`, `bbView`, `bigBlind`.

### Data fetching duplication

Three independent `apiFetch` calls for `/api/hands` exist across `CoachSidebar`, `useHistory`, and `StatsPanel`. No shared cache. If all are visible simultaneously, three in-flight requests fetch the same data. Loading states are local ad-hoc booleans. `useHistory` silently swallows errors (`catch {}`).

---

## 2. useSocket.js Decomposition

The recommended split is into five focused hooks plus one context provider. The existing `useSocket` public API stays intact during the transition — it becomes a thin composition layer.

### `useConnectionManager` → `hooks/useConnectionManager.js`

**Responsibility**: socket lifecycle only.

State: `connected`.
Refs: `socketRef`, `joinParamsRef`.
Listeners: `connect`, `disconnect`.
Also owns: `window.addEventListener('error', ...)` and `window.addEventListener('unhandledrejection', ...)`
Exports: `socketRef` (stable ref), `connected`.

### `useNotifications` → `hooks/useNotifications.js`

**Responsibility**: ephemeral UI feedback.

State: `errors`, `notifications`.
Refs: `errorTimersRef`, `notifTimersRef`.
Listeners: `error`, `notification`, `sync_error`.
Exports: `errors`, `notifications`, `addError`, `addNotification`.

### `useGameSession` → `hooks/useGameSession.js`

**Responsibility**: player identity, game state, session-level events.

State: `gameState`, `myId`, `isCoach`, `isSpectator`, `coachDisconnected`, `syncError`, `sessionStats`, `actionTimer`, `activeHandId`, `handTagsSaved`.
Depends on: `socketRef` from `useConnectionManager`, `addError`/`addNotification` from `useNotifications`.
Listeners: `room_joined`, `game_state`, `session_stats`, `action_timer`, `coach_disconnected`, `sync_error`, `hand_started`, `hand_tags_saved`, `replay_loaded`.
Emits: all game + coach action emitters.

### `useReplay` → `hooks/useReplay.js`

**Responsibility**: replay control emits. No local state — all replay state lives in `gameState.replay_mode`.

Depends on: `socketRef`.
Exports: `loadReplay`, `replayStepFwd`, `replayStepBack`, `replayJumpTo`, `replayBranch`, `replayUnbranch`, `replayExit`.

### `usePlaylists` → `hooks/usePlaylists.js`

**Responsibility**: playlist socket events and emits.

State: `playlists`.
Listeners: `playlist_state`.
Exports: `playlists`, `createPlaylist`, `getPlaylists`, `addToPlaylist`, `removeFromPlaylist`, `deletePlaylist`, `activatePlaylist`, `deactivatePlaylist`.

### `usePreferences` → `hooks/usePreferences.js`

**Responsibility**: localStorage-backed preferences. Zero socket dependency.

State: `bbView`.
Exports: `bbView`, `toggleBBView`.

### Revised `useSocket`

Becomes a thin composition layer: calls each hook above, passes `socketRef` and `addError`/`addNotification` where needed, returns the merged object that existing callers expect. **External API stays identical** — `App.jsx` and `CoachSidebar.jsx` require zero changes in the first migration step.

---

## 3. State Management Strategy

### Recommendation: React Context + selective subscription (no Zustand/Redux)

The app is single-table with a bounded state shape. A library's overhead outweighs the benefit at this scale.

**`SocketContext`** — provides `socketRef` and all stable emit callbacks. Never causes re-renders. Components that only emit (e.g. `BettingControls`) subscribe here.

**`GameStateContext`** — provides `gameState`, `myId`, `isCoach`, `isSpectator`, `coachDisconnected`, `actionTimer`, `bbView`. Components that render game state subscribe here.

Auxiliary state (`errors`, `notifications`, `playlists`, `sessionStats`, `activeHandId`, `handTagsSaved`, `syncError`) stays local to the components that consume it.

**Key win**: `PokerTable` and its children currently re-render on every socket event because they receive the `emit` bundle and entire game state as props. With context, `BettingControls` only re-renders when `gameState` changes, not when `playlists` or `notifications` change.

The `emit` bundle in `App` must be replaced with `useMemo` over stable callbacks, or provided via context directly.

---

## 4. Component Responsibility Audit

### Over-responsibility (must split)

**`App.jsx`**: `JoinScreen`, `TopBar`, `TagHandPill`, `ErrorToast`, `NotificationToast`, and `ConnectionDot` should move to `client/src/components/`. `App` itself shrinks to ~100 lines: context providers, conditional render between `JoinScreen` and main layout, `CardPicker` modal.

**`CoachSidebar.jsx`**: split into panel container + section-level components (see Section 5).

**`PlayerSeat.jsx`**: `ActionTimerRing` (lines 7–46) and `BetChip` (lines 48–70) should extract to own files for testability.

### Appropriately sized (no split needed)

`BettingControls.jsx` — complex raise-amount logic but well-bounded to its single concern.
`HandConfigPanel.jsx` — large but all configuration-domain concerns. No split needed unless range visualiser grows significantly.

### Duplication to fix

`PokerTable.jsx` defines an `ActionTimerBar` inline (lines 62–83) that duplicates `PlayerSeat.jsx`'s `ActionTimerRing`. One should be removed.

### Proposed component hierarchy

```
App
├── providers/
│   ├── SocketContextProvider        (useConnectionManager + useGameSession)
│   └── GameStateContextProvider
├── screens/
│   └── JoinScreen
├── layout/
│   ├── TopBar
│   └── AppShell
├── table/
│   ├── PokerTable
│   ├── PlayerSeat
│   ├── GhostSeat
│   ├── BoardCards
│   ├── BettingControls
│   ├── ActionTimerRing              (extracted from PlayerSeat)
│   └── BetChip                     (extracted from PlayerSeat)
├── coach/
│   ├── CoachSidebar                 (container only, ~100 lines)
│   ├── sections/
│   │   ├── GameControlsSection
│   │   ├── BlindLevelsSection
│   │   ├── UndoControlsSection
│   │   ├── PlayersSection
│   │   ├── PlaylistsSection
│   │   ├── HandLibrarySection
│   │   ├── AdjustStacksSection
│   │   └── HistorySection
│   └── shared/
│       ├── CollapsibleSection
│       ├── CardSlot
│       ├── HandHistoryRow
│       └── HandDetailPanel
├── ui/
│   ├── TagHandPill
│   ├── ErrorToast
│   ├── NotificationToast
│   ├── ConnectionDot
│   └── CardPicker
└── stats/
    └── StatsPanel
```

---

## 5. CoachSidebar Decomposition

CoachSidebar becomes a container component (~100 lines) that manages `isOpen`/`onToggle`, renders `CollapsibleSection`-wrapped section components, and passes narrow props to each.

**State redistribution:**

| Section | Local state | Receives |
|---|---|---|
| `GameControlsSection` | `mode` | `gameState.phase`, `gameState.config_phase`, emit.startGame/resetHand/togglePause/setMode |
| `BlindLevelsSection` | `blindBB` | `gameState.big_blind`, `gameState.phase`, `setBlindLevels` |
| `PlaylistsSection` | `newPlaylistName`, `activePlaylistId`, `coachPlaylistMode`, `autoStartCountdown`, `prevConfigPhaseRef` | `playlists`, `gameState.playlist_mode`, `gameState.config_phase`, `myId`, playlist emits |
| `HandLibrarySection` | `scenarioSearch`, `selectedPlaylistForAdd`, `scenarioHands`, `scenarioStackMode` | `playlists`, `loadHandScenario`, `loadReplay`, `addToPlaylist` — REST call replaced by `useHistory` |
| `HistorySection` | (none) | `useHistory` return values |
| `PlayersSection`, `UndoControlsSection`, `AdjustStacksSection` | (none) | Narrow `gameState` slice + relevant emit callbacks |

The duplicate `apiFetch('/api/hands?limit=50')` in CoachSidebar is eliminated — replaced by `useHistory` (already exists).

---

## 6. Data Fetching Pattern

### Recommendation: React Query (TanStack Query v5)

REST calls are supplementary in this app — they fetch historical/aggregate data while real-time game state arrives via socket. This is exactly the use case where React Query adds value without conflicting with the socket layer.

**Benefits:**
- Deduplication: three components requesting `/api/hands` → one in-flight request
- `staleTime: 30_000` on hand history eliminates redundant fetches mid-hand
- Background revalidation: when `phase === 'waiting'`, a single `queryClient.invalidateQueries({ queryKey: ['hands'] })` refreshes all consumers simultaneously
- Standardised loading/error states replace ad-hoc `loading` booleans
- `queryClient` accessible outside React for imperative invalidation from socket handlers

`useHistory` becomes: `useQuery({ queryKey: ['hands', tableId], queryFn: () => apiFetch(...) })`.
`StatsPanel` becomes: `useQuery({ queryKey: ['stats', stableId] })`.

`apiFetch` in `lib/api.js` already throws on non-ok responses — correct shape for React Query's `queryFn`.

**Note**: `playlists` arrives via socket event (`playlist_state`), not REST. It stays in `usePlaylists` and is not moved to React Query.

---

## 7. Re-render Performance

### Worst-case path

Every `game_state` socket event (every player action) triggers `setGameState` and re-renders approximately 20–30 components:
- `App` → `TopBar` → `PokerTable` → all 9 `PlayerSeat` instances → `BettingControls` → `CoachSidebar` (all 11 sections)

### Missing memoisation

- `PokerTable` — not wrapped in `React.memo`. Receives new `emit` object and new `gameState` on every event. Memo would not help without first stabilising `emit`.
- `CoachSidebar` — not memoised. All 11 sections re-render on every `gameState` change, even sections that don't change (HISTORY, PLAYLISTS, ADJUST STACKS).
- `PlayerSeat` — not memoised. All 9 seats re-render on every action even when only one player's state changed.

### Recommended fixes

1. **Fix `emit` bundle in `App`**: replace plain object literal with `useMemo(() => ({ startGame, placeBet, ... }), [startGame, placeBet, ...])`. All emit callbacks are already stable `useCallback([], [])` refs — the `useMemo` deps will not change. This is a one-line fix with immediate impact.

2. **Wrap `PokerTable` in `React.memo`** after `emit` is stabilised.

3. **Wrap `PlayerSeat` in `React.memo`** with custom comparator comparing only `player.id`, `player.stack`, `player.action`, `player.is_active`, `player.hole_cards`, and the timer for that seat's player.

4. **Wrap collapsed `CollapsibleSection` content in `React.memo`** or use `useMemo` within sections. HISTORY, HAND LIBRARY, PLAYLISTS, and ADJUST STACKS are collapsed by default and should not compute render output when collapsed.

5. **`ActionTimerRing` and `ActionTimerBar`** use `setInterval(update, 100–200ms)`, causing frequent local state updates. These are already well-isolated — no change needed.

---

## 8. Type Safety

No TypeScript or JSDoc currently. Highest-value additions (JSDoc `@typedef`, no TypeScript migration needed):

**Priority 1 — `GameState` shape**: consumed by every component. Fields include `phase`, `players`, `board`, `pot`, `side_pots`, `current_player`, `current_turn`, `replay_mode`, `playlist_mode`, `config_phase`, `is_scenario`, `paused`, `winner`, `winner_name`, `showdown_result`, `big_blind`, `small_blind`, `table_name`, `mode`. Note: `current_player` vs `current_turn` are aliases that cause bugs when callers use the wrong one.

**Priority 2 — `Player` shape**: consumed by `PokerTable`, `PlayerSeat`, `CoachSidebar`. The `is_shadow` field (branched replay players) is not present on normal players — no type guard exists.

**Priority 3 — `EmitBundle`**: passed to `CoachSidebar`, `PokerTable`, `BettingControls` as `emit = {}` with no documentation. A `@typedef EmitBundle` listing all 26 callbacks would surface missing emitters.

**Priority 4 — `HandTag`**: the `parseTags`/`parseTagsFromRows` pattern is duplicated in `CoachSidebar`, `useHistory`, and `StatsPanel`. A shared `lib/parseTags.js` with `@typedef HandTag` eliminates all three copies.

Recommendation: add `// @ts-check` to key files + JSDoc `@typedef` declarations in a new `client/src/types.js`. No TypeScript compilation step needed.

---

## 9. Test Coverage

### What exists

- `CoachSidebar.test.jsx` — covers section rendering, button interactions, mode switching. Good happy-path coverage.
- `PokerTable.test.jsx` — covers waiting state, pot display, player seats, replay/branched badges, null-safety.
- `UI_EdgeCases.test.jsx` — betting controls, action timer edge cases.
- `chips.test.js` — unit tests for `fmtChips`.

### Coverage gaps

| Code | Status |
|---|---|
| `useSocket.js` | **Zero unit tests** — highest-risk gap. Auto-rejoin, `leaveRoom` reset, error deduplication, `hand_tags_saved` auto-clear, `coachDisconnected` cleared only when coach returns to `game_state.players` — all untested |
| `useHistory.js` | No tests — `parseTags` logic and data mapping (`hand_players` → `players`) untested |
| `HandConfigPanel.jsx` | No tests — `computePresetCombos`, `validateRange`, texture group radio behaviour all untested |
| `App.jsx` auth flow | No tests — `JoinScreen` login/spectate paths, error display, `joinRoom` call |
| `BettingControls.jsx` | `toCall`, `raiseMin`, `raiseMax`, `effectiveRaiseMin`, `handleQuickRaise` pot-fraction logic untested |
| `rangeParser.js` | Should have unit tests separate from the component |

### Why tests are hard now

`useSocket` creates a real socket connection on mount and registers window-level listeners. `renderHook` requires mocking `socket.io-client` and carefully sequencing socket event emissions.

After decomposition: `useNotifications` and `usePreferences` are testable with zero mocking. `useGameSession` is testable by injecting a mock `socketRef`. `CoachSidebar` sections are testable with narrow prop sets instead of a 20+ function `makeEmit` stub.

---

## 10. Migration Approach

**Critical constraint**: the `joinParamsRef` auto-rejoin pattern must be preserved exactly. Any refactor that moves or renames state around the socket lifecycle must keep this pattern intact, or reconnection after server restart will silently fail.

### Phase 0 — Stabilise the emit bundle (1 session, zero risk)

In `App.jsx`, replace the plain object literal `emit = { startGame, placeBet, ... }` with `useMemo(() => ({ ... }), [startGame, placeBet, ...])`. One-line change. Immediately fixes re-render propagation. Verify: `CoachSidebar.test.jsx` still passes.

### Phase 1 — Extract App.jsx inline components (1–2 sessions, low risk)

Move `JoinScreen`, `TopBar`, `TagHandPill`, `ErrorToast`, `NotificationToast`, `ConnectionDot` to `client/src/components/`. Import back. Zero behavioural change. Verifiable by visual diff.

### Phase 2 — Split CoachSidebar into section components (2–3 sessions, medium risk)

Extract sections bottom-to-top (least-used first): `HistorySection`, `AdjustStacksSection`, `PlaylistsSection`, `HandLibrarySection`. After each extraction, run `CoachSidebar.test.jsx`. Replace duplicate `apiFetch('/api/hands?limit=50')` with `useHistory` during this phase.

### Phase 3 — Decompose useSocket into focused hooks (2–3 sessions, high risk)

Safest order:
1. `usePreferences` (no socket, no side effects)
2. `useNotifications` (only needs `socketRef`)
3. `useReplay` (emits only, no state)
4. `usePlaylists` (emits + `playlists` state)
5. `useConnectionManager` + `useGameSession` (highest risk — owns the reconnect pattern)

At each step, `useSocket` re-exports the full return object unchanged. Test after each extraction: auto-rejoin after server restart, coach disconnect overlay, `hand_tags_saved` auto-clear timeout.

### Phase 4 — Introduce GameStateContext (1–2 sessions, medium risk)

Create `GameStateContext`, wrap main layout in its provider. Migrate `PokerTable` and `PlayerSeat` from props to `useContext`. Apply `React.memo` after migration.

### Phase 5 — Install React Query (1 session, low risk)

Add `@tanstack/react-query`. Wrap `apiFetch` calls in `useQuery` in `useHistory`, `StatsPanel`, `HandLibrarySection`. Wire `queryClient.invalidateQueries(['hands'])` into the `game_state` handler when `phase === 'waiting'`.

### Phase 6 — Type safety pass (1 session, zero risk)

Add `// @ts-check` to `useSocket.js`, `CoachSidebar.jsx`, `PokerTable.jsx`. Add `@typedef` in `client/src/types.js`. Fix surfaced type errors.

---

## Critical Files for Implementation

| File | Role |
|---|---|
| `client/src/hooks/useSocket.js` | Core hook to decompose; `joinParamsRef` reconnect pattern must survive |
| `client/src/components/CoachSidebar.jsx` | 1,626-line monolith; sections to extract, duplicate fetch to eliminate |
| `client/src/App.jsx` | Emit bundle stabilisation + inline component extractions |
| `client/src/components/PokerTable.jsx` | Primary memoisation target; contains duplicate `ActionTimerBar` |
| `client/src/hooks/useHistory.js` | Pattern to extend for React Query migration; `parseTags` to consolidate |
