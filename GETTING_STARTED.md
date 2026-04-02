# Poker Trainer — Getting Started

A real-time poker training tool. The **coach** controls the game (deal hands, pause, undo, configure specific cards, review history). **Players** join from any browser and act in turn. Everything is persisted to **Supabase (PostgreSQL)** so hand history and player stats survive restarts and are accessible from any device.

**Last updated:** 2026-04-02 — **New UI (POK-60):** Complete page-by-page UI overhaul. 18 routes implemented matching the full UI spec. New global layout (AppLayout with icon SideNav + GlobalTopBar). 5 role-variant Lobby, 4 role-variant Table View, 8-tab Player CRM, 5-tab Settings page, Review Table (new), Hand History browser (new), Tournament system (Lobby/Standings/Setup/Referee), Scenario Builder, Stable Overview, Coach Alerts, AI Analysis, User Management, Leaderboard, Multi-Table. 45 components, 26 page files, 142 files changed, 26K+ lines added. Previously: Play vs Bot (POK-56/58), Coach Intelligence (POK-43–47), School Management, Announcements, Chip Bank, Auth & Registration, Table Privacy.

---

## Requirements

- **Node.js 18+** (includes npm)
- A modern browser (Chrome, Firefox, Edge, Safari)
- Players on the same local network, or a tunneling tool for remote access
- A **Supabase project** (free tier works; schema already deployed)

---

## 1. First-Time Setup

```bash
# From the poker-trainer folder:
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### Environment Variables

**`/.env`** (project root — read by the server):
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SESSION_SECRET=<a-long-random-string>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available in your Supabase dashboard under Settings → API. `SESSION_SECRET` can be any random string (e.g. output of `openssl rand -hex 32`) — it signs the JWTs that keep players logged in.

> The browser client no longer has any Supabase credentials. The `client/.env` file is not required.

---

## 2. Running the App

### Production mode (single server, recommended)

```bash
# Build the client once
cd client && npm run build && cd ..

# Start the server — serves everything on port 3001
cd server && node index.js
```

Open **http://localhost:3001** in your browser.

### Development mode (hot-reload for UI work)

Terminal 1:
```bash
cd server && node index.js
```

Terminal 2:
```bash
cd client && npm run dev
```

Open **http://localhost:5173**. The client hot-reloads on file save; the server does not.

---

## 3. Accounts & Roles

Accounts can be created by admins (via **Admin → User Management**) or via **self-registration** through the API. Legacy `players.csv` bootstrapping is still supported.

### Self-registration (API)

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/register` | Student self-registration. Requires `name` (≥2 chars), `password` (≥8 chars). Optional: `email`, `coachId`, `schoolId`. Returns a JWT. If `schoolId` is provided, school capacity is checked before account creation. |
| `POST /api/auth/register-coach` | Coach application. Requires `name`, `password`, `email`. Returns `202 Accepted` — admin must approve before login is possible. |
| `POST /api/auth/reset-password` | Authenticated users reset their own password. Requires `currentPassword` and `newPassword` (≥8 chars). |

**Trial accounts**: students registered via `/api/auth/register` receive a 7-day trial window and 20 trial hands. Joining a table is blocked after either limit is reached. An admin or coach must upgrade the account.

### Roles

| Role | Description |
|------|-------------|
| `superadmin` | Full unrestricted access |
| `admin` | All permissions — user management, all admin panels |
| `coach` | Leads coached tables, tags hands, builds scenarios, manages playlists |
| `coached_student` | Student registered under a specific coach (trial account) |
| `solo_student` | Student registered without a coach (trial account) |
| `moderator` | Can tag hands, run tables; limited admin |
| `referee` | Creates and manages tournaments |
| `player` | Standard seated player — no elevated permissions |
| `trial` | Trial access — no special permissions |

Roles map to 12 granular permissions (`table:create`, `hand:tag`, `playlist:manage`, `crm:view`, `admin:access`, etc.). Permission checks happen both in Express middleware and socket handlers.

### Logging in

1. Open the app — you are redirected to `/login`.
2. Enter your **name** and **password**. Click Log In.
3. On success you land on the **Lobby** (`/lobby`).

### Coach vs. player modes

- **coached_cash table**: The coach controls dealing, configuration, undo, and pausing. Players only see betting controls. The coach cannot be dealt cards.
- **uncoached_cash / tournament tables**: All seated users (including coaches) are regular players who are dealt cards and take actions. No coach-specific controls exist on these tables.

