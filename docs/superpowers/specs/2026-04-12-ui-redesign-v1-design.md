# UI Redesign V1 — Design Spec

**Date:** 2026-04-12
**Scope:** Foundation layer, sidebar navigation, dashboard/tables split, CRM overhaul
**Branch:** `feat/ui-redesign-v1`

---

## 1. Foundation Layer

### 1.1 Semantic Color Tokens

New file: `client/src/lib/colors.js`

```js
export const colors = {
  bgPrimary: '#060a0f',
  bgSurface: '#0d1117',
  bgSurfaceRaised: '#161b22',
  bgSurfaceHover: '#1c2128',
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#6e7681',
  gold: '#d4af37',
  goldHover: '#e6c34d',
  goldSubtle: 'rgba(212,175,55,0.07)',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
  borderDefault: '#21262d',
  borderStrong: '#30363d',
};
```

All new/modified components import from this file. No raw hex in JSX. Existing components migrate to tokens as they're touched — no separate migration pass.

### 1.2 Typography Scale

Enforced rules (Tailwind classes only):

| Element | Class |
|---|---|
| Page titles (h1) | `text-xl font-bold` |
| Section headers (h2) | `text-sm font-semibold` |
| Subsection headers (h3) | `text-sm font-medium` |
| Body / table cells | `text-sm` |
| Sidebar labels | `text-xs` (12px) |
| Labels / captions | `text-xs` (12px min) |
| Badge numbers | `text-[10px]` (absolute minimum) |

**Rule:** No `text-[Npx]` below 10px anywhere in new code.

### 1.3 Toast System Improvement

Improve existing `NotificationToast.jsx` + `ErrorToast.jsx` — not a rewrite.

Changes:
- Extract `useToast()` hook wrapping existing `useNotifications`
- Add fixed viewport-anchored container: `fixed top-4 right-4 z-50`
- Stack vertically, 8px gap, max 5 visible
- Auto-dismiss: 5s with progress bar
- Types: `error` (red border), `success` (green), `info` (gold), `warning` (orange)

### 1.4 Icon Library

Add `lucide-react` as dependency. All new sidebar icons use Lucide. Existing emoji icons replaced only in files being modified — no separate sweep.

---

## 2. Sidebar + Layout

### 2.1 GlobalTopBar Removal

`GlobalTopBar.jsx` is deleted. Its responsibilities move to:
- **User info + chip balance** → sidebar header
- **Role pill** → removed (role implicit from visible nav items)
- **Breadcrumbs** → inline at top of each page's content area

`AppLayout.jsx` becomes: sidebar + `<Outlet />`. No topbar.

### 2.2 Sidebar Structure

220px expanded, collapsible to 56px icon-only. State persisted in localStorage. Default: expanded.

**Expanded state:**

```
┌──────────────────────┐
│ Holdem Hub (logo)    │
│                      │
│ PlayerName           │
│ 💰 1,270  [+ Add]   │
│ School: Academy      │  ← students see school name
│ 3 online · 2 tables  │  ← coach+ sees quick stats
├──────────────────────┤
│ HOME                 │
│  🏠 Dashboard        │
│  🎰 Tables           │
│  🏆 Tournaments      │
│  📋 History          │
│  🏅 Leaderboard      │
│                      │
│ COACHING    (coach+) │
│  👥 Students         │
│  📊 Groups           │
│  🎯 Scenarios        │
├──────────────────────┤
│  ⚙️  Settings         │
│  ◀ Collapse          │
└──────────────────────┘
```

**Collapsed state (56px):** Icons only. Chip balance shows as number only. No section headers. No school stats.

**Mobile (<768px):** Sidebar hidden. Hamburger button (fixed top-left) opens it as full-height overlay drawer. Tap outside or X to close.

**Auto-collapse:** Below 1280px viewport, sidebar auto-collapses. User can manually expand (overrides auto until next session).

**Per-role visibility:**

| Item | superadmin | admin | coach | coached_student | solo_student |
|---|---|---|---|---|---|
| Dashboard | x | x | x | x | x |
| Tables | x | x | x | x | x |
| Tournaments | x | x | x | x | x |
| History | x | x | x | x | x |
| Leaderboard | x | x | x | x | x |
| Students | x | x | x | | |
| Groups | x | x | x | | |
| Scenarios | x | x | x | | |
| Settings | x | x | x | x | x |

