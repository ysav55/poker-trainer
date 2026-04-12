# Poker Trainer

A real-time multi-table poker coaching platform. Coaches control coached tables (deal, undo, configure cards, manage playlists); players join from any browser and act in turn. Everything is persisted to **Supabase (PostgreSQL)** so hand history, player stats, and chip balances survive restarts and are accessible from any device.

## Quick Start (Local Development)

```bash
# Install dependencies
cd server && npm install && cd ..
cd client && npm install && cd ..
```

**`/.env`** (project root):
```
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SESSION_SECRET=<random-string-32-chars>
```

```bash
# Terminal 1 — server
cd server && node index.js
# → http://localhost:3001

# Terminal 2 — client (dev hot-reload)
cd client && npm run dev
# → http://localhost:5173
```

## Production Build

```bash
# Build the React client
cd client && npm run build && cd ..

# Start the server — serves both API and React SPA on port 3001
cd server && node index.js
```

## Deployment (Fly.io)

```bash
fly launch --name poker-trainer
fly secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SESSION_SECRET=...
fly deploy
```

Current production app: `poker-trainer-ysav55` (region `iad`, 512 MB shared CPU, scale-to-zero).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service-role key (server-side only, never sent to browser) |
| `SESSION_SECRET` | Yes | Random string — signs JWTs. Server exits on startup if missing. |
| `ANTHROPIC_API_KEY` | No | Enables NarratorService (Claude Haiku LLM narration). Gracefully absent. |
| `PORT` | No | HTTP port (default `3001`) |
| `IDLE_TIMEOUT_MINUTES` | No | Auto-shutdown idle timer (default `20`) |
| `ALLOWED_ORIGIN` | No | CORS origin (defaults to `http://localhost:5173` in dev) |

## Architecture

```
Express server (port 3001)
├── Socket.io       — real-time game events (11 handler groups)
├── REST API        — /api/* (18 route files)
├── /health         — Supabase ping; returns 503 if DB is down
└── /*              — React SPA (served from client/dist in production)

Database: Supabase (PostgreSQL)
├── Service-role key on server only
├── No Supabase credentials in the browser
└── All client data access via Express + JWT
```

## Roles

| Role | Description |
|---|---|
| `superadmin` | Full unrestricted access |
| `admin` | All admin panels, user management, all permissions |
| `coach` | Leads coached tables, tags hands, builds scenarios, manages playlists, runs coach intelligence |
| `moderator` | Can tag hands and run tables; limited admin access |
| `referee` | Creates and manages tournaments |
| `player` | Standard seated player |
| `trial` | 7-day / 20-hand trial access |
| `coached_student` | Trial student registered under a specific coach |
| `solo_student` | Trial student registered without a coach |

Roles map to 12 granular permissions enforced in both Express middleware and socket handlers.

## Game Modes

| Mode | Description |
|---|---|
| `coached_cash` | Coach controls dealing, undo, card config. Players bet. Coach is an observer. |
| `uncoached_cash` | Auto-deals. All users (including coaches) are seated players. |
| `tournament` | Auto-deals with a blind schedule and elimination tracking. |
| `bot_cash` | Autonomous table — no coach required; `BotDecisionService` plays all seats. |

## Tech Stack

- **Server:** Node.js 18+, Express 4, Socket.io 4
- **Client:** React 18, Vite 5, Tailwind CSS 3, Socket.io client 4
- **Database:** Supabase (PostgreSQL) — 24 migrations applied
- **Auth:** `players.csv` (bcrypt, primary) + DB-backed `player_profiles.password_hash` (secondary); JWT (7-day expiry)
- **LLM:** Claude Haiku via Anthropic API (optional — NarratorService only)
- **Tests:** Jest (server, 2148+ tests across 85 suites)

## Key Directories

```
server/
├── auth/           JwtService, requireAuth, requireRole, socketAuthMiddleware
├── game/           GameManager, SessionManager, HandEvaluator, AnalyzerService, tagAnalyzers/
├── db/             repositories/ (Hand, Player, Playlist, Tag, Session, School, ChipBank, …)
├── routes/         18 REST route files
├── socket/         handlers/ (11 groups: gameLifecycle, betting, replay, …)
├── services/       BaselineService, AlertService, ProgressReportService, SessionPrepService, NarratorService
├── state/          SharedState.js (7 shared Maps)
└── lifecycle/      shutdown.js, idleTimer.js

client/src/
├── hooks/          useSocket.js + 6 focused hooks
├── pages/          26 page components
├── components/     45+ components including AppLayout, CoachSidebar, PokerTable
└── lib/            api.js (apiFetch with JWT header)
```

## Adding Players

Edit `players.csv` (gitignored) — one player per line: `name,password_hash,role`

```bash
# After editing plain-text passwords:
node scripts/hash-passwords.js
```

Or use **Admin → User Management** in the app to create accounts via the UI.

## Database Migrations

All 24 migrations live in `supabase/migrations/`. Apply with:

```bash
supabase db push
# or paste individual SQL files into the Supabase SQL editor
```

Migrations 001–020b are applied to the live database. Migrations 021–024 cover hand annotations, schema fixes, and the groups/cohorts system.
