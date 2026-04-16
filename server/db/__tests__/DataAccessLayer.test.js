'use strict';

const DataAccessLayer = require('../DataAccessLayer');

// Mock Supabase — avoid network calls in test env
jest.mock('../supabase', () => ({
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  single: jest.fn(),
}));

const supabase = require('../supabase');

describe('DataAccessLayer (Unit Tests)', () => {
  let dal;

  beforeEach(() => {
    dal = new DataAccessLayer('test-request-123');
    jest.clearAllMocks();
  });

  afterEach(() => {
    dal.clear();
    jest.restoreAllMocks();
  });

  // Jest worker timeout workaround: ensure cleanup
  afterAll(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('getHand()', () => {
    test('should throw if handId is missing', async () => {
      expect(() => dal.getHand(null)).toThrow('handId required');
      expect(() => dal.getHand(undefined)).toThrow('handId required');
    });

    test('should cache hand by ID', () => {
      const handId = 'test-hand-1';

      // Mock the query
      const mockHand = {
        hand_id: handId,
        session_id: 'session-1',
        hand_actions: [],
        hand_players: [],
        hand_tags: [],
      };

      supabase.single.mockResolvedValueOnce(mockHand);

      const promise1 = dal.getHand(handId);

      // Check cache is populated
      expect(dal.cache.has('hands')).toBe(true);
      expect(dal.cache.get('hands').has(handId)).toBe(true);
    });

    test('should deduplicate identical calls (same promise)', () => {
      const handId = 'test-hand-1';

      const mockHand = {
        hand_id: handId,
        hand_actions: [],
        hand_players: [],
        hand_tags: [],
      };

      supabase.single.mockResolvedValueOnce(mockHand);

      const p1 = dal.getHand(handId);
      const p2 = dal.getHand(handId);

      // Same promise object (not two separate queries)
      expect(p1).toBe(p2);
    });

    test('should normalize null children to empty arrays', async () => {
      const mockHand = {
        hand_id: 'hand-1',
        hand_actions: null,
        hand_players: undefined,
        hand_tags: null,
      };

      supabase.single.mockResolvedValueOnce(mockHand);

      const hand = await dal.getHand('hand-1');

      expect(hand.hand_actions).toEqual([]);
      expect(hand.hand_players).toEqual([]);
      expect(hand.hand_tags).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('getHandBatch()', () => {
    test('should handle empty input gracefully', async () => {
      const map1 = await dal.getHandBatch([]);
      expect(map1.size).toBe(0);

      const map2 = await dal.getHandBatch(null);
      expect(map2.size).toBe(0);
    });

    test('should batch-load uncached hands', async () => {
      const ids = ['hand-1', 'hand-2', 'hand-3'];

      // Mock batch query
      const mockRows = ids.map(id => ({
        hand_id: id,
        hand_actions: [],
        hand_players: [],
        hand_tags: [],
      }));

      supabase.in.mockReturnThis();
      supabase.single.mockResolvedValueOnce(null); // Not used in batch
      // Mock the .in() chain for batch query
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };
      supabase.from.mockReturnValue(mockChain);
      mockChain.select.mockReturnValue(mockChain);
      mockChain.in.mockResolvedValueOnce(mockRows);

      const map = await dal.getHandBatch(ids);

      // KEY TEST: batch loader should return all 3, not 0
      expect(map.size).toBe(3);
      expect(map.has('hand-1')).toBe(true);
      expect(map.has('hand-2')).toBe(true);
      expect(map.has('hand-3')).toBe(true);
    });

    test('should cache fetched hands for deduplication', async () => {
      const mockChain = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };
      supabase.from.mockReturnValue(mockChain);
      mockChain.select.mockReturnValue(mockChain);

      const mockRows = [{ hand_id: 'hand-1', hand_actions: [], hand_players: [], hand_tags: [] }];
      mockChain.in.mockResolvedValueOnce(mockRows);

      // First batch call
      const map1 = await dal.getHandBatch(['hand-1']);
      expect(map1.size).toBe(1);

      // Second call for same ID should use cache (no DB call)
      const queryCountBefore = supabase.from.mock.calls.length;
      const map2 = await dal.getHandBatch(['hand-1']);
      const queryCountAfter = supabase.from.mock.calls.length;

      // Should not make a new query (cache hit)
      expect(queryCountAfter).toBe(queryCountBefore);
      expect(map2.size).toBe(1);
    });

    test('should isolate caches between requests', () => {
      const dal1 = new DataAccessLayer('req-1');
      const dal2 = new DataAccessLayer('req-2');

      // Populate dal1 cache
      dal1._getTableCache('hands').set('hand-1', Promise.resolve({ hand_id: 'hand-1' }));

      // dal2 cache should be empty
      expect(dal2.cache.has('hands')).toBe(false);

      // Clearing dal1 shouldn't affect dal2
      dal1.clear();
      expect(dal1.cache.size).toBe(0);
      expect(dal2.cache.has('hands')).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('Cache management', () => {
    test('should clear all caches', () => {
      dal._getTableCache('hands').set('h1', Promise.resolve({}));
      dal._getTableCache('tables').set('t1', Promise.resolve({}));

      expect(dal.cache.size).toBe(2);

      dal.clear();

      expect(dal.cache.size).toBe(0);
    });

    test('should create table caches on demand', () => {
      const handsCache = dal._getTableCache('hands');
      const tablesCache = dal._getTableCache('tables');

      expect(handsCache).not.toBe(tablesCache);
      expect(dal.cache.size).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('getTable()', () => {
    test('should use explicit columns (not SELECT *)', () => {
      const mockTable = {
        id: 'table-1',
        table_name: 'Test Table',
        table_status: 'active',
      };

      const mockChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValueOnce(mockTable),
      };
      supabase.from.mockReturnValue(mockChain);

      dal.getTable('table-1');

      // Verify select was called with explicit columns (not *)
      const selectCall = mockChain.select.mock.calls[0]?.[0];
      expect(selectCall).not.toBe('*');
      expect(selectCall).toContain('id');
      expect(selectCall).toContain('table_name');
    });
  });
});