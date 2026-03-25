# Refactor Plan 04 — Authentication, Authorization & Security

**Target codebase:** `server/` (Node.js / Express / Socket.io)
**Status:** Planning — no code changes yet
**Date:** 2026-03-24
**Scope:** Auth consolidation, JWT layer fix, Socket.io middleware, coach guard deduplication, RBAC, PlayerRoster hardening, security hardening, test coverage, migration path

---

## 1. Current State Audit

### 1.1 Where auth logic lives today

| Location | What it does | Problem |
|---|---|---|
| `server/index.js` lines 116–127 | `requireAuth` Express middleware — strips Bearer token, calls `HandLogger.authenticateToken()` | Auth middleware delegates verification to the DB layer (wrong abstraction) |
| `server/index.js` lines 131–137 | `authLimiter` rate limiter for login endpoint | Fine as-is; belongs in auth module |
| `server/index.js` lines 1546–1576 | Login endpoint: calls `PlayerRoster.authenticate()`, calls `HandLogger.loginRosterPlayer()`, calls `jwt.sign()` directly | JWT signing mixed into route handler; `jwt` required in `index.js` for this one use |
| `server/index.js` lines 439–447 | `join_room` socket handler: calls `HandLogger.authenticateToken(token)` inline, derives `isCoach` and `stableId` from JWT payload | Token verification buried inside a game event handler — not a middleware concern |
| `server/index.js` lines 572–574, 707–1247 (30 occurrences) | `if (!socket.data.isCoach) return sendError(socket, '...')` — repeated 30 times | Guard pattern copied verbatim; any change to error format requires 30 edits |
| `server/db/HandLoggerSupabase.js` lines 830–845 | `authenticateToken(token)` — calls `jwt.verify()` with `process.env.SESSION_SECRET` | JWT verification in the database/persistence layer — architecture violation |
| `server/auth/PlayerRoster.js` | CSV load, bcrypt compare, `getRole()` | Good isolation; loads synchronously at require-time |

### 1.2 What is scattered or coupled wrong

1. **JWT in the data layer.** `HandLoggerSupabase.authenticateToken` requires `jsonwebtoken` and reads `SESSION_SECRET`. The data layer has no business knowing about session tokens. This coupling means every test that mocks `HandLoggerSupabase` must also stub `authenticateToken`.

2. **`jwt` required in two unrelated modules.** `server/index.js` requires `jsonwebtoken` at line 70 only to call `jwt.sign()` in the login handler. `HandLoggerSupabase.js` requires it again for `jwt.verify()`. No single authoritative JWT module.

3. **Login handler calls `jwt.sign()` directly.** The expiry is hard-coded as `'7d'`. Not configurable without editing the handler.

4. **No `io.use()` middleware for Socket.io auth.** Token verification happens inside `join_room`. If a socket somehow bypasses `join_room`, it will have undefined identity data and the 30 coach guards will behave inconsistently (`!undefined === true` passes the guard).

5. **Coach guard repetition.** 30 occurrences of `if (!socket.data.isCoach) return sendError(socket, 'Only the coach can ...')`. Message string varies per handler.

6. **Spectators skip auth entirely.** Lines 438–447: spectators never present a token. Intentional and acceptable but undocumented as a design decision.

7. **Playlist REST endpoints lack auth.** `GET /api/playlists`, `POST /api/playlists`, `DELETE /api/playlists/:id` have no `requireAuth` middleware. Any unauthenticated caller can create and delete playlists.

8. **`ALLOWED_ORIGIN` fallback is an empty string.** `process.env.CORS_ORIGIN || ''`. Passing empty string to `cors({ origin: '' })` may behave differently across `cors` versions. A `false` value would be safer.

9. **`PlayerRoster` has no hot-reload trigger.** `reload()` exists but is never called automatically. If `players.csv` is edited while the server runs, existing JWT sessions for deleted players remain valid until expiry.

10. **No token revocation mechanism.** JWTs are signed for 7 days. Removing a player from `players.csv` does not invalidate their outstanding token.

---

## 2. Auth Layer Consolidation

### Proposed `server/auth/` module structure

