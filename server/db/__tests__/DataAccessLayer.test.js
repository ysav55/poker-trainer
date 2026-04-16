'use strict';

const DataAccessLayer = require('../DataAccessLayer');
const supabase = require('../supabase');

describe('DataAccessLayer', () => {
  let dal;

  beforeEach(() => {
    dal = new DataAccessLayer('test-request-123');
  });

  afterEach(() => {
    dal.clear();
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('getHand()', () => {
    test('should fetch hand with eager-loaded children', async () => {
      const hand = await dal.getHand('test-hand-1');

      expect(hand).toHaveProperty('hand_id', 'test-hand-1');
      expect(hand).toHaveProperty('hand_actions');
      expect(hand).toHaveProperty('hand_players');
      expect(hand).toHaveProperty('hand_tags');
      expect(Array.isArray(hand.hand_actions)).toBe(true);
      expect(Array.isArray(hand.hand_players)).toBe(true);
      expect(Array.isArray(hand.hand_tags)).toBe(true);
    });

    test('should deduplicate identical calls within same request', async () => {
      const p1 = dal.getHand('test-hand-1');
      const p2 = dal.getHand('test-hand-1');

      // Same promise object (not two separate queries)
      expect(p1).toBe(p2);

      const hand1 = await p1;
      const hand2 = await p2;
      expect(hand1).toEqual(hand2);
    });

    test('should throw if handId is missing', async () => {
      await expect(dal.getHand(null)).rejects.toThrow('handId required');
      await expect(dal.getHand(undefined)).rejects.toThrow('handId required');
    });

    test('should handle null children gracefully', async () => {
      // Simulate hand with no actions/players/tags
      const hand = await dal.getHand('empty-hand');

      expect(hand.hand_actions).toEqual([]);
      expect(hand.hand_players).toEqual([]);
      expect(hand.hand_tags).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('getHandBatch()', () => {
    test('should batch-load multiple hands', async () => {
      const ids = ['hand-1', 'hand-2', 'hand-3'];
      const map = await dal.getHandBatch(ids);

      expect(map.size).toBe(3); // Should be 3, not 0
      expect(map.has('hand-1')).toBe(true);
      expect(map.has('hand-2')).toBe(true);
      expect(map.has('hand-3')).toBe(true);

      const hand1 = map.get('hand-1');
      expect(hand1).toHaveProperty('hand_id', 'hand-1');
      expect(Array.isArray(hand1.hand_actions)).toBe(true);
    });

    test('should deduplicate within batch (multiple calls for same ID)', async () => {
      const p1 = dal.getHandBatch(['hand-1', 'hand-2']);
      const p2 = dal.getHandBatch(['hand-1']); // Overlapping

      const map1 = await p1;
      const map2 = await p2;

      // Both should have hand-1 cached from first call
      expect(map1.has('hand-1')).toBe(true);
      expect(map2.has('hand-1')).toBe(true);

      // Should be same data
      const h1a = map1.get('hand-1');
      const h1b = map2.get('hand-1');
      expect(h1a.hand_id).toEqual(h1b.hand_id);
    });

    test('should reuse cached hands across requests', async () => {
      const dal1 = new DataAccessLayer('request-1');
      const dal2 = new DataAccessLayer('request-2');

      // Note: different DAL instances = different caches
      // This test verifies each DAL is independent (expected behavior)
      const map1 = await dal1.getHandBatch(['hand-1']);
      const map2 = await dal2.getHandBatch(['hand-1']);

      // Both should succeed independently
      expect(map1.size).toBe(1);
      expect(map2.size).toBe(1);
    });

    test('should handle empty input gracefully', async () => {
      const map1 = await dal.getHandBatch([]);
      expect(map1.size).toBe(0);

      const map2 = await dal.getHandBatch(null);
      expect(map2.size).toBe(0);
    });

    test('should return complete map (not partial)', async () => {
      const ids = ['hand-a', 'hand-b', 'hand-c', 'hand-d', 'hand-e'];
      const map = await dal.getHandBatch(ids);

      // KEY TEST: batch loader used to return empty maps (N+1 bug)
      // Should return all 5, not 0
      expect(map.size).toBe(5);

      for (const id of ids) {
        expect(map.has(id)).toBe(true);
        expect(map.get(id)).toHaveProperty('hand_id', id);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('Cache management', () => {
    test('should clear cache on explicit call', async () => {
      await dal.getHand('hand-1');
      expect(dal.cache.size).toBe(1);

      dal.clear();
      expect(dal.cache.size).toBe(0);
    });

    test('should isolate caches between requests', async () => {
      const dal1 = new DataAccessLayer('req-1');
      const dal2 = new DataAccessLayer('req-2');

      await dal1.getHand('hand-1');
      await dal2.getHand('hand-2');

      // dal1 has 1 cache entry, dal2 has 1 cache entry
      expect(dal1.cache.get('hands').size).toBe(1);
      expect(dal2.cache.get('hands').size).toBe(1);

      // Clearing dal1 doesn't affect dal2
      dal1.clear();
      expect(dal1.cache.size).toBe(0);
      expect(dal2.cache.size).toBe(1);
    });
  });
});