### Watching without an account

Spectators can join any table without authentication. They see the board and player stacks but cannot act.

---

## 4. Chip Bank (Player Economy)

Each player has a persistent chip balance stored in Supabase (`player_chip_bank`). Chips move between the bank and the table via atomic DB transactions — no race conditions even under high concurrency.

### How it works

| Event | Direction | Description |
|-------|-----------|-------------|
| **Join table (buy-in)** | Bank → Table | Deducted automatically when `join_room` includes `buyInAmount` |
| **Leave table (cash-out)** | Table → Bank | Returned automatically after the 60-second reconnect window expires |
| **Coach reload** | Admin → Bank | `POST /api/players/:id/chips` (coach or admin role required) |
| **Manual adjustment** | ±Bank | `POST /api/players/:id/chip-adjust` (admin role required) |

### Chip Bank REST endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/players/:id/chip-balance` | Own or coach/admin | Current bank balance |
| `POST` | `/api/players/:id/chips` | Coach+ | Reload chips (`amount` must be a positive integer) |
| `POST` | `/api/players/:id/chip-adjust` | Admin+ | Manual credit or debit (`amount` non-zero integer; negative = debit) |
| `GET` | `/api/players/:id/chip-history` | Own or coach/admin | Paginated transaction log (`?limit=50&offset=0`; max 200) |

### Client buy-in

When emitting `join_room`, include `buyInAmount` (positive integer) to deduct that amount from the player's bank and set their table stack:

```js
socket.emit('join_room', { name: 'Alice', tableId: 'main-table', buyInAmount: 500 });
```

If the player's balance is too low, the join is rejected with a clear error. Unauthenticated spectators are unaffected.

---

## 5. School Management

Superadmins and admins with the `school:manage` permission can create and manage schools. Schools let you group players under a coaching organization and restrict access to specific features.

### Admin API (`/api/admin/schools` — requires `school:manage`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/schools` | List all schools with coach/student counts |
| POST | `/api/admin/schools` | Create a school (`name` required; optional `maxCoaches`, `maxStudents`, `logoUrl`, `primaryColor`, `theme`) |
| GET | `/api/admin/schools/:id` | Get school detail + members + feature toggles |
| PATCH | `/api/admin/schools/:id` | Update school fields |
| DELETE | `/api/admin/schools/:id` | Archive school (soft delete) |
| GET | `/api/admin/schools/:id/members` | List members (optional `?role=coach`) |
| POST | `/api/admin/schools/:id/members` | Assign player `{ playerId, role }` — enforces capacity limits |
| DELETE | `/api/admin/schools/:id/members/:playerId` | Remove player from school |
| GET | `/api/admin/schools/:id/features` | Get feature toggle states |
| PUT | `/api/admin/schools/:id/features` | Bulk update features `{ replay: true, analysis: false, … }` |

### Feature Toggles

Each school can disable specific features. Disabled features return `403 feature_disabled` for all players in that school. Features default to **enabled** when no setting exists.

| Key | Controls |
|-----|----------|
| `replay` | Hand replay viewer |
| `analysis` | Hand analyzer (`/api/analysis/*`) |
| `chip_bank` | Chip bank system |
| `playlists` | Playlist access |
| `tournaments` | Tournament mode |
| `crm` | Coach CRM/player notes |
| `leaderboard` | Leaderboard visibility |
| `scenarios` | Scenario/drill mode |

### Capacity Limits

Set `maxCoaches` and `maxStudents` on a school to enforce member limits. Attempting to add a member over the limit returns `409`. Registration via `POST /api/auth/register` with a `schoolId` also checks student capacity before creating the account.

---

## 6. Announcements

Coaches and admins can broadcast messages to all students or a specific individual. Students see their feed via the REST API with unread badge support.

### Announcement REST endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/announcements` | Coach+ | Create an announcement. Body: `{title, body, targetType?, targetId?}` |
| `GET` | `/api/announcements` | Any authenticated | List announcements visible to the caller. Supports `?limit=50&offset=0`. Each item includes `readAt` (null if unread). |
| `GET` | `/api/announcements/unread-count` | Any authenticated | Returns `{unreadCount: N}` — use for badge display. |
| `PATCH` | `/api/announcements/:id/read` | Any authenticated | Mark an announcement as read. Idempotent. |

