'use strict';

/**
 * SchoolRepository unit tests.
 *
 * All Supabase calls are mocked. Tests cover:
 *   - findAll / findById
 *   - create / update / archive
 *   - getMembers / getMemberCounts / assignPlayer / removePlayer
 *   - canAddCoach / canAddStudent (capacity enforcement)
 *   - getFeatures / setFeature / bulkSetFeatures
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockChain = {
  from:        jest.fn(),
  select:      jest.fn(),
  eq:          jest.fn(),
  like:        jest.fn(),
  order:       jest.fn(),
  insert:      jest.fn(),
  update:      jest.fn(),
  upsert:      jest.fn(),
  single:      jest.fn(),
  maybeSingle: jest.fn(),
};

function rewire() {
  mockChain.from.mockReturnValue(mockChain);
  mockChain.select.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.like.mockReturnValue(mockChain);
  mockChain.order.mockReturnValue(mockChain);
  mockChain.insert.mockReturnValue(mockChain);
  mockChain.update.mockReturnValue(mockChain);
  mockChain.upsert.mockReturnValue(mockChain);
}

const mockSupabase = { from: mockChain.from };
jest.mock('../../db/supabase', () => mockSupabase);

const repo = require('../repositories/SchoolRepository');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  rewire();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSchool(overrides = {}) {
  return {
    id: 'school-1', name: 'Test School', status: 'active',
    max_coaches: null, max_students: null,
    coaches: 0, students: 0, total: 0,
    ...overrides,
  };
}

// ─── findAll ──────────────────────────────────────────────────────────────────

describe('findAll', () => {
  test('returns schools array with member counts', async () => {
    const schoolRows = [makeSchool({ id: 'school-1' }), makeSchool({ id: 'school-2' })];
    mockChain.order.mockResolvedValueOnce({ data: schoolRows, error: null });

    // getMemberCounts calls getMembers which calls supabase; mock two getMembers calls
    mockChain.order
      .mockResolvedValueOnce({ data: [], error: null }) // members school-1
      .mockResolvedValueOnce({ data: [], error: null }); // members school-2

    const result = await repo.findAll();
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('coaches', 0);
  });

  test('throws when supabase returns error', async () => {
    mockChain.order.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    await expect(repo.findAll()).rejects.toThrow('DB error');
  });
});

// ─── findById ─────────────────────────────────────────────────────────────────

describe('findById', () => {
  test('returns null when school not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await repo.findById('missing-id');
    expect(result).toBeNull();
  });

  test('returns school with counts when found', async () => {
    const schoolRow = makeSchool();
    mockChain.maybeSingle.mockResolvedValueOnce({ data: schoolRow, error: null });
    // getMembers for counts
    mockChain.order.mockResolvedValueOnce({ data: [], error: null });

    const result = await repo.findById('school-1');
    expect(result).toMatchObject({ id: 'school-1', coaches: 0 });
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('create', () => {
  test('inserts and returns created school', async () => {
    const created = makeSchool({ id: 'new-school' });
    mockChain.single.mockResolvedValueOnce({ data: created, error: null });

    const result = await repo.create({ name: 'New School', createdBy: 'user-1' });
    expect(mockChain.insert).toHaveBeenCalled();
    expect(result.id).toBe('new-school');
  });

  test('throws when insert fails', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'insert failed' } });
    await expect(repo.create({ name: 'Bad' })).rejects.toThrow('insert failed');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('update', () => {
  test('patches allowed fields and returns updated school', async () => {
    const updated = makeSchool({ name: 'Renamed' });
    mockChain.single.mockResolvedValueOnce({ data: updated, error: null });

    const result = await repo.update('school-1', { name: 'Renamed' }, 'admin-id');
    expect(mockChain.update).toHaveBeenCalled();
    expect(result.name).toBe('Renamed');
  });

  test('ignores undefined fields', async () => {
    mockChain.single.mockResolvedValueOnce({ data: makeSchool(), error: null });
    await repo.update('school-1', {}, 'admin-id');
    const updateArg = mockChain.update.mock.calls[0][0];
    expect(updateArg).not.toHaveProperty('name');
  });

  test('throws on error', async () => {
    mockChain.single.mockResolvedValueOnce({ data: null, error: { message: 'update failed' } });
    await expect(repo.update('school-1', { name: 'X' }, 'admin-id')).rejects.toThrow('update failed');
  });
});

// ─── archive ──────────────────────────────────────────────────────────────────

describe('archive', () => {
  test('sets status to archived', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null });
    await repo.archive('school-1');
    const patchArg = mockChain.update.mock.calls[0][0];
    expect(patchArg.status).toBe('archived');
  });

  test('throws on error', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: { message: 'archive failed' } });
    await expect(repo.archive('school-1')).rejects.toThrow('archive failed');
  });
});

// ─── getMembers ───────────────────────────────────────────────────────────────

describe('getMembers', () => {
  const coachMember = {
    id: 'p1', display_name: 'Coach', school_id: 'school-1',
    player_roles: [{ roles: { name: 'coach' } }],
  };
  const studentMember = {
    id: 'p2', display_name: 'Student', school_id: 'school-1',
    player_roles: [{ roles: { name: 'coached_student' } }],
  };

  test('returns all members without role filter', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [coachMember, studentMember], error: null });
    const result = await repo.getMembers('school-1');
    expect(result).toHaveLength(2);
  });

  test('filters by role when specified', async () => {
    mockChain.order.mockResolvedValueOnce({ data: [coachMember, studentMember], error: null });
    const result = await repo.getMembers('school-1', { role: 'coach' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  test('throws on supabase error', async () => {
    mockChain.order.mockResolvedValueOnce({ data: null, error: { message: 'query error' } });
    await expect(repo.getMembers('school-1')).rejects.toThrow('query error');
  });
});

// ─── getMemberCounts ──────────────────────────────────────────────────────────

describe('getMemberCounts', () => {
  test('counts coaches and students correctly', async () => {
    const members = [
      { player_roles: [{ roles: { name: 'coach' } }] },
      { player_roles: [{ roles: { name: 'coached_student' } }] },
      { player_roles: [{ roles: { name: 'solo_student' } }] },
    ];
    mockChain.order.mockResolvedValueOnce({ data: members, error: null });

    const counts = await repo.getMemberCounts('school-1');
    expect(counts.coaches).toBe(1);
    expect(counts.students).toBe(2);
    expect(counts.total).toBe(3);
  });
});

// ─── assignPlayer / removePlayer ──────────────────────────────────────────────

describe('assignPlayer', () => {
  test('sets school_id on player_profiles', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null });
    await repo.assignPlayer('player-1', 'school-1', 'admin-1');
    const patchArg = mockChain.update.mock.calls[0][0];
    expect(patchArg.school_id).toBe('school-1');
  });

  test('throws on error', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: { message: 'assign failed' } });
    await expect(repo.assignPlayer('p1', 's1', 'a1')).rejects.toThrow('assign failed');
  });
});

describe('removePlayer', () => {
  test('sets school_id to null', async () => {
    mockChain.eq.mockResolvedValueOnce({ error: null });
    await repo.removePlayer('player-1', 'admin-1');
    const patchArg = mockChain.update.mock.calls[0][0];
    expect(patchArg.school_id).toBeNull();
  });
});

// ─── canAddCoach ──────────────────────────────────────────────────────────────

describe('canAddCoach', () => {
  test('returns true when no limit set (max_coaches=null)', async () => {
    const school = makeSchool({ max_coaches: null, coaches: 5 });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: school, error: null });
    mockChain.order.mockResolvedValueOnce({ data: [], error: null });

    const result = await repo.canAddCoach('school-1');
    expect(result).toBe(true);
  });

  test('returns false when at coach limit', async () => {
    const school = makeSchool({ max_coaches: 3 });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: school, error: null });
    // getMembers returns 3 coaches
    const coaches = Array(3).fill({ player_roles: [{ roles: { name: 'coach' } }] });
    mockChain.order.mockResolvedValueOnce({ data: coaches, error: null });

    const result = await repo.canAddCoach('school-1');
    expect(result).toBe(false);
  });

  test('returns true when under coach limit', async () => {
    const school = makeSchool({ max_coaches: 5 });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: school, error: null });
    const coaches = Array(2).fill({ player_roles: [{ roles: { name: 'coach' } }] });
    mockChain.order.mockResolvedValueOnce({ data: coaches, error: null });

    const result = await repo.canAddCoach('school-1');
    expect(result).toBe(true);
  });

  test('returns false when school not found', async () => {
    mockChain.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const result = await repo.canAddCoach('missing');
    expect(result).toBe(false);
  });
});

// ─── canAddStudent ────────────────────────────────────────────────────────────

describe('canAddStudent', () => {
  test('returns true when no limit set', async () => {
    const school = makeSchool({ max_students: null });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: school, error: null });
    mockChain.order.mockResolvedValueOnce({ data: [], error: null });

    expect(await repo.canAddStudent('school-1')).toBe(true);
  });

  test('returns false when at student limit', async () => {
    const school = makeSchool({ max_students: 10 });
    mockChain.maybeSingle.mockResolvedValueOnce({ data: school, error: null });
    const students = Array(10).fill({ player_roles: [{ roles: { name: 'coached_student' } }] });
    mockChain.order.mockResolvedValueOnce({ data: students, error: null });

    expect(await repo.canAddStudent('school-1')).toBe(false);
  });
});

// ─── getFeatures ──────────────────────────────────────────────────────────────

describe('getFeatures', () => {
  test('defaults all features to enabled when no settings rows exist', async () => {
    mockChain.like.mockResolvedValueOnce({ data: [], error: null });
    const features = await repo.getFeatures('school-1');

    expect(features.replay).toBe(true);
    expect(features.analysis).toBe(true);
    expect(features.chip_bank).toBe(true);
  });

  test('returns false for explicitly disabled feature', async () => {
    mockChain.like.mockResolvedValueOnce({
      data: [{ key: 'feature:analysis', value: { enabled: false } }],
      error: null,
    });
    const features = await repo.getFeatures('school-1');
    expect(features.analysis).toBe(false);
    expect(features.replay).toBe(true); // unset = enabled
  });

  test('throws on supabase error', async () => {
    mockChain.like.mockResolvedValueOnce({ data: null, error: { message: 'query failed' } });
    await expect(repo.getFeatures('school-1')).rejects.toThrow('query failed');
  });
});

// ─── setFeature ───────────────────────────────────────────────────────────────

describe('setFeature', () => {
  test('upserts a setting row', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: null });
    await repo.setFeature('school-1', 'analysis', false, 'admin-1');
    expect(mockChain.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = mockChain.upsert.mock.calls[0][0];
    expect(upsertArg.key).toBe('feature:analysis');
    expect(upsertArg.value.enabled).toBe(false);
  });

  test('accepts "feature:analysis" key prefix format', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: null });
    await repo.setFeature('school-1', 'feature:analysis', true, 'admin-1');
    const upsertArg = mockChain.upsert.mock.calls[0][0];
    expect(upsertArg.key).toBe('feature:analysis');
  });

  test('throws on unknown feature key', async () => {
    await expect(repo.setFeature('school-1', 'not_a_feature', true, null))
      .rejects.toThrow('Unknown feature key');
  });
});

// ─── bulkSetFeatures ──────────────────────────────────────────────────────────

describe('bulkSetFeatures', () => {
  test('upserts all provided features', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: null });
    await repo.bulkSetFeatures('school-1', { replay: false, analysis: true }, 'admin-1');

    const upsertArg = mockChain.upsert.mock.calls[0][0];
    expect(Array.isArray(upsertArg)).toBe(true);
    expect(upsertArg).toHaveLength(2);
    const replayRow = upsertArg.find(r => r.key === 'feature:replay');
    expect(replayRow.value.enabled).toBe(false);
  });

  test('throws on unknown feature key in map', async () => {
    await expect(
      repo.bulkSetFeatures('school-1', { unknown_key: true }, 'admin-1')
    ).rejects.toThrow('Unknown feature key');
  });

  test('throws when supabase returns error', async () => {
    mockChain.upsert.mockResolvedValueOnce({ error: { message: 'upsert error' } });
    await expect(
      repo.bulkSetFeatures('school-1', { replay: true }, 'admin-1')
    ).rejects.toThrow('upsert error');
  });
});
