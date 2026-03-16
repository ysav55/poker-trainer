# Poker Trainer — Getting Started

A real-time poker training tool. The **coach** controls the game (deal hands, pause, undo, configure specific cards, review history). **Players** join from any browser and act in turn. Everything is persisted to a local database so hand history and player stats survive restarts.

**Last updated:** 2026-03-16 — Blind controls, BB view toggle, 100BB default stack, B145–B244 integration tests, in-hand toggle fix (ISS-72). 951 tests passing.

---

## Requirements

- **Node.js 18+** (includes npm)
- A modern browser (Chrome, Firefox, Edge, Safari)
- Players on the same local network, or a tunneling tool for remote access

---

## 1. First-Time Setup

```bash
# From the poker-trainer folder:
cd server && npm install && cd ..
cd client && npm install && cd ..
```

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

### Registering (first visit)

1. Open the app and choose the **Register** tab.
2. Enter a **display name**, **email**, and **password**. Click Register.
3. Your identity is saved to the database. On return visits you only need your name and password.

### Logging in (return visits)

1. Choose the **Log In** tab.
2. Enter your **name** and **password**. Click Log In.
3. If your browser still has your stored identity, the form is pre-filled and you go straight to the table.

### Watching without an account

Click **Watch**. Enter any name. You can see the table but cannot act or place bets.

### Joining as coach

Click **Coach**. Enter your name and the coach password (set via the `COACH_PASSWORD` environment variable). The coach has full control of the game and also plays at the table as a regular seat.

---

## 4. Joining a Table

After logging in or registering, enter a **table name** and click **Join Table**. Everyone who enters the same table name is in the same game.

