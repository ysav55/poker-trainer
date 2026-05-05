# Settings Cascade Redesign — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure settings tabs so Platform Tab gains Schools/Platform-Defaults sub-tabs (absorbing Org Tab), School Tab gains cascade indicators for leaderboard and a new blind structures section, and the Org Tab is dissolved.

**Architecture:** New `resolveLeaderboardConfig` and `resolveBlindStructures` methods in `SettingsService` follow the existing `resolveTableDefaults` cascade pattern (school → org → hardcoded). `GET /api/settings/school` leaderboard shape changes to `{ value, source }`. `CascadeLabel` is extracted to `shared.jsx` so SchoolTab can reuse it. PlatformTab gains internal sub-tab state — no route change.

**Tech Stack:** Node.js, Express, Supabase/Postgres, React, Vite, Tailwind, `colors.js` design tokens, Jest (server tests only)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `server/services/SettingsService.js` | Modify | Add `resolveLeaderboardConfig`, `resolveBlindStructures`, `deleteSchoolSetting` |
| `server/__tests__/services/SettingsService.test.js` | Create | Unit tests for the three new methods |
| `server/routes/settings.js` | Modify | Update GET /school leaderboard shape; add DELETE /school/leaderboard; add blind-structures CRUD (4 endpoints) |
| `client/src/pages/settings/shared.jsx` | Modify | Export `CascadeLabel` component |
| `client/src/pages/settings/TableDefaultsTab.jsx` | Modify | Remove local `CascadeLabel`, import from shared |
| `client/src/pages/settings/PlatformTab.jsx` | Modify | Add Schools/Platform-Defaults sub-tab switcher; Platform-Defaults sub-tab contains full OrgTab content |
| `client/src/pages/SettingsPage.jsx` | Modify | Remove `org` from ALL_TABS; remove OrgTab import |
| `client/src/pages/settings/SchoolTab.jsx` | Modify | Update leaderboard fetch (new shape); add `lbSource` state + CascadeLabel + Reset; add blind structures section |
| `client/src/pages/settings/OrgTab.jsx` | Delete | Content moved to PlatformTab |

---

## Task 1: SettingsService — new cascade methods

**Files:**
- Modify: `server/services/SettingsService.js`
- Create: `server/__tests__/services/SettingsService.test.js`

- [ ] **Step 1: Write the failing tests**

Create `server/__tests__/services/SettingsService.test.js`:

```js
'use strict';

// Mock Supabase before requiring the service
const mockSupabase = { from: jest.fn() };
jest.mock('../../db/supabase', () => mockSupabase);

const SettingsService = require('../../services/SettingsService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockMaybeSingle(value) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
  };
  mockSupabase.from.mockReturnValue(chain);
  return chain;
}

// ─── resolveLeaderboardConfig ─────────────────────────────────────────────────

describe('resolveLeaderboardConfig', () => {
  const SCHOOL_ID = 'school-abc';
  const HARDCODED = { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' };

  beforeEach(() => jest.clearAllMocks());

  it('returns school source when school-scope row exists', async () => {
    const schoolVal = { primary_metric: 'bb_per_100', secondary_metric: 'win_rate', update_frequency: 'daily' };
    // getSchoolSetting called first, getOrgSetting second
    mockSupabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { value: schoolVal }, error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      });

    const result = await SettingsService.resolveLeaderboardConfig(SCHOOL_ID);
    expect(result.source).toBe('school');
    expect(result.value.primary_metric).toBe('bb_per_100');
  });

  it('returns org source when no school row but org row exists', async () => {
    const orgVal = { primary_metric: 'hands_played', secondary_metric: 'net_chips', update_frequency: 'hourly' };
    mockSupabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { value: orgVal }, error: null }),
      });

    const result = await SettingsService.resolveLeaderboardConfig(SCHOOL_ID);
    expect(result.source).toBe('org');
    expect(result.value.primary_metric).toBe('hands_played');
  });

  it('returns hardcoded source when neither school nor org row exists', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await SettingsService.resolveLeaderboardConfig(SCHOOL_ID);
    expect(result.source).toBe('hardcoded');
    expect(result.value).toEqual(HARDCODED);
  });

  it('skips school lookup when schoolId is null', async () => {
    const orgVal = { primary_metric: 'win_rate', secondary_metric: 'net_chips', update_frequency: 'daily' };
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { value: orgVal }, error: null }),
    });

    const result = await SettingsService.resolveLeaderboardConfig(null);
    expect(result.source).toBe('org');
    // Only one DB call made (no school lookup)
    expect(mockSupabase.from).toHaveBeenCalledTimes(1);
  });
});

// ─── resolveBlindStructures ───────────────────────────────────────────────────

describe('resolveBlindStructures', () => {
  const SCHOOL_ID = 'school-abc';

  beforeEach(() => jest.clearAllMocks());

  it('merges school structures first, then org, with source tags', async () => {
    const schoolStructs = [{ id: 's1', label: 'NL50', sb: 25, bb: 50, ante: 0 }];
    const orgStructs    = [{ id: 'o1', label: 'Micro', sb: 5, bb: 10, ante: 0 }];

    mockSupabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { value: schoolStructs }, error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { value: orgStructs }, error: null }),
      });

    const result = await SettingsService.resolveBlindStructures(SCHOOL_ID);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 's1', source: 'school' });
    expect(result[1]).toMatchObject({ id: 'o1', source: 'org' });
  });

  it('returns only org structures when no school structures exist', async () => {
    const orgStructs = [{ id: 'o1', label: 'Micro', sb: 5, bb: 10, ante: 0 }];
    mockSupabase.from
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      })
      .mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { value: orgStructs }, error: null }),
      });

    const result = await SettingsService.resolveBlindStructures(SCHOOL_ID);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('org');
  });

  it('returns empty array when neither school nor org has structures', async () => {
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });

    const result = await SettingsService.resolveBlindStructures(SCHOOL_ID);
    expect(result).toEqual([]);
  });
});

// ─── deleteSchoolSetting ──────────────────────────────────────────────────────

describe('deleteSchoolSetting', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes the school-scope row for the given key', async () => {
    const mockChain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
    };
    // Final .eq() must return a thenable
    mockChain.eq.mockReturnValueOnce(mockChain)
              .mockReturnValueOnce(mockChain)
              .mockReturnValueOnce(Promise.resolve({ error: null }));
    mockSupabase.from.mockReturnValue(mockChain);

    await expect(
      SettingsService.deleteSchoolSetting('school-abc', 'school.leaderboard')
    ).resolves.not.toThrow();

    expect(mockChain.delete).toHaveBeenCalled();
    expect(mockChain.eq).toHaveBeenCalledWith('scope', 'school');
    expect(mockChain.eq).toHaveBeenCalledWith('scope_id', 'school-abc');
    expect(mockChain.eq).toHaveBeenCalledWith('key', 'school.leaderboard');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd c:/Users/user/poker-trainer
npx jest server/__tests__/services/SettingsService.test.js --no-coverage
```

Expected: FAIL — `resolveLeaderboardConfig is not a function` (or similar).

- [ ] **Step 3: Add the three methods to SettingsService**