### Target types

| `targetType` | Who sees it |
|---|---|
| `all` (default) | Every authenticated user |
| `individual` | Only the player whose UUID matches `targetId` |
| `group` | (Future) players with a matching CRM group tag |

### Example — send an announcement

```js
// Coach client
await apiFetch('/api/announcements', {
  method: 'POST',
  body: JSON.stringify({ title: 'Session tonight', body: 'We meet at 7pm on the main table.' }),
});

// Student client — poll or load on mount
const { announcements } = await apiFetch('/api/announcements').then(r => r.json());
const { unreadCount }   = await apiFetch('/api/announcements/unread-count').then(r => r.json());
```

---

## 6. Coach Intelligence

The Coach Intelligence Layer surfaces prioritized, actionable insights to the coach across four admin pages (accessible to `admin` / `superadmin` / `coach` roles).

> **Status (2026-04-01):** Prep Brief API (`GET /api/coach/students/:id/prep-brief` + refresh) is live. DB migration 018 (POK-41) and BaselineService + SessionQualityService (POK-43) are implemented and tested. Alert feed baseline data will be live once the migration is applied to the database; AlertService (POK-44) is the remaining dependency for full alert generation.

### Alert Feed — `/admin/alerts`

Accessed via the **Coach Alerts** nav tile on the lobby.

- **Needs Attention** section — students sorted by severity score (0.0–1.0):
  - 🔴 ≥ 0.75 — Critical (red)
  - 🟠 0.50–0.74 — Warning (orange)
  - 🟡 < 0.50 — Low (yellow)
  - Alert types: `mistake_spike`, `inactivity`, `volume_drop`, `losing_streak`, `stat_regression`
  - Actions: **Dismiss** (hides from feed), **Review →** (navigates to CRM)
- **Milestones** section — 🟢 positive events (first profitable week, stat improvement)

### Session Prep Brief — CRM student profile → PREP BRIEF tab

Full brief assembled before sitting with a student:
- **Active Alerts** — any outstanding alerts
- **Top Leaks** — student rate vs stable average with trend direction
- **Stats Snapshot** — current vs previous period, per-stat delta
- **Hands to Review** — top 5 by review score (mistake tags + equity decisions + depth)
- **Coach's Last Notes** — most recent session notes
- **Recent Sessions** — last 5: date, hands, net chips, quality score
- **Refresh** button — calls `POST /api/coach/students/:id/prep-brief/refresh` to force-regenerate

### Progress Reports — CRM student profile → REPORTS tab

Periodic performance summaries:
- **Report list** — weekly/monthly cards showing period, grade (0–100), and net chip result
- **Report detail** (tap a card) — full breakdown:
  - Overall grade prominently displayed (green ≥80, gold 60–79, red <60)
  - Stat changes table (vs prior period) with ▲/▼/= arrows
  - Mistake trends (per tag, this vs last period)
  - Leak coaching effectiveness (which leaks improved/worsened)
  - Key hands: best, worst, most instructive
- **Previous/Next week** navigation
- **Share with Student** button (placeholder)

### Stable Overview — `/admin/stable`

Accessed via the **Stable Report** nav tile on the lobby. Coach-level weekly summary of all students:
- **Stable Averages** — avg grade, grade delta, active/total students, total hands
- **Top Improvers** — top 3 by grade improvement this week
- **Needs Attention** — bottom 3 by grade or flagged as inactive
- Click any student row to navigate to their CRM profile

### Wiring to real APIs

When the backend ships these endpoints, update the mock constants in each component file:

| Surface | File | Endpoint |
|---|---|---|
| Alert feed | `CoachAlertsPage.jsx` | `GET /api/coach/alerts`, `PATCH /api/coach/alerts/:id` |
| Prep brief | `PrepBriefTab.jsx` | `GET /api/coach/students/:id/prep-brief` |
| Reports | `ReportsTab.jsx` | `GET /api/coach/students/:id/reports` |
| Stable overview | `StableOverviewPage.jsx` | `GET /api/coach/reports/stable` |

---

## 6. Global Layout & Navigation

All authenticated pages (except auth and full-screen table views) use the **AppLayout**: a persistent icon-only **SideNav** on the left and a **GlobalTopBar** across the top.

