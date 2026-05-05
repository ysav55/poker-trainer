'use strict';

/**
 * DataAccessLayer
 *
 * Request-scoped caching + eager-loading middleware for Supabase queries.
 *
 * Purpose:
 * 1. Batch identical queries within a request (deduplicate Promise)
 * 2. Eager-load common relationships (hand → actions, session → stats)
 * 3. Standardize query shape (explicit SELECT, no *)
 * 4. Provide middleware to inject into Express requests
 *
 * Philosophy:
 * - Lightweight; no external dependencies (vs DataLoader complexity)
 * - Request-scoped lifespan (GC'd after response sent)
 * - Opt-in via req.db.getHand() etc.
 * - Falls back to direct repo calls if not initialized
 *
 * Example usage in route:
 *   const hand = await req.db.getHand(handId);  // deduplicated + eager-loaded
 *   const hands = await req.db.getHandBatch([id1, id2, id3]);  // batch load
 */

const supabase = require('./supabase');
const { q } = require('./utils');

// ─── Cache Map Structure ──────────────────────────────────────────────────────
// requestCache = Map<table_name, Map<id, Promise>>
// Promises resolve to the full row with relationships

class DataAccessLayer {
  constructor(requestId = null) {
    this.requestId = requestId;
    this.cache = new Map(); // table → Map(id → promise)
    this.timer = null;
  }

  /**
   * Get or create cache for a table
   * @private
   */
  _getTableCache(tableName) {
    if (!this.cache.has(tableName)) {
      this.cache.set(tableName, new Map());
    }
    return this.cache.get(tableName);
  }

  /**
   * Fetch a single hand with all children (actions, players, tags)
   * Deduplicates within request: multiple calls for same ID share promise
   *
   * @param {string} handId
   * @returns {Promise<{hand_id, session_id, …, hand_actions: [], hand_players: [], hand_tags: []}>}
   */
  async getHand(handId) {
    if (!handId) throw new Error('handId required');

    const tableCache = this._getTableCache('hands');
    if (tableCache.has(handId)) {
      return tableCache.get(handId);
    }

    // Single query: hand + children via Supabase nested select
    // Note: Supabase supports * or explicit; prefer explicit columns
    const promise = q(
      supabase
        .from('hands')
        .select(
          'hand_id, session_id, table_id, started_at, completed_normally, ' +
          'dealer_seat, is_scenario_hand, small_blind, big_blind, ' +
          'session_type, table_mode, created_at, ' +
          'hand_actions(id, street, action, amount, player_id, position, actor_seat), ' +
          'hand_players(player_id, player_name, seat, position, stack_start, stack_end), ' +
          'hand_tags(tag, tag_type, player_id, action_id)'
        )
        .eq('hand_id', handId)
        .single()
    ).then(row => {
      // Normalize nested arrays
      return {
        ...row,
        hand_actions: row.hand_actions || [],
        hand_players: row.hand_players || [],
        hand_tags: row.hand_tags || [],
      };
    });

    tableCache.set(handId, promise);
    return promise;
  }

