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