- **GlobalTopBar** — shows the app logo, current page context, role pill (Coach/Student/Admin/Trial), chip bank balance (students), and user dropdown menu.
- **SideNav** — icon-only sidebar with role-based items. Coaches see: Lobby, Tables, CRM, Scenarios, Hand History, AI Analysis, Stats, Leaderboard, Tournaments, Alerts, Settings. Students see a reduced set (no CRM, no Scenarios, no Analysis, no Alerts).
- **Quick Stats Bar** — role-dependent stat pills below the TopBar (e.g., Active Tables / Students Online / Hands This Week for coaches; Chip Bank / Hands Played / VPIP / Leaderboard Rank for students).

## 6. Lobby & Tables

After logging in you land on the **Lobby** (`/lobby`).

### Lobby layout (role-variant)

**Coach view:** Quick stats row (5 pills), Needs Attention alert feed, table card grid with filter tabs (All/Cash/Tournament/My Tables/School/Open), "+ New Table" ghost card, Recent Activity feed.

**Coached Student view:** Quick stats (Chip Bank, Hands, VPIP, PFR, Rank), Announcement banner, Upcoming Sessions widget, table grid with JOIN/PLAYING/SPECTATE buttons.

**Solo Student view:** Simplified stats (3 pills), no announcements, minimal sidebar. Same table grid.

**Trial view:** Trial countdown banner (days + hands remaining), Subscribe/Join Coach CTAs, only Open tables visible.

**Admin view:** Like Coach but with platform-wide stats, all tables across all coaches visible, full sidebar.

- **Leaderboard** (`/leaderboard`) — full ranked player table sortable with medal ranks, period filter tabs, and search. Accessible from the SideNav.

### Joining a table
Click **Join** on any table tile in the lobby, or navigate directly to `/table/:tableId`.

### Creating a table (coach / admin)
Click **+ Create Table** in the lobby. Choose mode, name, and optional scheduled start time.

### Multi-table view
Coaches and admins can open `/multi` for a grid overview of all active tables. Focused table (click to select) renders a full table view; unfocused tables show status chips. The **Broadcast Bar** at the bottom sends Start / Reset / Pause / Advance Blinds to all tables simultaneously.

### Game modes

| Mode | Description |
|------|-------------|
| **coached_cash** | Coach controls dealing, config, undo. Players bet. Coach is an observer. |
| **uncoached_cash** | Auto-deals after each hand. All users (including coaches) are seated players. |
| **tournament** | Auto-deals with a blind schedule and elimination tracking. All users are players. |

### Network access
- Same-LAN players: use the server's IP on port 3001 (or the Vite network URL in dev mode).
- Remote play: `ngrok http 3001` and share the URL.

---

## 6. Coach Controls (coached_cash mode only)

The **coach sidebar** appears on the right (collapsible). It has three tabs:

### GAME tab
- **GAME CONTROLS** — start/reset hands, pause, mode selection; hand config (manual mode)
- **BLIND LEVELS** — change BB between hands (collapsed by default)
- **UNDO CONTROLS** — undo last action / rollback street (collapsed by default)
- **ADJUST STACKS** — directly set any player's chip count (collapsed by default)
- **PLAYERS** — seated players with in-hand toggles and hole card view (collapsed by default)

### HANDS tab
- **HAND LIBRARY** — search and load historical hands; load as scenario or activate as drill
- **HISTORY** — recent hand history with expandable detail
- **+ Build Scenario** button — navigates to the Scenario Builder admin page

### PLAYLISTS tab
- **PLAYLISTS** — create / manage / activate hand playlists

A sticky strip at the top of the sidebar shows the current phase badge and pot size at all times.

### TAG HAND Pill

While a hand is in progress, a **TAG HAND** pill button floats in the top-right corner (below the TopBar, to the left of the sidebar). Click it to expand a chip panel with quick tags: **Review, Bluff, Hero Call, Mistake, Key Hand, 3-Bet Pot**. Selected tags are saved automatically (debounced). The pill collapses and resets at the start of each new hand.

**Auto-playlist from tags:** When you save a manual tag on a hand, a playlist is automatically created with that tag's name if one doesn't already exist, and the hand is added to it.

### GAME CONTROLS

| Button | What it does |
|--------|-------------|
| **RNG MODE / MANUAL MODE** | Toggle between random-deal and configured-hand modes |
| **Start Hand** | Deals a new hand |
| **Reset** | Resets to the waiting lobby |
| **Pause / Resume** | Freezes the action timer; players cannot act while paused |
| **EV OVERLAY — Coach** | Show/hide equity % badges on all seats in the coach's own view |
| **EV OVERLAY — Players** | Broadcast equity % to all players; they see their own equity above the action bar |
| **⬡ Share Range** | Open a 13×13 matrix modal, select a range, and broadcast it to all clients as an overlay |

