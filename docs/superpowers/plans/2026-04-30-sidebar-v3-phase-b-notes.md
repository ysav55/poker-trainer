# Sidebar v3 — Phase B: Notes Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship hand-level coach notes — multi-note, school-scoped, plaintext (≤500 chars), surfaced on Live (inline-live edit), Review (full edit), and History (read-only preview).

**Architecture:** New `hand_notes` table (school-scoped via existing `player_profiles.school_id`). New REST endpoints under `/api`. New client hook `useNotes(handId)`. New shared component `NotesPanel.jsx` with 3 modes. New `requireSchool` Express middleware (resolves + caches `school_id` from `player_profiles`).

**Tech Stack:** Express + Supabase (PostgreSQL). React + Vite + Tailwind + Vitest + React Testing Library. Server-side Jest. Existing repository pattern in `server/db/repositories/`.

**Spec:** [docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md](../specs/2026-04-30-sidebar-v3-spec.md), Phase B in Section 10.

**Prereq:** Phase A merged (it ships the 📝 Notes button skeleton via the footer.live re-arrangement; Phase B wires its onClick).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/064_hand_notes.sql` | Create | New `hand_notes` table + indexes |
| `server/auth/requireSchool.js` | Create | Express middleware: resolves `req.user.school_id` from `player_profiles`, 5-min cache, 403 if no assignment |
| `server/db/repositories/HandNotesRepository.js` | Create | CRUD: list, create, update, delete, countForHand, batchCounts |
| `server/routes/notes.js` | Create | 5 REST endpoints: list/create/update/delete/batch-counts |
| `server/index.js` | Modify | Mount `notes` router |
| `server/tests/HandNotesRepository.test.js` | Create | Repo unit tests (school filter, CRUD) |
| `server/tests/notes.routes.test.js` | Create | Route integration tests (auth, school match, body validation, RBAC) |
| `client/src/hooks/useNotes.js` | Create | Wraps REST CRUD; 60s stale-while-revalidate per handId |
| `client/src/components/sidebar-v3/NotesPanel.jsx` | Create | Mode-driven shared component: `inline-live` / `review` / `preview` |
| `client/src/components/sidebar-v3/TabLive.jsx` | Modify | Mount `live.notes_panel` (collapsed by default; opens via footer button) |
| `client/src/components/sidebar-v3/TabReview.jsx` | Modify | Mount `review.notes_panel` |
| `client/src/components/sidebar-v3/TabHistory.jsx` | Modify | Add `notes_pip` per hand card with popover preview |
| `client/src/components/sidebar-v3/Sidebar.jsx` | Modify | Wire `📝 Notes` footer button to toggle live notes panel; pass `notesOpen` state to TabLive |
| `client/src/components/sidebar-v3/buildLiveData.js` | Modify | Surface `notes_counts` from a batch fetch on tab mount |
| `client/src/components/sidebar-v3/__tests__/NotesPanel.test.jsx` | Create | Per-mode rendering, add/edit/delete UX |
| `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx` | Modify | Notes panel collapsed by default; opens on footer click |
| `client/src/components/sidebar-v3/__tests__/TabReview.test.jsx` | Create | Review notes panel mount |
| `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx` | Modify | Notes pip badge + popover |
| `client/src/hooks/__tests__/useNotes.test.js` | Create | Cache TTL, fetch / mutation flow |

---

## Task 1: Migration 064 — `hand_notes` table

**Files:**
- Create: `supabase/migrations/064_hand_notes.sql`
- Test: migration sanity (one-shot script)

- [ ] **Step 1.1: Write the migration**

Create `supabase/migrations/064_hand_notes.sql`:

```sql
-- 064_hand_notes.sql
-- Coach hand-level notes (school-scoped read/write).
-- Spec: docs/superpowers/specs/2026-04-30-sidebar-v3-spec.md section 6.1.

BEGIN;

CREATE TABLE IF NOT EXISTS hand_notes (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id            UUID         NOT NULL REFERENCES hands(hand_id) ON DELETE CASCADE,
  school_id          UUID         NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  author_player_id   UUID         REFERENCES player_profiles(id) ON DELETE SET NULL,
  body               TEXT         NOT NULL CHECK (char_length(body) > 0 AND char_length(body) <= 500),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hand_notes_hand_id   ON hand_notes (hand_id);
CREATE INDEX IF NOT EXISTS idx_hand_notes_school_id ON hand_notes (school_id);

COMMIT;
```

- [ ] **Step 1.2: Apply locally and verify**

Run (against your local Supabase / Postgres):

```bash
psql $DATABASE_URL -f supabase/migrations/064_hand_notes.sql
```

Expected: `BEGIN`, `CREATE TABLE`, two `CREATE INDEX`, `COMMIT`. No errors.

Verify table:
```bash
psql $DATABASE_URL -c "\d hand_notes"
```

Expected output shows columns matching the migration, FK constraints, and the two indexes.

- [ ] **Step 1.3: Commit**

```bash
git add supabase/migrations/064_hand_notes.sql
git commit -m "$(cat <<'EOF'
feat(db): migration 064 — hand_notes table

School-scoped coach hand-level notes. Replaces the dropped hand_annotations
feature. ON DELETE CASCADE on hand_id and school_id; author_player_id
sets NULL when the author is removed.

Body size: 1–500 chars. Indexed on hand_id (read by useNotes) and
school_id (RBAC filter at write time).

Spec: section 6.1 / Phase B.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `requireSchool` Express middleware

**Files:**
- Create: `server/auth/requireSchool.js`
- Create: `server/auth/__tests__/requireSchool.test.js`

- [ ] **Step 2.1: Write the failing test**

Create `server/auth/__tests__/requireSchool.test.js`:

```js
const { describe, it, expect, beforeEach, jest: vi } = require('@jest/globals');

jest.mock('../../db/supabase.js', () => {
  const mock = {
    from: jest.fn(() => mock),
    select: jest.fn(() => mock),
    eq: jest.fn(() => mock),
    single: jest.fn(),
  };
  return mock;
});

const supabase = require('../../db/supabase.js');
const requireSchool = require('../requireSchool.js');

function makeReqRes() {
  const req = { user: { id: 'p1', stableId: 'p1' } };
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireSchool middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireSchool.__clearCache?.();
  });

  it('attaches school_id to req.user and calls next()', async () => {
    supabase.single.mockResolvedValueOnce({ data: { school_id: 's-1' }, error: null });
    const { req, res, next } = makeReqRes();
    await requireSchool(req, res, next);
    expect(req.user.school_id).toBe('s-1');
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 403 with no_school_assignment when school_id is null', async () => {
    supabase.single.mockResolvedValueOnce({ data: { school_id: null }, error: null });
    const { req, res, next } = makeReqRes();
    await requireSchool(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'no_school_assignment' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 if req.user is missing', async () => {
    const { req, res, next } = makeReqRes();
    delete req.user;
    await requireSchool(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('caches the school_id for subsequent calls within TTL', async () => {
    supabase.single.mockResolvedValueOnce({ data: { school_id: 's-1' }, error: null });
    const { req: r1, res: rs1, next: n1 } = makeReqRes();
    await requireSchool(r1, rs1, n1);
    const { req: r2, res: rs2, next: n2 } = makeReqRes();
    await requireSchool(r2, rs2, n2);
    expect(supabase.single).toHaveBeenCalledTimes(1); // second call hit cache
    expect(r2.user.school_id).toBe('s-1');
    expect(n2).toHaveBeenCalled();
  });

  it('returns 500 if supabase fails', async () => {
    supabase.single.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const { req, res, next } = makeReqRes();
    await requireSchool(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2.2: Run, verify failure**

Run: `cd server && npx jest auth/__tests__/requireSchool.test.js`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement requireSchool**

Create `server/auth/requireSchool.js`:

```js
'use strict';

const supabase = require('../db/supabase.js');

const SCHOOL_CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();   // playerId -> { school_id, fetchedAt }

async function requireSchool(req, res, next) {
  const uid = req.user?.id ?? req.user?.stableId;
  if (!uid) return res.status(401).json({ error: 'auth_required' });

  const cached = cache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < SCHOOL_CACHE_TTL_MS) {
    if (!cached.school_id) return res.status(403).json({ error: 'no_school_assignment' });
    req.user.school_id = cached.school_id;
    return next();
  }

  const { data, error } = await supabase
    .from('player_profiles')
    .select('school_id')
    .eq('id', uid)
    .single();

  if (error) return res.status(500).json({ error: 'school_lookup_failed', message: error.message });

  cache.set(uid, { school_id: data?.school_id ?? null, fetchedAt: Date.now() });
  if (!data?.school_id) {
    return res.status(403).json({ error: 'no_school_assignment', message: 'Your account is not assigned to a school. Contact admin.' });
  }
  req.user.school_id = data.school_id;
  return next();
}

