# Poker Trainer — Getting Started

A real-time poker training tool. The **coach** controls the game (deal hands, pause, undo, configure specific cards, review history). **Players** join from any browser and act in turn. Everything is persisted to **Supabase (PostgreSQL)** so hand history and player stats survive restarts and are accessible from any device.

**Last updated:** 2026-03-24 — Replay controls moved inline (below table, replaces betting panel during replay); ghost seat cards now show face-down backs when hole cards missing; board suppressed as interactive during replay; markIncomplete saves board+cards on shutdown; number input spinners hidden globally; blind levels input overflow fixed.

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

## 3. Accounts

This is a **closed system** — there is no self-registration. The admin edits `players.csv` at the project root to add or remove players.

### Managing the player roster (`players.csv`)

```csv
# Poker Trainer — Player Roster
# Format: name,password,role
# role must be: coach   or   student
# Lines starting with # are ignored. Whitespace around commas is trimmed.

Coach,coach123,coach
Alice,alice123,student
Bob,bob123,student
```

- Add a row to give someone access.
- Delete a row to revoke access immediately (takes effect on next server restart, or call `reload()` in server console).
- `role` must be exactly `coach` or `student`.
- Names are case-insensitive for login but the capitalisation in the file is what appears in-game.
- There is no email field — name + password is sufficient.

> The server exits with a fatal error at startup if `players.csv` is missing.

### Logging in

1. Open the app — the **Log In** tab is shown by default.
2. Enter your **name** and **password** exactly as listed in `players.csv`. Click Log In.
3. The server returns a `stableId` that is stored in `localStorage` so your hand history persists across sessions.

### Watching without an account

Click **Watch**. Enter any name. You can see the table but cannot act or place bets.

### Joining as coach

Log in with a name that has `role: coach` in `players.csv`. The coach flag is granted automatically — there is no separate coach password.

---

## 4. Joining a Table

After logging in, everyone automatically joins the main table. Players on the same server see the same game.

- Players on the same Wi-Fi use the **Network URL** printed by Vite in dev mode (e.g. `http://192.168.x.x:5173`), or the server's IP on port 3001 in production.
- For remote/internet play, use [ngrok](https://ngrok.com): `ngrok http 3001` and share the resulting URL.

---

## 5. Coach Controls

The **coach sidebar** appears on the right (collapsible via the tab on its left edge). All sections are individually collapsible — click a section header to expand or collapse it. The default order is:

1. **GAME CONTROLS** — start/reset hands, pause, mode selection
2. **BLIND LEVELS** — change BB between hands (collapsed by default)
3. **CARD INJECTION** — manual card picker (manual mode only)
4. **UNDO CONTROLS** — undo last action / rollback street (collapsed by default)
5. **POT & STACKS** — award pot, adjust stacks (collapsed by default)
6. **PLAYERS** — seated players with in-hand toggles and hole card view
7. **PLAYLISTS** — create / manage / activate hand playlists (collapsed by default)
8. **SCENARIO LOADER** — search and load historical hands (collapsed by default)
9. **HISTORY** — recent hand history with expandable detail (collapsed by default)

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

### BLIND LEVELS

Change the big blind **between hands** (disabled during an active hand).

- Enter a new **BB** value. The small blind is automatically set to `floor(BB / 2)`. Click **Set Blinds**.
- Any player joining after blinds are set receives a default stack of **100 × the new BB**.
- Default blind levels are **5/10** (1,000-chip stack).

### REPLAY CONTROLS

When a hand is loaded via Replay, the **replay panel appears inline below the table** — replacing the betting controls for the duration of the replay. All hole cards are shown face-up for coaching.

| Control | What it does |
|---------|-------------|
| **Progress label** | Shows "N / Total" and the current action description |
| **Scrubber** | Drag to jump to any action |
| **◀ Back / Fwd ▶** | Step one action at a time |
| **Branch to Live from Here** | Switches to live play from the current board state. Coach acts for shadow players using the normal betting controls. |
| **Return to Replay** | Unwinds the live branch and restores the replay state. |
| **Exit Replay** | Ends replay and returns to the waiting lobby. |

> In branched mode, the coach acts for each shadow player's turn using the betting controls (showing "ACT FOR [name]").

### CARD INJECTION (manual mode)

All card picking is done through the sidebar only — clicking cards on the table does nothing. Click any card slot in CARD INJECTION to open the card picker.

### UNDO CONTROLS

- **Undo Last Action** — roll back the most recent player action
- **Rollback Street** — roll back to the start of the current street
- **Force Next Street** — skip immediately to the next community card street

### POT & STACKS

- **Award Pot To** — manually award the pot to any player
- **Adjust Stack** — directly set any player's chip count

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

### SCENARIO LOADER

Search historical hands by player name, date, or auto-tags. Per result:
- **Load** (blue) — pre-fills cards for a new hand
- **Replay** (purple) — enters Guided Replay Mode for that hand
- **+ Playlist** — adds to a selected playlist

### HISTORY

Last 10 hands with expandable detail: full board, player stacks, hole cards, and every action.

---

## 6. Configuring a Hand (Manual / Hybrid Mode)

1. Click **Configure Hand** in Section 1 (only visible between hands).
2. For each player, use the **Cards / Range** toggle:
   - **Cards** — click the two card slots to pin specific hole cards.
   - **Range** — click scenario tags to constrain the dealt hand. The server picks randomly from the intersection of all selected tags.
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

## 7. Playing as a Player

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

## 9. Disconnection Handling

- A disconnected player's seat shows an amber **OFFLINE** badge at 50% opacity.
- If it is their turn when they disconnect, the timer is paused.
- They have **60 seconds** to reconnect. On reconnect the timer resumes from where it left off.
- After 60 seconds with no reconnect the player is removed and the game continues.
- If the **coach** disconnects, the game is automatically paused for all players until the coach returns.

---

## 10. Running Tests

Server tests (Jest):
```bash
cd server
npx jest --no-coverage
```
Expected: **951 tests passing** across 21 suites.

Client tests (Vitest + React Testing Library):
```bash
cd client
npm test
```
Expected: **46 tests passing** across 3 suites.

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
| `SESSION_SECRET` | `dev-secret-change-in-production` | Signs player JWTs — set to a long random string in production |
| `CORS_ORIGIN` | `*` | Allowed origin for CORS — set to your domain in production (e.g. `https://poker.example.com`) |

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
