'use strict';

/**
 * ChipBankRepository unit tests.
 *
 * All Supabase calls are mocked. Tests verify:
 *   - getBalance (reads bank row or returns 0 if none)
 *   - getTransactionHistory (paginated query)
 *   - applyTransaction (calls rpc; maps insufficient_funds error)
 *   - reload / buyIn / cashOut / adjustment (thin wrappers around applyTransaction)
 */

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockChain = {
  from:        jest.fn(),
  select:      jest.fn(),
  eq:          jest.fn(),
  order:       jest.fn(),
  range:       jest.fn(),
  maybeSingle: jest.fn(),
  rpc:         jest.fn(),
};

// All chainable methods return the chain itself by default.
mockChain.from.mockReturnValue(mockChain);
mockChain.select.mockReturnValue(mockChain);
mockChain.eq.mockReturnValue(mockChain);
mockChain.order.mockReturnValue(mockChain);
mockChain.range.mockReturnValue(mockChain);

const mockSupabase = {
  from: mockChain.from,
  rpc:  mockChain.rpc,
};

jest.mock('../../db/supabase', () => mockSupabase);

// ─── Module under test ────────────────────────────────────────────────────────

const {
  getBalance,
  getTransactionHistory,
  applyTransaction,
  reload,
  buyIn,
  cashOut,
  adjustment,
} = require('../repositories/ChipBankRepository');

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire chain after clearAllMocks
  mockChain.from.mockReturnValue(mockChain);
  mockChain.select.mockReturnValue(mockChain);
  mockChain.eq.mockReturnValue(mockChain);
  mockChain.order.mockReturnValue(mockChain);
  mockChain.range.mockReturnValue(mockChain);
  mockSupabase.from = mockChain.from;
  mockSupabase.rpc  = mockChain.rpc;
});

// ─── getBalance ───────────────────────────────────────────────────────────────

describe('getBalance', () => {
  test('returns balance from bank row', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: { balance: 500 }, error: null });
    const bal = await getBalance('player-uuid-1');
    expect(bal).toBe(500);
  });

  test('returns 0 when no bank row exists', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: null });
    const bal = await getBalance('new-player-uuid');
    expect(bal).toBe(0);
  });

  test('throws on DB error', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'DB failure' } });
    await expect(getBalance('uuid-x')).rejects.toThrow('DB failure');
  });
});

// ─── getTransactionHistory ────────────────────────────────────────────────────

describe('getTransactionHistory', () => {
  test('returns transaction rows newest-first', async () => {
    const rows = [
      { id: 2, amount: -100, type: 'buy_in', created_at: '2026-04-01T10:00:00Z' },
      { id: 1, amount: 1000, type: 'reload',  created_at: '2026-04-01T09:00:00Z' },
    ];
    mockChain.range.mockResolvedValue({ data: rows, error: null });

    const txns = await getTransactionHistory('player-uuid-1', { limit: 10, offset: 0 });
    expect(txns).toEqual(rows);
    expect(mockChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  test('returns empty array when no transactions', async () => {
    mockChain.range.mockResolvedValue({ data: null, error: null });
    const txns = await getTransactionHistory('player-uuid-1');
    expect(txns).toEqual([]);
  });

  test('passes limit and offset to range()', async () => {
    mockChain.range.mockResolvedValue({ data: [], error: null });
    await getTransactionHistory('player-uuid-1', { limit: 25, offset: 50 });
    expect(mockChain.range).toHaveBeenCalledWith(50, 74); // offset to offset+limit-1
  });

  test('throws on DB error', async () => {
    mockChain.range.mockResolvedValue({ data: null, error: { message: 'query failed' } });
    await expect(getTransactionHistory('uuid-x')).rejects.toThrow('query failed');
  });
});

// ─── applyTransaction ─────────────────────────────────────────────────────────

describe('applyTransaction', () => {
  test('calls supabase.rpc with correct arguments', async () => {
    mockChain.rpc.mockResolvedValue({ data: 900, error: null });

    const bal = await applyTransaction({
      playerId:  'player-uuid',
      amount:    -100,
      type:      'buy_in',
      tableId:   'table-1',
      createdBy: null,
      notes:     null,
    });

    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', {
      p_player_id:  'player-uuid',
      p_amount:     -100,
      p_type:       'buy_in',
      p_table_id:   'table-1',
      p_created_by: null,
      p_notes:      null,
    });
    expect(bal).toBe(900);
  });

  test('throws insufficient_funds when DB returns that message', async () => {
    mockChain.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_funds: balance would go below zero' } });
    await expect(applyTransaction({ playerId: 'p', amount: -9999, type: 'buy_in' }))
      .rejects.toThrow('insufficient_funds');
  });

  test('throws generic error for other DB failures', async () => {
    mockChain.rpc.mockResolvedValue({ data: null, error: { message: 'connection refused' } });
    await expect(applyTransaction({ playerId: 'p', amount: 100, type: 'reload' }))
      .rejects.toThrow('connection refused');
  });
});

// ─── reload ───────────────────────────────────────────────────────────────────

describe('reload', () => {
  test('calls applyTransaction with positive amount and reload type', async () => {
    mockChain.rpc.mockResolvedValue({ data: 1500, error: null });
    const bal = await reload('player-uuid', 500, 'coach-uuid');
    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', expect.objectContaining({
      p_amount: 500,
      p_type:   'reload',
      p_created_by: 'coach-uuid',
    }));
    expect(bal).toBe(1500);
  });

  test('throws for zero amount', async () => {
    await expect(reload('player-uuid', 0, 'coach-uuid')).rejects.toThrow();
  });

  test('throws for negative amount', async () => {
    await expect(reload('player-uuid', -100, 'coach-uuid')).rejects.toThrow();
  });

  test('throws for non-integer amount', async () => {
    await expect(reload('player-uuid', 10.5, 'coach-uuid')).rejects.toThrow();
  });
});

