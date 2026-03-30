'use strict';

/**
 * Alpha-testing logger for Poker Trainer.
 *
 * Two sinks:
 *   1. stdout — always, as newline-delimited JSON (Fly.io captures these via `fly logs`)
 *   2. Supabase alpha_logs table — async, fire-and-forget, for errors/warns/key events
 *
 * In-memory ring buffers accumulate stats for the current process lifetime,
 * surfaced by the /api/alpha-report endpoint without a DB round-trip.
 *
 * Usage:
 *   const log = require('./logs/logger');
 *   log.error('db', 'write_failed', 'HandLogger.endHand threw', { handId, err: err.message });
 *   log.info('socket', 'join_room', 'player joined', { tableId, playerId, name });
 *   log.httpMiddleware()  → Express middleware that logs every request
 */

// Supabase is optional — logger must not crash if DB credentials are absent
// (CI test environment, cold-boot before .env is loaded, etc.)
let supabase = null;
try { supabase = require('../db/supabase'); } catch { /* no-op */ }

// ─── Level ordering ────────────────────────────────────────────────────────────
const LEVEL_ORDER = { error: 0, warn: 1, info: 2, debug: 3 };

// ─── In-memory ring buffers (survive across requests, reset on process restart) ─
const _mem = {
  startedAt: new Date(),
  counts:       {},   // { 'error:db': 3, 'info:socket': 12, 'total:error': 5 }
  recentErrors: [],   // last 100 error entries
  httpRequests: [],   // last 500 HTTP requests (method, path, status, ms)
  socketEvents: [],   // last 200 socket events
};

const MAX_RECENT_ERRORS  = 100;
const MAX_HTTP_REQUESTS  = 500;
const MAX_SOCKET_EVENTS  = 200;

// ─── Core log function ─────────────────────────────────────────────────────────

/**
 * @param {'error'|'warn'|'info'|'debug'} level
 * @param {string} category  – socket | http | game | db | auth | system | client
 * @param {string} event     – machine-readable name (join_room, db_write_failed …)
 * @param {string} message   – human-readable description
 * @param {object} [data]    – extra context: tableId, playerId, sessionId, durationMs, err …
 */
function log(level, category, event, message, data = {}) {
  const entry = {
    ts:       new Date().toISOString(),
    level,
    category,
    event,
    msg:      message,
    ...data,
  };

  // 1. stdout — Fly.io / local dev captures this
  process.stdout.write(JSON.stringify(entry) + '\n');

  // 2. In-memory counters
  const catKey   = `${level}:${category}`;
  const totalKey = `total:${level}`;
  _mem.counts[catKey]   = (_mem.counts[catKey]   || 0) + 1;
  _mem.counts[totalKey] = (_mem.counts[totalKey] || 0) + 1;
  _mem.counts['total:all'] = (_mem.counts['total:all'] || 0) + 1;

  if (level === 'error') {
    _mem.recentErrors.unshift(entry);
    if (_mem.recentErrors.length > MAX_RECENT_ERRORS) _mem.recentErrors.pop();
  }

  // 3. Supabase — persist errors, warns, and key info events
  const shouldPersist =
    LEVEL_ORDER[level] <= LEVEL_ORDER['warn'] ||
    (level === 'info' && ['auth', 'game', 'system', 'client'].includes(category));

  if (shouldPersist) {
    _persistAsync(level, category, event, message, data);
  }
}

// ─── Async Supabase write (never throws) ──────────────────────────────────────

async function _persistAsync(level, category, event, message, data) {
  if (!supabase) return; // no credentials available — skip DB persistence silently
  try {
    // Strip the 'err' field if it's an Error object — store only the message string
    const safeData = { ...data };
    if (safeData.err instanceof Error) safeData.err = safeData.err.message;

    await supabase.from('alpha_logs').insert({
      level,
      category,
      event,
      message,
      data:        Object.keys(safeData).length > 0 ? safeData : null,
      table_id:    safeData.tableId    ?? null,
      player_id:   safeData.playerId   ?? null,
      session_id:  safeData.sessionId  ?? null,
      duration_ms: safeData.durationMs ?? null,
    });
  } catch (e) {
    // Absolutely cannot let logger errors affect the server
    process.stderr.write(`[logger] supabase write failed: ${e.message}\n`);
  }
}