```
server/auth/
  PlayerRoster.js          (existing — keep, minor additions)
  JwtService.js            (new — single source of truth for JWT sign/verify)
  socketAuthMiddleware.js  (new — io.use() middleware)
  requireAuth.js           (new — Express middleware, extracted from index.js)
  requireRole.js           (new — RBAC Express middleware)
  __tests__/
    PlayerRoster.test.js   (existing)
    JwtService.test.js     (new)
    socketAuthMiddleware.test.js (new)
    requireAuth.test.js    (new)
    requireRole.test.js    (new)
```

### 2.1 `JwtService.js`

Owns all JWT concerns: signing algorithm, expiry constant, sign, verify.

Exports:
- `sign({ stableId, name, role })` → `string` — calls `jwt.sign()` with canonical options
- `verify(token)` → `{ stableId, name, role } | null` — wraps `jwt.verify()`, returns null on any error
- `JWT_EXPIRY` constant (`'7d'`)
- `JWT_ALGORITHM` constant (`'HS256'`)

`SESSION_SECRET` is read once at module load. If missing, the module throws at require-time (consistent with current startup fail-fast behaviour).

Dependency chain after consolidation:
- `server/index.js` → `JwtService.sign()` (login handler)
- `server/auth/requireAuth.js` → `JwtService.verify()`
- `server/auth/socketAuthMiddleware.js` → `JwtService.verify()`
- `HandLoggerSupabase.js` → `authenticateToken` deleted entirely

### 2.2 `requireAuth.js`

Extracted from `server/index.js` lines 116–127. Depends only on `JwtService`. No reference to `HandLogger`.

```
requireAuth(req, res, next)
  → reads Authorization header
  → calls JwtService.verify(token)
  → sets req.user = { stableId, name, role }
  → or 401
```

### 2.3 `requireRole.js`

Higher-order middleware factory for RBAC.

```
requireRole(...roles) → Express middleware
  → assumes requireAuth already ran (req.user set)
  → checks req.user.role against roles array
  → or 403 { error: 'forbidden', message: '...' }
```

Usage: `app.post('/api/playlists', requireAuth, requireRole('coach'), handler)`

---

## 3. JWT in the Wrong Layer — Fix

### Problem

`HandLoggerSupabase.js` lines 830–845 contains `jwt.verify()` and reads `SESSION_SECRET`. The database/persistence layer has no business doing this.

### Fix — dependency chain

1. Create `server/auth/JwtService.js` with `verify()`.
2. Update `server/auth/requireAuth.js` to import `JwtService` directly.
3. Delete `authenticateToken` from `HandLoggerSupabase.js` (lines 838–845 and the export).
4. Update `server/index.js` `requireAuth` to use the new `requireAuth.js` module.
5. Update `server/game/__tests__/socket.integration.test.js`: remove the `authenticateToken` stub from the `HandLoggerSupabase` mock. Add a `JwtService` mock if needed.
6. Update `server/db/__tests__/REST.api.test.js`: same removal.

`loginRosterPlayer` stays in `HandLoggerSupabase` — it is a DB concern (upsert player_profiles). Only the JWT concern moves.

---

## 4. Socket Auth Middleware

### Problem

Token verification at `join_room` (lines 439–447) runs after the socket is already connected. Between connection and `join_room`, the socket has no authenticated identity. If a handler were invoked before `join_room`, `socket.data.isCoach` would be `undefined` and `!undefined === true` would pass the coach guard, silently treating an unauthenticated socket as a non-coach player.

### Proposed: `io.use()` middleware via `socketAuthMiddleware.js`

Runs at connection time — before any event handlers fire.

```
socketAuthMiddleware(socket, next)
  reads token from socket.handshake.auth.token
    OR socket.handshake.query.token (fallback for older clients)
  if no token → sets socket.data.authenticated = false, socket.data.isCoach = false
  if token present → calls JwtService.verify(token)
    on success → sets socket.data.authenticated = true, socket.data.role,
                 socket.data.stableId, socket.data.name,
                 socket.data.isCoach = (role === 'coach')
    on failure → calls next(new Error('auth_required'))
  calls next()
```

Spectators (no token, `socket.handshake.auth.spectator = true`) set
`socket.data.isSpectator = true`. The `join_room` handler validates this flag.

After middleware runs, `join_room` becomes simpler:
- Remove lines 439–447 (inline `HandLogger.authenticateToken` call)
- Trust `socket.data.stableId` and `socket.data.role` set by middleware
- Keep reconnect logic and `gm.addPlayer()` call

Registration: `io.use(require('./auth/socketAuthMiddleware'))` — one line before `io.on('connection', ...)`.