// ─── buyIn ────────────────────────────────────────────────────────────────────

describe('buyIn', () => {
  test('deducts from bank (sends negative amount) with buy_in type', async () => {
    mockChain.rpc.mockResolvedValue({ data: 400, error: null });
    const bal = await buyIn('player-uuid', 600, 'table-1');
    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', expect.objectContaining({
      p_amount:   -600,
      p_type:     'buy_in',
      p_table_id: 'table-1',
    }));
    expect(bal).toBe(400);
  });

  test('throws insufficient_funds when balance is too low', async () => {
    mockChain.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_funds' } });
    await expect(buyIn('player-uuid', 9999, 'table-1')).rejects.toThrow('insufficient_funds');
  });

  test('throws for zero amount', async () => {
    await expect(buyIn('player-uuid', 0, 'table-1')).rejects.toThrow();
  });
});

// ─── cashOut ──────────────────────────────────────────────────────────────────

describe('cashOut', () => {
  test('credits remaining stack back to bank with cash_out type', async () => {
    mockChain.rpc.mockResolvedValue({ data: 850, error: null });
    const bal = await cashOut('player-uuid', 350, 'table-1');
    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', expect.objectContaining({
      p_amount:   350,
      p_type:     'cash_out',
      p_table_id: 'table-1',
    }));
    expect(bal).toBe(850);
  });

  test('skips DB call and returns current balance for zero stack', async () => {
    mockChain.maybeSingle.mockResolvedValue({ data: { balance: 500 }, error: null });
    const bal = await cashOut('player-uuid', 0, 'table-1');
    expect(mockChain.rpc).not.toHaveBeenCalled();
    expect(bal).toBe(500);
  });

  test('throws for negative stack amount', async () => {
    await expect(cashOut('player-uuid', -10, 'table-1')).rejects.toThrow();
  });
});

// ─── adjustment ───────────────────────────────────────────────────────────────

describe('adjustment', () => {
  test('sends positive amount for a credit adjustment', async () => {
    mockChain.rpc.mockResolvedValue({ data: 1100, error: null });
    await adjustment('player-uuid', 200, 'admin-uuid', 'bonus chips');
    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', expect.objectContaining({
      p_amount: 200,
      p_type:   'adjustment',
      p_notes:  'bonus chips',
    }));
  });

  test('sends negative amount for a debit adjustment', async () => {
    mockChain.rpc.mockResolvedValue({ data: 800, error: null });
    await adjustment('player-uuid', -100, 'admin-uuid', 'correction');
    expect(mockChain.rpc).toHaveBeenCalledWith('apply_chip_transaction', expect.objectContaining({
      p_amount: -100,
      p_type:   'adjustment',
    }));
  });

  test('throws for zero amount', async () => {
    await expect(adjustment('player-uuid', 0, 'admin-uuid')).rejects.toThrow();
  });

  test('throws insufficient_funds for large debit', async () => {
    mockChain.rpc.mockResolvedValue({ data: null, error: { message: 'insufficient_funds' } });
    await expect(adjustment('player-uuid', -99999, 'admin-uuid')).rejects.toThrow('insufficient_funds');
  });
});