  /**
   * Batch-load multiple hands (deduplicates + caches within request)
   *
   * Key fixes:
   * 1. Don't set placeholders before fetching (causes empty results)
   * 2. Only fetch uncached IDs; reuse cached promises
   * 3. Return complete map of all requested + cached hands
   *
   * @param {string[]} handIds
   * @returns {Promise<Map<handId, hand>>}
   */
  async getHandBatch(handIds) {
    if (!Array.isArray(handIds) || handIds.length === 0) {
      return new Map();
    }

    const tableCache = this._getTableCache('hands');
    const result = new Map();

    // Step 1: Identify which IDs are already cached (don't fetch these)
    const uncachedIds = [];
    for (const id of handIds) {
      if (tableCache.has(id)) {
        // Already cached; will collect result at end
        continue;
      }
      uncachedIds.push(id);
    }

    // Step 2: Batch-fetch only the uncached IDs
    if (uncachedIds.length > 0) {
      const rows = await q(
        supabase
          .from('hands')
          .select(
            'hand_id, session_id, table_id, started_at, completed_normally, ' +
            'dealer_seat, is_scenario_hand, small_blind, big_blind, ' +
            'session_type, table_mode, created_at, ' +
            'hand_actions(id, street, action, amount, player_id, position, actor_seat), ' +
            'hand_players(player_id, player_name, seat, position, stack_start, stack_end), ' +
            'hand_tags(tag, tag_type, player_id, action_id)'
          )
          .in('hand_id', uncachedIds)
      );

      // Step 2a: Cache and collect fetched rows
      for (const row of rows) {
        const normalized = {
          ...row,
          hand_actions: row.hand_actions || [],
          hand_players: row.hand_players || [],
          hand_tags: row.hand_tags || [],
        };
        tableCache.set(row.hand_id, Promise.resolve(normalized));
        result.set(row.hand_id, normalized);
      }
    }

    // Step 3: Collect cached results (from previous requests)
    for (const id of handIds) {
      if (!result.has(id) && tableCache.has(id)) {
        const promise = tableCache.get(id);
        try {
          const resolved = await promise;
          if (resolved) {
            result.set(id, resolved);
          }
        } catch (err) {
          // Silent fail for cached promises that were rejected
          // (shouldn't happen, but defensive)
        }
      }
    }

    return result;
  }

  /**
   * Get session with stats joined
   * @param {string} sessionId
   * @returns {Promise<{session_id, table_id, …, session_player_stats: []}>}
   */
  async getSession(sessionId) {
    if (!sessionId) throw new Error('sessionId required');

    const tableCache = this._getTableCache('sessions');
    if (tableCache.has(sessionId)) {
      return tableCache.get(sessionId);
    }

    const promise = q(
      supabase
        .from('sessions')
        .select(
          'session_id, table_id, session_type, started_at, ended_at, ' +
          'session_player_stats(player_id, vpip, pfr, wtsd, wsd, quality_score)'
        )
        .eq('session_id', sessionId)
        .single()
    ).then(row => ({
      ...row,
      session_player_stats: row.session_player_stats || [],
    }));

    tableCache.set(sessionId, promise);
    return promise;
  }

  /**
   * Get table with school context (explicit columns, not SELECT *)
   * @param {string} tableId
   * @returns {Promise<{id, table_name, table_status, …}>}
   */
  async getTable(tableId) {
    if (!tableId) throw new Error('tableId required');

    const tableCache = this._getTableCache('tables');
    if (tableCache.has(tableId)) {
      return tableCache.get(tableId);
    }

    const promise = q(
      supabase
        .from('tables')
        .select(
          'id, table_name, table_status, table_type, table_mode, ' +
          'config, controller_id, school_id, privacy, ' +
          'created_by, created_at, updated_at'
        )
        .eq('id', tableId)
        .single()
    );

    tableCache.set(tableId, promise);
    return promise;
  }

  /**
   * Clear cache (on error or explicit reset)
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Express middleware factory
   * Usage: app.use(DataAccessLayer.middleware)
   *
   * Initializes request-scoped cache; clears after response.
   * Use req.db.getHand(), req.db.getHandBatch(), etc. in route handlers.
   */
  static middleware(req, res, next) {
    req.db = new DataAccessLayer(req.id);

    // Debug logging (only if DEBUG env var set to avoid log spam)
    if (process.env.DEBUG && req.db.requestId) {
      const log = require('../logs/logger');
      log.debug('dal', 'request_initialized', `[DAL] Request ${req.db.requestId} initialized`);
    }

    // Clear cache after response sent
    res.on('finish', () => {
      req.db.clear();
    });

    next();
  }
}

module.exports = DataAccessLayer;

/**
 * BACKLOG: Features to add as needed
 *
 * - getHandBatchWithReplay(handIds) — specialized for replay (no hand_tags, eager load actions)
 * - getTournament(tournamentId) — with standings, players
 * - getScenario(scenarioId) — with playlist items
 * - Metrics: cache hit rate, query count per request
 * - Timeout handling (stale cache fallback)
 * - Distributed cache support (Redis) if multi-instance
 */
