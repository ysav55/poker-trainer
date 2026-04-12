# UI Redesign V2 — Design Spec

**Date:** 2026-04-12
**Scope:** Settings token migration, Admin page decomposition, HandBuilder playlist-first redesign, Tournament pages polish
**Branch:** `feat/ui-redesign-v1` (continues V1 work)

---

## 1. SettingsPage — Token Migration

### 1.1 Scope

Migrate the 70-line SettingsPage shell and all 7 tab components from hardcoded hex to `colors.js` tokens. Replace any emoji icons with lucide-react equivalents. No structural changes, no file splits.

### 1.2 Files

| File | Lines | Change |
|---|---|---|
| `SettingsPage.jsx` | 70 | Token migration, lucide tab icons |
| `TableDefaultsTab.jsx` | 323 | Token migration |
| `SchoolTab.jsx` | 623 | Token migration |
| `AlertsTab.jsx` | 182 | Token migration |
| `OrgTab.jsx` | 442 | Token migration |
| `PlatformTab.jsx` | 210 | Token migration |
| `ProfileTab.jsx` | 212 | Token migration |
| `DangerZoneTab.jsx` | 170 | Token migration |

### 1.3 Rules

- Replace all `#d4af37` / `GOLD` constant references with `colors.gold`
- Replace all inline hex (`#0d1117`, `#30363d`, `#6e7681`, `#f0ece3`, `#f85149`, `#3fb950`, etc.) with corresponding `colors.*` token
- Replace `rgba(212,175,55,...)` patterns with `colors.goldSubtle` where appropriate
- Import `{ colors }` from `../../lib/colors.js` in each file
- No layout or structural changes — visual output should be identical, just sourced from tokens

---

## 2. Admin Pages — Extract + Token Migration

### 2.1 UserManagement (655L → ~250L)

Extract inline sub-components to `client/src/components/admin/`:

| Extracted Component | Responsibility |
|---|---|
| `ResetPasswordModal.jsx` | Password reset confirmation modal |
| `DeleteConfirmModal.jsx` | Type-to-verify delete confirmation |
| `UserTableRow.jsx` | Single user row: StatusBadge + RolePill + ActionsMenu |
| `UserFilters.jsx` | Search input + role select + status toggles |

The page file keeps: data fetching, pagination state, modal open/close orchestration, table layout.

All extracted components use `colors.js` tokens and lucide-react icons (replace `⋯` menu with `MoreHorizontal`, `✕` close with `X`).

### 2.2 RefereeDashboard (367L → ~180L)

Extract to `client/src/components/admin/`:

| Extracted Component | Responsibility |
|---|---|
| `MovePlayerModal.jsx` | Player move between tournament tables |
| `TournamentTableCard.jsx` | Single tournament table card with player list |

Page file keeps: data fetching, refresh logic, card grid layout.

Token migration + lucide icons (`X` for close, `RefreshCw` for refresh, `ArrowLeft` for back).

### 2.3 Consistent Page Headers

Both admin pages adopt the V1 header pattern:
- `text-xl font-bold` title (h1)
- `text-sm` subtitle in `colors.textSecondary`
- Action buttons right-aligned

---

## 3. HandBuilder — Playlist-First Redesign

### 3.1 Mental Model Change

**Current:** Build scenario → save → QuickSavePanel asks "add to playlist?" as afterthought.

**New:** Playlists are the primary organizational unit. Scenarios are always created inside a playlist. QuickSavePanel is eliminated entirely.

### 3.2 Layout

