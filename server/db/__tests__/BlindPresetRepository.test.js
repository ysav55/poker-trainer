'use strict';

/**
 * BlindPresetRepository unit tests.
 * All Supabase calls are mocked — no real DB or network calls made.
 */

// ─── Supabase chain mock ──────────────────────────────────────────────────────
// Must be defined before jest.mock() calls; prefixed with 'mock' as required.

const mockChain = {
  from:        jest.fn(),
  select:      jest.fn(),
  insert:      jest.fn(),
  update:      jest.fn(),
  delete:      jest.fn(),
  eq:          jest.fn(),
  order:       jest.fn(),
  single:      jest.fn(),
  maybeSingle: jest.fn(),
};
// Make every method return the chain itself so calls can be chained arbitrarily
Object.keys(mockChain).forEach(k => {
  mockChain[k].mockReturnValue(mockChain);
});

jest.mock('../supabase', () => mockChain);

// ─── q mock ───────────────────────────────────────────────────────────────────

const mockQ = jest.fn();
jest.mock('../utils', () => ({ q: mockQ }));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Set what q resolves to for the next call. */
function setQ(value) {
  mockQ.mockResolvedValue(value);
}

/** Set q to resolve to successive values per call (one-shot). */
function setQSequence(...values) {
  values.forEach(v => mockQ.mockResolvedValueOnce(v));
}

// ─── Reset between tests ──────────────────────────────────────────────────────

let repo;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  // Restore chain self-returns after clearAllMocks resets them
  Object.keys(mockChain).forEach(k => mockChain[k].mockReturnValue(mockChain));
  // Re-register mocks
  jest.mock('../supabase', () => mockChain);
  jest.mock('../utils', () => ({ q: mockQ }));
  repo = require('../repositories/BlindPresetRepository').BlindPresetRepository;
});

// ─── list() ───────────────────────────────────────────────────────────────────

describe('list(schoolId)', () => {
  it('returns system and school presets split correctly', async () => {
    const systemPresets = [
      { id: 'sys-1', name: 'Default 9-max', is_system: true, school_id: null },
      { id: 'sys-2', name: 'Turbo',         is_system: true, school_id: null },
    ];
    const schoolPresets = [
      { id: 'sch-1', name: 'Custom deep', is_system: false, school_id: 'school-abc' },
    ];
    // Promise.all fires two q calls: system query first, school query second
    setQSequence(systemPresets, schoolPresets);

    const result = await repo.list('school-abc');

    expect(result.system).toHaveLength(2);
    expect(result.system[0].id).toBe('sys-1');
    expect(result.school).toHaveLength(1);
    expect(result.school[0].id).toBe('sch-1');
  });

  it('returns empty school array when schoolId is null', async () => {
    const systemPresets = [
      { id: 'sys-1', name: 'Default', is_system: true, school_id: null },
    ];
    // Only one q call when schoolId is null (school query skipped)
    setQSequence(systemPresets);

    const result = await repo.list(null);

    expect(result.system).toHaveLength(1);
    expect(result.school).toHaveLength(0);
  });

  it('returns empty arrays when no presets exist', async () => {
    setQSequence([], []);
    const result = await repo.list('school-xyz');
    expect(result.system).toEqual([]);
    expect(result.school).toEqual([]);
  });
});

// ─── getById() ────────────────────────────────────────────────────────────────

describe('getById(id)', () => {
  it('returns the preset when found', async () => {
    const preset = {
      id: 'preset-1',
      name: 'Standard 6-max',
      levels: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
      is_system: false,
      school_id: 'school-abc',
    };
    setQ(preset);

    const result = await repo.getById('preset-1');

    expect(result).toEqual(preset);
  });

  it('returns null when preset is not found', async () => {
    setQ(null);

    const result = await repo.getById('nonexistent-id');

    expect(result).toBeNull();
  });
});

// ─── create() ────────────────────────────────────────────────────────────────

describe('create(...)', () => {
  it('inserts with correct fields and returns the new row', async () => {
    const newPreset = {
      id: 'new-uuid',
      name: 'My Tournament',
      description: 'A custom structure',
      levels: [
        { level: 1, sb: 25,  bb: 50,  ante: 0,  duration_minutes: 15 },
        { level: 2, sb: 50,  bb: 100, ante: 10, duration_minutes: 15 },
      ],
      is_system: false,
      school_id: 'school-abc',
      created_by: 'coach-uuid',
    };
    setQ(newPreset);

    const result = await repo.create({
      name: 'My Tournament',
      description: 'A custom structure',
      levels: newPreset.levels,
      schoolId: 'school-abc',
      createdBy: 'coach-uuid',
    });

    expect(mockQ).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('My Tournament');
    expect(result.is_system).toBe(false);
    expect(result.school_id).toBe('school-abc');
    expect(result.created_by).toBe('coach-uuid');
  });

  it('sets description and created_by to null when omitted', async () => {
    const newPreset = {
      id: 'new-uuid',
      name: 'Minimal',
      description: null,
      levels: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 20 }],
      is_system: false,
      school_id: null,
      created_by: null,
    };
    setQ(newPreset);

    const result = await repo.create({
      name: 'Minimal',
      levels: newPreset.levels,
    });

    expect(result.description).toBeNull();
    expect(result.created_by).toBeNull();
  });
});

// ─── delete() ────────────────────────────────────────────────────────────────

describe('delete(id, schoolId)', () => {
  it('succeeds and calls q twice (fetch + delete)', async () => {
    const preset = { id: 'preset-1', school_id: 'school-abc', is_system: false };
    setQSequence(preset, null);

    await expect(repo.delete('preset-1', 'school-abc')).resolves.toBeUndefined();
    expect(mockQ).toHaveBeenCalledTimes(2);
  });

  it('throws NOT_FOUND when preset does not exist', async () => {
    setQ(null); // maybeSingle returns null

    await expect(repo.delete('ghost-id', 'school-abc')).rejects.toThrow('NOT_FOUND');
    // Should not attempt the delete query
    expect(mockQ).toHaveBeenCalledTimes(1);
  });

  it('throws SYSTEM_PRESET when trying to delete a system preset', async () => {
    const systemPreset = { id: 'sys-1', school_id: null, is_system: true };
    setQ(systemPreset);

    await expect(repo.delete('sys-1', 'school-abc')).rejects.toThrow('SYSTEM_PRESET');
    // Should not attempt the delete query
    expect(mockQ).toHaveBeenCalledTimes(1);
  });
});
