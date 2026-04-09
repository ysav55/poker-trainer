'use strict';

const supabase = require('../db/supabase');
const { requireFeature } = require('../auth/featureGate');

/**
 * GET /api/analysis/tags
 *   Query params: playerId, dateFrom, dateTo, tagType
 *   Returns: { totalHands, tags: [{ tag, tag_type, count, pct }] }
 *
 * GET /api/analysis/hands-by-tag
 *   Query params: tag (required), playerId, dateFrom, dateTo
 *   Returns: { hands: [{ hand_id, started_at, winner_name, final_pot, table_id, board, tags }] }
 */
module.exports = function registerAnalysisRoutes(app, { requireAuth }) {

  // ── Tag aggregation ────────────────────────────────────────────────────────

  app.get('/api/analysis/tags', requireAuth, requireFeature('analysis'), async (req, res) => {
    try {
      const { playerId, dateFrom, dateTo, tagType, gameType } = req.query;

      const handIds = await getHandIds({ playerId, dateFrom, dateTo, gameType });
      if (handIds.size === 0) {
        return res.json({ totalHands: 0, tags: [] });
      }

      const handIdArr = [...handIds];

      // Supabase IN clause is fine for up to a few thousand; coaches have bounded history
      let tagQuery = supabase
        .from('hand_tags')
        .select('tag, tag_type, hand_id')
        .in('hand_id', handIdArr);

      if (playerId) {
        // Include player-attributed tags AND hand-level tags (player_id IS NULL)
        tagQuery = tagQuery.or(`player_id.eq.${playerId},player_id.is.null`);
      }
      if (tagType) {
        tagQuery = tagQuery.eq('tag_type', tagType);
      }

      const { data: tagRows, error } = await tagQuery;
      if (error) throw new Error(error.message);

      // Aggregate: count distinct hand_ids per (tag, tag_type)
      const tagMap = new Map();
      for (const row of (tagRows || [])) {
        const key = `${row.tag_type}||${row.tag}`;
        if (!tagMap.has(key)) {
          tagMap.set(key, { tag: row.tag, tag_type: row.tag_type, handSet: new Set() });
        }
        tagMap.get(key).handSet.add(row.hand_id);
      }

      const totalHands = handIds.size;
      const tags = [...tagMap.values()]
        .map(t => ({
          tag:      t.tag,
          tag_type: t.tag_type,
          count:    t.handSet.size,
          pct:      Math.round(t.handSet.size / totalHands * 100),
        }))
        .sort((a, b) => b.count - a.count);

      res.json({ totalHands, tags });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });

  // ── Hands for a specific tag ───────────────────────────────────────────────

  app.get('/api/analysis/hands-by-tag', requireAuth, requireFeature('analysis'), async (req, res) => {
    try {
      const { tag, playerId, dateFrom, dateTo, gameType } = req.query;
      if (!tag) return res.status(400).json({ error: 'tag is required' });

      const handIds = await getHandIds({ playerId, dateFrom, dateTo, gameType });
      if (handIds.size === 0) return res.json({ hands: [] });

      const { data: tagRows, error: tErr } = await supabase
        .from('hand_tags')
        .select('hand_id')
        .eq('tag', tag)
        .in('hand_id', [...handIds]);

      if (tErr) throw new Error(tErr.message);

      const matchingIds = [...new Set((tagRows || []).map(r => r.hand_id))];
      if (matchingIds.length === 0) return res.json({ hands: [] });

      const { data: hands, error: hErr } = await supabase
        .from('hands')
        .select('hand_id, started_at, winner_name, final_pot, table_id, board, hand_tags(tag, tag_type)')
        .in('hand_id', matchingIds)
        .order('started_at', { ascending: false })
        .limit(50);

      if (hErr) throw new Error(hErr.message);

      res.json({
        hands: (hands || []).map(h => ({
          hand_id:     h.hand_id,
          started_at:  h.started_at,
          winner_name: h.winner_name,
          final_pot:   h.final_pot,
          table_id:    h.table_id,
          board:       h.board || [],
          tags:        (h.hand_tags || []).map(t => t.tag),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'internal_error' });
    }
  });
};

// ── Shared helper ──────────────────────────────────────────────────────────────

// gameType → table_mode values
const GAME_TYPE_MODES = {
  cash:       ['coached_cash', 'uncoached_cash', 'bot_cash'],
  tournament: ['tournament'],
};

async function getHandIds({ playerId, dateFrom, dateTo, gameType } = {}) {
  if (playerId) {
    // Hands this specific player was seated at
    let query = supabase
      .from('hand_players')
      .select('hand_id, hands!inner(started_at, table_mode)')
      .eq('player_id', playerId);
    if (dateFrom) query = query.gte('hands.started_at', dateFrom);
    if (dateTo)   query = query.lte('hands.started_at', dateTo);
    if (gameType && GAME_TYPE_MODES[gameType]) {
      query = query.in('hands.table_mode', GAME_TYPE_MODES[gameType]);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return new Set((data || []).map(r => r.hand_id));
  }

  // All hands (possibly date-filtered)
  let query = supabase.from('hands').select('hand_id');
  if (dateFrom) query = query.gte('started_at', dateFrom);
  if (dateTo)   query = query.lte('started_at', dateTo);
  if (gameType && GAME_TYPE_MODES[gameType]) {
    query = query.in('table_mode', GAME_TYPE_MODES[gameType]);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Set((data || []).map(r => r.hand_id));
}