---

## 5. Coach Guard Repetition — Proposed Pattern

### Problem

30 identical guard blocks:

```js
if (!socket.data.isCoach) return sendError(socket, 'Only the coach can <verb>');
```

### Option A: `requireCoach` helper function (recommended)

Define in `server/auth/socketGuards.js`:

```js
function requireCoach(socket, action) {
  if (!socket.data.isCoach) {
    sendError(socket, `Only the coach can ${action}`);
    return false;
  }
  return true;
}
```

Usage:
```js
socket.on('start_game', async ({ mode = 'rng' } = {}) => {
  if (!requireCoach(socket, 'start the game')) return;
  ...
});
```

30 two-line guards collapse to 30 single-line calls. The function can later be extended to log unauthorized attempts or check a role set.

### Option B: `coachOnly(handler)` higher-order wrapper

```js
function coachOnly(eventName, handler) {
  return async function(payload) {
    if (!this.data.isCoach) return sendError(this, `Only the coach can ${eventName}`);
    return handler.call(this, payload);
  };
}
```

Option B is cleaner but requires refactoring all 30 handler registrations and has `this` binding risks.

### Recommendation

Implement Option A first (mechanical find-and-replace, zero behaviour change). Extract to `server/auth/socketGuards.js` for independent unit testing.

---

## 6. Role-Based Access — Current Model and Future Proofing

### Current roles

| Role | Defined in | Checked via |
|---|---|---|
| `coach` | `players.csv` column 3 | `socket.data.isCoach` (boolean) in socket handlers |
| `student` | `players.csv` column 3 | Implicit — anyone who is not coach |

No `requireRole` on REST endpoints. Playlist REST endpoints are fully unauthenticated.

### Proposed lightweight RBAC

Introduce a `ROLES` constant:

```js
ROLES = { COACH: 'coach', STUDENT: 'student', ADMIN: 'admin' }
```

`requireRole(...allowedRoles)` checks `req.user.role` against the array. 10-line change, no schema migration.

For socket handlers, extend `requireCoach` to `requireSocketRole(socket, ...roles)` which checks `socket.data.role` (set by middleware from JWT payload) rather than the boolean `socket.data.isCoach`.

`socket.data.isCoach` becomes a computed alias: `socket.data.isCoach = socket.data.role === 'coach'`. This preserves backward compatibility with all 30 existing guards.

### Future `admin` role

Add `admin` to `players.csv` as a valid role. Update `PlayerRoster._parse()` to accept it. Admin can reload roster, view alpha reports, manage playlists.

---

## 7. PlayerRoster Improvements

### 7.1 Hot-reload on file change

`reload()` exists (line 104) but is never triggered automatically. Proposed: use `fs.watch()` to watch `ROSTER_PATH` and call `reload()` with a 500ms debounce.

```js
if (process.env.NODE_ENV !== 'test') {
  fs.watch(ROSTER_PATH, { persistent: false }, debounce(reload, 500));
}
```

`persistent: false` ensures the watcher does not prevent process exit.

### 7.2 Runtime roster management API

```
POST /api/admin/roster/reload
  requireAuth + requireRole('admin') middleware
  calls PlayerRoster.reload()
  returns { size: _roster.size }
```

Allows hot-reload after editing `players.csv` without restarting. Does NOT expose roster contents (no GET of hashes).

### 7.3 Player existence check on every JWT verify (optional, deferred)

In `JwtService.verify()`, after successful `jwt.verify()`, call
`PlayerRoster.getRole(name)` and return `null` if the name is no longer in the
roster. This ensures deleted players are immediately locked out. Breaking change
if a player is renamed in the CSV — document this trade-off.

### 7.4 Column parser hardening

`PlayerRoster._parse()` uses `trimmed.split(',')` which breaks if a player name contains a comma. Split on the first three commas only:

```js
const idx1 = trimmed.indexOf(',');
const idx2 = trimmed.indexOf(',', idx1 + 1);
const name     = trimmed.slice(0, idx1).trim();
const password = trimmed.slice(idx1 + 1, idx2).trim();
const roleRaw  = trimmed.slice(idx2 + 1).trim().toLowerCase();
```

---

## 8. Security Hardening Opportunities

### 8.1 JWT storage: localStorage vs httpOnly cookies