Students see: 5 HOME items + Settings = **6 items**.
Coaches see: 5 HOME + 3 COACHING + Settings = **9 items**.

**Active state:** 3px gold left border + gold icon/text. Hover: `bgSurfaceHover` token. Focus: `focus-visible:ring-2 ring-gold`.

**Badges:** Small dot after label text (e.g., Students badge for unread alerts).

### 2.3 Sidebar Header — Role Adaptive

**Everyone:** Display name + chip balance with [+ Add] button.

**Students:** School name below chip balance.

**Coach/Admin/Superadmin:** Quick stats below chip balance — students online count, active tables count.

### 2.4 Component Architecture

```
client/src/components/SideNav/
  SideNav.jsx            — composition root (<200 lines)
  NavGroup.jsx           — section header + children
  NavItem.jsx            — icon + label + badge + active state
  SidebarHeader.jsx      — user info, chips, school stats
  useSidebarState.js     — collapse/expand, localStorage, auto-collapse
```

---

## 3. Dashboard + Tables Split

### 3.1 LobbyPage Decomposition

`LobbyPage.jsx` (1,064 lines) is replaced by two pages.

### 3.2 DashboardPage (`/dashboard`)

**Coach view — sections in priority order:**

1. **Quick Links** — Create Table, Students, Scenarios. Large tappable cards.
2. **Quick Stats** — Active Tables, Students Online, Hands/Week, Avg Grade. 4 stat pills in a row.
3. **Active Tables** — Top 3 tables with player counts. "View All →" links to `/tables`.
4. **Alert Feed** — Top 3 alerts with severity dots. "See All →" links to Students page (alerts tucked there).

**Student view — sections in priority order:**

1. **Personal Stats** — VPIP, PFR, Hands Played, Leaderboard Rank. 4 stat pills.
2. **Coach Notes** — Shared notes from coach (most recent 3). Read-only.
3. **Quick Links** — Join Table, Bot Practice, History. Large tappable cards.
4. **Available Tables** — Joinable tables. "View All →" links to `/tables`.

**Admin view:** Same as coach + system-level pills (Total Users, Online Now).

### 3.3 TablesPage (`/tables`)

- Filter tabs: `All | Cash | Tournament | Bot Practice`
- Table card grid: `auto-fill`, responsive
- `NewTableCard` with create modal (coach+ only)
- `BuyInModal` for uncoached tables
- "Open Multi-View" button (replaces removed sidebar item)

### 3.4 Redirects

- `/lobby` → `/dashboard`

### 3.5 File Architecture

```
client/src/pages/
  DashboardPage.jsx          (~200 lines)
  TablesPage.jsx             (~200 lines)

client/src/components/dashboard/
  QuickLinks.jsx             (~80 lines)
  QuickStats.jsx             (~100 lines)
  ActiveTables.jsx           (~80 lines)
  AlertFeed.jsx              (~80 lines)

client/src/components/tables/
  CreateTableModal.jsx       (~180 lines)
  BuyInModal.jsx             (~120 lines)
```

---

## 4. Students / CRM Overhaul

### 4.1 PlayerCRM Decomposition

`PlayerCRM.jsx` (2,794 lines) is replaced by a roster page + student dashboard page + 12 section components.

### 4.2 StudentsRosterPage (`/students`)

Full-page data table (Linear-style rows):

**Columns:** Name | Group | Grade | Alert | Last Active

- **Search** — text input, filters by name
- **Filter dropdowns** — Group (color-coded), Alert severity, Status (active/archived)
- **Group column** — color-coded pill, click to filter by that group
- **Alert column** — severity dot (red/gold/green) or dash
- **Row click** → `/students/:playerId`
- **"Manage Groups" button** → slide-over panel for group CRUD
- **"Add Student" button** in header

**States:**
- Loading: skeleton rows with pulse animation
- Empty: message + "Invite your first student" CTA
- Error: message + retry button

