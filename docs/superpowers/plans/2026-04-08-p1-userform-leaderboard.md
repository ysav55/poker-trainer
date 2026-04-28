# P1 Stabilization — UserForm Fix + Leaderboard Filter Coverage

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix the student creation 500 error (UserForm defaults to retired `'player'` role, missing coach assignment field) and add client-side test coverage confirming leaderboard period/gameType filters pass the correct query params to the API.

**Architecture:** Two independent fixes with no shared state. Fix A touches one client component (`UserForm.jsx`) and one server route handler (`admin/users.js`) — no migration needed because `coach_id` already exists in `player_profiles` and `updatePlayer()` already maps `coachId` to it. Fix B adds client-side tests only — the server-side filter implementation already exists and is already tested in `server/db/__tests__/PlayerRepository.test.js`.

**Tech Stack:** React/Vite/Vitest (client), Node.js/Express/Jest+supertest (server), Supabase

---

## Files Changed

| File | Action | Why |
|------|--------|-----|
| `client/src/pages/admin/UserForm.jsx` | Modify | Fix default role `'player'`→`'coached_student'`; add coach dropdown for coached_student role; include coachId in POST body |
| `server/routes/admin/users.js` | Modify | Accept `coachId` from POST body; call `updatePlayer(newId, { coachId })` after creation |
| `client/src/__tests__/UserForm.test.jsx` | Create | Isolated tests: default role, coach dropdown visibility, API call on role change, POST body shape |
| `server/routes/__tests__/adminUsers.test.js` | Create | Server-side test: POST creates user + assigns role + assigns coach when coachId provided |
| `client/src/__tests__/LeaderboardPage.test.jsx` | Modify | Add tests asserting `apiFetch` is called with correct query string on filter tab clicks |

---

## Task 1: Fix UserForm default role — test first

**Files:**
- Create: `client/src/__tests__/UserForm.test.jsx`
- Modify: `client/src/pages/admin/UserForm.jsx` (lines 51, 60)

- [x] **Step 1: Create the failing test**

Create `client/src/__tests__/UserForm.test.jsx`:

```jsx
/**
 * UserForm.test.jsx
 *
 * Isolated tests for the UserForm modal component:
 *  - Default role is coached_student when creating a new user
 *  - Coach dropdown renders when role is coached_student
 *  - Coach dropdown is hidden when role is not coached_student
 *  - Coaches are loaded from GET /api/admin/users?role=coach
 *  - POST body includes coachId when a coach is selected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import UserForm from '../pages/admin/UserForm.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderCreate() {
  return render(
    <UserForm user={null} onClose={vi.fn()} onSaved={vi.fn()} />
  );
}

// ── Default role ──────────────────────────────────────────────────────────────

describe('UserForm — create mode defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: coaches fetch returns empty list
    mockApiFetch.mockResolvedValue({ players: [] });
  });

  it('defaults role to coached_student when creating a new user', () => {
    renderCreate();
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('coached_student');
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/UserForm.test.jsx
```

Expected: FAIL — `select.value` is `'player'`, not `'coached_student'`.

- [x] **Step 3: Fix the default role in UserForm.jsx**

In `client/src/pages/admin/UserForm.jsx`, change line 51:

```js
// BEFORE:
const [role, setRole] = useState(user?.role ?? 'player');

// AFTER:
const [role, setRole] = useState(user?.role ?? 'coached_student');
```

Change line 60 (inside `useEffect`):

```js
// BEFORE:
setRole(user?.role ?? 'player');

// AFTER:
setRole(user?.role ?? 'coached_student');
```

- [x] **Step 4: Run to verify it passes**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/UserForm.test.jsx
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
cd c:/Users/user/poker-trainer
git add client/src/pages/admin/UserForm.jsx client/src/__tests__/UserForm.test.jsx
git commit -m "fix(user-form): default role coached_student instead of retired 'player'

UserForm was sending role='player' on POST, which no longer exists in
the roles table after migration 043, causing a 500 from setPlayerRole.

Closes gap audit items 1.3, 1.4, 6.6."
```

---

## Task 2: Add coach assignment dropdown to UserForm

When `role === 'coached_student'`, show a coach selection dropdown loaded from `GET /api/admin/users?role=coach`. Include the selected `coachId` in the POST body.

**Files:**
- Modify: `client/src/__tests__/UserForm.test.jsx` (append new describe blocks)
- Modify: `client/src/pages/admin/UserForm.jsx`

- [x] **Step 1: Write failing tests for the coach dropdown**

Append these describe blocks to `client/src/__tests__/UserForm.test.jsx` (after the existing `describe`):

```jsx
// ── Coach dropdown ────────────────────────────────────────────────────────────

