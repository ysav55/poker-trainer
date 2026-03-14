# Poker Trainer — Getting Started

A real-time poker training tool for coaches and players. The coach controls the game (deal, pause, undo, configure hands); players join from any browser on the same network and act in turn.

---

## Requirements

- **Node.js** 18 or newer (includes npm)
- A modern browser (Chrome, Firefox, Edge, Safari)
- Players on the same local network, **or** a tunneling tool for remote access (see section 4)

---

## 1. First-Time Setup

Open a terminal in the `poker-trainer` folder and install dependencies for both the server and the client.

```bash
# Server dependencies (Express, Socket.io, SQLite, uuid, …)
cd server
npm install
cd ..

# Client dependencies (React, Vite, Tailwind, …)
cd client
npm install
cd ..
```

This only needs to be done once. After that you can skip straight to section 2.

---

## 2. Starting the Game (Every Session)

You need **two terminal windows** open at the same time.

**Terminal 1 — Start the server:**
```bash
cd poker-trainer/server
node index.js
```
You should see:
```
Server running on port 3001
```

**Terminal 2 — Start the client (dev mode):**
```bash
cd poker-trainer/client
npm run dev
```
You should see Vite print a local URL such as:
```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

Leave both terminals running for the entire session. The database file `poker_trainer.sqlite` is created automatically in the `poker-trainer` folder on first run.

---

## 3. Joining the Table (Same Network)

### Coach
1. Open `http://localhost:5173` in your browser.
2. Enter any name, select **Coach**, and click **Join Table**.
3. You will see the full coach sidebar on the right with all controls.

### Players (same Wi-Fi or LAN)
1. Players open the **Network URL** shown by Vite (e.g. `http://192.168.x.x:5173`) in their browser. They can use a phone, tablet, or laptop.
2. Each player enters their name, selects **Player**, and clicks **Join Table**.
3. They will see their seat on the poker table.

> **Tip:** The Network URL is printed by `npm run dev`. If players cannot reach it, make sure the coach's computer firewall allows connections on port 5173 and 3001.

---

## 4. Getting Players Online (Remote / Internet)

If players are not on the same Wi-Fi (e.g. playing over the internet), you need to expose the server and client to the internet. The easiest free option is **ngrok**.

### Option A — ngrok (recommended for quick sessions)

1. Download ngrok from [ngrok.com](https://ngrok.com) and create a free account.
2. With the server and client already running, open a third terminal:

```bash
# Expose the server (port 3001)
ngrok http 3001
```

ngrok prints a public URL like `https://abc123.ngrok-free.app`.

3. Tell players to open your **client URL** (the Vite local URL or another ngrok tunnel for port 5173).
4. Before sharing, update the socket URL in the client so it points to the public server:

   Open `client/src/hooks/useSocket.js` and change line 3:
   ```js
   // Before:
   const SOCKET_URL = 'http://localhost:3001';
   // After (paste your ngrok URL):
   const SOCKET_URL = 'https://abc123.ngrok-free.app';
   ```
   Save the file — Vite hot-reloads automatically.

5. Optionally run a second ngrok tunnel for the client:
   ```bash
   ngrok http 5173
   ```
   Share the resulting URL (e.g. `https://xyz789.ngrok-free.app`) with players. They open it in any browser, no installation required.

### Option B — Deploy permanently (advanced)

For a permanent hosted game, deploy:
- The **server** to any Node.js host (Railway, Render, Fly.io, VPS). Set `PORT` environment variable.
- The **client** with `npm run build` and serve the `dist/` folder from any static host (Vercel, Netlify, Cloudflare Pages).
- Set `VITE_SOCKET_URL` in the client build environment to your server's public URL.

---

## 5. How to Play — Coach Controls

Once players have joined, the coach controls the session from the right sidebar.

| Action | How |
|--------|-----|
| **Start a hand (random)** | Click **Start Hand** in Game Controls |
| **Configure a hand** | Click **Configure Hand** → set specific hole cards and board cards → **Start Hand** |
| **Pause / Resume** | Click the Pause button — the action timer stops while paused |
| **Skip to next street** | **Force Next Street** — deals the flop, turn, or river immediately |
| **Undo last action** | **Undo** — rolls back one player action |
| **Roll back to previous street** | **Rollback Street** |
| **Manually deal a card** | Click any face-down card on the table to pick a specific card |
| **Award pot manually** | **Award Pot To** → pick a player (for training scenarios where auto-showdown is overridden) |
| **Adjust a player's stack** | **Adjust Stack** → enter the player ID and new chip total |
| **Next hand** | **Reset Hand** after a hand ends |

### Session Stats (Section 6)
After each hand the sidebar shows live VPIP / PFR / WTSD / WSD stats for every player. These reset when the server restarts.

### Hand History (Section 7)
Click **History** to see the last 10 hands. Click any hand row to expand board, player stacks, and full action log. The history is persisted to `poker_trainer.sqlite` and survives server restarts.

### Live Hand Tags (Section 8)
During a hand, click any tag button (3BET_POT, C-BET, CHECK_RAISE, BLUFF_CATCH, WHALE_POT, etc.) to label the current hand for review. Tags are local only and are not yet persisted to the database (see ISS-61).

### Playlist Manager (Section 9)
Create named playlists of hands for sequential replay. Activate a playlist to have `reset_hand` automatically load the next scenario. Use **Add to Playlist** from the Scenario Loader to build the queue.

### Scenario Loader (Section 10)
Search historical hands from the database and load them directly into the config phase (hole cards + board pre-filled). Optionally add the scenario to an active playlist for batch review sessions.

---

## 6. How to Play — Player View

- Your hole cards are shown only to you (face-down to everyone else).
- When it is your turn you will see **Fold / Check / Call / Raise** buttons.
- You have **30 seconds** to act — a timer counts down. If you do not act in time you are automatically folded.
- At showdown your cards are revealed and the winner is announced.

---

## 7. Stopping the Server

Press **Ctrl+C** in each terminal. The server saves any in-progress hand as "incomplete" in the database before shutting down.

---

## 8. Resetting Everything

To wipe the hand history database:
```bash
# From the poker-trainer folder:
rm poker_trainer.sqlite
```
The file is recreated automatically on next server start. Player session stats (in-memory) are always reset when the server restarts.

---

## 9. Running Tests

```bash
cd poker-trainer/server
npx jest --no-coverage
```

Expected output: **635 tests passing** across 12 test suites (excludes stress tests by default).

To also run the 1000-hand stress test:
```bash
npx jest --no-coverage --testPathPattern="stress"
```

**Client tests (Vitest + React Testing Library):**
```bash
cd poker-trainer/client
npm test
```

Expected output: **8 tests passing** across 4 suites (Spectator View, Reconnection Sync, Illegal Bet, Coach Opacity).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Cannot connect to server" | Make sure `node index.js` is running in `server/`. Check that port 3001 is not blocked by a firewall. |
| Players can't reach the game | Use the **Network URL** from Vite (not `localhost`). Both ports 5173 (client) and 3001 (server) must be reachable. |
| "better-sqlite3 not found" | Run `npm install` inside the `server/` folder. |
| Socket shows wrong port | Check `client/src/hooks/useSocket.js` line 3 — `SOCKET_URL` must be `http://<host>:3001`. |
| Coach sidebar not visible | Make sure you joined as **Coach**, not Player. Only one coach per table. |
| Hand history not saving | The `poker_trainer.sqlite` file is created in the `poker-trainer` root. Make sure the server process has write permission there. |