```
┌─────────────────────────────────────────────────────────┐
│ Page Header: "Scenarios" | counts | [+ Also Add to…] [+ New Playlist] │
├─────────────────┬───────────────────────────────────────┤
│ PLAYLIST TREE   │ TOOLBAR: 🔵 Playlist › Scenario Name  │
│                 │ [Duplicate] [Delete]                   │
│ 🔍 Search…      │                                       │
│                 │                                       │
│ ▾ 🟠 Dry Flop   │                                       │
│   ├ AKo K72r  ◄─┤  ScenarioBuilder component            │
│   ├ QQ J84r     │  (existing, unchanged)                │
│   └ 77 A52r     │                                       │
│ ▸ 🔵 Wet Flop   │                                       │
│ ▸ 🟢 Paired     │                                       │
│ ▸ 🟣 Monotone   │                                       │
│ ▸ 🔴 Big Pairs  │                                       │
│ ▸ 🟦 Drawing    │                                       │
│ ▸ 🟡 Bluff      │                                       │
│ ▸ 🩷 Trap       │                                       │
│                 │                                       │
│ [+ New Scenario in Dry Flop]                            │
└─────────────────┴───────────────────────────────────────┘
```

### 3.3 Playlist Tree (Left Panel)

- Playlists displayed as expandable nodes with color dot + name + scenario count
- Click playlist to expand → shows nested scenario list
- Click scenario to load in right panel
- Selected scenario highlighted with `colors.goldSubtle` background + `colors.gold` border
- Search filters both playlists and scenario names
- "New Scenario" button at bottom is contextual — shows selected playlist name

### 3.4 Color System

Each playlist gets a unique color from a fixed palette:

```js
const PLAYLIST_COLORS = [
  '#f97316', // orange — Dry Flop Spots
  '#3b82f6', // blue — Wet Flop Spots
  '#22c55e', // green — Paired Board
  '#a855f7', // purple — Monotone Board
  '#ef4444', // red — Big Pair Spots
  '#06b6d4', // cyan — Drawing Hands
  '#f59e0b', // amber — Bluff Spots
  '#ec4899', // pink — Trap Hands
];
```

- Playlist node: color dot + 3px left border in playlist color
- Scenario items: 2px left border in a lighter/desaturated variant of the playlist color (20% opacity of the playlist color)
- Coach-created playlists are assigned colors from the palette by `index % PLAYLIST_COLORS.length`
- Pre-seeded playlists are assigned colors by their position in the seed list (index 0 = orange, index 1 = blue, etc.)

### 3.5 Page Header

Above the split-pane:
- Title: "Scenarios"
- Subtitle: "{n} playlists · {m} scenarios"
- **"+ Also Add to…"** button — opens a dropdown/modal to cross-list the currently selected scenario into additional playlists. Only visible when a scenario is selected.
- **"+ New Playlist"** button — gold CTA, creates a new empty playlist

### 3.6 Scenario Toolbar (Right Panel Header)

When a scenario is selected:
- Breadcrumb: `[color dot] Playlist Name › Scenario Name`
- Action buttons: Duplicate, Delete
- No toolbar when no scenario is selected (empty state shows)

### 3.7 Primary Playlist vs Cross-Listing

- Every scenario has a **primary playlist** — the one it was created in. This determines the scenario's display color.
- Scenarios can be **cross-listed** into additional playlists via the "Also Add to…" button in the page header.
- Cross-listed scenarios appear in multiple playlist expansions but their color always reflects the primary playlist.
- Database: existing `playlist_items` join table already supports many-to-many. The `scenarios` table needs a `primary_playlist_id` column (new migration).

### 3.8 Pre-Seeded Playlists

On first load, if no playlists exist, seed 8 default playlists:

1. **Dry Flop Spots** — rainbow, unpaired, low-mid boards
2. **Wet Flop Spots** — flush draws, straight draws, connected
3. **Paired Board** — trips potential, kicker battles
4. **Monotone Board** — flush-heavy textures
5. **Big Pair Spots** — overpairs on various textures
6. **Drawing Hands** — flush draws, straight draws, combo draws
7. **Bluff Spots** — missed draws, air on scary runouts
8. **Trap Hands** — sets, hidden monsters, slowplay setups

Seeding is coach-scoped — each coach gets their own defaults. Seeding happens client-side: if `GET /api/playlists` returns empty, POST 8 playlists in sequence, then reload.

### 3.9 "Save as Scenario" Modal (Reusable)

A shared modal component used from:
- **HandHistoryPage** — button on each hand row (coach only)
- **ReviewTablePage** — button in coach controls (coach only)

