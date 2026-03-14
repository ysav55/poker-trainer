# Poker Trainer

A real-time poker coaching platform for training sessions. Coaches control the game; players act from their own devices.

## Quick Start (Local Development)

```bash
# 1. Install all dependencies
npm run install-all

# 2. Start the server (terminal 1)
npm run dev:server
# → http://localhost:3001

# 3. Start the client dev server (terminal 2)
npm run dev:client
# → http://localhost:5173
```

## Production Build (Single Service)

In production, the Express server serves the React build directly — one port, one process.

```bash
# Build the React client
npm run build

# Start the production server
npm start
# → http://localhost:3001  (serves both API and React app)
```

## Docker

```bash
# Build the image
docker build -t poker-trainer .

# Run with a persistent database volume
docker run -p 3001:3001 -v poker-data:/data poker-trainer
```

## One-Click Cloud Deployment

### Render.com

1. Push this repo to GitHub
2. Create a new **Web Service** on [Render](https://render.com)
3. Connect your GitHub repository
4. Configure:
   - **Build Command:** `npm run install-all && npm run build`
   - **Start Command:** `npm start`
   - **Environment:** Node
5. Add environment variables:
   | Variable | Description | Example |
   |---|---|---|
   | `PORT` | Server port (set automatically by Render) | `10000` |
   | `DATABASE_PATH` | Path to SQLite file (use a Render Disk) | `/data/poker_trainer.sqlite` |
6. Add a **Disk** (Render > your service > Disks): mount at `/data`

### Railway.app

1. Connect your GitHub repo to [Railway](https://railway.app)
2. Railway auto-detects the `npm start` script
3. Add environment variables:
   - `DATABASE_PATH=/data/poker_trainer.sqlite`
4. Add a **Volume** mounted at `/data`

### Fly.io

```bash
# Install flyctl, then:
fly launch --name poker-trainer
fly volumes create poker_data --size 1
fly secrets set DATABASE_PATH=/data/poker_trainer.sqlite
fly deploy
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP server port |
| `DATABASE_PATH` | `./poker_trainer.sqlite` | SQLite database file path |
| `NODE_ENV` | `development` | Set to `production` in deployment |

## Architecture

```
Single Express server (PORT 3001)
├── Socket.io   — real-time game events
├── REST API    — /api/hands, /api/playlists, /api/sessions
├── /health     — health check endpoint
└── /*          — React SPA (served from client/dist in production)
```

## Roles

| Role | How to join | Capabilities |
|---|---|---|
| **Coach** | Toggle "Join as Coach" | Full game control, undo, pause, playlists, scenario loading |
| **Player** | Default join | Fold/Check/Call/Raise betting actions |
| **Spectator** | Second coach join | View-only; no controls |

## Tech Stack

- **Server:** Node.js 18+, Express 4, Socket.io 4, better-sqlite3
- **Client:** React 18, Vite 5, Tailwind CSS 3, Socket.io client 4
- **Database:** SQLite (WAL mode, foreign keys enabled)
- **Tests:** Jest (server, 635 tests), Vitest + RTL (client, 8 tests)