const MOCK_COACHES = [
  { id: 'coach-1', display_name: 'Alice Coach', role: 'coach' },
  { id: 'coach-2', display_name: 'Bob Coach',   role: 'coach' },
];

describe('UserForm — coach assignment dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('role=coach')) {
        return Promise.resolve({ players: MOCK_COACHES });
      }
      return Promise.resolve({ players: [] });
    });
  });

  it('shows coach dropdown when role is coached_student (default)', async () => {
    renderCreate();
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
  });

  it('does NOT show coach dropdown when role is changed to coach', async () => {
    renderCreate();
    // Wait for initial coach-select to appear (default role is coached_student)
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    // Change role to coach
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'coach' } });
    expect(screen.queryByTestId('coach-select')).toBeNull();
  });

  it('fetches coaches from /api/admin/users?role=coach when role is coached_student', async () => {
    renderCreate();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/users?role=coach')
      )
    );
  });

  it('populates dropdown with loaded coaches', async () => {
    renderCreate();
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    expect(screen.getByText('Alice Coach')).toBeTruthy();
    expect(screen.getByText('Bob Coach')).toBeTruthy();
  });
});

// ── POST body includes coachId ────────────────────────────────────────────────

describe('UserForm — POST body includes coachId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url, opts) => {
      if (typeof url === 'string' && url.includes('role=coach')) {
        return Promise.resolve({ players: MOCK_COACHES });
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ id: 'new-user-1' });
      }
      return Promise.resolve({});
    });
  });

  it('includes coachId in POST body when a coach is selected', async () => {
    renderCreate();

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('Display name'), {
      target: { value: 'New Student' },
    });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), {
      target: { value: 'password123' },
    });

    // Wait for coach dropdown to load, then select a coach
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('coach-select'), { target: { value: 'coach-1' } });

    // Submit
    fireEvent.click(screen.getByText('CREATE'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.coachId).toBe('coach-1');
    });
  });

  it('omits coachId from POST body when no coach is selected', async () => {
    renderCreate();

    fireEvent.change(screen.getByPlaceholderText('Display name'), {
      target: { value: 'Solo Student' },
    });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), {
      target: { value: 'password123' },
    });

    // Wait for dropdown but leave it at default (unassigned)
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());

    fireEvent.click(screen.getByText('CREATE'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.coachId).toBeUndefined();
    });
  });
});
```

- [x] **Step 2: Run to verify they fail**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/UserForm.test.jsx
```

Expected: Multiple FAILs — `getByTestId('coach-select')` not found.

- [x] **Step 3: Implement the coach dropdown in UserForm.jsx**

In `client/src/pages/admin/UserForm.jsx`:

**3a.** After `const [error, setError] = useState(null);`, add two new state lines:

```js
const [coaches,  setCoaches]  = useState([]);
const [coachId,  setCoachId]  = useState(user?.coach_id ?? '');
```

**3b.** In the existing `useEffect` that resets form state on user prop change (lines 56–63), add the two new state resets:

```js
useEffect(() => {
  setName(user?.display_name ?? '');
  setEmail(user?.email ?? '');
  setPassword('');
  setRole(user?.role ?? 'coached_student');
  setCoachId(user?.coach_id ?? '');   // ← add this
  setCoaches([]);                      // ← add this
  setError(null);
}, [user]);
```

**3c.** After that effect (after line 63), add a new effect to load coaches:

```js
useEffect(() => {
  if (role !== 'coached_student') {
    setCoachId('');
    setCoaches([]);
    return;
  }
  let cancelled = false;
  apiFetch('/api/admin/users?role=coach')
    .then((data) => {
      if (!cancelled) setCoaches(data?.players ?? []);
    })
    .catch(() => {
      if (!cancelled) setCoaches([]);
    });
  return () => { cancelled = true; };
}, [role]);
```

**3d.** In `handleSubmit`, after `const body = { display_name: name.trim(), email: email.trim(), role };`, add:

```js
if (coachId) body.coachId = coachId;
```

