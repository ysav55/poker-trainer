# Poker Trainer — Getting Started

A real-time poker training tool. The **coach** controls the game (deal hands, pause, undo, configure specific cards, review history). **Players** join from any browser and act in turn. Everything is persisted to **Supabase (PostgreSQL)** so hand history and player stats survive restarts and are accessible from any device.

**Last updated:** 2026-03-31 — Gap fixes: replay UI removed from client (server-side ReplayEngine intact), AuthContext loading state added, JWT source unified through AuthContext, DB migrations 008–013 applied (RBAC, user management, tables registry, scenario configs, player CRM, tournaments).

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

This is a **closed system** — there is no self-registration. Admins create and manage accounts through the **Admin → User Management** panel (at `/admin/users`) or by editing `players.csv` at the project root (legacy path — still supported for bootstrapping).

### Roles

| Role | Description |
|------|-------------|
| `superadmin` | Full unrestricted access |
| `admin` | All permissions — user management, all admin panels |
| `coach` | Leads coached tables, tags hands, builds scenarios, manages playlists |
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

## 4. Lobby & Tables

After logging in you land on the **Lobby** (`/lobby`).

### Lobby layout
- **Stats row** — hands played, net chips, VPIP since login
- **Active Tables** — live card grid of open tables with a **Join** button on each tile
- **Recent Hands** — last 5 completed hands with tags and net chips
- **Playlists** — visible to coaches; quick access to activate drills
- **Admin nav pills** — Users / Hands / CRM / Tournaments — visible to roles with `admin:access`

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

## 5. Coach Controls (coached_cash mode only)

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

Admin pages are accessible from the lobby nav pills (require `admin:access` permission).

### User Management (`/admin/users`)
- Create users with name, password, role, optional email, and notes
- Edit role, status (active/archived), and profile details
- Reset passwords
- Assign/remove roles

### Scenario Builder (`/admin/hands`)
- Build hand scenarios for drill playlists
- Configure hole cards, board, stacks, and positions with a vertical flow UI
- Save scenarios to playlists — students replay them as ordered drills
- Also accessible from CoachSidebar → HANDS tab → "+ Build Scenario"

### Player CRM (`/admin/crm`)
Requires `crm:view` / `crm:edit` permissions.
- **Left panel**: search/filter player list; assign tags; quick actions
- **OVERVIEW tab**: stats (hands, net chips, VPIP, PFR) + line chart of weekly snapshots
- **NOTES tab**: append-only coach notes with type badges (general / session_review / goal / weakness)
- **SCHEDULE tab**: upcoming coaching sessions; create / update status
- **HISTORY tab**: paginated hand history with tag filters

### Tournament Setup (`/admin/tournaments`)
Requires `tournament:manage` permission.
- Create a tournament: name, blind schedule (level rows with SB/BB/ante/duration), starting stack, rebuy settings
- Start/stop tournaments via the admin panel or the table page overlay

---

## 11. Tournament Mode

During a tournament:
- **TournamentInfoPanel** (right side overlay) shows: current blind level, countdown timer, player count, recent eliminations
- **Blind levels advance automatically** on a timer — the panel shows a gold pulse when < 15 s remain
- **Eliminations**: when a player's stack reaches 0, they are recorded in standings and removed from the hand. The panel shows their finish position.
- **Tournament ends** when one player remains. Final standings are shown and the table closes.

---

## 12. Running Tests

Server tests (Jest):
```bash
cd server
npx jest --no-coverage
```
Expected: **~1598 tests passing** across 59 suites.

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