### BLIND LEVELS

Change the big blind **between hands** (disabled during an active hand).

- Enter a new **BB** value. The small blind is automatically set to `floor(BB / 2)`. Click **Set Blinds**.
- Any player joining after blinds are set receives a default stack of **100 × the new BB**.
- Default blind levels are **5/10** (1,000-chip stack).

### GAME CONTROLS — Card Config (manual mode)

All card picking is done through the GAME CONTROLS section (via Configure Hand) — clicking cards on the table does nothing. Click any card slot in the HandConfigPanel to open the card picker.

### UNDO CONTROLS

- **Undo Last Action** — roll back the most recent player action
- **Rollback Street** — roll back to the start of the current street
- **Force Next Street** — skip immediately to the next community card street

### ADJUST STACKS

Directly set any player's chip count between hands.

### PLAYERS

Lists every seated player. The coach can:
- **Exclude / include a player from the next hand** using the ✕/✓ toggle before clicking Start Hand.

### Player Stats Hover Cards

Hover over any player's seat on the table to see their stats (visible to all clients):

| Stat | Session | All-time |
|------|---------|----------|
| VPIP | ✓ | ✓ |
| PFR | ✓ | ✓ |
| WTSD | ✓ | ✓ |
| WSD | ✓ | ✓ |
| 3-bet % | ✓ | ✓ |
| Alltime Winning | — | ✓ (0 if negative) |

### HAND LIBRARY

Search historical hands by player name, date, or auto-tags. Each row shows a **hand-group chip** (e.g. "AKo") if the hero's hole cards are available. Per result:
- **Load** (blue) — pre-fills cards for a new hand
- **+ Playlist** — adds to a selected playlist

Per result:
- **Load** (blue) — pre-fills cards for a new hand
- **+ Playlist** — adds to a selected playlist

**Filter by Range** — click the "⬡ Filter by Range" toggle above the hand list to expand a 13×13 matrix. Click cells to filter the list to only hands where the hero was dealt those hand groups. A chip count badge on the button shows how many groups are active. Click "Clear filter" to reset.

### HISTORY

Last 10 hands with expandable detail: full board, player stacks, hole cards, and every action.

---

## 6. Configuring a Hand (Manual / Hybrid Mode)

1. Click **Configure Hand** in Section 1 (only visible between hands).
2. For each player, use the **Cards / Range / Matrix** toggle:
   - **Cards** — click the two card slots to pin specific hole cards.
   - **Range** — click scenario tags to constrain the dealt hand. The server picks randomly from the intersection of all selected tags.
   - **Matrix** — click cells on the interactive 13×13 hand grid to select any combination of hand groups (AA, AKs, QJo, etc.). The selected cells are highlighted green; a combo count is shown below the grid.
3. **Range tag groups** (radio within each group, intersect across groups):
   - **PAIRS:** All Pairs · QQ+ · 77-JJ · 22-66
   - **SUIT:** Suited · Offsuit
   - **TYPE:** Broadway · Connectors · 1-Gap · Ace-high · King-high
   - **SHORTCUT:** ATo+ · KJo+ · Premium (TT+,AK) · Strong (77+,AJ+,KQ)
   - A combo count badge shows how many combos are in the intersection. Incompatible combinations (e.g. Pairs + Suited) show 0 combos and fall through to random.
4. Set specific board cards (flop/turn/river) or leave any slot blank for random.
5. Optionally expand **Board Texture** to constrain the flop:
   - **Suit:** Rainbow | Flush Draw | Monotone
   - **Pair:** Unpaired | Paired | Trips
   - **Connect:** Connected | Disconnected
   - **High:** Broadway | Low | Ace High
   - Select at most one per group. The system retries the flop up to 100 times until all constraints are satisfied.
6. Click **Start Hand**. The server validates everything before dealing — errors are shown as notifications.

> Hole cards are keyed to each player's stable identity, not their current socket connection, so reconnecting between configuring and starting is safe.

---

## 7. Equity Overlays & Range Tools

### Live Equity (EV Overlay)