**3e.** In the JSX form body, after the closing `</div>` of the Role section (after the select dropdown's parent div), add the coach dropdown:

```jsx
{/* Coach assignment — only for coached_student */}
{role === 'coached_student' && (
  <div>
    <FieldLabel htmlFor="uf-coach">Assign Coach</FieldLabel>
    <select
      id="uf-coach"
      data-testid="coach-select"
      value={coachId}
      onChange={(e) => setCoachId(e.target.value)}
      className="w-full rounded px-3 py-2 text-sm outline-none transition-colors"
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        color: '#f0ece3',
        cursor: 'pointer',
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
    >
      <option value="" style={{ background: '#161b22' }}>— Unassigned —</option>
      {coaches.map((c) => (
        <option key={c.id} value={c.id} style={{ background: '#161b22' }}>
          {c.display_name}
        </option>
      ))}
    </select>
  </div>
)}
```

- [x] **Step 4: Run tests to verify they pass**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/UserForm.test.jsx
```

Expected: All tests PASS.

- [x] **Step 5: Run the full client test suite for regressions**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run
```

Expected: All tests PASS. If UserManagement tests fail due to the new API call for coaches, update `UserManagement.test.jsx`'s `apiFetch` mock to handle `?role=coach` calls (return `{ players: [] }`).

- [x] **Step 6: Commit**

```bash
cd c:/Users/user/poker-trainer
git add client/src/pages/admin/UserForm.jsx client/src/__tests__/UserForm.test.jsx
git commit -m "feat(user-form): add coach assignment dropdown for coached_student role

When role is coached_student, loads available coaches from
GET /api/admin/users?role=coach and shows a dropdown. Selected
coachId is included in the POST/PUT body.

Gap audit 1.3, 1.4, 6.6."
```

---

## Task 3: Wire coachId through server POST /api/admin/users

**Files:**
- Modify: `server/routes/admin/users.js` (POST handler, lines 195–219)
- Create: `server/routes/__tests__/adminUsers.test.js`

- [x] **Step 1: Write a failing server test**

Create `server/routes/__tests__/adminUsers.test.js`:

```js
'use strict';

/**
 * POST /api/admin/users — creates a user with role and optional coach assignment.
 *
 * Covered:
 *  - 400 when displayName missing
 *  - 400 when password missing
 *  - 201 on success with role assigned
 *  - 201 on success with coachId assigned when provided
 *  - 401 when unauthenticated
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('bcrypt', () => ({
  hash: jest.fn(async (plain) => `hashed:${plain}`),
}));

jest.mock('../../db/repositories/PlayerRepository', () => ({
  createPlayer:             jest.fn(),
  updatePlayer:             jest.fn(),
  assignRole:               jest.fn(),
  removeRole:               jest.fn(),
  listPlayers:              jest.fn(),
  getPrimaryRole:           jest.fn(),
  findByDisplayName:        jest.fn(),
  findById:                 jest.fn(),
  archivePlayer:            jest.fn(),
  setPassword:              jest.fn(),
}));

// Chainable supabase mock — roles table lookup returns a role id
const mockSupabase = {
  from:        jest.fn().mockReturnThis(),
  select:      jest.fn().mockReturnThis(),
  insert:      jest.fn().mockReturnThis(),
  update:      jest.fn().mockReturnThis(),
  delete:      jest.fn().mockReturnThis(),
  eq:          jest.fn().mockReturnThis(),
  in:          jest.fn().mockReturnThis(),
  single:      jest.fn().mockResolvedValue({ data: { id: 'role-uuid-1' }, error: null }),
  maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
};
jest.mock('../../db/supabase.js', () => mockSupabase);

let mockCurrentUser = null;
jest.mock('../../auth/requireAuth.js', () =>
  jest.fn((req, res, next) => {
    if (!mockCurrentUser) return res.status(401).json({ error: 'auth_required' });
    req.user = mockCurrentUser;
    next();
  })
);

jest.mock('../../auth/requirePermission.js', () => ({
  requirePermission:         jest.fn(() => (req, res, next) => next()),
  invalidatePermissionCache: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const express    = require('express');
const request    = require('supertest');
const requireAuth = require('../../auth/requireAuth.js');
const PlayerRepo  = require('../../db/repositories/PlayerRepository');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', requireAuth, require('../admin/users'));
  return app;
}

const app = buildApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminUser  = { stableId: 'admin-1', id: 'admin-1', role: 'admin' };
const validBody  = { display_name: 'Alice Student', email: 'alice@example.com', password: 'secret123', role: 'coached_student' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser = null;
  PlayerRepo.createPlayer.mockResolvedValue('new-player-uuid');
  PlayerRepo.updatePlayer.mockResolvedValue(undefined);
  PlayerRepo.assignRole.mockResolvedValue(undefined);
  PlayerRepo.listPlayers.mockResolvedValue([]);
  // Default supabase single — resolves with a role UUID
  mockSupabase.single.mockResolvedValue({ data: { id: 'role-uuid-1' }, error: null });
  // delete resolves cleanly (for setPlayerRole's existing-role removal)
  mockSupabase.delete.mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  });
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────

describe('POST /api/admin/users', () => {
  test('returns 401 when not authenticated', async () => {
    const res = await request(app).post('/api/admin/users').send(validBody);
    expect(res.status).toBe(401);
  });

  test('returns 400 when display_name is missing', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send({
      password: 'secret123',
      role: 'coached_student',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/displayName/i);
  });

  test('returns 400 when password is missing', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send({
      display_name: 'Alice',
      role: 'coached_student',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('returns 201 with new user id on success', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app).post('/api/admin/users').send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-player-uuid');
    expect(PlayerRepo.createPlayer).toHaveBeenCalledTimes(1);
  });

  test('calls updatePlayer with coachId when coachId is provided in body', async () => {
    mockCurrentUser = adminUser;
    const res = await request(app)
      .post('/api/admin/users')
      .send({ ...validBody, coachId: 'coach-uuid-1' });

    expect(res.status).toBe(201);
    expect(PlayerRepo.updatePlayer).toHaveBeenCalledWith(
      'new-player-uuid',
      { coachId: 'coach-uuid-1' }
    );
  });

  test('does NOT call updatePlayer with coachId when coachId is absent', async () => {
    mockCurrentUser = adminUser;
    await request(app).post('/api/admin/users').send(validBody); // no coachId

    // updatePlayer may be called for other things, but NOT with a coachId patch
    const coachIdCalls = PlayerRepo.updatePlayer.mock.calls.filter(
      (c) => c[1]?.coachId !== undefined
    );
    expect(coachIdCalls).toHaveLength(0);
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
cd c:/Users/user/poker-trainer
npx jest server/routes/__tests__/adminUsers.test.js --no-coverage
```

Expected: `calls updatePlayer with coachId` FAILS — `updatePlayer` is never called since the server doesn't handle `coachId` yet.

- [x] **Step 3: Update the POST handler in server/routes/admin/users.js**

Find the POST handler (around line 195). The current handler reads:

```js
router.post('/users', async (req, res) => {
  try {
    const body = req.body || {};
    const displayName = body.displayName || body.display_name;
    const { email, password, role: roleName = 'coached_student' } = body;

    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password)    return res.status(400).json({ error: 'password is required' });

    const passwordHash = await bcrypt.hash(password, 12);
    const newId = await createPlayer({
      displayName,
      email:     email || null,
      passwordHash,
      createdBy: req.user?.stableId ?? req.user?.id ?? null,
    });

    await setPlayerRole(newId, roleName, req.user?.stableId ?? req.user?.id ?? null);

    res.status(201).json({ id: newId });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
```

Change the destructuring line to also extract `coachId`, and add the `updatePlayer` call:

```js
router.post('/users', async (req, res) => {
  try {
    const body = req.body || {};
    const displayName = body.displayName || body.display_name;
    const { email, password, role: roleName = 'coached_student', coachId } = body;

    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password)    return res.status(400).json({ error: 'password is required' });

    const passwordHash = await bcrypt.hash(password, 12);
    const newId = await createPlayer({
      displayName,
      email:     email || null,
      passwordHash,
      createdBy: req.user?.stableId ?? req.user?.id ?? null,
    });

    await setPlayerRole(newId, roleName, req.user?.stableId ?? req.user?.id ?? null);

    if (coachId) {
      await updatePlayer(newId, { coachId });
    }

    res.status(201).json({ id: newId });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [x] **Step 4: Run the server test to verify it passes**

```bash
npx jest server/routes/__tests__/adminUsers.test.js --no-coverage
```

Expected: All tests PASS.

- [x] **Step 5: Run the full server test suite for regressions**

```bash
npx jest --no-coverage
```

Expected: All tests PASS.

- [x] **Step 6: Commit**

```bash
cd c:/Users/user/poker-trainer
git add server/routes/admin/users.js server/routes/__tests__/adminUsers.test.js
git commit -m "feat(admin/users): accept coachId in POST /api/admin/users

When coachId is provided in the POST body, updatePlayer() is called
after creation to set the coach_id FK on the new player's profile.

updatePlayer() already maps coachId -> coach_id (PlayerRepository:362).
No migration needed."
```

---

## Task 4: Add leaderboard filter URL assertion tests

The server-side filter path and its tests already exist. This task adds client-side assertions that `apiFetch` is called with the correct query string when period/gameType filter tabs are clicked.

**Files:**
- Modify: `client/src/__tests__/LeaderboardPage.test.jsx` (append new describe block)

- [x] **Step 1: Append failing tests to LeaderboardPage.test.jsx**

Add the following describe block at the end of `client/src/__tests__/LeaderboardPage.test.jsx`:

```jsx
// ── Filter query params ────────────────────────────────────────────────────────

describe('LeaderboardPage filter query params', () => {
  it('calls apiFetch with ?period=7d when 7 Days tab is clicked', async () => {
    renderPage();
    // Wait for initial load to finish
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Reset mock so we can assert the next call cleanly
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByTestId('period-7d'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=7d')
    );
  });

  it('calls apiFetch with ?period=30d when 30 Days tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByTestId('period-30d'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=30d')
    );
  });

  it('calls apiFetch with no query params when All Time tab is clicked (default)', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Switch to 7d first, then back to all — verifies the all-time path
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-7d'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-all'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players')
    );
  });

  it('calls apiFetch with ?gameType=cash when Cash tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByText('Cash'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?gameType=cash')
    );
  });

  it('calls apiFetch with ?gameType=tournament when Tournament tab is clicked', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });

    fireEvent.click(screen.getByText('Tournament'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?gameType=tournament')
    );
  });

  it('calls apiFetch with both params when period and gameType are both set', async () => {
    renderPage();
    await waitFor(() => expect(screen.queryByText(/Loading…/i)).toBeNull());

    // Set period first
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByTestId('period-7d'));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());

    // Now set gameType
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ players: PLAYERS });
    fireEvent.click(screen.getByText('Cash'));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/api/players?period=7d&gameType=cash')
    );
  });
});
```

- [x] **Step 2: Run to verify they fail**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run src/__tests__/LeaderboardPage.test.jsx
```