requireSchool.__clearCache = () => cache.clear();

module.exports = requireSchool;
```

- [ ] **Step 2.4: Run, verify pass**

Run: `cd server && npx jest auth/__tests__/requireSchool.test.js`
Expected: PASS for all 5 cases.

- [ ] **Step 2.5: Commit**

```bash
git add server/auth/requireSchool.js \
        server/auth/__tests__/requireSchool.test.js
git commit -m "$(cat <<'EOF'
feat(auth): add requireSchool middleware

Resolves req.user.school_id from player_profiles. Caches per playerId
with 5-min TTL (mirrors permission cache). 403 if no school assignment;
500 if DB lookup fails.

Used by Notes routes to enforce school-team trust model. Spec section
3.1, 5.1 RBAC notes.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `HandNotesRepository`

**Files:**
- Create: `server/db/repositories/HandNotesRepository.js`
- Create: `server/tests/HandNotesRepository.test.js`

- [ ] **Step 3.1: Write failing repo tests**

Create `server/tests/HandNotesRepository.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');

jest.mock('../db/supabase.js', () => {
  // Chainable supabase mock; each method returns the same object,
  // and the terminal calls return Promises that the test sets up.
  const chain = {};
  ['from', 'select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'single'].forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain.__resolveSelect = (data, error = null) => {
    chain.then = undefined;
    chain.eq.mockReturnValueOnce(Promise.resolve({ data, error }));
  };
  return chain;
});

const supabase = require('../db/supabase.js');
const repo = require('../db/repositories/HandNotesRepository.js');

beforeEach(() => {
  jest.clearAllMocks();
  Object.values(supabase).forEach((m) => typeof m === 'function' && m.mockClear?.());
  ['from', 'select', 'eq', 'in', 'order', 'insert', 'update', 'delete', 'single'].forEach((m) => {
    supabase[m] = jest.fn(() => supabase);
  });
});

describe('HandNotesRepository.listForHand', () => {
  it('queries hand_notes filtered by hand_id and school_id', async () => {
    supabase.order = jest.fn().mockResolvedValueOnce({
      data: [{ id: 'n1', hand_id: 'h1', school_id: 's1', body: 'note', author_player_id: 'p1', created_at: 't', updated_at: 't' }],
      error: null,
    });
    const result = await repo.listForHand('h1', 's1');
    expect(supabase.from).toHaveBeenCalledWith('hand_notes');
    expect(result).toHaveLength(1);
    expect(result[0].hand_id).toBe('h1');
  });

  it('returns empty array on supabase error', async () => {
    supabase.order = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const result = await repo.listForHand('h1', 's1');
    expect(result).toEqual([]);
  });
});

describe('HandNotesRepository.create', () => {
  it('inserts a note with provided fields', async () => {
    supabase.single = jest.fn().mockResolvedValueOnce({
      data: { id: 'n1', hand_id: 'h1', school_id: 's1', body: 'hi', author_player_id: 'p1' },
      error: null,
    });
    const result = await repo.create('h1', 's1', 'p1', 'hi');
    expect(result.body).toBe('hi');
    expect(result.school_id).toBe('s1');
  });

  it('throws on supabase error', async () => {
    supabase.single = jest.fn().mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    await expect(repo.create('h1', 's1', 'p1', 'hi')).rejects.toThrow('fail');
  });
});

describe('HandNotesRepository.update', () => {
  it('updates body and bumps updated_at; school_id guard in WHERE', async () => {
    supabase.single = jest.fn().mockResolvedValueOnce({
      data: { id: 'n1', body: 'edited' }, error: null,
    });
    const result = await repo.update('n1', 's1', 'edited');
    expect(supabase.update).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('school_id', 's1');
    expect(result.body).toBe('edited');
  });
});

describe('HandNotesRepository.delete', () => {
  it('deletes scoped to school_id', async () => {
    supabase.eq = jest.fn().mockReturnValueOnce(supabase).mockResolvedValueOnce({ data: null, error: null });
    await repo.delete('n1', 's1');
    expect(supabase.delete).toHaveBeenCalled();
    expect(supabase.eq).toHaveBeenCalledWith('school_id', 's1');
  });
});

describe('HandNotesRepository.countForHand', () => {
  it('returns count of notes for hand+school', async () => {
    supabase.eq = jest.fn().mockReturnValueOnce(supabase).mockResolvedValueOnce({ count: 3, error: null });
    const result = await repo.countForHand('h1', 's1');
    expect(result).toBe(3);
  });
});

describe('HandNotesRepository.batchCounts', () => {
  it('returns Map<handId, count> for given handIds and school', async () => {
    supabase.in = jest.fn().mockResolvedValueOnce({
      data: [
        { hand_id: 'h1' }, { hand_id: 'h1' }, { hand_id: 'h2' },
      ],
      error: null,
    });
    const result = await repo.batchCounts(['h1', 'h2', 'h3'], 's1');
    expect(result.get('h1')).toBe(2);
    expect(result.get('h2')).toBe(1);
    expect(result.get('h3')).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run, verify failure**

Run: `cd server && npx jest tests/HandNotesRepository.test.js`
Expected: FAIL — repo file not found.

- [ ] **Step 3.3: Implement repository**

Create `server/db/repositories/HandNotesRepository.js`:

```js
'use strict';

const supabase = require('../supabase.js');

const NOTE_COLUMNS = 'id, hand_id, school_id, author_player_id, body, created_at, updated_at';