Equity (win probability) is computed automatically at the start of each hand and after each street. The coach controls visibility:

- **Coach view** — toggle "EV OVERLAY → Coach" in Game Controls to show/hide equity badges above each player's seat chip (green >55%, amber 40–55%, red <40%).
- **Player view** — toggle "EV OVERLAY → Players" to broadcast equity to all seated players. Players see their own equity as a line above the action buttons.
- **Showdown** — equity is always shown to everyone after the last card is dealt.

### Shared Range Overlay

1. Click **⬡ Share Range** in Game Controls.
2. Select hand groups in the 13×13 matrix modal and optionally add a label.
3. Click **Broadcast** — a floating overlay appears for all clients showing the matrix.
4. Each client can dismiss their overlay independently. You can re-broadcast any time.

> During the waiting phase the overlay is labeled **Warmup** — useful for pre-session range discussion.

### Auto-Tags — Equity-Based Mistakes

The hand analyzer now includes equity-based tags:

| Tag | Meaning |
|-----|---------|
| `DREW_THIN` | Called a bet with <25% equity |
| `EQUITY_FOLD` | Folded with >50% equity |
| `VALUE_BACKED` | Bet/raised with >70% equity |
| `EQUITY_BLUFF` | Bet/raised with <30% equity and got called |

---

## 8. Playing as a Player

- Your hole cards are visible only to you (face-down to others).
- **BB view toggle** — click the **Chips / BB** pill button in the **top bar (top-left)** to switch between flat chip counts (e.g. "1,000") and big-blind units (e.g. "100bb"). This is a personal setting — it only affects your view and is remembered across sessions via `localStorage`.
- When it is your turn, the action panel slides up from the bottom:
  - **Fold** — give up your hand.
  - **Check** — pass (only when no bet is outstanding).
  - **Call** — match the current bet.
  - **Raise** — open the raise panel, choose an amount (slider, quick-buttons: ½ pot / 1× pot / 2× pot / all-in), then click Raise again to confirm.
- You have **60 seconds** to act. The timer bar counts down. If you run out of time you are automatically folded.
- If you disconnect during your turn, the timer pauses. You have 60 seconds to reconnect before being removed from the game.

---

## 8. Stats Dashboard

Click the **Stats** button (top bar, coach only) to open the full stats dashboard.

- **Hand History** — full list of the last 50 hands with winner, pot, phase-ended, and all tags.
- **Player Drilldown** — click any player row for their career stats, hand-by-hand breakdown, and tagged hands.

Stats are stored in Supabase (PostgreSQL) and persist across server restarts and deployments. All data loads through Express — no Supabase credentials are embedded in the browser.

---

## 9. Error Recovery

The poker table and coach sidebar are each wrapped in a React **error boundary**. If an unexpected JavaScript error occurs inside one of those panels:

- A "Something went wrong" overlay is shown in that panel instead of a blank screen.
- Two buttons are offered: **Reload page** (full reload) and **Try again** (clears the error and re-renders).
- The error is logged best-effort to `/api/logs/client-error` on the server (non-blocking — no user impact if the request fails).
- The rest of the UI (top bar, card picker, stats panel) remains functional.

---

## 10. Disconnection Handling

- A disconnected player's seat shows an amber **OFFLINE** badge at 50% opacity.
- If it is their turn when they disconnect, the timer is paused.
- They have **60 seconds** to reconnect. On reconnect the timer resumes from where it left off.
- After 60 seconds with no reconnect the player is removed and the game continues.
- If the **coach** disconnects, the game is automatically paused for all players until the coach returns.

---

## 10. Admin Features

Admin pages are accessible from the SideNav (require `admin:access` permission).

### User Management (`/admin/users`)
- Searchable user table with Name, Email, Roles (pill), Status (pill), Coach, Joined columns
- Per-row actions menu: View Profile, Change Role, Assign to Coach, Reset Password, Reload Chips, Suspend/Delete Account
- Add User modal: name, email, temp password, role, coach, initial chip balance
- Super Admin: Login as User (impersonation with audit log)
- Pagination (15 per page), CSV export

### Scenario Builder (`/admin/hands`)
- Two-panel layout: Library (left) + Builder (right)
- **Library — Scenarios tab:** search, tag/player filters, scenario cards with mode indicator (Fixed/Range)
- **Library — Playlists tab:** playlist cards with scenario count and tags
- **Builder — Scenario:** name, tags, mode toggle, blind mode, player config with card pickers or range selectors, board state, mini preview
- **Builder — Playlist:** name, tags, execution settings (ordering, advance mode), drag-reorderable scenario list, student/group assignments
- Also accessible from CoachSidebar → HANDS tab → "+ Build Scenario"