Expected: The new tests should already PASS (the feature is implemented). If any FAIL, the implementation has a bug — read the failure message to find the mismatch between expected URL and actual URL passed to `apiFetch`.

> **If a test fails:** Open `client/src/pages/LeaderboardPage.jsx` and check lines 118–128. The `useEffect` dependency array must include both `period` and `gameType`, and the query string construction must match the expected format exactly.

- [x] **Step 3: Run the full client test suite**

```bash
cd c:/Users/user/poker-trainer/client
npx vitest run
```

Expected: All tests PASS.

- [x] **Step 4: Commit**

```bash
cd c:/Users/user/poker-trainer
git add client/src/__tests__/LeaderboardPage.test.jsx
git commit -m "test(leaderboard): assert correct query params sent on filter tab clicks

Confirms that period/gameType filter tabs trigger refetches with the
correct URL query string (?period=7d, ?gameType=cash, etc.).

Server-side filter tests already exist in server/db/__tests__/PlayerRepository.test.js."
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Gap 1.3/1.4/6.6 — student creation 500: default role fixed (Task 1)
- ✅ Gap 1.3/1.4 — coach auto-assignment field: coach dropdown added (Task 2)
- ✅ Server accepts coachId on creation (Task 3)
- ✅ Flow 10.1 — leaderboard filter coverage confirmed with URL assertions (Task 4)

**Placeholder scan:** No TBDs, no "add appropriate error handling", no forward references.

**Type consistency:**
- `coachId` (camelCase) used throughout client and in server destructuring — maps to `coach_id` via `updatePlayer()`
- `mockApiFetch` used consistently across all new test files
- `data-testid="coach-select"` is the same string in the implementation and in every test

**Out of scope for this plan (P2+):**
- Story 1.5 — student self-registration with coach selection (requires changes to RegisterPage)
- Story 1.6 — coach can reset password from CRM (requires separate CRM flow)
- Tournament system unification (flagged as separate plan — significant architectural work)
