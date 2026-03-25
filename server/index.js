'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs      = require('fs');
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

const log             = require('./logs/logger');
const socketAuthMiddleware = require('./auth/socketAuthMiddleware');
const requireAuth     = require('./auth/requireAuth');
const requireRole     = require('./auth/requireRole');
const JwtService      = require('./auth/JwtService');
const PlayerRoster    = require('./auth/PlayerRoster');
const HandLogger      = require('./db/HandLoggerSupabase');
const supabaseAdmin   = require('./db/supabase');
const { generateHTMLReport }          = require('./reports/SessionReport');
const { generateReport: generateAlphaReport } = require('./logs/AlphaReporter');
const sharedState = require('./state/SharedState');

const { registerSocketHandlers } = require('./socket/index');

const registerHandRoutes        = require('./routes/hands');
const registerPlayerRoutes      = require('./routes/players');
const registerSessionRoutes     = require('./routes/sessions');
const registerPlaylistRoutes    = require('./routes/playlists');
const registerAuthRoutes        = require('./routes/auth');
const registerHealthRoute       = require('./routes/health');
const registerAlphaReportRoute  = require('./routes/alphaReport');

const { registerShutdown }  = require('./lifecycle/shutdown');
const { registerIdleTimer } = require('./lifecycle/idleTimer');

// ─── Startup checks ───────────────────────────────────────────────────────────

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('[startup] FATAL: SESSION_SECRET environment variable is not set.');
  console.error('[startup] Set a strong random secret in your .env file before starting the server.');
  console.error('[startup] Example: SESSION_SECRET=<run: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))")>');
  process.exit(1);
}

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || '';
if (!ALLOWED_ORIGIN && process.env.NODE_ENV === 'production') {
  console.warn('[startup] WARNING: CORS_ORIGIN is not set. Cross-origin requests will be blocked.');
  console.warn('[startup] Set CORS_ORIGIN=https://your-domain.com in your production .env file.');
}

// ─── Express + Socket.IO setup ───────────────────────────────────────────────

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());
app.use(log.httpMiddleware());

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: ALLOWED_ORIGIN, methods: ['GET', 'POST'] },
});

io.use(socketAuthMiddleware);

// ─── Rate limiter ─────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', message: 'Too many login attempts — try again in 15 minutes' },
});

// ─── Socket handlers ──────────────────────────────────────────────────────────

registerSocketHandlers(io);

// ─── REST routes ──────────────────────────────────────────────────────────────

registerHandRoutes(app, { requireAuth, HandLogger });
registerPlayerRoutes(app, { requireAuth, HandLogger });
registerSessionRoutes(app, { requireAuth, HandLogger, tables: sharedState.tables, generateHTMLReport });
registerPlaylistRoutes(app, { requireAuth, requireRole, HandLogger });
registerAuthRoutes(app, { HandLogger, PlayerRoster, JwtService, authLimiter, log });
registerHealthRoute(app, { supabaseAdmin, tables: sharedState.tables });
registerAlphaReportRoute(app, { generateAlphaReport, log });

// ─── Global Express error handler ────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  log.error('http', 'unhandled_error', `Unhandled Express error: ${err.message}`, {
    err: err.message, stack: err.stack?.slice(0, 500), path: req.path, method: req.method,
  });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

registerShutdown(sharedState.tables, sharedState.activeHands, HandLogger);

const IDLE_MINUTES = parseInt(process.env.IDLE_TIMEOUT_MINUTES, 10) || 0;
const scheduleIdleShutdown = registerIdleTimer(io, sharedState.activeHands, HandLogger, IDLE_MINUTES);

// ─── Static file serving (production) ────────────────────────────────────────

const CLIENT_DIST = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
  console.log(`[static] Serving React build from ${CLIENT_DIST}`);
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  httpServer.listen(PORT, () => {
    console.log(`Poker Training Server running on http://localhost:${PORT}`);
    if (scheduleIdleShutdown) scheduleIdleShutdown();
  });
}

module.exports = { app, httpServer, io, tables: sharedState.tables };