### Player CRM (`/admin/crm`)
Requires `crm:view` / `crm:edit` permissions. Master-detail layout.
- **Left panel (StudentRoster):** color-coded alert dots (red/orange/green/grey), search, group/tag filters, + Add Student, Bulk Actions
- **8-tab detail panel:**
  - **INFO:** profile, chip bank balance, reload, recent transactions
  - **SESSIONS:** session history table (date, table, hands, net, score), attendance tracking
  - **STATS:** 5 stat pills (VPIP, PFR, 3bet%, WTSD, Agg) with trends, TrendChart, mistakes per 100 hands, vs school average
  - **NOTES:** coach notes with tags, filterable, new note input
  - **STAKING:** staking ledger, contract terms, monthly P&L summary
  - **SCENARIOS:** assigned playlists with completion rates, scenario history
  - **REPORTS:** weekly/monthly progress reports with grade, stat changes, leak progress
  - **PREP BRIEF:** session prep: top leaks, stats snapshot, hands to review, recent notes/sessions

### Stable Overview (`/admin/stable`)
- Aggregate view of all students — 4 stat pills (Avg Grade, Active Students, Total Hands, Avg Hands/Student)
- Top Improvers and Needs Attention panels
- All Students table (sortable, searchable, filterable by group)
- Group Breakdown table — click any row to navigate to CRM

### Coach Alerts (`/admin/alerts`)
- Active/Dismissed toggle tabs, type/severity filters
- Alert cards: Mistake Spike (red), Inactivity (orange), Losing Streak (yellow), Milestone (green)
- Actions: Review in CRM, View Hands/Sessions, Dismiss
- Configurable alert thresholds (inactivity days, mistake spike multiplier, losing streak sessions, regression sigma)

### AI Analysis (`/analysis`)
- Coach/Admin only. Student selector, date range, Run Analysis button
- Tag distribution and mistake breakdown bar charts
- Flagged hands list with links to Review Table

### Tournament Setup (`/admin/tournaments`)
- Filter tabs: Upcoming / Active / Completed. Tournament cards with status, player count, buy-in
- 5-step creation wizard: Basic Info → Blind Structure → Payout Structure → Rules → Review & Create

### Referee Dashboard (`/admin/referee`)
- Full-width live tournament control. Tournament info bar with timer
- Controls: Next Level, Pause Clock, End Tournament
- Tables grid with player stacks and Move Player dropdown
- Eliminations list, Blind Schedule table (current level highlighted)

## 10b. New Pages

### Review Table (`/review`)
- Two-panel read-only hand replay: poker table visualization (left) + Review Panel (right)
- Review Panel: expandable timeline (street sections with actions), step-through controls (first/prev/play/next/last), scrubber bar
- Coach: annotation input + Save Note. Student: read-only annotations.
- Prev/Next Hand navigation

### Hand History (`/history`)
- Filterable hand browser: Student, Table, Date range, Tags multi-select, Scenarios only / Mistakes only checkboxes
- Results table: Hand #, Date, Table, Tags (pills), Net
- Click any hand → opens in Review Table
- Coach sees all students. Student sees own hands only.
- Pagination (25 per page)

### Settings (`/settings`)
Tabbed page with role-dependent tab visibility:
- **Table Defaults** (Coach/Admin): default game type, blinds, buy-in, rebuy, time bank, showdown, disconnection settings
- **School** (Coach): school name/description, leaderboard config, groups/cohorts, announcements
- **Org** (Admin): default blind structures, platform limits, open table auto-spawn, leaderboard defaults
- **Platform** (Super Admin): school agreements (student caps, AI quotas, feature toggles, branding), system health
- **Profile** (all roles): avatar, name, email, password change

---

## 11. Tournament Mode

### Tournament Lifecycle

1. **Create** — admin/coach navigates to `/admin/tournaments` and fills in the creation wizard (name, blind schedule, starting stack, rebuy settings). Clicking "Create Tournament" creates the table and config, then redirects to the Tournament Lobby.

