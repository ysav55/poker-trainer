# Item 5: Frontend Routing & Lobby

**Status**: ⬜ pending
**Blocked by**: Items 3 (permissions), 4 (DB-backed auth)
**Blocks**: Item 6 (multi-table UI), Item 8 (CRM pages)

---

## Context

No routing library installed. No React Context. `App.jsx` (336 lines) renders either
`JoinScreen` (pre-join) or a full single-table view. JWT is stored in localStorage and
managed directly in `useConnectionManager.js`. No lobby, admin pages, or navigation exist.

---

## Install

```bash
# From client/
npm install react-router-dom
```

---

## New Directory Structure

```
client/src/
  contexts/
    AuthContext.jsx       ← JWT state, login/logout, permission cache
    LobbyContext.jsx      ← table listings, user profile
  pages/
    LoginPage.jsx         ← extracted from JoinScreen.jsx
    MainLobby.jsx         ← dashboard
    TablePage.jsx         ← route wrapper for /table/:tableId
    MultiTablePage.jsx    ← stub (fleshed out in Item 6)
    admin/
      UserManagement.jsx  ← stub (fleshed out in Item 4)
      HandBuilder.jsx     ← stub (fleshed out in Item 7)
      PlayerCRM.jsx       ← stub (fleshed out in Item 8)
```

---

## `client/src/contexts/AuthContext.jsx`

```jsx
import { createContext, useContext, useState } from 'react';
import { apiFetch } from '../lib/api.js';

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('poker_trainer_jwt');
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload) return null;
    return { id: payload.stableId, name: payload.name, role: payload.role, token };
  });

  // Client-side permission cache: fetched once on login
  const [permissions, setPermissions] = useState(new Set());

  const login = async (name, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    localStorage.setItem('poker_trainer_jwt', data.token);
    localStorage.setItem('poker_trainer_player_id', data.stableId);
    setUser({ id: data.stableId, name: data.name, role: data.role, token: data.token });
    // Fetch permissions from new endpoint
    const { permissions: perms } = await apiFetch('/api/auth/permissions');
    setPermissions(new Set(perms));
    return data;
  };

  const logout = () => {
    localStorage.removeItem('poker_trainer_jwt');
    localStorage.removeItem('poker_trainer_player_id');
    setUser(null);
    setPermissions(new Set());
  };

  const hasPermission = (key) => permissions.has(key);

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
```

---

## `client/src/contexts/LobbyContext.jsx`

```jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';

const LobbyContext = createContext(null);

export function LobbyProvider({ children }) {
  const [activeTables, setActiveTables] = useState([]);
  const [recentHands, setRecentHands] = useState([]);

  const refreshTables = useCallback(async () => {
    const tables = await apiFetch('/api/tables');
    setActiveTables(tables);
  }, []);

  useEffect(() => {
    refreshTables();
    const interval = setInterval(refreshTables, 10_000);
    return () => clearInterval(interval);
  }, [refreshTables]);

  return (
    <LobbyContext.Provider value={{ activeTables, recentHands, refreshTables }}>
      {children}
    </LobbyContext.Provider>
  );
}

export const useLobby = () => useContext(LobbyContext);
```

---

## Refactored `client/src/App.jsx`

Replace the current single-view render with React Router:

```jsx
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { LobbyProvider } from './contexts/LobbyContext.jsx';

function RequireAuth() {
  const { user } = useAuth();
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function RequirePermission({ permission }) {
  const { hasPermission } = useAuth();
  return hasPermission(permission) ? <Outlet /> : <Navigate to="/lobby" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <LobbyProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/lobby" element={<MainLobby />} />
              <Route path="/table/:tableId" element={<TablePage />} />
              <Route path="/multi" element={<MultiTablePage />} />
              <Route element={<RequirePermission permission="admin:access" />}>
                <Route path="/admin/users" element={<UserManagement />} />
                <Route path="/admin/hands" element={<HandBuilder />} />
                <Route path="/admin/crm" element={<PlayerCRM />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/lobby" replace />} />
          </Routes>
        </BrowserRouter>
      </LobbyProvider>
    </AuthProvider>
  );
}
```

---

## `client/src/pages/LoginPage.jsx`

Extract login form from `JoinScreen.jsx`. HTTP login only (spectate is a table-level action,
not a login mode). On success: redirect to `/lobby`.

Key change from JoinScreen: remove the "spectate without login" path. Spectating requires
authentication in Phase 2.

---

## `client/src/pages/MainLobby.jsx`

```
Layout:
┌─────────────────────────────────────────────────────┐
│ Header: [User name] [Role badge] [Logout]            │
├──────────┬──────────┬──────────┬───────────────────┤
│ Hands    │ Net chips│ VPIP     │ Active tables      │
│ played   │          │          │                    │
├──────────┴──────────┴──────────┴───────────────────┤
│ Active Tables               │ Recent Hands (5)      │
│ [table list + Join button]  │ [hand id, tags, net]  │
├────────────────────────────┴───────────────────────┤
│ Playlists (coach only)                              │
└─────────────────────────────────────────────────────┘
```

Data sources:
- Stats: `GET /api/players/:stableId/stats`
- Tables: `useLobby().activeTables`
- Recent hands: `GET /api/hands?limit=5`
- Playlists: existing playlist endpoint (coach only, gated by `hasPermission('playlist:manage')`)

---

## `client/src/pages/TablePage.jsx`

```jsx
import { useParams } from 'react-router-dom';

export default function TablePage() {
  const { tableId } = useParams();
  // TableProvider added in Item 6; for now, pass tableId down via props
  return <SingleTableView tableId={tableId} />;
}
```

`SingleTableView` is the current `App.jsx` game render extracted into its own component.

---

## Migrate JWT logic out of `useConnectionManager.js`

- Remove `localStorage.getItem('poker_trainer_jwt')` from the socket `auth` callback
- Pass `token` from `AuthContext` as a prop/param to `useConnectionManager`
- `useConnectionManager({ token, tableId, ... })` — token comes from `useAuth().user.token`

---

## New Backend Route: `GET /api/auth/permissions`

```js
// server/routes/auth.js — add to existing file
router.get('/permissions', requireAuth, async (req, res) => {
  const perms = await getPlayerPermissions(req.user.id);
  res.json({ permissions: [...perms] });
});
```

---

## Key Files to Read Before Implementing

- `client/src/App.jsx` — full 336-line file (understand what to extract)
- `client/src/hooks/useConnectionManager.js` — JWT localStorage reads to remove
- `client/src/components/JoinScreen.jsx` — extract login form
- `client/package.json` — confirm react-router-dom not present
- `server/routes/auth.js` — add /permissions endpoint here

---

## Tests

- Unit: `AuthContext.login` — sets user, fetches permissions, stores in localStorage
- Unit: `AuthContext.logout` — clears user, permissions, localStorage
- Unit: `RequireAuth` — redirects unauthenticated to /login
- Unit: `RequirePermission` — redirects player to /lobby when missing admin:access
- Integration: login → `/lobby` renders with active tables
- Integration: navigate to `/admin/users` as player → redirected to `/lobby`
- Integration: navigate to `/admin/users` as coach → renders UserManagement