### 4.3 StudentDashboardPage (`/students/:playerId`)

Single scrollable page. All sections are collapsible cards with localStorage-persisted collapse state. Responsive: 2-column grid above 1024px, single column below.

**Breadcrumb:** `← Students > Group Name > Player Name`

**Sections (collapsible cards):**

| Section | Left Column | Right Column |
|---|---|---|
| Row 1 | Overview Stats (4 cards) | Quick Actions (Reload Chips, Reset Pwd) |
| Row 2 | Performance Trend (line chart + stat selector) | Alerts (student's active alerts) |
| Row 3 | Mistake Breakdown (bar chart, per 100 hands) | Groups (assigned groups + manage) |
| Row 4 | Recent Hands (last 10, inline tags, "View All") | Staking (contract status, monthly P&L) |
| Row 5 | Notes (timeline + share toggle) | Reports (weekly report cards) |
| Row 6 | Prep Brief (brief, refresh, timestamp) | Scenarios (assigned playlists) |

Each `<CollapsibleSection>`:
- `aria-expanded` attribute
- localStorage-persisted open/closed state per section
- Skeleton loading per section (not full-page spinner)
- Error + retry per section
- `h2` heading with collapse toggle

### 4.4 Alerts — Tucked Into Students

No standalone `/admin/alerts` sidebar item. Alerts surface in two places:
- **Dashboard:** Alert feed widget (top 3) with "See All →"
- **Student Dashboard:** AlertsSection card showing that student's alerts

The existing `CoachAlertsPage` route (`/admin/alerts`) remains accessible via the Dashboard's "See All →" link and direct URL, but is removed from sidebar navigation.

### 4.5 Staking — Tucked Into Students

No standalone sidebar item. Staking surfaces as:
- **Student Dashboard:** StakingSection card (contract status, monthly P&L summary)
- **Full staking admin** (`/admin/staking`) linked from within the StakingSection card

### 4.6 Notes With Student Visibility

**Backend exists:** `player_notes` table + `CRMRepository.js` (createNote, getNotes, updateNote). Note types already supported (`note_type` column).

**New: visibility column.** Requires migration to add `shared_with_student BOOLEAN DEFAULT false` to `player_notes` table. Migration numbered sequentially (next available).

- Per-note toggle: "Share with student" (off by default = opt-in)
- Shared notes appear on student's Dashboard as "Coach Notes" section
- Note types with color coding (existing `note_type` column):
  - General (gray)
  - Session Review (gold)
  - Goal (green)
  - Weakness (red)
- Shared notes show eye icon indicator
- New API endpoint: `GET /api/students/:id/shared-notes` — returns notes where `shared_with_student = true`, used by student Dashboard

### 4.7 File Architecture

```
client/src/pages/
  StudentsRosterPage.jsx          (~200 lines)
  StudentDashboardPage.jsx        (~200 lines)

client/src/components/crm/
  PlayerHeader.jsx                (~80 lines)
  OverviewSection.jsx             (~150 lines)
  PerformanceSection.jsx          (~180 lines)
  MistakesSection.jsx             (~150 lines)
  HandsSection.jsx                (~100 lines)
  AlertsSection.jsx               (~120 lines)
  NotesSection.jsx                (~120 lines)
  StakingSection.jsx              (~180 lines)
  GroupsSection.jsx               (~100 lines)
  PrepBriefSection.jsx            (~180 lines)
  ReportsSection.jsx              (~180 lines)
  ScenariosSection.jsx            (~100 lines)
```

### 4.8 Redirects

- `/admin/crm` → `/students`
- `/admin/stable` → `/students`

---

## 5. Route Map

### New routes

| Route | Page | Source |
|---|---|---|
| `/dashboard` | DashboardPage | New (from LobbyPage) |
| `/tables` | TablesPage | New (from LobbyPage) |
| `/students` | StudentsRosterPage | Replaces `/admin/crm` |
| `/students/:playerId` | StudentDashboardPage | Replaces CRM detail view |

### Kept routes (no changes in V1)

| Route | Page |
|---|---|
| `/table/:tableId` | TablePage (full-screen, no sidebar) |
| `/multi` | MultiTablePage (full-screen) |
| `/review` | ReviewTablePage (full-screen) |
| `/bot-lobby` | Redirects to `/tables?filter=bot` |
| `/tournaments` | TournamentListPage |
| `/tournaments/:groupId` | TournamentDetailPage |
| `/tournaments/:groupId/control` | TournamentControlPage |
| `/tournament/:tableId/lobby` | TournamentLobby |
| `/tournament/:tableId/standings` | TournamentStandings |
| `/admin/users` | UserManagement |
| `/admin/hands` | HandBuilder (Scenarios) |
| `/admin/alerts` | CoachAlertsPage (still accessible, removed from sidebar) |
| `/admin/referee` | RefereeDashboard |
| `/admin/staking` | StakingPage |
| `/admin/tournaments` | TournamentSetup |
| `/staking` | StakingPlayerPage |
| `/history` | HandHistoryPage |
| `/leaderboard` | LeaderboardPage |
| `/settings` | SettingsPage |
| `/login` | LoginPage |
| `/register` | RegisterPage |
| `/forgot-password` | ForgotPasswordPage |

### Redirects

| Old | New |
|---|---|
| `/lobby` | `/dashboard` |
| `/admin/crm` | `/students` |
| `/admin/stable` | `/students` |
| `/bot-lobby` | `/tables?filter=bot` |

### Removed from sidebar (still routed)

- Bot Lobby → accessed via Tables page "Bot Practice" filter tab
- Multi-table → accessed via Tables page button
- Alerts → accessed via Dashboard widget + Student dashboard
- Staking → accessed via Student dashboard card
- Analysis → deferred to V2

---

## 6. Implementation Phases

### Phase 1 — Foundation
1. Create `client/src/lib/colors.js`
2. Add `lucide-react` dependency
3. Improve toast system: `useToast()` hook + fixed container

### Phase 2 — Sidebar + Layout
4. Build `SideNav/` directory (SideNav, NavGroup, NavItem, SidebarHeader, useSidebarState)
5. Rewrite `AppLayout.jsx` (sidebar + Outlet, no topbar)
6. Delete `GlobalTopBar.jsx`
7. Update `App.jsx` (new routes + redirects)

### Phase 3 — Dashboard + Tables
8. Build `DashboardPage.jsx` + sub-components
9. Build `TablesPage.jsx` + extracted modals
10. Wire redirects (`/lobby` → `/dashboard`)

### Phase 4 — CRM Overhaul
11. Build `StudentsRosterPage.jsx`
12. Build `StudentDashboardPage.jsx` + `CollapsibleSection` component
13. Build 12 section components in `components/crm/`
14. Wire redirects (`/admin/crm` → `/students`)
15. Remove old `PlayerCRM.jsx` once all sections migrated

### Phase 5 — Cleanup + Verification
16. Remove unused imports/components (old LobbyPage, GlobalTopBar)
17. Run `npm run build` — zero errors
18. Visual check at 320px, 768px, 1024px, 1440px
19. Tab through every interactive element
20. Verify each role sees correct nav items
21. Verify all redirects
22. Existing test suite passes

---

## 7. Deferred to V2

These are explicitly out of scope for V1:
- Groups page / group dashboard (`/groups`, `/groups/:groupId`)
- Hand History redesign (card list, inline replay)
- Tournament pages split/polish (6 files)
- Scenario Builder split (3 files)
- Staking pages split (11 files)
- Settings tabs split (9+ files)
- Review Table split (4 files)
- Auth pages typography polish
- Admin Users coach-grouping
- Global polish pass (font audit across all files, contrast fixes)
- Hardcoded hex migration in untouched files

---

## 8. Verification Checklist (per phase)

- [ ] `npm run build` — zero errors
- [ ] Visual check at 320px, 768px, 1024px, 1440px
- [ ] Tab through every interactive element (keyboard nav)
- [ ] Each role sees correct nav items and content
- [ ] All redirects work (old URLs → new)
- [ ] Toast visible from every page
- [ ] No new component > 200 lines
- [ ] New code uses color tokens from `colors.js`
- [ ] Loading, empty, error states present on new pages
- [ ] Existing test suite passes
