# Scenario Builder — Implementation Plan

**Author**: Architecture planning pass
**Date**: 2026-03-24
**Target file**: `plans/scenario-builder.md`

---

## 1. Feature Overview

The Scenario Builder is a coach-only tool for constructing hand scenarios from scratch and saving them directly to a playlist. It differs from the existing `HandConfigPanel` in two critical ways:

1. **It operates independently of live table state.** No players need to be seated. The coach defines players, positions, and stacks as part of the scenario definition itself.
2. **It produces a persisted artifact (a `scenario_config` row).** Rather than just configuring the running game, it saves a reusable scenario that can be added to any playlist and replayed later.

The tool must be fast enough to use mid-session. The gold standard is: coach opens the builder, picks board cards with arrow keys + Enter, assigns hole cards by clicking two cells per player, selects a playlist from a dropdown, and clicks Save — in under 30 seconds.

---

## 2. UX Flow (Step by Step)

### 2a. Opening the Builder

The coach clicks a new **"+ Build Scenario"** button in the `CoachSidebar` PLAYLISTS section (or a floating "Build" button above the playlist list). This opens the `ScenarioBuilder` as a full-screen fixed overlay — same z-index pattern as `CardPicker` — so the table stays visible in the background. It does not navigate away and does not disrupt the running hand.

### 2b. Step 1 — Player Setup (left column)

A column of player rows. Each row contains:

- **Seat number** (1–9, auto-incremented, editable)
- **Stack** input — numeric, default 1000
- **Position badge** — auto-calculated from seat count and dealer position (BTN/SB/BB/CO/HJ/UTG/UTG+1). Read-only but updates live.
- **Two card slots** (empty dashed squares) — click either to open the inline card picker
- An optional **Range toggle** (same pattern as `HandConfigPanel`'s `PlayerModeToggle`)
- A **remove row** button (×)

At the bottom: an **"+ Add Player"** link (max 9). A **"Dealer at seat N"** selector (dropdown or left/right arrows) auto-rotates position labels.

Default on open: 2 players, stacks 1000/1000, dealer at seat 1.

### 2c. Step 2 — Board Cards (center strip)

Five `ConfigCardSlot`s in a row (Flop 1, Flop 2, Flop 3, Turn, River), identical to `HandConfigPanel`'s board section. Click any slot to open the inline card picker targeting that slot.

Above the board slots: a **"Start from"** radio — PREFLOP / FLOP / TURN / RIVER. This sets `starting_street` on the scenario. When FLOP is selected, only the flop slots activate. The inactive slots dim.

### 2d. Card Picker (inline, not modal)

The existing `CardPicker` component is already modal. Inside `ScenarioBuilder`, it is rendered within the overlay itself — the same `pickerTarget` / `pickerUsedCards` pattern from `HandConfigPanel` is replicated verbatim. No changes to `CardPicker.jsx` itself.

**Keyboard shortcut layer**: When a card slot is focused, pressing a rank key (2–9, T, J, Q, K, A) opens the picker and pre-navigates to that rank column. This is additive CSS/JS work on the `ScenarioBuilder` card slots only — `CardPicker` is unchanged.

### 2e. Step 3 — Playlist & Save (right column or bottom bar)

- **Playlist dropdown** — populated from `playlists` state (same data already in `CoachSidebar`)
- **"New Playlist" inline** — if dropdown selection is "— New —", a text input appears for a name. On Save, the playlist is created first, then the scenario is added.
- **Scenario name** — optional free-text field, defaults to an auto-generated label like "6-max flop AhKd2c 2026-03-24".
- **Template pills** — horizontal row of quick-start presets (see Section 7). Clicking one pre-fills everything.
- **"Save to Playlist" button** — primary gold button. Disabled until at least 2 players are defined.
- **Scenario preview strip** — shows a compact read-only summary: seat count, positions, any pinned cards, starting street.

### 2f. Quick-Edit Mode (Phase 2)

When the coach activates a playlist that contains scenario-config hands, a small **"Edit"** pencil icon appears next to each hand in the playlist hand list. Clicking it opens the `ScenarioBuilder` pre-populated with that scenario's data. On Save it overwrites the `scenario_config` row and refreshes the playlist.

---

## 3. Data Model — Scenario Object

The scenario is stored in a new DB table `scenario_configs`. A `hands` row is NOT created at build time; it is created when the scenario is actually dealt (same as the current `start_configured_hand` path).

```
scenario_config {
  scenario_id:     uuid (PK)
  table_id:        text (nullable — if null, usable on any table)
  name:            text
  created_at:      timestamptz
  created_by:      uuid (FK → player_profiles)
  player_count:    int (2–9)
  dealer_position: int (0-indexed into players array = "dealer_seat" convention)
  starting_street: 'preflop' | 'flop' | 'turn' | 'river'
  small_blind:     int
  big_blind:       int
  config_json:     jsonb  — full HandConfiguration as used by GameManager
}
```

`config_json` mirrors the `HandConfiguration` object that `GameManager.updateHandConfig()` already accepts:

```json
{
  "mode": "hybrid",
  "hole_cards": {
    "0": ["As", "Kh"],
    "1": [null, null]
  },
  "hole_cards_range": {},
  "hole_cards_combos": {},
  "board": ["Ah", "Kd", "2c", null, null],
  "board_texture": [],
  "player_setup": [
    { "slot": 0, "stack": 1000 },
    { "slot": 1, "stack": 750 }
  ],
  "dealer_position": 0,
  "starting_street": "flop"
}
```

`player_setup` is new — it stores stack sizes keyed by positional slot (slot 0 = BTN). `hole_cards` keys are slot-indexed strings (`"0"`, `"1"`, …), not player UUIDs, because no real players are involved at build time. The live `_loadScenarioIntoConfig` function already maps by relative position and can consume this format with minor adaptation.

### Playlist linkage

`playlist_hands` already has `(playlist_id, hand_id)` as PK. The scenario flow adds a nullable FK:

```sql
ALTER TABLE playlist_hands ADD COLUMN scenario_config_id uuid REFERENCES scenario_configs;
```

**Phase 1 approach** (avoids PK constraint change): create a stub `hands` row at save time with `is_scenario_hand=true`, `completed_normally=false`, all fields stubbed. Tag it `SCENARIO_BUILDER` to distinguish from real hands in hand history. The `scenario_configs.config_json` is the authoritative source of truth; the placeholder `hand_id` just satisfies the FK.

---

## 4. DB Schema Changes

### Migration 008 — scenario_configs table

```sql
-- 008_scenario_builder.sql

CREATE TABLE IF NOT EXISTS scenario_configs (
  scenario_id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         text,
  name             text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid        REFERENCES player_profiles,
  player_count     int         NOT NULL CHECK (player_count BETWEEN 2 AND 9),
  dealer_position  int         NOT NULL DEFAULT 0,
  starting_street  text        NOT NULL DEFAULT 'preflop'
                               CHECK (starting_street IN ('preflop','flop','turn','river')),
  small_blind      int         NOT NULL DEFAULT 5,
  big_blind        int         NOT NULL DEFAULT 10,
  config_json      jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_scenario_configs_table   ON scenario_configs (table_id);
CREATE INDEX IF NOT EXISTS idx_scenario_configs_created ON scenario_configs (created_at DESC);

-- Link scenarios to playlists alongside stub hand_id
ALTER TABLE playlist_hands
  ADD COLUMN IF NOT EXISTS scenario_config_id uuid REFERENCES scenario_configs;
```

### New HandLoggerSupabase functions

- `saveScenarioConfig({ tableId, name, createdBy, playerCount, dealerPosition, startingStreet, smallBlind, bigBlind, configJson })` → `{ scenario_id }`
- `getScenarioConfigs({ tableId })` → array
- `getScenarioConfig(scenarioId)` → single row
- `updateScenarioConfig(scenarioId, patch)` → void (Phase 2)

---

## 5. Socket Events

### New client → server events

| Event | Payload | Guard |
|---|---|---|
| `save_scenario_to_playlist` | `{ name, playlistId, playerCount, dealerPosition, startingStreet, smallBlind, bigBlind, config }` | isCoach |
| `get_scenario_configs` | `{}` | isCoach |
| `update_scenario_config` | `{ scenarioId, patch }` | isCoach (Phase 2) |
| `delete_scenario_config` | `{ scenarioId }` | isCoach (Phase 2) |

### New server → client events

| Event | Payload | When |
|---|---|---|
| `scenario_saved` | `{ scenarioId, playlistId, scenarioName }` | After successful save |
| `scenario_configs` | `{ configs: ScenarioConfig[] }` | Response to `get_scenario_configs` |

### Existing events unchanged

The `activate_playlist` / `_advancePlaylist` path already calls `_loadScenarioIntoConfig` when a playlist hand is loaded. Phase 1 extends `_advancePlaylist` to detect when `playlist_hands.scenario_config_id` is set (and `hand_id` is a stub) and calls `_loadScenarioConfigIntoConfig` instead, which applies the `player_setup` stacks in addition to cards.

---

## 6. Component Breakdown

### New components

#### `ScenarioBuilder.jsx` (`client/src/components/ScenarioBuilder.jsx`)

Top-level overlay. Manages all local state. Talks to the server only via `emit.saveScenarioToPlaylist`. Accepts:

```js
ScenarioBuilder({
  emit,               // subset: saveScenarioToPlaylist, createPlaylist, getPlaylists
  playlists,          // from useSocket
  gameState,          // for current small_blind / big_blind defaults
  onClose,            // called after save or ESC
})
```

Internal state:
- `players[]` — array of `{ slot, stack, holeCards: [null|string, null|string], rangeMode, rangeStr }`
- `dealerSlot` — index into `players`
- `board[5]` — same shape as HandConfigPanel
- `startingStreet` — `'preflop' | 'flop' | 'turn' | 'river'`
- `pickerTarget` — same shape as HandConfigPanel
- `scenarioName` — string
- `selectedPlaylistId` — string | `'NEW'`
- `newPlaylistNameInput` — string
- `saving` — boolean

Derived (useMemo):
- `usedCards` — Set of all pinned cards (board + hole cards)
- `positionMap` — `buildPositionMap` equivalent run client-side

#### `ScenarioPlayerRow.jsx` (`client/src/components/ScenarioPlayerRow.jsx`)

One row in the player list. Receives `{ player, positionLabel, onStackChange, onCardSlotClick, onRemove, onRangeModeToggle }`. Renders seat badge, position badge, two `ConfigCardSlot`s, stack input, remove button.

#### `ScenarioPreview.jsx` (`client/src/components/ScenarioPreview.jsx`)

Small read-only strip at the bottom of the builder. Shows: "6 players · BTN opens · Board: Ah Kd 2c ?? ?? · Starting: FLOP". Updates live as coach configures.

### Existing components to extend

#### `CoachSidebar.jsx`

Add a **"+ Build Scenario"** button in the PLAYLISTS `CollapsibleSection`, just above the playlist list. Sets `scenarioBuilderOpen = true` in local state, which renders `<ScenarioBuilder>` as a sibling in `App.jsx`.

#### `useSocket.js`

New handlers:
- `scenario_saved` → `addNotification` + refresh playlists
- `scenario_configs` → `setScenarioConfigs(payload.configs)`

New emit helpers:
- `saveScenarioToPlaylist(payload)` → `socket.emit('save_scenario_to_playlist', payload)`
- `getScenarioConfigs()` → `socket.emit('get_scenario_configs')`

#### `CardPicker.jsx` — **no changes**

#### `HandConfigPanel.jsx` — **no changes** (patterns replicated, not imported)

---

## 7. Scenario Templates (Phase 3)

Templates are client-side only — no server round trip:

```js
const SCENARIO_TEMPLATES = [
  {
    id: 'three_bet_pot_oop',
    label: '3-Bet Pot OOP',
    description: 'BTN opens, BB 3-bets, BTN calls. Board dealt.',
    playerCount: 3, dealerSlot: 0, stacks: [1000, 1000, 1000],
    startingStreet: 'flop',
  },
  {
    id: 'limp_multiway',
    label: 'Limp Multiway',
    description: '5 players limp to the BB. BB checks. Flop.',
    playerCount: 5, dealerSlot: 0, stacks: [800, 800, 800, 800, 1200],
    startingStreet: 'flop',
  },
  {
    id: 'river_spot',
    label: 'River Spot',
    description: 'HU on the river. Full board dealt. Assign cards.',
    playerCount: 2, dealerSlot: 0, stacks: [600, 900],
    startingStreet: 'river',
  },
  {
    id: 'squeeze_pot',
    label: 'Squeeze Pot',
    description: 'UTG opens, BTN calls, SB squeezes.',
    playerCount: 4, dealerSlot: 3, stacks: [1000, 1000, 1000, 1000],
    startingStreet: 'flop',
  },
];
```

Template picker renders as a horizontal scrollable chip row near the top of the builder. Selecting a template calls `applyTemplate(template)` which resets all local state. Hole cards are never pre-set by templates — always require manual assignment.

---

## 8. Quick-Edit Mode (Phase 2)

When `CoachSidebar` renders the playlist hand list, each hand row gains a pencil icon if `playlist_hands.scenario_config_id` is non-null. Clicking it:

1. Emits `get_scenario_config(scenarioId)` → server returns full `config_json`
2. Opens `ScenarioBuilder` pre-populated from `config_json`
3. On Save, emits `update_scenario_config` instead of `save_scenario_to_playlist`

---

## 9. Integration with `_advancePlaylist`

Current flow (line ~314 in `server/index.js`): calls `HandLogger.getHandDetail(hand.hand_id)` then `_loadScenarioIntoConfig`.

Phase 1 extension: after fetching hand detail, check for non-null `scenario_config_id`. If present, load full `scenario_config` from DB and call new `_loadScenarioConfigIntoConfig(tableId, gm, scenarioConfig)` which:

1. Calls `gm.openConfigPhase()`
2. Calls `gm.adjustStack(playerId, stack)` for each active seated player, matched by relative position (slot 0 = dealer = BTN, slot 1 = SB, etc.)
3. Calls `gm.updateHandConfig(scenarioConfig.config_json)` with keys remapped from slot indices to live player IDs
4. If `starting_street !== 'preflop'`, board cards from `config_json.board` are already in config; `startGame()` in hybrid mode pins them

Contained in `server/index.js` — no changes to `GameManager`.

---

## 10. Edge Cases and Constraints

| Scenario | Handling |
|---|---|
| Builder opened mid-hand | Overlay opens; no socket events until Save. Save always allowed — stub hand creation doesn't affect game state. |
| Duplicate card assigned | `usedCards` set (same as `HandConfigPanel.pickerUsedCards` pattern) prevents same card in two slots. |
| Player count mismatch at activation | `_loadScenarioConfigIntoConfig` uses relative position mapping. Surplus scenario positions silently dropped; extra seats get null hole cards. Notification emitted as per existing mismatch path. |
| No playlist exists on first save | "— New playlist —" option reveals a text input. Server creates playlist first, then scenario, atomically in the same handler. |
| Scenario name collision | Not enforced — names are display labels; `scenario_id` (UUID) is identity. |
| Coach closes without saving | All state is local React state. `onClose()` — no server events, no cleanup. |
| Mobile | Overlay uses `overflow-y-auto` and `min(90vw, 900px)` max-width. Scrolls on small screens but not touch-optimised. Known limitation per desktop-first UX requirement. |
| Stack validation | `type="number" min="1"`. Invalid values prevent Save. |
| Range mode | Supported via `PlayerModeToggle` + `PRESET_GROUPS` pattern. Ranges stored as `hole_cards_range` in `config_json`; resolved by `HandGenerator.generateHand` at activation. |
| Starting street validation | RIVER requires 5 board cards; TURN requires ≥ 4; FLOP requires ≥ 3. Inline error message on Save rather than disabling button — coach can see exactly what's missing. |

---

## 11. Server Handler — `save_scenario_to_playlist` (pseudocode)

```
socket.on('save_scenario_to_playlist', async ({ name, playlistId, newPlaylistName,
  playerCount, dealerPosition, startingStreet, smallBlind, bigBlind, config }) => {
  guard: isCoach

  1. Validate inputs (playerCount 2–9, startingStreet in enum, board completeness)

  2. If playlistId === 'new':
       playlist = await HandLogger.createPlaylist({ name: newPlaylistName, tableId })
       playlistId = playlist.playlist_id

  3. scenarioId = await HandLogger.saveScenarioConfig({
       tableId, name, createdBy: stableIdMap.get(socket.id),
       playerCount, dealerPosition, startingStreet, smallBlind, bigBlind,
       configJson: config,
     })

  4. stubHandId = uuidv4()
     await HandLogger.startHand({
       handId: stubHandId, sessionId: gm.sessionId, tableId,
       players: [], allPlayers: [], dealerSeat: dealerPosition,
       isScenario: true, smallBlind, bigBlind, sessionType: 'drill',
     })
     await HandLogger.saveHandTags(stubHandId, ['SCENARIO_BUILDER'], 'coach')

  5. await HandLogger.addHandToPlaylist(playlistId, stubHandId)
     await supabase.from('playlist_hands')
       .update({ scenario_config_id: scenarioId })
       .eq('playlist_id', playlistId)
       .eq('hand_id', stubHandId)

  6. socket.emit('scenario_saved', { scenarioId, playlistId, scenarioName: name })
     socket.emit('playlist_state', { playlists: await HandLogger.getPlaylists({ tableId }) })
     socket.emit('notification', { type: 'scenario_saved',
       message: `"${name}" added to playlist` })
})
```

---

## 12. Phased Implementation

### Phase 1 — MVP (Complexity: L)

**Goal**: Coach can build a scenario from scratch, save it to a playlist, and have it load correctly when the playlist runs.

**Deliverables**:
- Migration `008_scenario_builder.sql`
- `HandLoggerSupabase.saveScenarioConfig()`, `getScenarioConfigs()`, `getScenarioConfig()`
- Socket handler `save_scenario_to_playlist` with stub-hand creation
- `_loadScenarioConfigIntoConfig()` in `server/index.js`
- Extended `_advancePlaylist` to detect `scenario_config_id`
- `ScenarioBuilder.jsx`, `ScenarioPlayerRow.jsx`, `ScenarioPreview.jsx`
- `CoachSidebar.jsx`: "+ Build Scenario" button, `scenarioBuilderOpen` state
- `useSocket.js`: `saveScenarioToPlaylist` emit helper, `scenario_saved` handler
- Update `GETTING_STARTED.md` and `ISSUES_REGISTRY.md`

**Deferred to Phase 2+**: templates, quick-edit, keyboard rank shortcuts, range mode in builder

**Test coverage**:
- Server unit: `saveScenarioConfig`, `getScenarioConfig`, `_loadScenarioConfigIntoConfig`
- Integration: `save_scenario_to_playlist` socket handler; `activate_playlist` with scenario-config entry

---

### Phase 2 — Polish (Complexity: M)

**Goal**: Quick-edit flow; keyboard shortcut layer on card slots; range mode in builder.

**Deliverables**:
- Socket handler `update_scenario_config`
- `HandLoggerSupabase.updateScenarioConfig()`
- Quick-edit pencil icon in playlist hand list
- Pre-population of `ScenarioBuilder` from existing config
- Keyboard shortcut: rank key opens CardPicker pre-navigated to that rank column
- Range mode in `ScenarioPlayerRow` (reuse `PRESET_GROUPS` from `HandConfigPanel`)

---

### Phase 3 — Templates (Complexity: S)

**Goal**: One-click scenario presets to dramatically reduce time-to-first-card.

**Deliverables**:
- `SCENARIO_TEMPLATES` constant (client-side only)
- Template chip row in `ScenarioBuilder` header
- `applyTemplate(template)` state reset function
- 4+ built-in templates: 3-Bet Pot OOP, Limp Multiway, River Spot, Squeeze Pot, HU Flop
- Optional Phase 3b: save custom templates (`is_template=true` flag on `scenario_configs`)

---

## 13. Files Requiring Most Attention During Implementation

| File | Why |
|---|---|
| `server/index.js` lines ~314–416 | `_loadScenarioIntoConfig`, `_advancePlaylist` — new loader must be placed adjacent and follow same guard patterns |
| `server/db/HandLoggerSupabase.js` lines ~339–399 | `createPlaylist`, `addHandToPlaylist` — new `saveScenarioConfig` follows same `q()` wrapper patterns |
| `client/src/components/HandConfigPanel.jsx` | `pickerUsedCards` derived value and slot click handlers — `ScenarioBuilder` replicates this logic verbatim |
| `supabase/migrations/001_initial_schema.sql` lines ~155–177 | `playlists` + `playlist_hands` FK constraints — migration 008 must be consistent |
| `client/src/components/CoachSidebar.jsx` | PLAYLISTS section where "+ Build Scenario" entry point is added; `emit` prop shape to extend |
