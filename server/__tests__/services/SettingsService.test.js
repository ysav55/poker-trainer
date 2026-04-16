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

  it('throws when getSchoolSetting encounters DB error', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockRejectedValue(new Error('DB connection failed')),
    });

    await expect(SettingsService.resolveLeaderboardConfig('school-abc')).rejects.toThrow('DB connection failed');
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

  it('throws when getOrgSetting encounters DB error', async () => {
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockSupabase.from.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockRejectedValue(new Error('DB error')),
    });

    await expect(SettingsService.resolveBlindStructures('school-abc')).rejects.toThrow('DB error');
  });

  it('skips school lookup when schoolId is null', async () => {
    const orgStructs = [{ id: 'o1', label: 'Micro', sb: 5, bb: 10, ante: 0 }];
    mockSupabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { value: orgStructs }, error: null }),
    });

    const result = await SettingsService.resolveBlindStructures(null);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('org');
    expect(mockSupabase.from).toHaveBeenCalledTimes(1); // only org lookup
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

  it('throws when delete fails', async () => {
    const mockChain = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn(),
    };
    // First two .eq() calls return the chain; third returns a promise-like with error
    mockChain.eq
      .mockReturnValueOnce(mockChain)
      .mockReturnValueOnce(mockChain)
      .mockReturnValueOnce(Promise.resolve({ error: new Error('permission denied') }));
    mockSupabase.from.mockReturnValue(mockChain);

    await expect(SettingsService.deleteSchoolSetting('school-abc', 'school.leaderboard'))
      .rejects.toThrow('permission denied');
  });

  it('throws when schoolId is invalid (empty string)', async () => {
    await expect(SettingsService.deleteSchoolSetting('', 'school.leaderboard'))
      .rejects.toThrow('Invalid schoolId: must be a non-empty string');
  });

  it('throws when schoolId is invalid (not a string)', async () => {
    await expect(SettingsService.deleteSchoolSetting(null, 'school.leaderboard'))
      .rejects.toThrow('Invalid schoolId: must be a non-empty string');
  });

  it('throws when key is invalid (empty string)', async () => {
    await expect(SettingsService.deleteSchoolSetting('school-abc', ''))
      .rejects.toThrow('Invalid key: must be a non-empty string');
  });

  it('throws when key is invalid (not a string)', async () => {
    await expect(SettingsService.deleteSchoolSetting('school-abc', null))
      .rejects.toThrow('Invalid key: must be a non-empty string');
  });
});
