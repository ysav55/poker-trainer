'use strict';

const supabase = require('../supabase');
const { q, parseTags } = require('../utils');

// ─── Session ──────────────────────────────────────────────────────────────────

async function ensureSession(sessionId, tableId) {
  await q(supabase.from('sessions').upsert(
    { session_id: sessionId, table_id: tableId, started_at: new Date().toISOString() },
    { onConflict: 'session_id', ignoreDuplicates: true }
  ));
}

async function getSessionStats(sessionId) {
  const data = await q(
    supabase.from('session_player_stats')
      .select('*')
      .eq('session_id', sessionId)
  );
  return (data || []).map(r => ({
    player_id:    r.player_id,
    player_name:  r.display_name,
    hands_played: r.hands_played,
    hands_won:    r.hands_won,
    net_chips:    r.net_chips,
    vpip: r.hands_played > 0 ? Math.round(r.vpip_count / r.hands_played * 1000) / 1000 : 0,
    pfr:  r.hands_played > 0 ? Math.round(r.pfr_count  / r.hands_played * 1000) / 1000 : 0,
  }));
}

async function getSessionReport(sessionId) {
  const session = await q(
    supabase.from('sessions').select('*').eq('session_id', sessionId).maybeSingle()
  );
  if (!session) return null;

  const statsRows = await q(
    supabase.from('session_player_stats').select('*').eq('session_id', sessionId)
  );

  const hands = await q(
    supabase.from('hands')
      .select('*, hand_tags(tag, tag_type), hand_players(player_id, player_name, seat, stack_start, stack_end, is_winner, hole_cards)')
      .eq('session_id', sessionId)
      .order('started_at', { ascending: true })
  );

  const handCount = (hands || []).length;
  if (handCount === 0) {
    return { session: { ...session, hand_count: 0 }, players: [], hands: [], tag_summary: {}, mistake_summary: {} };
  }

  const players = (statsRows || []).map(r => ({
    stableId:     r.player_id,
    name:         r.display_name,
    hands_played: r.hands_played,
    hands_won:    r.hands_won,
    net_chips:    r.net_chips,
    vpip:  r.hands_played > 0 ? Math.round(r.vpip_count / r.hands_played * 100) : 0,
    pfr:   r.hands_played > 0 ? Math.round(r.pfr_count  / r.hands_played * 100) : 0,
    wtsd:  r.hands_played > 0 ? Math.round(r.wtsd_count / r.hands_played * 100) : 0,
    wsd:   r.wtsd_count > 0   ? Math.round(r.wsd_count  / r.wtsd_count   * 100) : 0,
  })).sort((a, b) => b.net_chips - a.net_chips);

  const tagSummary     = {};
  const mistakeSummary = {};

  const handsDetail = (hands || []).map(h => {
    const { auto_tags, mistake_tags, coach_tags } = parseTags(h.hand_tags);
    for (const t of auto_tags) tagSummary[t] = (tagSummary[t] || 0) + 1;
    for (const t of mistake_tags) {
      if (!mistakeSummary[t]) mistakeSummary[t] = { count: 0, hands: [] };
      mistakeSummary[t].count++;
      mistakeSummary[t].hands.push(h.hand_id);
    }
    return {
      hand_id:     h.hand_id,
      started_at:  h.started_at,
      ended_at:    h.ended_at,
      board:       h.board || [],
      final_pot:   h.final_pot,
      winner_name: h.winner_name,
      phase_ended: h.phase_ended,
      auto_tags, mistake_tags, coach_tags,
      players: (h.hand_players || []).map(p => ({
        player_id:   p.player_id,
        player_name: p.player_name,
        seat:        p.seat,
        stack_start: p.stack_start,
        stack_end:   p.stack_end,
        is_winner:   p.is_winner,
        hole_cards:  p.hole_cards || [],
      })),
    };
  });

  const ended_at = hands[hands.length - 1]?.ended_at || null;
  return {
    session: { ...session, hand_count: handCount, ended_at },
    players,
    hands:           handsDetail,
    tag_summary:     tagSummary,
    mistake_summary: mistakeSummary,
  };
}

module.exports = { ensureSession, getSessionStats, getSessionReport };