**Modal contents:**
- **Hole Cards** — pre-filled from the hand, read-only display
- **Board** — pre-filled from the hand, editable (click card to change via CardPicker)
- **Name** — auto-generated from hole cards + board (e.g., "AKo on K72r"), editable
- **Playlist** — dropdown picker with color dots, pre-selects based on hand tags if possible (e.g., a hand tagged `C_BET` could suggest a relevant playlist, but falls back to first playlist)
- **Save / Cancel** buttons

On save: `POST /api/scenarios` with `{ name, holeCards, board, primary_playlist_id }`, then `POST /api/playlists/{id}/items` to link.

**File:** `client/src/components/SaveAsScenarioModal.jsx` (~150 lines)

### 3.10 File Architecture

```
client/src/pages/admin/
  HandBuilder.jsx                (~200L — layout shell + state)

client/src/components/scenarios/
  PlaylistTree.jsx               (~120L — expandable playlist list)
  PlaylistNode.jsx               (~60L — single playlist with expand/collapse)
  ScenarioItem.jsx               (~40L — scenario in playlist tree)
  ScenarioToolbar.jsx            (~50L — breadcrumb + actions)
  EmptyBuilder.jsx               (~30L — empty state)
  PLAYLIST_COLORS.js             (~15L — color palette constant)

client/src/components/
  SaveAsScenarioModal.jsx        (~150L — reusable modal)
```

### 3.11 Deferred: Ghost Player Simulation

Position-accurate scenarios (e.g., BTN vs BB with ghost folds) require game engine changes:
- `HandGenerator.js` — ghost player slots with auto-fold flag
- `GameManager.js` — process ghost folds at hand start
- `BettingRound.js` — ghost fold ordering affects pot/position state
- `positions.js` / `buildPositionMap` — full 6-max positions even with 2 real players
- `ScenarioBuilder.jsx` — seat map UI for placing real vs ghost players

This is a separate 2-3 day epic. The HandBuilder component architecture designed here does not block it — the ScenarioBuilder component (right panel) is unchanged and can later accept ghost player configuration.

### 3.12 Database Changes

**Migration (next sequential number):**

```sql
ALTER TABLE scenarios ADD COLUMN primary_playlist_id UUID REFERENCES playlists(playlist_id);
```

Nullable — existing scenarios without a primary playlist display in an "Unassigned" section at the bottom of the tree.

---

## 4. Tournament Pages — Polish

### 4.1 Shared Changes (All 3 Pages)

- All hardcoded hex → `colors.js` tokens
- All emoji → lucide-react (`ArrowLeft`, `ChevronDown`, `Eye`, `Users`, `TrendingUp`, `ShoppingBag`)
- Consistent page header pattern: `text-xl font-bold` title, `text-sm` subtitle
- Cards use `colors.bgSurface` background (not `bgSurfaceRaised`)

### 4.2 Shared Components

Extract to `client/src/components/tournament/`:

| Component | Used By |
|---|---|
| `StatusBadge.jsx` | All 3 pages |

### 4.3 TournamentListPage (179L)

- Count badges on filter tabs (Upcoming/Active/Completed)
- Tournament cards: status badge + metadata row + action buttons
- Gold hover border on cards
- "Create Tournament" button in page header (coach+ only)
- Empty state with "Create one →" CTA

### 4.4 TournamentDetailPage (272L)

- Lucide `ArrowLeft` back button (replaces `←` emoji)
- Info grid: 2-column layout inside a card (replaces stacked InfoRow)
- Three sections become `CollapsibleSection` components:
  - **Blind Structure** — table with gold level numbers
  - **Registrants** — player list with status badges
  - **Payouts** — place/percentage/amount with prize pool total
- Each section gets a lucide icon in the header (TrendingUp, Users, ShoppingBag)
- Action buttons: Register (gold primary), Unregister (ghost), Control View (ghost), Cancel (danger ghost)

### 4.5 TournamentControlPage (173L)