In `server/services/SettingsService.js`, add after the `resetTableDefaults` block and before the `// ─── Generic org/school key access` comment:

```js
// ─── Leaderboard config cascade ───────────────────────────────────────────────

const LEADERBOARD_HARDCODED = {
  primary_metric:   'net_chips',
  secondary_metric: 'win_rate',
  update_frequency: 'after_session',
};

/**
 * Resolve leaderboard config for a school caller.
 * Returns { value: {...}, source: 'school' | 'org' | 'hardcoded' }
 * @param {string|null} schoolId
 */
async function resolveLeaderboardConfig(schoolId) {
  const [schoolVal, orgVal] = await Promise.all([
    schoolId ? getSchoolSetting(schoolId, 'school.leaderboard') : Promise.resolve(null),
    getOrgSetting('org.leaderboard'),
  ]);
  if (schoolVal) return { value: { ...LEADERBOARD_HARDCODED, ...schoolVal }, source: 'school' };
  if (orgVal)    return { value: { ...LEADERBOARD_HARDCODED, ...orgVal },    source: 'org' };
  return { value: LEADERBOARD_HARDCODED, source: 'hardcoded' };
}

/**
 * Resolve blind structures: school structures first (full CRUD), then org (read-only).
 * Each entry is tagged with source: 'school' | 'org'.
 * @param {string|null} schoolId
 */
async function resolveBlindStructures(schoolId) {
  const [schoolVal, orgVal] = await Promise.all([
    schoolId ? getSchoolSetting(schoolId, 'school.blind_structures') : Promise.resolve(null),
    getOrgSetting('org.blind_structures'),
  ]);
  const school = Array.isArray(schoolVal) ? schoolVal : [];
  const org    = Array.isArray(orgVal)    ? orgVal    : [];
  return [
    ...school.map(s => ({ ...s, source: 'school' })),
    ...org.map(s => ({ ...s, source: 'org' })),
  ];
}

/**
 * Delete a school-scope setting row entirely (used for "Reset to platform default").
 */
async function deleteSchoolSetting(schoolId, key) {
  const { error } = await supabase
    .from('settings')
    .delete()
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .eq('key', key);
  if (error) throw error;
}
```

Also update the `module.exports` at the bottom of `server/services/SettingsService.js`:

```js
module.exports = {
  ORG_SCOPE_ID,
  TABLE_DEFAULTS_APP,
  TABLE_DEFAULTS_KEYS,
  resolveTableDefaults,
  saveTableDefaults,
  resetTableDefaults,
  resolveLeaderboardConfig,
  resolveBlindStructures,
  deleteSchoolSetting,
  getOrgSetting,
  setOrgSetting,
  getSchoolSetting,
  setSchoolSetting,
};
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx jest server/__tests__/services/SettingsService.test.js --no-coverage
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/SettingsService.js server/__tests__/services/SettingsService.test.js
git commit -m "feat: add resolveLeaderboardConfig, resolveBlindStructures, deleteSchoolSetting to SettingsService"
```

---

## Task 2: settings.js routes — leaderboard cascade shape + blind structures CRUD

**Files:**
- Modify: `server/routes/settings.js`

- [ ] **Step 1: Update `GET /api/settings/school` to return cascade-shaped leaderboard**

Find the `GET /api/settings/school` handler (line ~190). Replace the `leaderboard` key in the response:

```js
// BEFORE (around line 198–202):
const [stakingDefaults, platforms, leaderboard] = await Promise.all([
  SettingsService.getSchoolSetting(school.id, 'school.staking_defaults'),
  SettingsService.getSchoolSetting(school.id, 'school.platforms'),
  SettingsService.getSchoolSetting(school.id, 'school.leaderboard'),
]);

return res.json({
  identity: { id: school.id, name: school.name, description: school.description ?? '' },
  staking_defaults: {
    coach_split_pct:           50,
    makeup_policy:             'carries',
    bankroll_cap:              25000,
    contract_duration_months:  6,
    ...(stakingDefaults ?? {}),
  },
  platforms: platforms?.platforms ?? ['PokerStars', 'GGPoker', 'Live Games'],
  leaderboard: {
    primary_metric:   'net_chips',
    secondary_metric: 'win_rate',
    update_frequency: 'after_session',
    ...(leaderboard ?? {}),
  },
});

// AFTER:
const [stakingDefaults, platforms, leaderboard] = await Promise.all([
  SettingsService.getSchoolSetting(school.id, 'school.staking_defaults'),
  SettingsService.getSchoolSetting(school.id, 'school.platforms'),
  SettingsService.resolveLeaderboardConfig(school.id),
]);

return res.json({
  identity: { id: school.id, name: school.name, description: school.description ?? '' },
  staking_defaults: {
    coach_split_pct:           50,
    makeup_policy:             'carries',
    bankroll_cap:              25000,
    contract_duration_months:  6,
    ...(stakingDefaults ?? {}),
  },
  platforms: platforms?.platforms ?? ['PokerStars', 'GGPoker', 'Live Games'],
  leaderboard,   // now { value: {...}, source: 'school'|'org'|'hardcoded' }
});
```

- [ ] **Step 2: Add `DELETE /api/settings/school/leaderboard` ("Reset to platform default")**

Add after the existing `PUT /api/settings/school/leaderboard` handler (after line ~341):

```js
// ── DELETE /api/settings/school/leaderboard ───────────────────────────────────
// Removes school-scope override — falls back to org/hardcoded default.
router.delete('/school/leaderboard', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    await SettingsService.deleteSchoolSetting(school.id, 'school.leaderboard');
    const resolved = await SettingsService.resolveLeaderboardConfig(school.id);
    return res.json(resolved);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});
```

- [ ] **Step 3: Add blind structures CRUD endpoints**

Add before `module.exports = router;` at the bottom of `server/routes/settings.js`:

```js
// ─── School Blind Structures ──────────────────────────────────────────────────
// Coaches manage school-specific blind structure presets.
// Org structures are read-only (managed via /api/admin/org-settings/blind-structures).

// ── GET /api/settings/school/blind-structures ────────────────────────────────
router.get('/school/blind-structures', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const structures = await SettingsService.resolveBlindStructures(school.id);
    return res.json({ structures });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /api/settings/school/blind-structures ───────────────────────────────
// Body: { label, sb, bb, ante? }
router.post('/school/blind-structures', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  const { label, sb, bb, ante } = req.body || {};
  if (!label || !sb || !bb)
    return res.status(400).json({ error: 'invalid_body', message: 'label, sb, and bb are required.' });

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const current = await SettingsService.getSchoolSetting(school.id, 'school.blind_structures') ?? [];
    const newStruct = {
      id:    require('crypto').randomUUID(),
      label: String(label).trim(),
      sb:    Number(sb),
      bb:    Number(bb),
      ante:  Number(ante) || 0,
    };
    await SettingsService.setSchoolSetting(school.id, 'school.blind_structures', [...current, newStruct]);
    return res.status(201).json({ ...newStruct, source: 'school' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PATCH /api/settings/school/blind-structures/:id ──────────────────────────
// Body: { label?, sb?, bb?, ante? }
router.patch('/school/blind-structures/:id', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  const { id } = req.params;
  const { label, sb, bb, ante } = req.body || {};

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const current = await SettingsService.getSchoolSetting(school.id, 'school.blind_structures') ?? [];
    const idx = current.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const updated = [...current];
    updated[idx] = {
      ...updated[idx],
      ...(label !== undefined && { label: String(label).trim() }),
      ...(sb    !== undefined && { sb: Number(sb) }),
      ...(bb    !== undefined && { bb: Number(bb) }),
      ...(ante  !== undefined && { ante: Number(ante) }),
    };
    await SettingsService.setSchoolSetting(school.id, 'school.blind_structures', updated);
    return res.json({ ...updated[idx], source: 'school' });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/settings/school/blind-structures/:id ─────────────────────────
router.delete('/school/blind-structures/:id', async (req, res) => {
  if (!SCHOOL_ROLES.has(req.user.role))
    return res.status(403).json({ error: 'forbidden' });

  const { id } = req.params;

  try {
    const school = await _callerSchool(req.user.stableId);
    if (!school) return res.status(404).json({ error: 'no_school' });

    const current = await SettingsService.getSchoolSetting(school.id, 'school.blind_structures') ?? [];
    const filtered = current.filter(s => s.id !== id);
    if (filtered.length === current.length)
      return res.status(404).json({ error: 'not_found' });

    await SettingsService.setSchoolSetting(school.id, 'school.blind_structures', filtered);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});
```

