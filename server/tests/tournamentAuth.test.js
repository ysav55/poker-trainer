'use strict';

jest.mock('../db/supabase.js', () => ({
  from: jest.fn(),
}));
jest.mock('../auth/requirePermission.js', () => ({
  getPlayerPermissions: jest.fn(),
}));

const supabase = require('../db/supabase.js');
const { getPlayerPermissions } = require('../auth/requirePermission.js');
const { canManageTournament, canAppoint } = require('../auth/tournamentAuth.js');

// Supabase chainable query mock helper
function mockQuery(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: result }),
  };
  supabase.from.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('canManageTournament', () => {
  test('returns true for user with tournament:manage permission', async () => {
    getPlayerPermissions.mockResolvedValue(new Set(['tournament:manage']));
    mockQuery(null); // DB not called — permission short-circuits
    const result = await canManageTournament('user-1', { tableId: 'table-1' });
    expect(result).toBe(true);
  });

  test('returns true for active referee on the table', async () => {
    getPlayerPermissions.mockResolvedValue(new Set()); // no global permission
    mockQuery({ id: 'ref-row-id' }); // active ref row found
    const result = await canManageTournament('ref-user', { tableId: 'table-1' });
    expect(result).toBe(true);
  });

  test('returns false for expired/inactive referee', async () => {
    getPlayerPermissions.mockResolvedValue(new Set());
    mockQuery(null); // no active ref row
    const result = await canManageTournament('ref-user', { tableId: 'table-1' });
    expect(result).toBe(false);
  });

  test('returns false for ref appointed to a different table', async () => {
    getPlayerPermissions.mockResolvedValue(new Set());
    mockQuery(null); // query for table-2 finds nothing
    const result = await canManageTournament('ref-user', { tableId: 'table-2' });
    expect(result).toBe(false);
  });

  test('returns false when no tableId or groupId provided', async () => {
    getPlayerPermissions.mockResolvedValue(new Set());
    const result = await canManageTournament('user-1', {});
    expect(result).toBe(false);
  });

  describe('scope isolation — table_id filter must be applied', () => {
    test('referee scoped to table-A passes for table-A', async () => {
      getPlayerPermissions.mockResolvedValue(new Set());
      // Build a mock chain that records every eq() call
      const eqCalls = [];
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(function (col, val) {
          eqCalls.push([col, val]);
          return chain;
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ref-row' } }),
      };
      supabase.from.mockReturnValue(chain);

      const result = await canManageTournament('ref-user', { tableId: 'table-A' });

      expect(result).toBe(true);
      // Verify the table_id filter was actually applied with the correct value
      expect(eqCalls).toContainEqual(['table_id', 'table-A']);
    });

    test('referee scoped to table-A is rejected for table-B (scope filter enforced)', async () => {
      getPlayerPermissions.mockResolvedValue(new Set());
      const eqCalls = [];
      // Return data only when queried for table-A; return null for anything else
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(function (col, val) {
          eqCalls.push([col, val]);
          return chain;
        }),
        maybeSingle: jest.fn().mockImplementation(() => {
          // The filter for table-B should have been pushed — return no match
          const tableFilter = eqCalls.find(([c]) => c === 'table_id');
          const data = tableFilter && tableFilter[1] === 'table-A' ? { id: 'ref-row' } : null;
          return Promise.resolve({ data });
        }),
      };
      supabase.from.mockReturnValue(chain);

      const result = await canManageTournament('ref-user', { tableId: 'table-B' });

      expect(result).toBe(false);
      // Critically: the table_id filter must have been applied with 'table-B', not 'table-A'
      expect(eqCalls).toContainEqual(['table_id', 'table-B']);
    });

    test('referee scoped to group-G passes for group-G', async () => {
      getPlayerPermissions.mockResolvedValue(new Set());
      const eqCalls = [];
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(function (col, val) {
          eqCalls.push([col, val]);
          return chain;
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'ref-row' } }),
      };
      supabase.from.mockReturnValue(chain);

      const result = await canManageTournament('ref-user', { groupId: 'group-G' });

      expect(result).toBe(true);
      expect(eqCalls).toContainEqual(['group_id', 'group-G']);
    });

    test('table_id filter is NOT applied when only groupId is provided', async () => {
      getPlayerPermissions.mockResolvedValue(new Set());
      const eqCalls = [];
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockImplementation(function (col, val) {
          eqCalls.push([col, val]);
          return chain;
        }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null }),
      };
      supabase.from.mockReturnValue(chain);

      await canManageTournament('ref-user', { groupId: 'group-G' });

      expect(eqCalls.map(([c]) => c)).not.toContain('table_id');
    });
  });
});

describe('canAppoint', () => {
  test('returns true for user with tournament:manage', async () => {
    getPlayerPermissions.mockResolvedValue(new Set(['tournament:manage']));
    expect(await canAppoint('user-1')).toBe(true);
  });

  test('returns false for user without tournament:manage', async () => {
    getPlayerPermissions.mockResolvedValue(new Set(['view_hands']));
    expect(await canAppoint('user-1')).toBe(false);
  });
});