- Status badge uses token colors (running = `colors.success`)
- TableMiniCard enriched: shows player count badge + current blind level
- Spectate button with `Eye` icon
- Danger-styled Cancel button (`colors.error` background + border)
- "End & Finalize" as gold ghost button

---

## 5. Route Map

No new routes. All changes are within existing pages.

| Route | Page | Change |
|---|---|---|
| `/settings` | SettingsPage | Token migration |
| `/admin/users` | UserManagement | Decomposition + tokens |
| `/admin/referee` | RefereeDashboard | Decomposition + tokens |
| `/admin/hands` | HandBuilder | Playlist-first redesign |
| `/tournaments` | TournamentListPage | Token + icon polish |
| `/tournaments/:groupId` | TournamentDetailPage | Token + icon + CollapsibleSections |
| `/tournaments/:groupId/control` | TournamentControlPage | Token + icon polish |

---

## 6. New API Requirements

### 6.1 Scenario primary_playlist_id

The `POST /api/scenarios` endpoint must accept an optional `primary_playlist_id` field and persist it to the new column.

The `GET /api/scenarios` response should include `primary_playlist_id` for each scenario.

### 6.2 No Other API Changes

All other data flows use existing endpoints:
- `GET /api/playlists` — list playlists
- `POST /api/playlists` — create playlist
- `POST /api/playlists/:id/items` — link scenario to playlist
- `GET /api/scenarios` — list scenarios
- `POST /api/scenarios` — create scenario

---

## 7. Implementation Phases

### Phase 1 — Settings Token Migration
1. Migrate SettingsPage.jsx shell
2. Migrate 7 tab components (one commit per batch of 2-3)
3. Verify build + tests

### Phase 2 — Admin Decomposition
4. Extract UserManagement sub-components to `components/admin/`
5. Extract RefereeDashboard sub-components to `components/admin/`
6. Token migration on both pages
7. Verify build + tests

### Phase 3 — HandBuilder Playlist-First
8. Database migration: `primary_playlist_id` column on scenarios
9. Update `POST /api/scenarios` to accept `primary_playlist_id`
10. Build `components/scenarios/` directory (PlaylistTree, PlaylistNode, ScenarioItem, ScenarioToolbar, EmptyBuilder, PLAYLIST_COLORS)
11. Rewrite HandBuilder.jsx as layout shell importing new components
12. Client-side playlist seeding logic (8 defaults)
13. Build `SaveAsScenarioModal.jsx`
14. Wire modal into HandHistoryPage (coach only)
15. Wire modal into ReviewTablePage (coach only)
16. Remove QuickSavePanel (dead code after rewrite)
17. Verify build + tests

### Phase 4 — Tournament Polish
18. Extract `StatusBadge` to `components/tournament/`
19. Token + icon migration on TournamentListPage
20. Token + icon + CollapsibleSection migration on TournamentDetailPage
21. Token + icon migration on TournamentControlPage
22. Verify build + tests

### Phase 5 — Final Verification
23. Full build (`npm run build`) — zero errors
24. Full test suite — all pass
25. Visual spot-check at 320px, 768px, 1024px, 1440px
26. Verify each role sees correct content
27. Verify Save as Scenario modal works from History + Review

---

## 8. Deferred (Separate Epics)

- **Ghost Player Simulation** — positional scenarios with auto-folding ghost seats (game engine changes)
- **Settings tab decomposition** — split SchoolTab (623L) and OrgTab (442L) into section components
- **Global hex migration** — hardcoded colors in files not touched by V1 or V2

---

## 9. Verification Checklist (Per Phase)

- [ ] `npm run build` — zero errors
- [ ] `npx vitest run` — all tests pass
- [ ] New code uses `colors.js` tokens exclusively — no raw hex in new/modified JSX
- [ ] Lucide icons in all new/modified components — no emoji for UI elements
- [ ] Extracted components under 200 lines each
- [ ] Page files under 250 lines after extraction
- [ ] Loading, empty, error states on new components
- [ ] `aria-expanded` on all CollapsibleSection instances