- [ ] **Step 4: Run full server test suite to confirm no regressions**

```bash
cd c:/Users/user/poker-trainer
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All previously passing tests still pass. No test failures.

- [ ] **Step 5: Commit**

```bash
git add server/routes/settings.js
git commit -m "feat: cascade leaderboard shape in GET /school + blind structures CRUD endpoints"
```

---

## Task 3: Extract CascadeLabel to shared.jsx

**Files:**
- Modify: `client/src/pages/settings/shared.jsx`
- Modify: `client/src/pages/settings/TableDefaultsTab.jsx`

- [ ] **Step 1: Add CascadeLabel export to shared.jsx**

Append to the end of `client/src/pages/settings/shared.jsx`:

```jsx
/**
 * Cascade source badge. Shows '(platform default)' when a field inherits
 * from org/hardcoded, '(overridden)' when the school has set its own value.
 *
 * @param {string}  field    - key into scopeMap
 * @param {Object}  scopeMap - { [field]: 'school' | 'org' | 'hardcoded' }
 * @param {Set}     dirty    - fields that have been locally changed but not saved
 * @param {boolean} isAdmin  - admins see 'app default' instead of 'platform default'
 */
export function CascadeLabel({ field, scopeMap, dirty, isAdmin }) {
  const isDirty      = dirty.has(field);
  const isOverridden = isDirty || scopeMap[field] === 'school' || (isAdmin && scopeMap[field] === 'org');
  if (!scopeMap[field] && !isDirty) return null;
  return (
    <span className="text-xs ml-2" style={{ color: isOverridden ? colors.warning : colors.textMuted }}>
      {isOverridden ? '(overridden)' : isAdmin ? '(app default)' : '(platform default)'}
    </span>
  );
}
```

- [ ] **Step 2: Remove CascadeLabel from TableDefaultsTab.jsx and import from shared**

In `client/src/pages/settings/TableDefaultsTab.jsx`:

1. Find and **delete** the entire `function CascadeLabel(...)` definition (lines 54–63).
2. Update the import at line 1 to add `CascadeLabel`:

```jsx
// BEFORE:
import { SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';

// AFTER:
import { SectionHeader, Field, Input, Select, Toggle, SaveButton, Card, CascadeLabel } from './shared.jsx';
```

- [ ] **Step 3: Verify TableDefaults tab still works**

Start dev server (`npm run dev` from project root) and navigate to `/settings` → Table Defaults. Confirm:
- All fields render with their cascade badges
- A field shows `(overridden)` when dirty
- No console errors

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/settings/shared.jsx client/src/pages/settings/TableDefaultsTab.jsx
git commit -m "refactor: extract CascadeLabel from TableDefaultsTab into shared.jsx"
```

---

## Task 4: PlatformTab — Schools / Platform Defaults sub-tabs

**Files:**
- Modify: `client/src/pages/settings/PlatformTab.jsx`

- [ ] **Step 1: Replace PlatformTab.jsx with sub-tabbed version**

The new file adds a `subTab` state (`'schools' | 'defaults'`), wraps existing content under `'schools'`, and adds a `'defaults'` sub-tab containing everything that was in OrgTab. Replace the entire file:

```jsx
import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';
import { SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_FEATURES = [
  { key: 'replay',       label: 'Guided Replay'     },
  { key: 'analysis',     label: 'AI Analysis'       },
  { key: 'chip_bank',    label: 'Chip Bank'          },
  { key: 'playlists',    label: 'Playlists'          },
  { key: 'tournaments',  label: 'Tournaments'        },
  { key: 'crm',          label: 'CRM'                },
  { key: 'leaderboard',  label: 'Leaderboard'        },
  { key: 'scenarios',    label: 'Scenario Builder'   },
  { key: 'groups',       label: 'Groups / Cohorts'   },
];

const inputCls   = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

// ─── Sub-tab: Schools ─────────────────────────────────────────────────────────

function SchoolsSubTab() {
  const [schools,       setSchools]       = useState([]);
  const [health,        setHealth]        = useState(null);
  const [loadingList,   setLoadingList]   = useState(true);
  const [editingSchool, setEditingSchool] = useState(null);
  const [schoolFeats,   setSchoolFeats]   = useState({});
  const [maxStudents,   setMaxStudents]   = useState('');
  const [maxCoaches,    setMaxCoaches]    = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState('');
  const [loadErr,       setLoadErr]       = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/schools'),
      fetch('/health').then(r => r.json()).catch(() => null),
    ]).then(([schoolData, healthData]) => {
      setSchools(schoolData.schools ?? schoolData ?? []);
      setHealth(healthData);
    }).catch(() => setLoadErr('Failed to load platform data.'))
      .finally(() => setLoadingList(false));
  }, []);

  async function openEdit(school) {
    setEditingSchool(school);
    setMaxStudents(school.max_students != null ? String(school.max_students) : '');
    setMaxCoaches(school.max_coaches != null ? String(school.max_coaches) : '');
    setSaveMsg('');
    try {
      const data = await apiFetch(`/api/admin/schools/${school.id}/features`);
      setSchoolFeats(data.features ?? {});
    } catch {
      setSchoolFeats({});
    }
  }

  async function saveAgreement() {
    if (!editingSchool) return;
    setSaving(true); setSaveMsg('');
    try {
      await Promise.all([
        apiFetch(`/api/admin/schools/${editingSchool.id}/features`, {
          method: 'PUT',
          body: JSON.stringify(schoolFeats),
        }),
        apiFetch(`/api/admin/schools/${editingSchool.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            maxStudents: maxStudents !== '' ? Number(maxStudents) : null,
            maxCoaches:  maxCoaches  !== '' ? Number(maxCoaches)  : null,
          }),
        }),
      ]);
      setSaveMsg('Saved.');
      apiFetch('/api/admin/schools').then(d => setSchools(d.schools ?? d ?? [])).catch(() => {});
    } catch {
      setSaveMsg('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loadErr && <p className="text-sm" style={{ color: colors.error }}>{loadErr}</p>}

      {/* System health */}
      <Card>
        <SectionHeader title="System Health" />
        {health ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: health.db === 'ok' ? colors.success : colors.error }}>●</span>
              <span style={{ color: colors.textPrimary }}>
                Database: <span style={{ color: health.db === 'ok' ? colors.success : colors.error }}>{health.db}</span>
              </span>
            </div>
            <div className="text-sm" style={{ color: colors.textPrimary }}>
              Active tables: <span style={{ color: colors.gold }}>{health.tables ?? 0}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: colors.textMuted }}>{loadingList ? 'Loading…' : 'Health unavailable.'}</p>
        )}
      </Card>

      {/* Schools */}
      <Card>
        <SectionHeader title="School Agreements" />
        {loadingList ? (
          <p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${colors.borderStrong}` }}>
              <div
                className="grid text-xs font-bold uppercase tracking-widest px-4 py-2"
                style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderBottom: `1px solid ${colors.borderStrong}`, color: colors.textMuted }}
              >
                <span>School</span>
                <span className="text-right">Students</span>
                <span className="text-right">Coaches</span>
                <span className="text-right">Status</span>
              </div>
              {schools.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>No schools found.</p>
              )}
              {schools.map(s => (
                <div
                  key={s.id}
                  className="grid items-center px-4 py-3"
                  style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderTop: `1px solid ${colors.borderDefault}` }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.name}</div>
                    <button className="text-xs mt-0.5" style={{ color: colors.gold }} onClick={() => openEdit(s)}>Edit</button>
                  </div>
                  <span className="text-sm text-right" style={{ color: colors.textPrimary }}>
                    {s.students ?? 0}{s.max_students ? `/${s.max_students}` : ''}
                  </span>
                  <span className="text-sm text-right" style={{ color: colors.textPrimary }}>
                    {s.coaches ?? 0}{s.max_coaches ? `/${s.max_coaches}` : ''}
                  </span>
                  <span className="text-xs font-semibold text-right" style={{ color: s.status === 'active' ? colors.success : colors.textMuted }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>

            {editingSchool && (
              <div className="mt-2 rounded-lg p-4" style={{ border: `1px solid ${colors.borderStrong}`, background: colors.bgSurface }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{editingSchool.name}</span>
                  <button className="text-xs" style={{ color: colors.textMuted }} onClick={() => setEditingSchool(null)}>✕ Close</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Max students">
                    <Input value={maxStudents} onChange={setMaxStudents} type="number" min="0" placeholder="No limit" />
                  </Field>
                  <Field label="Max coaches">
                    <Input value={maxCoaches} onChange={setMaxCoaches} type="number" min="0" placeholder="No limit" />
                  </Field>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>Feature Toggles</span>
                <div className="mt-2 flex flex-col gap-2 mb-4">
                  {PLATFORM_FEATURES.map(f => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schoolFeats[f.key] !== false}
                        onChange={() => setSchoolFeats(prev => ({ ...prev, [f.key]: !(prev[f.key] !== false) }))}
                        style={{ accentColor: colors.gold }}
                      />
                      <span className="text-sm" style={{ color: colors.textPrimary }}>{f.label}</span>
                    </label>
                  ))}
                </div>
                {saveMsg && (
                  <p className="text-xs mb-2" style={{ color: saveMsg === 'Saved.' ? colors.success : colors.error }}>{saveMsg}</p>
                )}
                <button
                  onClick={saveAgreement}
                  disabled={saving}
                  className="px-5 py-2 rounded text-sm font-bold"
                  style={{ background: colors.gold, color: colors.bgSurface, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-tab: Platform Defaults (absorbed from OrgTab) ────────────────────────

function GroupPolicySection() {
  const [policy, setPolicy]     = useState({ enabled: true, max_groups: '', max_players_per_group: '' });
  const [schools, setSchools]   = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [schoolPolicies, setSchoolPolicies] = useState({});
  const [expandedSchool, setExpandedSchool] = useState(null);
  const [schoolSaving, setSchoolSaving]     = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/org-settings/groups'),
      apiFetch('/api/admin/schools'),
    ]).then(([pol, { schools: list }]) => {
      setPolicy({
        enabled:               pol.enabled,
        max_groups:            pol.max_groups            ?? '',
        max_players_per_group: pol.max_players_per_group ?? '',
      });
      setSchools(list ?? []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function loadSchoolPolicy(schoolId) {
    if (schoolPolicies[schoolId]) return;
    const p = await apiFetch(`/api/admin/schools/${schoolId}/group-policy`).catch(() => ({}));
    setSchoolPolicies(prev => ({ ...prev, [schoolId]: {
      enabled:               p.enabled,
      max_groups:            p.max_groups            ?? '',
      max_players_per_group: p.max_players_per_group ?? '',
    }}));
  }

  async function saveOrgPolicy() {
    setSaving(true); setSaveMsg('');
    try {
      const result = await apiFetch('/api/admin/org-settings/groups', {
        method: 'PUT',
        body: JSON.stringify({
          enabled:               policy.enabled,
          max_groups:            policy.max_groups !== '' ? Number(policy.max_groups) : null,
          max_players_per_group: policy.max_players_per_group !== '' ? Number(policy.max_players_per_group) : null,
        }),
      });
      setPolicy({ enabled: result.enabled, max_groups: result.max_groups ?? '', max_players_per_group: result.max_players_per_group ?? '' });
      setSaveMsg('Saved.');
    } catch { setSaveMsg('Failed to save.'); }
    finally { setSaving(false); }
  }

  async function saveSchoolPolicy(schoolId) {
    setSchoolSaving(schoolId);
    const sp = schoolPolicies[schoolId];
    try {
      const result = await apiFetch(`/api/admin/schools/${schoolId}/group-policy`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled:               sp.enabled,
          max_groups:            sp.max_groups !== '' ? Number(sp.max_groups) : null,
          max_players_per_group: sp.max_players_per_group !== '' ? Number(sp.max_players_per_group) : null,
        }),
      });
      setSchoolPolicies(prev => ({ ...prev, [schoolId]: {
        enabled: result.enabled,
        max_groups: result.max_groups ?? '',
        max_players_per_group: result.max_players_per_group ?? '',
      }}));
    } catch { /* silently ignore */ }
    finally { setSchoolSaving(null); }
  }

  function setSchoolPolicyField(schoolId, key, value) {
    setSchoolPolicies(prev => ({ ...prev, [schoolId]: { ...prev[schoolId], [key]: value } }));
  }

  if (!loaded) return <p className="text-xs" style={{ color: colors.textMuted }}>Loading…</p>;

  return (
    <>
      <SectionHeader title="Group Policy" />
      <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Platform defaults. Individual schools can override these limits.</p>
      <Field label="Groups enabled by default">
        <Toggle value={policy.enabled} onChange={v => setPolicy(p => ({ ...p, enabled: v }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max groups per school" hint="Leave blank = unlimited">
          <Input type="number" value={String(policy.max_groups)} onChange={v => setPolicy(p => ({ ...p, max_groups: v }))} placeholder="Unlimited" />
        </Field>
        <Field label="Max players per group" hint="Leave blank = unlimited">
          <Input type="number" value={String(policy.max_players_per_group)} onChange={v => setPolicy(p => ({ ...p, max_players_per_group: v }))} placeholder="Unlimited" />
        </Field>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <SaveButton onClick={saveOrgPolicy} label={saving ? 'Saving…' : 'Save Defaults'} />
        {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved.' ? colors.success : colors.error }}>{saveMsg}</span>}
      </div>
      {schools.length > 0 && (
        <>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: colors.textMuted }}>School Overrides</p>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}` }}>
            {schools.map((s, i) => {
              const isOpen = expandedSchool === s.id;
              const sp     = schoolPolicies[s.id];
              return (
                <div key={s.id} style={{ borderBottom: i < schools.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={async () => { if (!isOpen) { await loadSchoolPolicy(s.id); setExpandedSchool(s.id); } else setExpandedSchool(null); }}
                  >
                    <span className="flex-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.name}</span>
                    {sp && (
                      <span className="text-xs" style={{ color: sp.enabled !== false ? colors.success : colors.textMuted }}>
                        {sp.enabled !== false ? 'ON' : 'OFF'}
                        {sp.max_groups !== '' ? ` · max ${sp.max_groups} groups` : ''}
                        {sp.max_players_per_group !== '' ? ` · ${sp.max_players_per_group}/group` : ''}
                      </span>
                    )}
                    <span style={{ color: colors.textMuted, fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && sp && (
                    <div className="px-4 pb-4 flex flex-col gap-3" style={{ background: colors.bgSurface }}>
                      <Field label="Groups enabled">
                        <Toggle value={sp.enabled !== false} onChange={v => setSchoolPolicyField(s.id, 'enabled', v)} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Max groups" hint="Blank = use default">
                          <Input type="number" value={String(sp.max_groups)} onChange={v => setSchoolPolicyField(s.id, 'max_groups', v)} placeholder={policy.max_groups !== '' ? `Default (${policy.max_groups})` : 'Unlimited'} />
                        </Field>
                        <Field label="Max per group" hint="Blank = use default">
                          <Input type="number" value={String(sp.max_players_per_group)} onChange={v => setSchoolPolicyField(s.id, 'max_players_per_group', v)} placeholder={policy.max_players_per_group !== '' ? `Default (${policy.max_players_per_group})` : 'Unlimited'} />
                        </Field>
                      </div>
                      <SaveButton onClick={() => saveSchoolPolicy(s.id)} label={schoolSaving === s.id ? 'Saving…' : 'Save Override'} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function PlatformDefaultsSubTab() {
  const [loading, setLoading]       = useState(true);
  const [structures, setStructures] = useState([]);
  const [editingStruct, setEditingStruct] = useState(null);
  const [newStruct, setNewStruct]   = useState({ label: '', sb: '', bb: '', ante: '0' });
  const [addingStruct, setAddingStruct]   = useState(false);
  const [structMsg, setStructMsg]   = useState('');
  const [limits, setLimits]         = useState({ max_tables_per_student: 4, max_players_per_table: 9, trial_days: 7, trial_hand_limit: 500 });
  const [limitsSaving, setLimitsSaving]   = useState(false);
  const [limitsMsg, setLimitsMsg]   = useState('');
  const [autospawn, setAutospawn]   = useState({ enabled: false, occupancy_threshold: 60, default_config: 'low' });
  const [spawnSaving, setSpawnSaving]     = useState(false);
  const [spawnMsg, setSpawnMsg]     = useState('');
  const [leaderboard, setLeaderboard] = useState({ primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' });
  const [lbSaving, setLbSaving]     = useState(false);
  const [lbMsg, setLbMsg]           = useState('');

  useEffect(() => {
    apiFetch('/api/admin/org-settings')
      .then(data => {
        setStructures(data.blind_structures ?? []);
        setLimits(data.platform_limits ?? limits);
        setAutospawn(data.autospawn ?? autospawn);
        setLeaderboard(data.leaderboard ?? leaderboard);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAddStruct(e) {
    e.preventDefault();
    if (!newStruct.label.trim() || !newStruct.sb || !newStruct.bb) return;
    setStructMsg('');
    try {
      const created = await apiFetch('/api/admin/org-settings/blind-structures', {
        method: 'POST',
        body: JSON.stringify({ label: newStruct.label.trim(), sb: Number(newStruct.sb), bb: Number(newStruct.bb), ante: Number(newStruct.ante) || 0 }),
      });
      setStructures(prev => [...prev, created]);
      setNewStruct({ label: '', sb: '', bb: '', ante: '0' });
      setAddingStruct(false);
    } catch (err) { setStructMsg(err.message || 'Failed to add.'); }
  }

  async function handleSaveStruct(s) {
    setStructMsg('');
    try {
      const updated = await apiFetch(`/api/admin/org-settings/blind-structures/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: s.label, sb: Number(s.sb), bb: Number(s.bb), ante: Number(s.ante) }),
      });
      setStructures(prev => prev.map(x => x.id === s.id ? updated : x));
      setEditingStruct(null);
    } catch (err) { setStructMsg(err.message || 'Failed to save.'); }
  }

  async function handleDeleteStruct(id) {
    setStructMsg('');
    try {
      await apiFetch(`/api/admin/org-settings/blind-structures/${id}`, { method: 'DELETE' });
      setStructures(prev => prev.filter(s => s.id !== id));
    } catch (err) { setStructMsg(err.message || 'Failed to delete.'); }
  }

  async function handleSaveLimits() {
    setLimitsSaving(true); setLimitsMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/limits', { method: 'PUT', body: JSON.stringify(limits) });
      setLimits(updated); setLimitsMsg('Saved.');
    } catch (err) { setLimitsMsg(err.message || 'Save failed.'); }
    finally { setLimitsSaving(false); }
  }

  async function handleSaveSpawn() {
    setSpawnSaving(true); setSpawnMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/autospawn', { method: 'PUT', body: JSON.stringify(autospawn) });
      setAutospawn(updated); setSpawnMsg('Saved.');
    } catch (err) { setSpawnMsg(err.message || 'Save failed.'); }
    finally { setSpawnSaving(false); }
  }

  async function handleSaveLeaderboard() {
    setLbSaving(true); setLbMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/leaderboard', { method: 'PUT', body: JSON.stringify(leaderboard) });
      setLeaderboard(updated); setLbMsg('Saved.');
    } catch (err) { setLbMsg(err.message || 'Save failed.'); }
    finally { setLbSaving(false); }
  }

  if (loading) return <Card><p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p></Card>;

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
        These apply platform-wide. Coaches can override leaderboard and blind structures for their school.
      </p>

      {/* Blind Structures */}
      <SectionHeader title="Default Blind Structures" />
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${colors.borderStrong}` }}>
        {structures.map((s, i) => {
          const isEditing = editingStruct?.id === s.id;
          const ed = editingStruct ?? s;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: i < structures.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}>
              {isEditing ? (
                <>
                  <input value={ed.label} onChange={e => setEditingStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 90 }} placeholder="Label" />
                  <input value={ed.sb}    onChange={e => setEditingStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="SB" type="number" />
                  <input value={ed.bb}    onChange={e => setEditingStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="BB" type="number" />
                  <input value={ed.ante}  onChange={e => setEditingStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="Ante" type="number" />
                  <button onClick={() => handleSaveStruct(editingStruct)} className="text-xs font-semibold" style={{ color: colors.gold }}>Save</button>
                  <button onClick={() => setEditingStruct(null)} className="text-xs" style={{ color: colors.textMuted }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="w-20 font-semibold text-sm" style={{ color: colors.textPrimary }}>{s.label}</span>
                  <span className="text-sm flex-1" style={{ color: colors.textMuted }}>{s.sb}/{s.bb}{s.ante > 0 ? ` · ante ${s.ante}` : ''}</span>
                  <button onClick={() => setEditingStruct({ ...s })} className="text-xs" style={{ color: colors.gold }}>Edit</button>
                  <button onClick={() => handleDeleteStruct(s.id)} className="text-xs" style={{ color: colors.error }}>✕</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!addingStruct ? (
        <button onClick={() => setAddingStruct(true)} className="text-sm font-semibold mb-3" style={{ color: colors.gold }}>+ Add Structure</button>
      ) : (
        <form onSubmit={handleAddStruct} className="flex flex-wrap gap-2 mb-3 items-end">
          <input value={newStruct.label} onChange={e => setNewStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 100 }} placeholder="Label" />
          <input value={newStruct.sb}    onChange={e => setNewStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="SB" type="number" />
          <input value={newStruct.bb}    onChange={e => setNewStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="BB" type="number" />
          <input value={newStruct.ante}  onChange={e => setNewStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="Ante" type="number" />
          <button type="submit" className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: colors.gold, color: colors.bgSurface }}>Add</button>
          <button type="button" onClick={() => setAddingStruct(false)} className="text-sm" style={{ color: colors.textMuted }}>Cancel</button>
        </form>
      )}
      {structMsg && <p className="text-xs mb-2" style={{ color: colors.error }}>{structMsg}</p>}

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Platform Limits */}
      <SectionHeader title="Platform Limits" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max tables per student">
          <Input type="number" value={limits.max_tables_per_student} onChange={v => setLimits(l => ({ ...l, max_tables_per_student: Number(v) }))} />
        </Field>
        <Field label="Trial duration (days)">
          <Input type="number" value={limits.trial_days} onChange={v => setLimits(l => ({ ...l, trial_days: Number(v) }))} />
        </Field>
        <Field label="Trial hand limit">
          <Input type="number" value={limits.trial_hand_limit} onChange={v => setLimits(l => ({ ...l, trial_hand_limit: Number(v) }))} />
        </Field>
        <Field label="Max players per table">
          <Input type="number" value={limits.max_players_per_table} onChange={v => setLimits(l => ({ ...l, max_players_per_table: Number(v) }))} />
        </Field>
      </div>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveLimits} disabled={limitsSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: limitsSaving ? 0.6 : 1 }}>
          {limitsSaving ? 'Saving…' : 'Save Limits'}
        </button>
        {limitsMsg && <span className="text-xs" style={{ color: colors.success }}>{limitsMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Autospawn */}
      <SectionHeader title="Open Table Auto-Spawn" />
      <Field label="Enabled">
        <Toggle value={autospawn.enabled} onChange={v => setAutospawn(a => ({ ...a, enabled: v }))} />
      </Field>
      {autospawn.enabled && (
        <>
          <Field label="Occupancy threshold (%)">
            <Input type="number" value={autospawn.occupancy_threshold} onChange={v => setAutospawn(a => ({ ...a, occupancy_threshold: Number(v) }))} />
          </Field>
          <Field label="Default config">
            <Select value={autospawn.default_config} onChange={v => setAutospawn(a => ({ ...a, default_config: v }))}>
              {['micro', 'low', 'medium', 'high'].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </Select>
          </Field>
        </>
      )}
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveSpawn} disabled={spawnSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: spawnSaving ? 0.6 : 1 }}>
          {spawnSaving ? 'Saving…' : 'Save Autospawn'}
        </button>
        {spawnMsg && <span className="text-xs" style={{ color: colors.success }}>{spawnMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Leaderboard */}
      <SectionHeader title="Leaderboard Defaults" />
      <Field label="Primary metric">
        <Select value={leaderboard.primary_metric} onChange={v => setLeaderboard(l => ({ ...l, primary_metric: v }))}>
          {['net_chips', 'bb_per_100', 'win_rate', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Secondary metric">
        <Select value={leaderboard.secondary_metric} onChange={v => setLeaderboard(l => ({ ...l, secondary_metric: v }))}>
          {['win_rate', 'net_chips', 'bb_per_100', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Update frequency">
        <Select value={leaderboard.update_frequency} onChange={v => setLeaderboard(l => ({ ...l, update_frequency: v }))}>
          {['after_session', 'hourly', 'daily'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveLeaderboard} disabled={lbSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: lbSaving ? 0.6 : 1 }}>
          {lbSaving ? 'Saving…' : 'Save Leaderboard'}
        </button>
        {lbMsg && <span className="text-xs" style={{ color: colors.success }}>{lbMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      <GroupPolicySection />
    </Card>
  );
}

// ─── Tab: Platform ────────────────────────────────────────────────────────────

export default function PlatformTab() {
  const [subTab, setSubTab] = useState('schools');

  const SUB_TABS = [
    { id: 'schools',  label: 'Schools'           },
    { id: 'defaults', label: 'Platform Defaults'  },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold" style={{ color: colors.error }}>Super Admin only.</p>

      {/* Sub-tab switcher */}
      <div className="flex gap-1" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
        {SUB_TABS.map(t => {
          const active = t.id === subTab;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className="px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-t"
              style={{
                color:        active ? colors.gold    : colors.textMuted,
                background:   active ? colors.goldSubtle : 'transparent',
                borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'schools'  && <SchoolsSubTab />}
      {subTab === 'defaults' && <PlatformDefaultsSubTab />}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Navigate to `/settings` → Platform tab. Confirm:
- "Schools" and "Platform Defaults" sub-tab buttons appear
- Schools sub-tab shows school list + health (identical to before)
- Platform Defaults sub-tab shows blind structures, limits, autospawn, leaderboard, group policy sections
- All saves in Platform Defaults sub-tab still work

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/settings/PlatformTab.jsx
git commit -m "feat: add Schools/Platform-Defaults sub-tabs to PlatformTab"
```

---

## Task 5: SettingsPage — remove Org Tab

**Files:**
- Modify: `client/src/pages/SettingsPage.jsx`

- [ ] **Step 1: Remove OrgTab from ALL_TABS and remove its import**

In `client/src/pages/SettingsPage.jsx`:

1. Remove line 7: `import OrgTab from './settings/OrgTab.jsx';`
2. Remove the `org` entry from `ALL_TABS` (line 17):

```jsx
// REMOVE this entire line from ALL_TABS:
{ id: 'org', label: 'Org', icon: Building2, roles: ['admin','superadmin'], component: OrgTab },
```

3. Remove the `Building2` icon from the lucide import since it's no longer used (line 4):

```jsx
// BEFORE:
import { SlidersHorizontal, School, Bell, Building2, Server, User, AlertTriangle } from 'lucide-react';

// AFTER:
import { SlidersHorizontal, School, Bell, Server, User, AlertTriangle } from 'lucide-react';
```

- [ ] **Step 2: Verify in browser**

Navigate to `/settings` as an admin user. Confirm the "Org" tab no longer appears in the tab bar. The tab sequence should now be: Table Defaults → School → Alerts (coach only) → Platform → Profile → Danger Zone.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/SettingsPage.jsx
git commit -m "feat: remove Org tab from settings — content absorbed into Platform > Platform Defaults"
```

---

## Task 6: SchoolTab — cascade leaderboard + blind structures section

**Files:**
- Modify: `client/src/pages/settings/SchoolTab.jsx`

- [ ] **Step 1: Update imports and add lbSource state**

At the top of `SchoolTab.jsx`, update the shared import to include `CascadeLabel`:

```jsx
// BEFORE:
import { SectionHeader, Field, Input, Select, Card } from './shared.jsx';

// AFTER:
import { SectionHeader, Field, Input, Select, Card, CascadeLabel } from './shared.jsx';
```

In the state declarations block (around line 439), replace the leaderboard state:

```jsx
// BEFORE:
const [leaderboard, setLeaderboard]   = useState({ primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' });
const [lbSaving, setLbSaving]         = useState(false);
const [lbMsg, setLbMsg]               = useState('');

// AFTER:
const [leaderboard, setLeaderboard]   = useState({ primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' });
const [lbSource, setLbSource]         = useState('hardcoded');   // 'school' | 'org' | 'hardcoded'
const [lbSaving, setLbSaving]         = useState(false);
const [lbResetting, setLbResetting]   = useState(false);
const [lbMsg, setLbMsg]               = useState('');
```

Also add blind structures state after the leaderboard block:

```jsx
const [blindStructures, setBlindStructures]       = useState([]);
const [blindLoading, setBlindLoading]             = useState(true);
const [newBlind, setNewBlind]                     = useState({ label: '', sb: '', bb: '', ante: '0' });
const [addingBlind, setAddingBlind]               = useState(false);
const [editingBlind, setEditingBlind]             = useState(null);  // { id, label, sb, bb, ante }
const [blindMsg, setBlindMsg]                     = useState('');
```

- [ ] **Step 2: Update the useEffect to read new leaderboard shape and fetch blind structures**

Find the `useEffect` (around line 458) that calls `apiFetch('/api/settings/school')`. Update the leaderboard line:

```jsx
// BEFORE:
setLeaderboard(school.leaderboard ?? leaderboard);

// AFTER:
if (school.leaderboard) {
  setLeaderboard(school.leaderboard.value ?? leaderboard);
  setLbSource(school.leaderboard.source ?? 'hardcoded');
}
```

After the existing `apiFetch('/api/settings/school')` effect, add a second effect for blind structures:

```jsx
useEffect(() => {
  apiFetch('/api/settings/school/blind-structures')
    .then(data => setBlindStructures(data.structures ?? []))
    .catch(() => {})
    .finally(() => setBlindLoading(false));
}, []);
```

- [ ] **Step 3: Add handleResetLeaderboard function**

After `handleSaveLeaderboard` (around line 558), add:

```jsx
async function handleResetLeaderboard() {
  setLbResetting(true); setLbMsg('');
  try {
    const resolved = await apiFetch('/api/settings/school/leaderboard', { method: 'DELETE' });
    setLeaderboard(resolved.value);
    setLbSource(resolved.source);
    setLbMsg('Reset to platform default.');
  } catch (err) { setLbMsg(err.message || 'Reset failed.'); }
  finally { setLbResetting(false); }
}
```

Also update `handleSaveLeaderboard` to set `lbSource` to `'school'` on success:

```jsx
async function handleSaveLeaderboard() {
  setLbSaving(true); setLbMsg('');
  try {
    const updated = await apiFetch('/api/settings/school/leaderboard', {
      method: 'PUT',
      body: JSON.stringify(leaderboard),
    });
    setLeaderboard(updated);
    setLbSource('school');
    setLbMsg('Saved.');
  } catch (err) { setLbMsg(err.message || 'Save failed.'); }
  finally { setLbSaving(false); }
}
```

- [ ] **Step 4: Add blind structure handler functions**

After `handleResetLeaderboard`, add:

```jsx
async function handleAddBlind(e) {
  e.preventDefault();
  if (!newBlind.label.trim() || !newBlind.sb || !newBlind.bb) return;
  setBlindMsg('');
  try {
    const created = await apiFetch('/api/settings/school/blind-structures', {
      method: 'POST',
      body: JSON.stringify({ label: newBlind.label.trim(), sb: Number(newBlind.sb), bb: Number(newBlind.bb), ante: Number(newBlind.ante) || 0 }),
    });
    setBlindStructures(prev => [
      ...prev.filter(s => s.source === 'school'),
      created,
      ...prev.filter(s => s.source === 'org'),
    ]);
    setNewBlind({ label: '', sb: '', bb: '', ante: '0' });
    setAddingBlind(false);
  } catch (err) { setBlindMsg(err.message || 'Failed to add.'); }
}

async function handleSaveBlind(s) {
  setBlindMsg('');
  try {
    const updated = await apiFetch(`/api/settings/school/blind-structures/${s.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ label: s.label, sb: Number(s.sb), bb: Number(s.bb), ante: Number(s.ante) }),
    });
    setBlindStructures(prev => prev.map(x => x.id === s.id ? updated : x));
    setEditingBlind(null);
  } catch (err) { setBlindMsg(err.message || 'Failed to save.'); }
}

async function handleDeleteBlind(id) {
  setBlindMsg('');
  try {
    await apiFetch(`/api/settings/school/blind-structures/${id}`, { method: 'DELETE' });
    setBlindStructures(prev => prev.filter(s => s.id !== id));
  } catch (err) { setBlindMsg(err.message || 'Failed to delete.'); }
}
```

- [ ] **Step 5: Update the leaderboard section JSX**

Find the `{/* ── Leaderboard ── */}` block in the JSX (around line 737). Replace it:

```jsx
{/* ── Leaderboard ── */}
{/* CascadeLabel sits beside SectionHeader — NOT inside title, which inherits uppercase/tracking styles */}
<div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
  <TrendingUp size={14} style={{ color: colors.textMuted }} />
  <span className="text-xs font-bold tracking-widest uppercase" style={{ color: colors.textMuted }}>Leaderboard</span>
  {/* CascadeLabel returns null when scopeMap[field] is falsy — 'hardcoded' maps to 'org' so the badge always shows */}
  <CascadeLabel
    field="leaderboard"
    scopeMap={{ leaderboard: lbSource === 'school' ? 'school' : 'org' }}
    dirty={new Set()}
    isAdmin={false}
  />
</div>
<Field label="Primary metric">
  <Select value={leaderboard.primary_metric} onChange={v => setLeaderboard(l => ({ ...l, primary_metric: v }))}>
    {['net_chips', 'bb_per_100', 'win_rate', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
  </Select>
</Field>
<Field label="Secondary metric">
  <Select value={leaderboard.secondary_metric} onChange={v => setLeaderboard(l => ({ ...l, secondary_metric: v }))}>
    {['win_rate', 'net_chips', 'bb_per_100', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
  </Select>
</Field>
<Field label="Update frequency">
  <Select value={leaderboard.update_frequency} onChange={v => setLeaderboard(l => ({ ...l, update_frequency: v }))}>
    {['after_session', 'hourly', 'daily'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
  </Select>
</Field>
<div className="flex items-center gap-3 mt-3">
  <button onClick={handleSaveLeaderboard} disabled={lbSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: lbSaving ? 0.6 : 1 }}>
    {lbSaving ? 'Saving…' : 'Save'}
  </button>
  {lbSource === 'school' && (
    <button
      onClick={handleResetLeaderboard}
      disabled={lbResetting}
      className="text-xs"
      style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
    >
      {lbResetting ? 'Resetting…' : 'Reset to platform default'}
    </button>
  )}
  {lbMsg && <span className="text-xs" style={{ color: lbMsg.includes('failed') ? colors.error : colors.success }}>{lbMsg}</span>}
</div>
```

- [ ] **Step 6: Add blind structures section JSX**

Find the `<div className="my-4" ...` divider after the leaderboard section (around line 761) and add the blind structures section after it:

```jsx
<div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

{/* ── Blind Structures ── */}
<SectionHeader title="Blind Structures" />
<p className="text-xs mb-3" style={{ color: colors.textMuted }}>
  School-specific presets appear first. Platform presets are read-only.
</p>

{blindLoading ? (
  <p className="text-xs mb-2" style={{ color: colors.textMuted }}>Loading…</p>
) : (
  <>
    {blindStructures.length > 0 && (
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${colors.borderStrong}` }}>
        {blindStructures.map((s, i) => {
          const isEditing = editingBlind?.id === s.id;
          const ed = editingBlind ?? s;
          const isOrg = s.source === 'org';

          // Divider before first org entry
          const prevIsSchool = i > 0 && blindStructures[i - 1].source === 'school';
          const showDivider  = isOrg && prevIsSchool;

          return (
            <React.Fragment key={s.id}>
              {showDivider && (
                <div className="px-4 py-1 text-xs font-bold uppercase tracking-widest" style={{ color: colors.textMuted, background: colors.bgSurface, borderTop: `1px solid ${colors.borderDefault}`, borderBottom: `1px solid ${colors.borderDefault}` }}>
                  Platform presets
                </div>
              )}
              <div
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: i < blindStructures.length - 1 ? `1px solid ${colors.borderDefault}` : 'none', opacity: isOrg ? 0.7 : 1 }}
              >
                {isEditing ? (
                  <>
                    <input value={ed.label} onChange={e => setEditingBlind(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 90 }} placeholder="Label" />
                    <input value={ed.sb}    onChange={e => setEditingBlind(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="SB" type="number" />
                    <input value={ed.bb}    onChange={e => setEditingBlind(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="BB" type="number" />
                    <input value={ed.ante}  onChange={e => setEditingBlind(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="Ante" type="number" />
                    <button onClick={() => handleSaveBlind(editingBlind)} className="text-xs font-semibold" style={{ color: colors.gold }}>Save</button>
                    <button onClick={() => setEditingBlind(null)} className="text-xs" style={{ color: colors.textMuted }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="w-24 font-semibold text-sm" style={{ color: colors.textPrimary }}>{s.label}</span>
                    <span className="text-sm flex-1" style={{ color: colors.textMuted }}>{s.sb}/{s.bb}{s.ante > 0 ? ` · ante ${s.ante}` : ''}</span>
                    {!isOrg && (
                      <>
                        <button onClick={() => setEditingBlind({ ...s })} className="text-xs" style={{ color: colors.gold }}>Edit</button>
                        <button onClick={() => handleDeleteBlind(s.id)} className="text-xs" style={{ color: colors.error }}>✕</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    )}

    {!addingBlind ? (
      <button onClick={() => setAddingBlind(true)} className="text-sm font-semibold mb-3" style={{ color: colors.gold }}>+ Add School Preset</button>
    ) : (
      <form onSubmit={handleAddBlind} className="flex flex-wrap gap-2 mb-3 items-end">
        <input value={newBlind.label} onChange={e => setNewBlind(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 100 }} placeholder="Label" />
        <input value={newBlind.sb}    onChange={e => setNewBlind(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="SB" type="number" />
        <input value={newBlind.bb}    onChange={e => setNewBlind(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="BB" type="number" />
        <input value={newBlind.ante}  onChange={e => setNewBlind(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="Ante" type="number" />
        <button type="submit" className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: colors.gold, color: colors.bgSurface }}>Add</button>
        <button type="button" onClick={() => setAddingBlind(false)} className="text-sm" style={{ color: colors.textMuted }}>Cancel</button>
      </form>
    )}
    {blindMsg && <p className="text-xs mb-2" style={{ color: colors.error }}>{blindMsg}</p>}
  </>
)}
```

- [ ] **Step 7: Verify in browser — full School Tab walkthrough**

1. Navigate to `/settings` → School tab as a coach
2. **Leaderboard section**: badge shows "(platform default)" if no school override; "(overridden)" after saving
3. **Save** leaderboard → badge flips to "(overridden)"; "Reset to platform default" link appears
4. **Reset** → badge returns to "(platform default)"; link disappears
5. **Blind Structures section**: shows school presets (editable) + platform presets (read-only, below divider)
6. **Add a school preset** → appears at top of list; edit and delete work
7. No console errors

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/settings/SchoolTab.jsx
git commit -m "feat: cascade indicator + reset for leaderboard; blind structures section in SchoolTab"
```

---

## Task 7: Delete OrgTab.jsx

**Files:**
- Delete: `client/src/pages/settings/OrgTab.jsx`

- [ ] **Step 1: Confirm no remaining imports**

```bash
grep -r "OrgTab" c:/Users/user/poker-trainer/client/src/
```

Expected: zero results (SettingsPage.jsx import was removed in Task 5).

- [ ] **Step 2: Delete the file**

```bash
git rm client/src/pages/settings/OrgTab.jsx
```

- [ ] **Step 3: Run full test suite one final time**

```bash
cd c:/Users/user/poker-trainer
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete OrgTab.jsx — content migrated to PlatformTab > Platform Defaults"
```

---

## End-to-End Verification Checklist

Run through all items in the spec Verification section:

- [ ] Admin saves leaderboard defaults in Platform Tab → Platform Defaults sub-tab → confirm DB row at `scope='org'` via Supabase dashboard or curl
- [ ] Coach opens School Tab → Leaderboard shows badge "(platform default)"
- [ ] Coach overrides primary_metric → saves → badge shows "(overridden)"
- [ ] Coach clicks "Reset to platform default" → badge returns to "(platform default)"
- [ ] Coach adds a blind structure → appears at top of list with edit/delete controls
- [ ] Org blind structures appear below "Platform presets" divider — no edit/delete controls visible
- [ ] Navigate to `/settings` → "Org" tab is gone from nav for all roles
- [ ] Table Defaults tab cascade still works (regression check)
- [ ] `npx jest --no-coverage` — all tests pass