Currently the client stores the JWT in `localStorage` under `poker_trainer_jwt`. This is readable by any JavaScript on the page — XSS attacks can exfiltrate it.

**Recommendation:** Migrate to `httpOnly`, `Secure`, `SameSite=Strict` cookies. The login endpoint sets the cookie; the client no longer stores the token manually.

Socket.io workaround: after login, a `GET /api/auth/socket-token` endpoint reads the cookie (httpOnly) and issues a short-lived (60s) socket connection token passed in `handshake.auth.token`.

**For this closed system (single domain, Fly.io):** httpOnly cookies are achievable and meaningfully reduce XSS risk. Prioritise if the app ever accepts untrusted HTML content in player names or tags.

### 8.2 CORS tightening

`ALLOWED_ORIGIN` defaults to `''`. Use `false` as the fallback to block all cross-origin requests when `CORS_ORIGIN` is unset in production:

```js
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? false : '*');
```

### 8.3 Token refresh

Propose:
- Shorten expiry to `24h` for regular play sessions.
- Issue a `refreshToken` (opaque, stored server-side) with 30-day expiry.
- `POST /api/auth/refresh` endpoint.

Low risk for a closed club system. Defer to a future hardening pass.

### 8.4 Session revocation

No revocation mechanism exists. Minimum viable: include a `jti` (JWT ID) claim and store revoked `jti`s in a `Set` in memory. `POST /api/admin/revoke` adds a `jti` to the set. `JwtService.verify()` checks the set. Set clears on server restart — acceptable for a club system.

### 8.5 Input sanitisation on login

Add max-length check: name ≤ 64 chars, password ≤ 128 chars. Prevents potential ReDoS and limits log entry sizes.

### 8.6 Unauthenticated endpoints audit

| Endpoint | Risk | Recommendation |
|---|---|---|
| `GET /api/players/:stableId/hover-stats` | Read-only, no PII | Keep open or add `requireAuth` |
| `GET /api/sessions/current` | Exposes player names, stacks | Add `requireAuth` |
| `GET /api/playlists` | Read-only, low risk | Add `requireAuth` |
| `POST /api/playlists` | Creates DB records | Add `requireAuth + requireRole('coach')` |
| `DELETE /api/playlists/:id` | Destructive | Add `requireAuth + requireRole('coach')` |
| `GET /api/alpha-report` | Internal stats | Add `requireAuth + requireRole('admin')` before public release |

### 8.7 Security headers

No `helmet` dependency is present. Add `helmet` (or manually set `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`) as middleware.

### 8.8 Rate limiting scope

`authLimiter` only covers `POST /api/auth/login`. Consider adding a lighter global limiter (`rateLimit({ windowMs: 60_000, max: 200 })`) applied before all routes.

---

## 9. Test Coverage

### 9.1 What is currently tested

- `PlayerRoster.test.js` — 100% coverage of CSV parsing, authenticate, getRole, reload, missing-file exit
- `REST.api.test.js` — covers `requireAuth` indirectly (missing/invalid token → 401), login happy path, register → 410
- `socket.integration.test.js` — "unauthenticated player tries to join (no token)" → error

### 9.2 Critical paths with no tests

| Gap | Risk | Test to add |
|---|---|---|
| `authenticateToken` called with expired token | High | Unit test for `JwtService.verify()` with expired/tampered tokens |
| `join_room` with token for player no longer in roster | Medium | Integration test: valid JWT for deleted user rejected |
| Coach guard when `socket.data.isCoach` is undefined (never ran `join_room`) | High | Integration test: emit `start_game` without prior `join_room` |
| `requireRole` middleware with wrong role | Medium | Unit test for `requireRole.js` |
| Playlist endpoints with no auth token | Medium | REST test: `POST /api/playlists` without token → 401 |
| `authLimiter` — 21st login request | Low | REST test: 21 requests in window → 429 |
| `socketAuthMiddleware` with valid/expired/missing token | High | Unit test for `socketAuthMiddleware.js` |
| CORS: request from disallowed origin | Low | Integration test with `Origin` header |

### 9.3 New test files to create

- `server/auth/__tests__/JwtService.test.js` — sign/verify/expiry/tamper/missing-secret
- `server/auth/__tests__/socketAuthMiddleware.test.js` — valid token sets socket.data; invalid token calls next(Error); no token on spectator passes
- `server/auth/__tests__/requireAuth.test.js` — missing header → 401; invalid token → 401; valid token sets req.user
- `server/auth/__tests__/requireRole.test.js` — matching role passes; wrong role → 403; no req.user → 401