// ─── Express HTTP middleware ───────────────────────────────────────────────────

/**
 * Returns an Express middleware that logs every request + response.
 * Attach before routes:  app.use(log.httpMiddleware());
 */
function httpMiddleware() {
  return function alphaLogMiddleware(req, res, next) {
    const startMs = Date.now();

    res.on('finish', () => {
      const durationMs = Date.now() - startMs;
      const entry = {
        ts:         new Date().toISOString(),
        method:     req.method,
        path:       req.path,
        status:     res.statusCode,
        durationMs,
        userId:     req.user?.stableId ?? null,
      };

      // Ring buffer
      _mem.httpRequests.unshift(entry);
      if (_mem.httpRequests.length > MAX_HTTP_REQUESTS) _mem.httpRequests.pop();

      // Count
      const bucket = res.statusCode >= 500 ? '5xx'
                   : res.statusCode >= 400 ? '4xx'
                   : res.statusCode >= 300 ? '3xx'
                   : '2xx';
      _mem.counts[`http:${bucket}`] = (_mem.counts[`http:${bucket}`] || 0) + 1;

      // stdout for all non-health requests; log errors to Supabase
      if (req.path !== '/health') {
        const level = res.statusCode >= 500 ? 'error'
                    : res.statusCode >= 400 ? 'warn'
                    : 'debug';
        process.stdout.write(JSON.stringify({ ts: entry.ts, level, category: 'http',
          event: 'request', ...entry }) + '\n');

        if (res.statusCode >= 400) {
          _persistAsync(level, 'http', 'request_error',
            `${req.method} ${req.path} → ${res.statusCode}`, entry);
        }
      }
    });

    next();
  };
}

// ─── Socket event tracker (call at start of each handler) ─────────────────────

/**
 * Track a socket event in the ring buffer.
 * Lightweight — only writes to memory, not Supabase.
 */
function trackSocket(event, tableId, playerId, extra = {}) {
  const entry = { ts: new Date().toISOString(), event, tableId, playerId, ...extra };
  _mem.socketEvents.unshift(entry);
  if (_mem.socketEvents.length > MAX_SOCKET_EVENTS) _mem.socketEvents.pop();
  _mem.counts[`socket:${event}`] = (_mem.counts[`socket:${event}`] || 0) + 1;
}

// ─── Client error receiver (socket event handler body) ────────────────────────

/**
 * Call this from a 'client_error' socket event handler to persist client-side errors.
 */
function logClientError(socket, payload) {
  const { message, stack, context } = payload || {};
  log('error', 'client', 'client_error', message || 'Unknown client error', {
    tableId:  socket.data?.tableId,
    playerId: socket.data?.stableId,
    stack:    stack?.slice(0, 500),
    context,
  });
}

// ─── Stats accessors ──────────────────────────────────────────────────────────

function getMemStats() {
  return {
    uptimeSince:    _mem.startedAt.toISOString(),
    uptimeMs:       Date.now() - _mem.startedAt.getTime(),
    counts:         { ..._mem.counts },
    recentErrors:   _mem.recentErrors.slice(0, 50),
    recentRequests: _mem.httpRequests.slice(0, 50),
    recentSockets:  _mem.socketEvents.slice(0, 50),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

module.exports = {
  error: (category, event, message, data) => log('error', category, event, message, data),
  warn:  (category, event, message, data) => log('warn',  category, event, message, data),
  info:  (category, event, message, data) => log('info',  category, event, message, data),
  debug: (category, event, message, data) => log('debug', category, event, message, data),
  httpMiddleware,
  trackSocket,
  logClientError,
  getMemStats,
};