- Players on the same Wi-Fi use the **Network URL** printed by Vite in dev mode (e.g. `http://192.168.x.x:5173`), or the server's IP on port 3001 in production.
- For remote/internet play, use [ngrok](https://ngrok.com): `ngrok http 3001` and share the resulting URL.

---

## 5. Coach Controls

The coach sidebar appears on the right. It has ten sections.

### Section 1 — Game Controls

| Button | What it does |
|--------|-------------|
| **Start Hand** | Deals a new hand (random cards by default) |
| **Configure Hand** | Opens the card configuration panel before dealing |
| **Pause / Resume** | Freezes the action timer; players cannot act while paused |
| **Force Next Street** | Skips to flop, turn, or river immediately |
| **Undo** | Rolls back the last player action |
| **Rollback Street** | Rolls back to the start of the current street |
| **Force Fold** | Folds the player whose turn it is |

### Section 2 — Manual Card Deal

While a hand is running in manual mode, click any face-down card on the table to pick a specific card to reveal.

### Section 3 — Pot & Stack Controls

- **Award Pot To** — manually award the pot to any player (useful for training scenarios where you want to override auto-showdown).
- **Adjust Stack** — directly set any player's chip count.

### Section 4 — Blind Levels

Change the small blind and big blind **between hands** (disabled during an active hand).

- Enter new **SB** and **BB** values (BB must be greater than SB).
- Click **Set Blinds** to apply. The current blinds are shown for reference.
- Any player who **joins the table after blinds are set** automatically receives a default stack of **100 × the new BB** (e.g. 25/50 blinds → 5,000 starting chips).
- The default blind levels are **5/10** (SB/BB), giving a 1,000-chip starting stack by default.

### Section 5 — Players

Lists every seated player. The coach can:
- **Exclude / include a player from the next hand** using the ✕/✓ toggle before clicking Start Hand. An excluded player sits out that hand only; the flag resets automatically after the hand starts.

### Section 6 — Session Stats

Live VPIP / PFR / WTSD / WSD stats for every player, updated after each hand. Resets when the server restarts. For persistent career stats see the Stats Dashboard below.

Click **Session Report** to open a full HTML report in a new browser tab — chip leaderboard, stats comparison, pattern summary, mistake flags, and key hand breakdowns for the current session.

### Section 7 — Hand History

Last 10 hands. Click any row to expand it: full board, player stacks, hole cards, and every action with street labels.

### Section 8 — Live Hand Tags

During a hand, click a tag button (3BET_POT, C-BET, CHECK_RAISE, BLUFF_CATCH, etc.) to label it for later review. Tags are saved to the database and visible in the Stats Dashboard.

### Section 9 — Playlist Manager

Create named playlists of hands and activate one for sequential replay. When a playlist is active, clicking Reset Hand automatically loads the next scenario in the queue.

### Section 10 — Scenario Loader

Search historical hands from the database by player name, date, or tags. There are two buttons per result:
- **Load** (blue) — loads the hand into the config phase so hole cards and board are pre-filled for a fresh hand.
- **Replay** (purple) — enters Guided Replay Mode for that hand (see Section 11 below). All hole cards are immediately visible.

Add scenarios to a playlist for batch review sessions.

### Section 11 — Replay Controls

Appears automatically when a hand is loaded via the **Replay** button. The table shows the hand state at the selected step, with all hole cards face-up for coaching.

| Control | What it does |
|---------|-------------|
| **Progress label** | Shows "Action N / Total" and describes the current action (player, street, action type, amount) |
| **Scrubber** | Drag to jump directly to any action in the hand |
| **◀ Back / Fwd ▶** | Step backward or forward one action at a time |
| **Branch to Live from Here** | Freezes the replay at the current state and switches to live play. Players can now act from that exact board/stack position to explore alternative lines. A **BRANCHED** badge replaces the REPLAY badge. |
| **Return to Replay** | Unwinds the live branch and returns to the exact replay step where you branched. |
| **Exit Replay** | Ends replay mode and returns to the waiting lobby. Player stacks are restored to their pre-replay values. |

> In replay mode, betting controls are hidden. Once you branch to live play, betting controls reappear and the game runs normally from the branched state.

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
- **BB view toggle** — click the **Chips / BB** pill button in the top-right of the table to switch between flat chip counts (e.g. "1,000") and big-blind units (e.g. "100bb"). This is a personal setting — it only affects your view and is remembered across sessions via `localStorage`.
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

- **Leaderboard** — ranked by net chips or VPIP/PFR across all recorded sessions.
- **Hand History** — full paginated list of all hands. Filter by player or date.
- **Player Drilldown** — click any player for their career stats, hand-by-hand breakdown, and tagged hands.

Stats are stored in `poker_trainer.sqlite` and persist across server restarts.

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
Expected: **951 tests passing** across 20 suites.

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

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_PATH` | `./poker_trainer.sqlite` | Path to the SQLite file |
| `COACH_PASSWORD` | *(none)* | Password required to join as coach |

Set these in a `.env` file at the project root or via your hosting platform's environment settings.

---

## 12. Resetting the Database

```bash
rm poker_trainer.sqlite
```

The file is recreated automatically on next server start. All hand history and player accounts are erased.

---

## 13. Cloud Deployment

The app runs as a single service on port 3001. Deploy to Render, Railway, Fly.io, or any Node.js host:

1. Set `DATABASE_PATH` to a persistent volume path (e.g. `/data/poker_trainer.sqlite`).
2. Set `COACH_PASSWORD`.
3. Build command: `npm run build` (root `package.json`).
4. Start command: `npm start` (root `package.json`).

A `Dockerfile` and `fly.toml` are included for Docker and Fly.io deployments.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot connect to server" | Make sure `node index.js` is running in `server/`. Check port 3001 is not blocked. |
| Players can't reach the game | Use the server's IP address, not `localhost`. Both port 3001 must be reachable on the network. |
| "better-sqlite3 not found" | Run `npm install` inside `server/`. |
| Stale UI after code changes | Run `npm run build` in `client/` and restart the server. |
| Coach sidebar not visible | Make sure you joined as Coach with the correct coach password. |
| Hand history not saving | Check the server has write permission at `DATABASE_PATH`. |
| "Please register or log in first" | Create an account on the Register tab before joining a table. |