async function listForHand(handId, schoolId) {
  const { data, error } = await supabase
    .from('hand_notes')
    .select(NOTE_COLUMNS)
    .eq('hand_id', handId)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

async function create(handId, schoolId, authorPlayerId, body) {
  const { data, error } = await supabase
    .from('hand_notes')
    .insert({ hand_id: handId, school_id: schoolId, author_player_id: authorPlayerId, body })
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function update(noteId, schoolId, body) {
  const { data, error } = await supabase
    .from('hand_notes')
    .update({ body, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .eq('school_id', schoolId)
    .select(NOTE_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function deleteNote(noteId, schoolId) {
  const { error } = await supabase
    .from('hand_notes')
    .delete()
    .eq('id', noteId)
    .eq('school_id', schoolId);
  if (error) throw new Error(error.message);
}

async function countForHand(handId, schoolId) {
  const { count, error } = await supabase
    .from('hand_notes')
    .select('id', { count: 'exact', head: true })
    .eq('hand_id', handId)
    .eq('school_id', schoolId);
  if (error) return 0;
  return count ?? 0;
}

async function batchCounts(handIds, schoolId) {
  if (!Array.isArray(handIds) || handIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('hand_notes')
    .select('hand_id')
    .eq('school_id', schoolId)
    .in('hand_id', handIds);
  if (error) return new Map();
  const counts = new Map();
  for (const row of data ?? []) {
    counts.set(row.hand_id, (counts.get(row.hand_id) ?? 0) + 1);
  }
  return counts;
}

module.exports = {
  listForHand,
  create,
  update,
  delete: deleteNote,
  countForHand,
  batchCounts,
};
```

- [ ] **Step 3.4: Run, verify pass**

Run: `cd server && npx jest tests/HandNotesRepository.test.js`
Expected: PASS for all 6 test groups (10 cases).

- [ ] **Step 3.5: Commit**

```bash
git add server/db/repositories/HandNotesRepository.js \
        server/tests/HandNotesRepository.test.js
git commit -m "$(cat <<'EOF'
feat(db): HandNotesRepository — CRUD + count + batchCounts

Every method takes school_id explicitly; queries filter by it as
defense-in-depth alongside route middleware. batchCounts powers the
notes-pip badge on history hand cards. Spec section 6.5.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: REST routes — `server/routes/notes.js`

**Files:**
- Create: `server/routes/notes.js`
- Create: `server/tests/notes.routes.test.js`
- Modify: `server/index.js` (mount the router)

- [ ] **Step 4.1: Write failing route integration tests**

Create `server/tests/notes.routes.test.js`:

```js
'use strict';

const { describe, it, expect, beforeEach, jest } = require('@jest/globals');
const request = require('supertest');
const express = require('express');

jest.mock('../db/repositories/HandNotesRepository.js');
jest.mock('../auth/requireAuth.js');
jest.mock('../auth/requireRole.js');
jest.mock('../auth/requireSchool.js');

const repo = require('../db/repositories/HandNotesRepository.js');
const requireAuth = require('../auth/requireAuth.js');
const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');

beforeEach(() => {
  jest.clearAllMocks();
  requireAuth.mockImplementation((req, _res, next) => {
    req.user = { id: 'coach-1', stableId: 'coach-1', name: 'Test Coach', role: 'coach' };
    next();
  });
  requireRole.mockImplementation(() => (_req, _res, next) => next());
  requireSchool.mockImplementation((req, _res, next) => {
    req.user.school_id = 's-1';
    next();
  });
});

function makeApp() {
  const app = express();
  app.use(express.json());
  require('../routes/notes.js')(app, { requireAuth });
  return app;
}

describe('GET /api/hands/:handId/notes', () => {
  it('returns notes for hand filtered by school', async () => {
    repo.listForHand.mockResolvedValueOnce([
      { id: 'n1', hand_id: 'h1', school_id: 's-1', body: 'hi', author_player_id: 'p1', created_at: 't', updated_at: 't' },
    ]);
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(200);
    expect(res.body.notes).toHaveLength(1);
    expect(repo.listForHand).toHaveBeenCalledWith('h1', 's-1');
  });
});

describe('POST /api/hands/:handId/notes', () => {
  it('creates a note with trimmed body', async () => {
    repo.create.mockResolvedValueOnce({ id: 'n1', hand_id: 'h1', school_id: 's-1', body: 'hi', author_player_id: 'coach-1' });
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: '  hi  ' });
    expect(res.status).toBe(201);
    expect(repo.create).toHaveBeenCalledWith('h1', 's-1', 'coach-1', 'hi');
  });

  it('rejects empty body with 400', async () => {
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('rejects body > 500 chars with 400', async () => {
    const res = await request(makeApp()).post('/api/hands/h1/notes').send({ body: 'x'.repeat(501) });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });
});

describe('PATCH /api/notes/:noteId', () => {
  it('updates a note (school-scoped)', async () => {
    repo.update.mockResolvedValueOnce({ id: 'n1', body: 'edited', school_id: 's-1' });
    const res = await request(makeApp()).patch('/api/notes/n1').send({ body: 'edited' });
    expect(res.status).toBe(200);
    expect(repo.update).toHaveBeenCalledWith('n1', 's-1', 'edited');
  });

  it('rejects empty body 400', async () => {
    const res = await request(makeApp()).patch('/api/notes/n1').send({ body: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/notes/:noteId', () => {
  it('deletes a note (school-scoped)', async () => {
    repo.delete.mockResolvedValueOnce(undefined);
    const res = await request(makeApp()).delete('/api/notes/n1');
    expect(res.status).toBe(204);
    expect(repo.delete).toHaveBeenCalledWith('n1', 's-1');
  });
});

describe('POST /api/hands/notes-counts', () => {
  it('returns batched counts for given handIds', async () => {
    const counts = new Map([['h1', 2], ['h2', 1]]);
    repo.batchCounts.mockResolvedValueOnce(counts);
    const res = await request(makeApp()).post('/api/hands/notes-counts').send({ handIds: ['h1', 'h2', 'h3'] });
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({ h1: 2, h2: 1 });
  });

  it('rejects when handIds is not an array', async () => {
    const res = await request(makeApp()).post('/api/hands/notes-counts').send({ handIds: 'oops' });
    expect(res.status).toBe(400);
  });
});

describe('Auth integration', () => {
  it('returns 401 when requireAuth fails', async () => {
    requireAuth.mockImplementationOnce((_req, res, _next) => res.status(401).json({ error: 'unauth' }));
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(401);
  });

  it('returns 403 when requireSchool rejects (no school assignment)', async () => {
    requireSchool.mockImplementationOnce((_req, res, _next) =>
      res.status(403).json({ error: 'no_school_assignment' }));
    const res = await request(makeApp()).get('/api/hands/h1/notes');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 4.2: Run, verify failure**

Run: `cd server && npx jest tests/notes.routes.test.js`
Expected: FAIL — `routes/notes.js` not found.

- [ ] **Step 4.3: Implement routes**

Create `server/routes/notes.js`:

```js
'use strict';

const repo = require('../db/repositories/HandNotesRepository.js');
const requireRole = require('../auth/requireRole.js');
const requireSchool = require('../auth/requireSchool.js');
const supabase = require('../db/supabase.js');

const MAX_BODY = 500;

function validateBody(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_BODY) return null;
  return trimmed;
}

async function attachAuthorName(notes) {
  if (!notes || notes.length === 0) return notes;
  const ids = [...new Set(notes.map((n) => n.author_player_id).filter(Boolean))];
  if (ids.length === 0) return notes;
  const { data } = await supabase
    .from('player_profiles')
    .select('id, name')
    .in('id', ids);
  const nameById = new Map((data ?? []).map((p) => [p.id, p.name]));
  return notes.map((n) => ({
    ...n,
    author_name: n.author_player_id ? (nameById.get(n.author_player_id) ?? 'Coach (deleted)') : 'Coach (deleted)',
  }));
}

module.exports = function registerNoteRoutes(app, { requireAuth }) {
  const coachOnly = requireRole('coach');

  app.get('/api/hands/:handId/notes', requireAuth, coachOnly, requireSchool, async (req, res) => {
    try {
      const notes = await repo.listForHand(req.params.handId, req.user.school_id);
      const enriched = await attachAuthorName(notes);
      res.json({ notes: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.post('/api/hands/:handId/notes', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const body = validateBody(req.body?.body);
    if (!body) return res.status(400).json({ error: 'invalid_body', message: 'Body must be 1–500 chars.' });
    try {
      const note = await repo.create(req.params.handId, req.user.school_id, req.user.id, body);
      const [enriched] = await attachAuthorName([note]);
      res.status(201).json({ note: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.patch('/api/notes/:noteId', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const body = validateBody(req.body?.body);
    if (!body) return res.status(400).json({ error: 'invalid_body', message: 'Body must be 1–500 chars.' });
    try {
      const note = await repo.update(req.params.noteId, req.user.school_id, body);
      if (!note) return res.status(404).json({ error: 'note_not_found' });
      const [enriched] = await attachAuthorName([note]);
      res.json({ note: enriched });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.delete('/api/notes/:noteId', requireAuth, coachOnly, requireSchool, async (req, res) => {
    try {
      await repo.delete(req.params.noteId, req.user.school_id);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });

  app.post('/api/hands/notes-counts', requireAuth, coachOnly, requireSchool, async (req, res) => {
    const handIds = req.body?.handIds;
    if (!Array.isArray(handIds)) {
      return res.status(400).json({ error: 'invalid_payload', message: 'handIds must be an array.' });
    }
    try {
      const counts = await repo.batchCounts(handIds, req.user.school_id);
      res.json({ counts: Object.fromEntries(counts) });
    } catch (err) {
      res.status(500).json({ error: 'internal_error', message: err.message });
    }
  });
};
```

- [ ] **Step 4.4: Run, verify pass**

Run: `cd server && npx jest tests/notes.routes.test.js`
Expected: PASS for all groups.

- [ ] **Step 4.5: Mount router in `server/index.js`**

Edit `server/index.js`. Find the section where other route modules are mounted (look for `require('./routes/hands')(app, ...)` or similar). Add:

```js
require('./routes/notes.js')(app, { requireAuth });
```

Place it alphabetically with other notes-adjacent routers (near `hands` router).

- [ ] **Step 4.6: Quick smoke test the mount**

Run: `cd server && npm start` in one terminal. In another:

```bash
curl -i http://localhost:3001/api/hands/00000000-0000-0000-0000-000000000000/notes \
  -H "Authorization: Bearer $JWT"
```

Expected: 200 with `{notes: []}` (or 401 if no JWT, 403 if no school assignment — all acceptable, just confirming route is mounted).

- [ ] **Step 4.7: Commit**

```bash
git add server/routes/notes.js \
        server/tests/notes.routes.test.js \
        server/index.js
git commit -m "$(cat <<'EOF'
feat(api): /api/hands/:id/notes + /api/notes/:id CRUD

Five endpoints under /api covering list, create, update, delete, and a
batched counts endpoint for the history notes-pip badge. All gated by
requireAuth + requireRole('coach') + requireSchool. Body validated to
1–500 trimmed chars. author_name joined from player_profiles, falls
back to "Coach (deleted)" when player_id is null.

Spec section 5.4, 7.3.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `useNotes` client hook

**Files:**
- Create: `client/src/hooks/useNotes.js`
- Create: `client/src/hooks/__tests__/useNotes.test.js`

- [ ] **Step 5.1: Write failing hook test**

Create `client/src/hooks/__tests__/useNotes.test.js`:

```jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useNotes from '../useNotes.js';

const mockApi = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args) => mockApi(...args),
}));

beforeEach(() => {
  mockApi.mockReset();
});

describe('useNotes', () => {
  it('fetches notes on mount when handId is set', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'hi' }] });
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toEqual([{ id: 'n1', body: 'hi' }]));
    expect(mockApi).toHaveBeenCalledWith('/api/hands/h1/notes');
  });

  it('does not fetch when handId is null', () => {
    renderHook(() => useNotes(null));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('add() POSTs and prepends the returned note', async () => {
    mockApi.mockResolvedValueOnce({ notes: [] });               // initial fetch
    mockApi.mockResolvedValueOnce({ note: { id: 'n2', body: 'new' } }); // add
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toEqual([]));
    await act(() => result.current.add('new'));
    expect(mockApi).toHaveBeenLastCalledWith('/api/hands/h1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'new' }),
    });
    expect(result.current.notes[0].id).toBe('n2');
  });

  it('edit() PATCHes and replaces the note in place', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'old' }] });
    mockApi.mockResolvedValueOnce({ note: { id: 'n1', body: 'edited' } });
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    await act(() => result.current.edit('n1', 'edited'));
    expect(result.current.notes[0].body).toBe('edited');
  });

  it('remove() DELETEs and drops the note', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'x' }] });
    mockApi.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    await act(() => result.current.remove('n1'));
    expect(result.current.notes).toEqual([]);
  });
});
```

- [ ] **Step 5.2: Run, verify failure**

Run: `cd client && npx vitest run src/hooks/__tests__/useNotes.test.js`
Expected: FAIL.

- [ ] **Step 5.3: Implement useNotes**

Create `client/src/hooks/useNotes.js`:

```js
import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';

const STALE_MS = 60 * 1000;
const cache = new Map(); // handId -> { notes, fetchedAt }

export default function useNotes(handId) {
  const [notes, setNotes] = useState(() => cache.get(handId)?.notes ?? []);
  const [loading, setLoading] = useState(!!handId);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!handId) return;
    try {
      setLoading(true);
      const result = await apiFetch(`/api/hands/${handId}/notes`);
      const fresh = result?.notes ?? [];
      cache.set(handId, { notes: fresh, fetchedAt: Date.now() });
      setNotes(fresh);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [handId]);

  useEffect(() => {
    if (!handId) { setNotes([]); setLoading(false); return; }
    const cached = cache.get(handId);
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setNotes(cached.notes);
      setLoading(false);
      return;
    }
    refresh();
  }, [handId, refresh]);

  const add = useCallback(async (body) => {
    if (!handId || !body?.trim()) return null;
    const result = await apiFetch(`/api/hands/${handId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const newNote = result?.note;
    if (newNote) {
      setNotes((prev) => {
        const next = [newNote, ...prev];
        cache.set(handId, { notes: next, fetchedAt: Date.now() });
        return next;
      });
    }
    return newNote;
  }, [handId]);

  const edit = useCallback(async (noteId, body) => {
    if (!body?.trim()) return null;
    const result = await apiFetch(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const edited = result?.note;
    if (edited) {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === noteId ? edited : n));
        cache.set(handId, { notes: next, fetchedAt: Date.now() });
        return next;
      });
    }
    return edited;
  }, [handId]);

  const remove = useCallback(async (noteId) => {
    await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      cache.set(handId, { notes: next, fetchedAt: Date.now() });
      return next;
    });
  }, [handId]);

  return { notes, loading, error, refresh, add, edit, remove };
}

useNotes.__clearCache = () => cache.clear();
```

- [ ] **Step 5.4: Run, verify pass**

Run: `cd client && npx vitest run src/hooks/__tests__/useNotes.test.js`
Expected: PASS for all 5 cases.

- [ ] **Step 5.5: Commit**

```bash
git add client/src/hooks/useNotes.js \
        client/src/hooks/__tests__/useNotes.test.js
git commit -m "$(cat <<'EOF'
feat(client): useNotes hook — REST CRUD with 60s SWR cache

Per-handId in-memory cache; stale-while-revalidate on subsequent mounts.
add / edit / remove mutate optimistically by patching the cached array.
Spec section 3.4 (Notes data freshness).

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `NotesPanel.jsx` shared component

**Files:**
- Create: `client/src/components/sidebar-v3/NotesPanel.jsx`
- Create: `client/src/components/sidebar-v3/__tests__/NotesPanel.test.jsx`

- [ ] **Step 6.1: Write failing component tests**

Create `client/src/components/sidebar-v3/__tests__/NotesPanel.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import NotesPanel from '../NotesPanel.jsx';

const sampleNotes = [
  { id: 'n1', body: 'First note', author_name: 'Yonatan', author_player_id: 'p1', created_at: '2026-04-30T10:00:00Z', updated_at: '2026-04-30T10:00:00Z' },
  { id: 'n2', body: 'Second',     author_name: 'Yonatan', author_player_id: 'p1', created_at: '2026-04-30T10:05:00Z', updated_at: '2026-04-30T10:05:00Z' },
];

const apiBase = {
  notes: sampleNotes,
  loading: false,
  error: null,
  refresh: vi.fn(),
  add: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

describe('NotesPanel — inline-live mode', () => {
  it('renders notes with author + body', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    expect(screen.getByText('First note')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getAllByText('Yonatan')).toHaveLength(2);
  });

  it('Add note: typing then Save calls api.add', () => {
    const api = { ...apiBase, add: vi.fn().mockResolvedValue({ id: 'n3', body: 'new' }) };
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    const ta = screen.getByPlaceholderText(/type a note/i);
    fireEvent.change(ta, { target: { value: 'new note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.add).toHaveBeenCalledWith('new note');
  });

  it('Save is disabled when textarea empty', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Char count is displayed', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    const ta = screen.getByPlaceholderText(/type a note/i);
    fireEvent.change(ta, { target: { value: 'hello' } });
    expect(screen.getByText(/5\s*\/\s*500/)).toBeInTheDocument();
  });

  it('Edit button toggles textarea, Save calls api.edit', () => {
    const api = { ...apiBase, edit: vi.fn().mockResolvedValue({ id: 'n1', body: 'edited' }) };
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    const noteCard = screen.getByText('First note').closest('div');
    fireEvent.click(within(noteCard).getByRole('button', { name: /edit/i }));
    const ta = screen.getByDisplayValue('First note');
    fireEvent.change(ta, { target: { value: 'edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.edit).toHaveBeenCalledWith('n1', 'edited');
  });

  it('Delete button calls api.remove (with confirm)', () => {
    const api = { ...apiBase, remove: vi.fn().mockResolvedValue() };
    const realConfirm = window.confirm;
    window.confirm = () => true;
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    const noteCard = screen.getByText('Second').closest('div');
    fireEvent.click(within(noteCard).getByRole('button', { name: '×' }));
    expect(api.remove).toHaveBeenCalledWith('n2');
    window.confirm = realConfirm;
  });
});

describe('NotesPanel — review mode', () => {
  it('renders the same edit affordances as inline-live', () => {
    render(<NotesPanel mode="review" handId="h1" api={apiBase} />);
    expect(screen.getByRole('button', { name: /\+ Add note/i })).toBeInTheDocument();
  });
});

describe('NotesPanel — preview mode', () => {
  it('renders read-only — no Add button, no edit/delete buttons', () => {
    render(<NotesPanel mode="preview" handId="h1" api={apiBase} />);
    expect(screen.queryByRole('button', { name: /\+ Add note/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: '×' })).toBeNull();
  });

  it('truncates to first 3 notes and shows "see more" hint', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`, body: `body ${i}`, author_name: 'X', author_player_id: 'p1',
      created_at: '2026-04-30T10:00:00Z', updated_at: '2026-04-30T10:00:00Z',
    }));
    render(<NotesPanel mode="preview" handId="h1" api={{ ...apiBase, notes: many }} />);
    expect(screen.getByText('body 0')).toBeInTheDocument();
    expect(screen.getByText('body 2')).toBeInTheDocument();
    expect(screen.queryByText('body 4')).toBeNull();
    expect(screen.getByText(/see more in Review/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/NotesPanel.test.jsx`
Expected: FAIL.

- [ ] **Step 6.3: Implement NotesPanel**

Create `client/src/components/sidebar-v3/NotesPanel.jsx`:

```jsx
import React, { useState } from 'react';

const MAX = 500;

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function NoteCard({ note, editable, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  if (editing) {
    return (
      <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
        <textarea
          className="field"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
          rows={3}
          style={{ width: '100%', resize: 'vertical' }}
        />
        <div className="row" style={{ gap: 5, marginTop: 6 }}>
          <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{draft.length} / {MAX}</span>
          <button className="btn ghost sm" onClick={() => { setEditing(false); setDraft(note.body); }}>Cancel</button>
          <button
            className="btn primary sm"
            disabled={!draft.trim() || draft === note.body}
            onClick={async () => { await onEdit(note.id, draft); setEditing(false); }}
          >Save</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink-dim)' }}>{note.author_name || 'Coach (deleted)'}</span>
        <span style={{ fontSize: 9, color: 'var(--ink-faint)' }}>· {timeAgo(note.updated_at || note.created_at)}</span>
        {editable && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="btn sm ghost" title="Edit" onClick={() => setEditing(true)}>edit</button>
            <button
              className="btn sm"
              style={{ color: 'var(--bad)' }}
              onClick={() => {
                if (typeof window !== 'undefined' && !window.confirm('Delete this note?')) return;
                onDelete(note.id);
              }}
            >×</button>
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{note.body}</div>
    </div>
  );
}

export default function NotesPanel({ mode, handId, api }) {
  const editable = mode !== 'preview';
  const isPreview = mode === 'preview';
  const visible = isPreview ? (api?.notes ?? []).slice(0, 3) : (api?.notes ?? []);
  const truncated = isPreview && (api?.notes?.length ?? 0) > 3;

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  if (!handId) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center' }}>
        No active hand.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Notes</div>
        <div className="card-kicker">{(api?.notes?.length ?? 0)} note{(api?.notes?.length ?? 0) === 1 ? '' : 's'}</div>
      </div>

      {visible.length === 0 && !adding && (
        <div style={{ fontSize: 11, color: 'var(--ink-faint)', padding: '6px 0', textAlign: 'center' }}>
          {isPreview ? 'No notes on this hand.' : 'No notes yet — add one below.'}
        </div>
      )}

      {visible.map((n) => (
        <NoteCard
          key={n.id}
          note={n}
          editable={editable}
          onEdit={api.edit}
          onDelete={api.remove}
        />
      ))}

      {truncated && (
        <div style={{ fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center', padding: '4px 0' }}>
          + {api.notes.length - 3} more — see more in Review
        </div>
      )}

      {editable && !adding && (
        <button
          className="btn sm full"
          style={{ marginTop: 6 }}
          onClick={() => setAdding(true)}
        >+ Add note</button>
      )}

      {editable && adding && (
        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6, padding: 8, marginTop: 6 }}>
          <textarea
            className="field"
            placeholder="Type a note (max 500 chars)"
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
            rows={3}
            autoFocus
            style={{ width: '100%', resize: 'vertical' }}
          />
          <div className="row" style={{ gap: 5, marginTop: 6 }}>
            <span style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)' }}>{draft.length} / {MAX}</span>
            <button className="btn ghost sm" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</button>
            <button
              className="btn primary sm"
              disabled={!draft.trim()}
              onClick={async () => { await api.add(draft); setAdding(false); setDraft(''); }}
            >Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/NotesPanel.test.jsx`
Expected: PASS for all groups.

- [ ] **Step 6.5: Commit**

```bash
git add client/src/components/sidebar-v3/NotesPanel.jsx \
        client/src/components/sidebar-v3/__tests__/NotesPanel.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): NotesPanel — shared component, 3 modes

- inline-live (Live tab footer panel — full edit)
- review     (Review tab — full edit)
- preview    (History card popover — read-only, max 3, "see more")

Each note shows author + relative timestamp; body is plaintext with
line breaks preserved. Char counter on input. Spec section 5.1.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Mount `live.notes_panel` + footer button wiring

**Files:**
- Modify: `client/src/components/sidebar-v3/TabLive.jsx`
- Modify: `client/src/components/sidebar-v3/Sidebar.jsx` (footer button onClick + `notesOpen` state passed to TabLive)
- Modify: `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx`

- [ ] **Step 7.1: Failing test — notes panel collapsed by default; opens via prop**

Append to `client/src/components/sidebar-v3/__tests__/TabLive.test.jsx`:

```jsx
import NotesPanel from '../NotesPanel.jsx';
vi.mock('../../../hooks/useNotes.js', () => ({
  default: () => ({ notes: [{ id: 'n1', body: 'hello', author_name: 'Coach' }], loading: false, error: null, refresh: vi.fn(), add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}));

describe('TabLive — Notes panel', () => {
  function withHand(overrides = {}) {
    return liveData({ gameState: { phase: 'flop', paused: false, hand_id: 'h-current' }, ...overrides });
  }

  it('does not render Notes content when notesOpen is false', () => {
    render(<TabLive data={withHand()} emit={noopEmit} notesOpen={false} />);
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('renders NotesPanel content when notesOpen is true', () => {
    render(<TabLive data={withHand()} emit={noopEmit} notesOpen={true} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: FAIL — TabLive doesn't accept `notesOpen` prop.

- [ ] **Step 7.3: Add notes panel to TabLive**

Edit `client/src/components/sidebar-v3/TabLive.jsx`:

1. Add imports at top:
   ```jsx
   import NotesPanel from './NotesPanel.jsx';
   import useNotes from '../../hooks/useNotes.js';
   ```

2. Add `notesOpen` prop to component signature:
   ```jsx
   export default function TabLive({ data, emit, notesOpen = false }) {
   ```

3. Inside the component, get the notes API:
   ```jsx
   const handId = data.gameState?.hand_id ?? null;
   const notesApi = useNotes(handId);
   ```

4. After the `live.action_log_card` render and before the closing wrapper, add:
   ```jsx
   {notesOpen && (
     <NotesPanel mode="inline-live" handId={handId} api={notesApi} />
   )}
   ```

- [ ] **Step 7.4: Wire `📝 Notes` button in Sidebar.jsx**

Edit `client/src/components/sidebar-v3/Sidebar.jsx`:

1. Add state near other `useState` declarations:
   ```jsx
   const [notesOpen, setNotesOpen] = useState(false);
   ```

2. In the live footer branch (already shipped from Phase A as a 6-button row), insert a `📝 Notes` button between Tag Hand and Undo:

   ```jsx
   <button
     className="btn"
     style={{ flex: 0.9 }}
     onClick={() => setNotesOpen((v) => !v)}
     disabled={!data.gameState?.hand_id}
     title={data.gameState?.hand_id ? 'Hand notes' : 'No active hand'}
   >📝 Notes{notesOpen ? ' ▾' : ''}</button>
   ```

   (If Phase A didn't land the Notes button slot, add it here as the new button.)

3. In the JSX where TabLive is rendered, pass the prop:
   ```jsx
   {tab === 'live' && <TabLive data={data} emit={emit} notesOpen={notesOpen} />}
   ```

4. On hand_id change, auto-collapse notes panel (avoid leaking state across hands):
   ```jsx
   useEffect(() => {
     setNotesOpen(false);
   }, [data.gameState?.hand_id]);
   ```

- [ ] **Step 7.5: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabLive.test.jsx`
Expected: PASS.

- [ ] **Step 7.6: Add Sidebar test for footer button toggle**

Append to `client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx`:

```jsx
describe('SidebarV3 — Notes button (Live footer)', () => {
  it('clicking Notes toggles the panel', () => {
    const data = { ...baseData, gameState: { ...baseData.gameState, hand_id: 'h-current', phase: 'flop' } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /📝 Notes/ }));
    // panel should now render — easiest assertion: NotesPanel header
    expect(screen.getByText(/^Notes$/)).toBeInTheDocument();
  });

  it('Notes button is disabled when no current hand_id', () => {
    const data = { ...baseData, gameState: { ...baseData.gameState, hand_id: null } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /📝 Notes/ })).toBeDisabled();
  });
});
```

- [ ] **Step 7.7: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/Sidebar.test.jsx`
Expected: PASS.

- [ ] **Step 7.8: Commit**

```bash
git add client/src/components/sidebar-v3/TabLive.jsx \
        client/src/components/sidebar-v3/Sidebar.jsx \
        client/src/components/sidebar-v3/__tests__/TabLive.test.jsx \
        client/src/components/sidebar-v3/__tests__/Sidebar.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): wire Notes panel on Live tab

📝 Notes button on footer.live toggles inline panel above the footer.
Bound to current gameState.hand_id; panel auto-collapses on hand
change (avoid bleeding draft across hands). Disabled when no active
hand. Spec section 5.1, 4.1 footer.live.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Mount `review.notes_panel`

**Files:**
- Modify: `client/src/components/sidebar-v3/TabReview.jsx`
- Create: `client/src/components/sidebar-v3/__tests__/TabReview.test.jsx`

- [ ] **Step 8.1: Failing test**

Create `client/src/components/sidebar-v3/__tests__/TabReview.test.jsx`:

```jsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabReview from '../TabReview.jsx';

vi.mock('../../../hooks/useNotes.js', () => ({
  default: () => ({ notes: [{ id: 'n1', body: 'review note', author_name: 'C', author_player_id: 'p1', created_at: 't', updated_at: 't' }], loading: false, error: null, refresh: vi.fn(), add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}));

const data = {
  gameState: { phase: 'waiting' },
  review: { loaded: true, handId: 'h1', cursor: 0, totalActions: 1, branched: false, board: [], players: [] },
  playlists: [],
};

describe('TabReview — notes panel', () => {
  it('renders the review notes panel when a hand is loaded', () => {
    render(<TabReview data={data} emit={{}} replay={{}} selectedHandId="h1" onBack={vi.fn()} />);
    expect(screen.getByText('review note')).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabReview.test.jsx`
Expected: FAIL — note not rendered (panel not mounted).

- [ ] **Step 8.3: Mount NotesPanel inside TabReview**

Edit `client/src/components/sidebar-v3/TabReview.jsx`:

1. Add imports at top:
   ```jsx
   import NotesPanel from './NotesPanel.jsx';
   import useNotes from '../../hooks/useNotes.js';
   ```

2. Inside the component, near other hooks:
   ```jsx
   const reviewHandId = selectedHandId ?? data.review?.handId ?? null;
   const notesApi = useNotes(reviewHandId);
   ```

3. In the live-replay UI section (where `review.replay_header`, `review.replay_controls`, `review.decision_tree`, `review.save_to_drill_card` render), inject the NotesPanel before `save_to_drill_card`:
   ```jsx
   <NotesPanel mode="review" handId={reviewHandId} api={notesApi} />
   ```

- [ ] **Step 8.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabReview.test.jsx`
Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabReview.jsx \
        client/src/components/sidebar-v3/__tests__/TabReview.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): mount NotesPanel on Review tab

Review tab now renders the notes panel for the selected hand,
positioned between decision tree and save_to_drill_card. Spec section
5.1, 4.4.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: History `notes_pip` + popover preview

**Files:**
- Modify: `client/src/components/sidebar-v3/TabHistory.jsx`
- Modify: `client/src/components/sidebar-v3/buildLiveData.js` (add `notes_counts`)
- Modify: `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx`

- [ ] **Step 9.1: Failing adapter test for notes_counts**

Append to `client/src/components/sidebar-v3/__tests__/buildLiveData.test.js`:

```jsx
describe('buildLiveData — notes_counts', () => {
  it('returns empty record by default (populated by TabHistory mount)', () => {
    const out = buildLiveData({
      hookState: {
        gameState: { phase: 'waiting', paused: false, is_scenario: false, hand_id: null, actions: [] },
        actionTimer: {},
        equityData: { showToPlayers: false, players: {} },
        myId: 'me',
        replayState: { active: false },
      },
      user: { stable_id: 'me' },
      playlist: { playlists: [], active: null },
    });
    expect(out.notes_counts).toEqual({});
  });
});
```

- [ ] **Step 9.2: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: FAIL — `notes_counts` missing.

- [ ] **Step 9.3: Add `notes_counts: {}` to adapter**

Edit `client/src/components/sidebar-v3/buildLiveData.js`. In the returned object, add:

```js
  return {
    ...fallback,
    status,
    actions_log,
    notes_counts: {},  // populated by TabHistory mount via batch fetch
    // ...rest
  };
```

- [ ] **Step 9.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/buildLiveData.test.js`
Expected: PASS.

- [ ] **Step 9.5: Failing test — `notes_pip` badge on hand cards**

Append to `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx`:

```jsx
import { vi } from 'vitest';

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue({ counts: { 'h1': 3, 'h2': 0 } }),
}));

const dataWithHistory = {
  history: [
    { hand_id: 'h1', hand_number: 1, board: [], pot_start: 0, pot_end: 100, phase_ended: 'showdown', winner: 'Alice', dealtAt: '2026-04-30T10:00:00Z', auto_tags: [] },
    { hand_id: 'h2', hand_number: 2, board: [], pot_start: 0, pot_end: 80,  phase_ended: 'fold',     winner: 'Bob',   dealtAt: '2026-04-30T10:05:00Z', auto_tags: [] },
  ],
  session: { hands: 2 },
};

describe('TabHistory — notes_pip', () => {
  it('renders 📝3 pip on cards with notes', async () => {
    render(<TabHistory data={dataWithHistory} onLoadReview={vi.fn()} />);
    // Wait for batchCounts to resolve and re-render
    await screen.findByText(/📝3/);
  });

  it('does not render pip on cards with zero notes', async () => {
    render(<TabHistory data={dataWithHistory} onLoadReview={vi.fn()} />);
    // Card for h2 should not show a pip
    await screen.findByText(/📝3/); // confirm fetch finished
    expect(screen.queryByText(/📝0/)).toBeNull();
  });
});
```

- [ ] **Step 9.6: Run, verify failure**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabHistory.test.jsx`
Expected: FAIL.

- [ ] **Step 9.7: Implement notes pip in TabHistory**

Edit `client/src/components/sidebar-v3/TabHistory.jsx`:

1. Add imports:
   ```jsx
   import { useEffect, useState } from 'react';
   import { apiFetch } from '../../lib/api.js';
   ```

2. Inside the component, add a state + effect that batches notes counts on history-data change:
   ```jsx
   const [notesCounts, setNotesCounts] = useState({});
   useEffect(() => {
     const handIds = (data.history ?? []).map((h) => h.hand_id).filter(Boolean);
     if (handIds.length === 0) { setNotesCounts({}); return; }
     let cancelled = false;
     apiFetch('/api/hands/notes-counts', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ handIds }),
     }).then((res) => {
       if (!cancelled) setNotesCounts(res?.counts ?? {});
     }).catch(() => { /* keep previous counts */ });
     return () => { cancelled = true; };
   }, [data.history]);
   ```

3. In the hand-card rendering, add the pip when count > 0. Find the JSX that renders each hand card; inside its content (after the auto-tags or near the pot value), add:
   ```jsx
   {notesCounts[hand.hand_id] > 0 && (
     <span
       title={`${notesCounts[hand.hand_id]} note${notesCounts[hand.hand_id] === 1 ? '' : 's'}`}
       style={{ fontSize: 10, color: 'var(--ink-dim)', marginLeft: 4 }}
     >📝{notesCounts[hand.hand_id]}</span>
   )}
   ```

   (Place this where the hand-card layout has room — usually near the meta row.)

- [ ] **Step 9.8: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabHistory.test.jsx`
Expected: PASS.

- [ ] **Step 9.9: Commit**

```bash
git add client/src/components/sidebar-v3/TabHistory.jsx \
        client/src/components/sidebar-v3/buildLiveData.js \
        client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx \
        client/src/components/sidebar-v3/__tests__/buildLiveData.test.js
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): notes pip badge on history hand cards

Each hand card on history.hand_strip shows 📝N when notes exist for
that hand. Counts fetched in batch on TabHistory mount via
POST /api/hands/notes-counts. Tooltip shows readable text. Spec
section 5.1 (preview surface), 4.3.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: History `notes_pip` popover (read-only preview)

**Files:**
- Modify: `client/src/components/sidebar-v3/TabHistory.jsx`
- Modify: `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx`

- [ ] **Step 10.1: Failing test**

Append to `client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx`:

```jsx
describe('TabHistory — notes pip popover', () => {
  it('clicking the pip opens a read-only NotesPanel popover', async () => {
    render(<TabHistory data={dataWithHistory} onLoadReview={vi.fn()} />);
    const pip = await screen.findByText(/📝3/);
    fireEvent.click(pip);
    // The popover renders the Notes title (from NotesPanel preview mode)
    expect(screen.getByText(/^Notes$/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 10.2: Run, verify failure**

Expected: FAIL.

- [ ] **Step 10.3: Implement popover**

Edit `client/src/components/sidebar-v3/TabHistory.jsx`:

1. Add NotesPanel + useNotes imports:
   ```jsx
   import NotesPanel from './NotesPanel.jsx';
   import useNotes from '../../hooks/useNotes.js';
   ```

2. Add popover state:
   ```jsx
   const [previewHandId, setPreviewHandId] = useState(null);
   const previewApi = useNotes(previewHandId);
   ```

3. Make the pip clickable — wrap or replace the existing pip span with a button:
   ```jsx
   {notesCounts[hand.hand_id] > 0 && (
     <button
       className="chip ghost"
       style={{ padding: '2px 5px', fontSize: 10, marginLeft: 4 }}
       onClick={(e) => { e.stopPropagation(); setPreviewHandId(hand.hand_id); }}
       title={`${notesCounts[hand.hand_id]} note${notesCounts[hand.hand_id] === 1 ? '' : 's'}`}
     >📝{notesCounts[hand.hand_id]}</button>
   )}
   ```

4. After the main JSX (before closing fragment/div of the component return), add the popover overlay:
   ```jsx
   {previewHandId && (
     <div
       role="dialog"
       aria-label="Notes preview"
       style={{
         position: 'fixed', inset: 0, zIndex: 900,
         background: 'rgba(0,0,0,0.45)',
         display: 'flex', alignItems: 'center', justifyContent: 'center',
       }}
       onClick={() => setPreviewHandId(null)}
     >
       <div
         style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: 12, minWidth: 280, maxWidth: 420 }}
         onClick={(e) => e.stopPropagation()}
       >
         <NotesPanel mode="preview" handId={previewHandId} api={previewApi} />
         <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
           <button className="btn ghost sm" onClick={() => setPreviewHandId(null)}>Close</button>
         </div>
       </div>
     </div>
   )}
   ```

- [ ] **Step 10.4: Run, verify pass**

Run: `cd client && npx vitest run src/components/sidebar-v3/__tests__/TabHistory.test.jsx`
Expected: PASS.

- [ ] **Step 10.5: Commit**

```bash
git add client/src/components/sidebar-v3/TabHistory.jsx \
        client/src/components/sidebar-v3/__tests__/TabHistory.test.jsx
git commit -m "$(cat <<'EOF'
feat(sidebar-v3): clickable notes pip opens read-only popover

Click 📝N pip on history hand card → modal popover with read-only
NotesPanel (preview mode, max 3 notes + "see more in Review"). Click
backdrop or Close to dismiss. Spec section 5.1.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final regression sweep + manual walkthrough

- [ ] **Step 11.1: Run all tests**

Run: `cd client && npx vitest run` and `cd server && npx jest`
Expected: green on both.

- [ ] **Step 11.2: Build client**

Run: `cd client && npm run build`
Expected: build succeeds.

- [ ] **Step 11.3: Apply migration on staging**

```bash
psql $STAGING_DATABASE_URL -f supabase/migrations/064_hand_notes.sql
```

Confirm: `\dt hand_notes` shows the table.

- [ ] **Step 11.4: Deploy and walkthrough**

```bash
flyctl deploy --config fly.staging.toml --remote-only
```

As Idopeer (coach) on `?sidebarV3=1`:

1. **Live tab + active hand**: click 📝 Notes → inline panel appears below action log → add a note → save → see card with author + timestamp → edit → delete (confirm dialog) → close panel.
2. **Hand transition**: deal next hand → notes panel auto-collapses → click 📝 Notes again → new hand's notes shown (empty initially).
3. **Review tab**: open a past hand → see notes panel populated → add/edit/delete works.
4. **History tab**: hand cards with notes show 📝N pip → click pip → read-only popover with first 3 notes → backdrop close → no edit affordances visible.
5. **No-school coach**: log in as a coach without `school_id` → all notes endpoints return 403 with "no_school_assignment" message.
6. **Cross-school read**: log in as coach from school B → view hand from school A → notes panel shows empty (no leak).
7. **Char limit**: type 501 chars in textarea → input clamps to 500.
8. **Migration sanity**: query `SELECT * FROM hand_notes WHERE school_id = '<school-uuid>';` → see seeded data from walkthrough.

- [ ] **Step 11.5: Investigate and fix any regressions**

For each bug, write a failing test → fix → re-test → commit.

---

## Self-Review checklist

- [ ] **Spec coverage** — every Phase B item in spec section 10 has a task:
  - migration `064_hand_notes.sql` → Task 1 ✓
  - HandNotesRepository → Task 3 ✓
  - routes/notes.js → Task 4 ✓
  - useNotes hook → Task 5 ✓
  - NotesPanel.jsx → Task 6 ✓
  - mount live.notes_panel → Task 7 ✓
  - mount review.notes_panel → Task 8 ✓
  - history.hand_card.notes_pip → Tasks 9, 10 ✓
  - footer.live 📝 button + wiring → Task 7 ✓
  - adapter notes_counts → Task 9 ✓
  - requireSchool middleware → Task 2 ✓ (spec section 12 open item resolved)
- [ ] **Placeholder scan** — no TBD, "implement later", or "similar to Task N" without code shown.
- [ ] **Type consistency** — `data.gameState.hand_id`, `data.review.handId`, `data.history`, `data.notes_counts`, `apiFetch` referenced consistently. Note shape (`id, hand_id, school_id, author_player_id, body, author_name, created_at, updated_at`) matches across server + client.
- [ ] **Cross-task ordering** — Task 1 (migration) before Task 3 (repo) before Task 4 (routes). Task 5 (hook) before Tasks 6–10 (UI). Task 6 (component) before Tasks 7, 8, 10 (mount).
- [ ] **Spec-section-12 prerequisites** — Task 2 introduces `requireSchool` (resolves item 2). Item 7 (`hands.school_id`) not needed because notes carry their own school_id at write time — covered in spec discussion.

---

**End of Phase B plan.**