---

## 10. Migration Path

### Phase 1 — Non-breaking extractions (safe to deploy any time)

1. Create `server/auth/JwtService.js` with `sign()` and `verify()`.
2. Create `server/auth/requireAuth.js` importing `JwtService.verify()`.
3. Update `server/index.js`:
   - Replace inline `requireAuth` function (lines 116–127) with `require('./auth/requireAuth')`.
   - Replace `jwt.sign()` call in login handler with `JwtService.sign()`.
   - Remove `const jwt = require('jsonwebtoken')` from `index.js`.
4. Delete `authenticateToken` from `HandLoggerSupabase.js` (lines 838–845 and export).
5. Update `HandLoggerSupabase` mocks in `REST.api.test.js` and `socket.integration.test.js` to remove the `authenticateToken` stub.

**Backward compatibility:** JWT format does not change. Existing tokens remain valid.

### Phase 2 — Socket.io middleware (requires client coordination)

6. Create `server/auth/socketAuthMiddleware.js`.
7. Register: `io.use(require('./auth/socketAuthMiddleware'))` before `io.on('connection', ...)`.
8. Update `join_room` handler: remove inline `HandLogger.authenticateToken` call (lines 439–447), trust `socket.data.*` set by middleware.

**Client impact:** Client must pass token in `socket.handshake.auth.token` rather than as a field in the `join_room` payload. Check `client/src/hooks/useSocket.js` for socket constructor options. Both paths must work during the transition window.

### Phase 3 — Coach guard consolidation (mechanical, zero behaviour change)

9. Create `server/auth/socketGuards.js` with `requireCoach(socket, action)`.
10. Find-and-replace all 30 occurrences of `if (!socket.data.isCoach) return sendError(socket, ...)` with `if (!requireCoach(socket, '<action>')) return`.

### Phase 4 — Playlist and session endpoint auth (adds auth gates)

11. Add `requireAuth` to `GET/POST/DELETE /api/playlists` endpoints.
12. Add `requireAuth` to `GET /api/sessions/current`.
13. Add `requireRole('coach')` to playlist mutation endpoints.

**Client impact:** Client must send `Authorization: Bearer <token>` on these requests. Verify playlist and session calls go through `apiFetch` in `client/src/lib/api.js` (which already adds JWT headers), not raw `fetch`.

### Phase 5 — Security hardening (deferred, higher effort)

- httpOnly cookie migration
- Token refresh (`jti` claim + refresh token table)
- CORS `false` fallback on production
- `helmet` headers
- `fs.watch` hot-reload for roster
- Admin reload endpoint

Each is independent. Each can ship in its own PR.

---

## Summary of New Files

| File | Purpose |
|---|---|
| `server/auth/JwtService.js` | Single JWT sign/verify module |
| `server/auth/requireAuth.js` | Express middleware for HTTP auth |
| `server/auth/requireRole.js` | Express RBAC middleware factory |
| `server/auth/socketAuthMiddleware.js` | Socket.io `io.use()` connection-level auth |
| `server/auth/socketGuards.js` | `requireCoach()` helper for socket handlers |
| `server/auth/__tests__/JwtService.test.js` | Unit tests for JWT service |
| `server/auth/__tests__/socketAuthMiddleware.test.js` | Unit tests for socket middleware |
| `server/auth/__tests__/requireAuth.test.js` | Unit tests for HTTP middleware |
| `server/auth/__tests__/requireRole.test.js` | Unit tests for RBAC middleware |

## Summary of Modified Files

| File | Changes |
|---|---|
| `server/index.js` | Remove inline `requireAuth`, remove `jwt` import, remove inline `jwt.sign()`, register `io.use()` socket middleware, update `join_room` to trust middleware-set socket.data, replace 30 coach guards with `requireCoach()` |
| `server/db/HandLoggerSupabase.js` | Delete `authenticateToken` function and its export |
| `server/db/__tests__/REST.api.test.js` | Remove `authenticateToken` stub from HandLoggerSupabase mock |
| `server/game/__tests__/socket.integration.test.js` | Remove `authenticateToken` stub, use `handshake.auth.token` in test client construction |
| `server/auth/PlayerRoster.js` | Add comma-safe CSV parser, add `fs.watch` hot-reload |
