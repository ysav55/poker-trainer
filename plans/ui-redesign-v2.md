# Plan: UI Redesign V2

> Source PRD: `docs/superpowers/specs/2026-04-12-ui-redesign-v2-design.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: No new routes. All changes are within existing pages: `/settings`, `/admin/users`, `/admin/referee`, `/admin/hands`, `/tournaments`, `/tournaments/:groupId`, `/tournaments/:groupId/control`
- **Schema**: One new column — `scenarios.primary_playlist_id UUID REFERENCES playlists(playlist_id)`. Migration 051. Nullable for backward compatibility.
- **API**: Scenarios API lives at `/api/admin/scenarios`. `POST` already accepts `playlistId` — extend to also persist `primary_playlist_id`. `GET` returns the new field.
- **Color system**: All new/modified components import from `client/src/lib/colors.js`. No raw hex in JSX. Playlist colors use golden-angle hue distribution (`hue = existingCount * 137.508 % 360`, saturation 70%, lightness 55%) for infinite non-repeating colors. 8 hand-picked colors for pre-seeded playlists.
- **Icons**: All new/modified components use lucide-react. No emoji for UI elements.
- **Component locations**: Settings tabs in `client/src/pages/settings/`. Admin extractions in `client/src/components/admin/`. Scenario components in `client/src/components/scenarios/`. Tournament extractions in `client/src/components/tournament/`.
- **Testing**: Every phase ships with tests for new/modified components. Tests run and pass before proceeding to next phase.

---

## Phase 1: Settings Token Migration

**User stories**: As a developer, I want all settings pages using centralized color tokens so future theme changes propagate automatically.

### What to build

Mechanical migration of 8 files from hardcoded hex to `colors.js` tokens. The SettingsPage shell (70L) gets lucide-react tab icons replacing any emoji. All 7 tab components (`client/src/pages/settings/`) get `import { colors } from '../../lib/colors.js'` and every inline hex value replaced with the corresponding token. `GOLD` constants become `colors.gold`. `rgba(212,175,55,...)` patterns become `colors.goldSubtle`. No layout or structural changes — visual output is identical, just sourced from tokens.

Files: `SettingsPage.jsx`, `TableDefaultsTab.jsx` (323L), `SchoolTab.jsx` (623L), `AlertsTab.jsx` (182L), `OrgTab.jsx` (442L), `PlatformTab.jsx` (210L), `ProfileTab.jsx` (212L), `DangerZoneTab.jsx` (170L).

### Acceptance criteria

- [ ] All 8 files import from `colors.js` — zero hardcoded hex remaining in modified files
- [ ] `grep -r "GOLD\s*=" client/src/pages/settings/` returns no matches (local GOLD constants removed)
- [ ] SettingsPage shell uses lucide-react icons for tab navigation
- [ ] `npm run build` passes with zero errors
- [ ] `npx vitest run` — all existing tests pass, no regressions
- [ ] Visual spot-check: settings page renders identically before and after

---

## Phase 2: Admin Page Decomposition

**User stories**: As a developer, I want admin pages decomposed into focused components so they're maintainable and use the V1 design system.

### What to build

**UserManagement.jsx** (655L → ~250L): Extract 4 sub-components to `client/src/components/admin/`:
- `ResetPasswordModal` — password reset confirmation
- `DeleteConfirmModal` — type-to-verify delete
- `UserTableRow` — single row with StatusBadge, RolePill, ActionsMenu
- `UserFilters` — search input + role dropdown + status toggles

Page file retains: data fetching, pagination, modal orchestration, table shell.

**RefereeDashboard.jsx** (367L → ~180L): Extract 2 sub-components:
- `MovePlayerModal` — player move between tournament tables
- `TournamentTableCard` — single tournament table card

Page file retains: data fetching, refresh, card grid layout.

Both pages: token migration, lucide icons (`MoreHorizontal` for menu, `X` for close, `RefreshCw` for refresh, `ArrowLeft` for back), V1 page header pattern (`text-xl font-bold` title, `text-sm` subtitle, right-aligned actions).

### Acceptance criteria

- [ ] `UserManagement.jsx` under 250 lines
- [ ] `RefereeDashboard.jsx` under 200 lines
- [ ] 6 new files in `client/src/components/admin/`
- [ ] All 8 files (2 pages + 6 components) use `colors.js` tokens — zero hardcoded hex
- [ ] All emoji icons replaced with lucide-react equivalents
- [ ] Tests: render tests for each extracted component (6 new test files)
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass
- [ ] Both pages render and function identically to before (data fetching, modals, actions all work)

---

## Phase 3: HandBuilder Backend — Migration + API

**User stories**: As a coach, I want scenarios to track which playlist they were created in so the UI can organize scenarios by playlist.

### What to build

A thin backend-only slice that adds `primary_playlist_id` support without touching the frontend.

**Migration `051_scenario_primary_playlist.sql`:**
```sql
ALTER TABLE scenarios ADD COLUMN primary_playlist_id UUID REFERENCES playlists(playlist_id);
```
Nullable — existing scenarios stay as-is.

**API changes in `server/routes/admin/scenarios.js`:**
- `POST /api/admin/scenarios` — accept optional `primary_playlist_id` in request body, persist to new column
- `GET /api/admin/scenarios` — include `primary_playlist_id` in response for each scenario

No frontend changes. Existing HandBuilder continues to work unchanged.

### Acceptance criteria

- [ ] Migration `051_scenario_primary_playlist.sql` exists and is idempotent (IF NOT EXISTS or similar guard)
- [ ] `POST /api/admin/scenarios` with `primary_playlist_id` persists the value
- [ ] `POST /api/admin/scenarios` without `primary_playlist_id` succeeds (nullable)
- [ ] `GET /api/admin/scenarios` response includes `primary_playlist_id` field per scenario
- [ ] Tests: unit tests for the new column in POST and GET (at least 3 test cases: with playlist_id, without, invalid UUID)
- [ ] Existing scenario tests still pass
- [ ] `npm run build` passes
- [ ] Server starts without errors

---

## Phase 4: HandBuilder Playlist Tree

**User stories**: As a coach, I want scenarios organized inside color-coded playlists so I can build a structured curriculum.

### What to build

Rewrite the HandBuilder left panel from a flat scenario/playlist tab switcher to a **playlist tree** with expandable nodes. This is the core UX change.

**New components in `client/src/components/scenarios/`:**
- `PLAYLIST_COLORS.js` — 8 hand-picked seed colors + `generatePlaylistColor(index)` function using golden-angle hue distribution
- `PlaylistTree.jsx` (~120L) — scrollable list of PlaylistNode components, search input, folder filter removed (replaced by tree structure)
- `PlaylistNode.jsx` (~60L) — expandable playlist: color dot, name, scenario count badge, expand/collapse toggle, nested ScenarioItems
- `ScenarioItem.jsx` (~40L) — single scenario in tree: name, 2px left border at 20% playlist color opacity, selected state

**Rewrite `HandBuilder.jsx`** (~200L) as layout shell:
- Left panel: search input + `<PlaylistTree>` + contextual "New Scenario in {playlist}" button
- Right panel: existing `<ScenarioBuilder>` component (unchanged)
- State: selected playlist, selected scenario, search query
- Data fetching: playlists + scenarios loaded, grouped by `primary_playlist_id`
- Unassigned scenarios (no `primary_playlist_id`) show in an "Unassigned" section at bottom

### Acceptance criteria

- [ ] Left panel shows playlists as expandable tree nodes with color dots
- [ ] Clicking a playlist expands to show its scenarios
- [ ] Clicking a scenario loads it in the right panel (ScenarioBuilder)
- [ ] Search filters both playlist names and scenario names
- [ ] "New Scenario" button shows selected playlist name (contextual)
- [ ] Unassigned scenarios appear in a bottom "Unassigned" section
- [ ] `PLAYLIST_COLORS.js` exports both the seed array and `generatePlaylistColor(index)`
- [ ] `generatePlaylistColor` produces visually distinct colors for indices 0–20 (test)
- [ ] Tests: render tests for PlaylistTree, PlaylistNode, ScenarioItem (3 new test files)
- [ ] `HandBuilder.jsx` under 250 lines
- [ ] All new components use `colors.js` tokens — zero hardcoded hex
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass

---

## Phase 5: HandBuilder Header + Seeding + Cross-List

**User stories**: As a new coach, I want pre-built playlist categories so I'm not staring at an empty page. As a coach, I want to cross-list scenarios across multiple playlists.

### What to build

**Page header** above the split-pane:
- Title: "Scenarios"
- Subtitle: "{n} playlists · {m} scenarios" (dynamic counts)
- "Also Add to…" button — visible only when a scenario is selected. Opens a dropdown listing all playlists (with color dots). Clicking a playlist calls `POST /api/playlists/:id/hands` to cross-list the scenario.
- "New Playlist" gold CTA — creates empty playlist via `POST /api/playlists`, assigns next golden-angle color

**Scenario toolbar** (right panel header):
- Breadcrumb: `[color dot] Playlist Name › Scenario Name`
- Duplicate + Delete action buttons
- Only renders when a scenario is selected

**Empty state** (`EmptyBuilder.jsx`):
- Shown when no scenario is selected
- Lucide icon + instructional text + "New Scenario" CTA

**Playlist seeding** (client-side):
- On HandBuilder mount, if `GET /api/playlists` returns empty array, POST 8 default playlists sequentially with names from spec (Dry Flop Spots, Wet Flop Spots, etc.), then reload
- Each seeded playlist gets its hand-picked color from `PLAYLIST_COLORS[0..7]`
- Seeding only fires once (empty check)

**Remove QuickSavePanel** — dead code after rewrite. Delete the component and its test.

### Acceptance criteria

- [ ] Page header shows title, subtitle with counts, and action buttons
- [ ] "Also Add to…" button hidden when no scenario selected, visible when one is
- [ ] Cross-listing a scenario via "Also Add to…" adds it to the target playlist
- [ ] "New Playlist" creates a playlist with a golden-angle-derived color
- [ ] Scenario toolbar shows breadcrumb with playlist color dot
- [ ] Duplicate and Delete actions work from toolbar
- [ ] Empty state renders with lucide icon when no scenario selected
- [ ] First-time coach sees 8 pre-seeded playlists
- [ ] Second load does NOT re-seed (playlists already exist)
- [ ] QuickSavePanel component and test deleted
- [ ] Tests: seeding logic test (mock empty playlists → verify 8 POSTs), cross-list test, toolbar render test
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass

---

## Phase 6: Save as Scenario Modal

**User stories**: As a coach reviewing hand history, I want to save interesting hands as scenarios so I can build training playlists from real play.

### What to build

**`SaveAsScenarioModal.jsx`** (~150L) — reusable modal component:
- **Hole Cards**: pre-filled from hand data, read-only display (card images/text)
- **Board**: pre-filled from hand, editable (click card to open CardPicker)
- **Name**: auto-generated from hole cards + board texture (e.g., "AKo on K72r"), editable text input
- **Playlist**: dropdown with color dots, fetches playlists via `GET /api/playlists`. Pre-selects based on hand tags if possible, otherwise defaults to first playlist.
- **Save**: calls `POST /api/admin/scenarios` with `{ name, seat_configs (hole cards), board_flop/turn/river, primary_playlist_id }`, then `POST /api/playlists/:id/hands` to link. Closes modal on success.
- **Cancel**: closes modal, no action

**Wire into HandHistoryPage** (`client/src/pages/HandHistoryPage.jsx`, 559L):
- Add "Save as Scenario" button in each hand row (coach only, gated by `isCoach` check)
- Button opens `SaveAsScenarioModal` with hand data pre-filled
- Requires extracting hole cards + board from the hand object

**Wire into ReviewTablePage** (`client/src/pages/ReviewTablePage.jsx`, 828L):
- Add "Save as Scenario" button in coach controls area (coach only)
- Button opens `SaveAsScenarioModal` with current hand's hole cards + board

### Acceptance criteria

- [ ] `SaveAsScenarioModal` renders with pre-filled hole cards, board, auto-generated name, and playlist picker
- [ ] Board cards are editable via CardPicker
- [ ] Name field is editable
- [ ] Playlist dropdown shows all playlists with color dots
- [ ] Save creates a scenario AND links it to the selected playlist
- [ ] Modal closes on successful save
- [ ] Cancel closes modal without side effects
- [ ] HandHistoryPage shows "Save as Scenario" button on each row (coach only)
- [ ] ReviewTablePage shows "Save as Scenario" button in coach controls (coach only)
- [ ] Students do NOT see the button on either page
- [ ] Tests: modal render test, save flow test (mock API), role gate tests for both pages (3+ new test files)
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass

---

## Phase 7: Tournament Polish

**User stories**: As a user, I want tournament pages to match the V1 design system so the app feels consistent.

### What to build

Token migration + lucide icons + structural polish across all 3 tournament pages.

**Shared: extract `StatusBadge`** to `client/src/components/tournament/StatusBadge.jsx`. Used by all 3 pages. Maps status → token color: pending = `colors.info`, running = `colors.success`, paused = `colors.warning`, finished = `colors.textMuted`, cancelled = `colors.error`.

**TournamentListPage** (179L):
- All hex → tokens, emoji → lucide (`ArrowRight` for CTA)
- Count badges on filter tabs (Upcoming/Active/Completed)
- Cards use `colors.bgSurface` background
- Gold hover border on cards
- V1 page header

**TournamentDetailPage** (272L):
- Lucide `ArrowLeft` back button
- Info grid: 2-column layout inside a card (replaces stacked `InfoRow`)
- Blind Structure, Registrants, Payouts become `CollapsibleSection` components with lucide icons (`TrendingUp`, `Users`, `ShoppingBag`) and `aria-expanded`
- Action buttons: Register (gold primary), Unregister (ghost), Control View (ghost), Cancel (danger ghost)

**TournamentControlPage** (173L):
- Token migration throughout
- `TableMiniCard` enriched: player count badge + current blind level display
- Spectate button with `Eye` icon
- "End & Finalize" as gold ghost button, Cancel as danger ghost

### Acceptance criteria

- [ ] `StatusBadge` extracted to `components/tournament/StatusBadge.jsx`, imported by all 3 pages
- [ ] All 3 pages use `colors.js` tokens — zero hardcoded hex
- [ ] All emoji replaced with lucide-react icons
- [ ] TournamentListPage: count badges on tabs
- [ ] TournamentDetailPage: 3 CollapsibleSection instances with `aria-expanded`
- [ ] TournamentDetailPage: 2-column info grid
- [ ] TournamentControlPage: TableMiniCard shows player count + blind level
- [ ] Tests: StatusBadge render test, CollapsibleSection usage test on detail page (2+ new test files)
- [ ] `npm run build` passes
- [ ] `npx vitest run` — all tests pass
- [ ] Visual spot-check: all 3 pages match mockups from design spec

---

## Phase 8: Final Verification

**User stories**: As a developer, I want confidence that all V2 changes work together without regressions.

### What to build

No new code. Full verification pass across all V2 work.

### Acceptance criteria

- [ ] `npm run build` — zero errors, zero warnings (except chunk size which is pre-existing)
- [ ] `npx vitest run` — ALL tests pass (server + client)
- [ ] Visual spot-check at 320px, 768px, 1024px, 1440px:
  - [ ] Settings page: all 7 tabs render correctly
  - [ ] UserManagement: table, filters, modals work
  - [ ] RefereeDashboard: card grid, move modal work
  - [ ] HandBuilder: playlist tree, scenario selection, seeding, cross-list, empty state
  - [ ] Tournament pages: list, detail (collapsible sections), control
- [ ] Role verification:
  - [ ] Coach sees "Save as Scenario" button in History + Review
  - [ ] Student does NOT see "Save as Scenario" button
  - [ ] Coach+ sees all admin pages
- [ ] Verify all redirects from V1 still work (`/lobby` → `/dashboard`, `/admin/crm` → `/students`, `/bot-lobby` → `/tables?filter=bot`)
- [ ] No `console.log` debug statements in committed code
- [ ] `grep -rn "hardcoded\|TODO\|FIXME\|HACK" client/src/components/scenarios/ client/src/components/admin/ client/src/components/tournament/` — clean