2. **Lobby** (`/tournament/:tableId/lobby`) — pre-start view showing:
   - Tournament config (starting stack, levels, rebuy rules, scheduled start time)
   - Full blind structure sheet
   - Countdown timer if a scheduled start time was set
   - "Start Tournament" button (coaches only) — starts the blind timer and deals the first hand
   - "Join Table" button (players) — goes directly to the table seat

3. **In-progress** — **TournamentInfoPanel** (right side overlay) shows:
   - Current blind level and SB/BB/ante
   - Countdown timer (color shifts amber → red as the level expires)
   - Player count remaining
   - Recent eliminations feed (last 5)
   - **Advance Level** and **End Tournament** coach controls (confirmation modal)
   - Blind levels advance automatically on a timer
   - Eliminations: when a player's stack reaches 0, they are recorded in standings and marked out of future hands

4. **Standings** (`/tournament/:tableId/standings`) — automatically navigated to 3 seconds after `tournament:ended` fires. Shows:
   - Winner banner (gold)
   - Full final standings table with finish position, player name, chip count at elimination, prize (if set)
   - Tournament summary footer

### Player Table Balancing (Referee / Coach)

The server supports a `tournament:move_player` socket event for moving players between tables:

```js
socket.emit('tournament:move_player', {
  fromTableId: 'tournament-123',
  toTableId:   'tournament-456',
  playerId:    '<uuid>',
});
```

The Referee Dashboard provides a UI for this via the "Move Player" button on each table card.

---

## 12. Running Tests

Server tests (Jest):
```bash
cd server
npx jest --no-coverage
```
Expected: **~2012 tests passing** across 77 suites.

Client tests (Vitest + React Testing Library):
```bash
cd client
npm test
```
Expected: **677 tests passing** across 30 suites.

Batch integration simulation (100 scenario batches × 20 hands each):
```bash
npm run batches            # run all batches (B01–B244)
npm run batches -- 145 244 # run specific range
```
Expected: 0 crashes, 0 anomalies.

---

## 11. Environment Variables

### Server (`.env` at project root)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `SUPABASE_URL` | *(required)* | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | *(required)* | Service role key — used for all DB access (only the server ever holds this) |
| `SESSION_SECRET` | *(required — server exits if missing)* | Signs player JWTs — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | `http://localhost:5173` in dev, `''` in production | Allowed origin for CORS — set to your domain in production (e.g. `https://poker.example.com`) |

> The client has no `.env` file. The browser never receives any Supabase credentials.
> There is no `COACH_PASSWORD` variable. Coach access is granted by adding a `coach` role row to `players.csv`.

---

## 12. Resetting the Database

The database lives in Supabase. To clear hand history:

1. Open the Supabase dashboard → Table Editor.
2. Truncate the `hand_actions`, `hand_players`, `hand_tags`, `hands`, and `sessions` tables (in that order, to respect foreign keys).
3. Optionally truncate `leaderboard` and `session_player_stats` to reset aggregated stats.

> Player identities (`player_profiles`) are separate — truncating hand tables does not revoke access.
> To revoke a player's access, remove their row from `players.csv` and restart the server.

---

## 13. Cloud Deployment

The app runs as a single service on port 3001. Deploy to Render, Railway, Fly.io, or any Node.js host:

1. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, and `CORS_ORIGIN` as environment variables on the host.
2. Upload `players.csv` to a persistent volume or bake it into your deployment image.
3. Build command: `npm run build` (root `package.json`).
4. Start command: `npm start` (root `package.json`).

No persistent disk is needed — all data lives in Supabase. A `Dockerfile` and `fly.toml` are included for Docker and Fly.io deployments.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot connect to server" | Make sure `node index.js` is running in `server/`. Check port 3001 is not blocked. |
| Players can't reach the game | Use the server's IP address, not `localhost`. Port 3001 must be reachable on the network. |
| Stale UI after code changes | Run `npm run build` in `client/` and restart the server. |
| Coach sidebar not visible | Make sure your name has `role: coach` in `players.csv` and you logged in correctly. |
| Hand history not saving | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set correctly in `.env`. |
| Stats Dashboard shows no data | Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in `.env` and the server is running. |
| "Session expired" errors after restart | `SESSION_SECRET` changed between restarts; players need to log in again. |
| "Invalid name or password" | Check the name and password match a row in `players.csv` exactly (name is case-insensitive; password is exact). |
| Server exits immediately at startup | `players.csv` is missing or not found. Create it at the project root. |
