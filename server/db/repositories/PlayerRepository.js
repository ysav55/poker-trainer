'use strict';

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const { q, parseTags } = require('../utils');

// ─── Player Identity ──────────────────────────────────────────────────────────

async function upsertPlayerIdentity(stableId, name) {
  await q(supabase.from('player_profiles').upsert({
    id:           stableId,
    display_name: name,
    last_seen:    new Date().toISOString(),
  }, { onConflict: 'id' }));
}

async function getPlayerStats(stableId) {
  const data = await q(
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle()
  );
  if (!data) return null;
  const totalHands = data.total_hands ?? 0;
  const vpipCount  = data.vpip_count  ?? 0;
  const pfrCount   = data.pfr_count   ?? 0;
  return {
    player_id:       data.player_id,
    latest_name:     data.display_name,
    total_hands:     totalHands,
    total_wins:      data.total_wins   ?? 0,
    total_net_chips: data.net_chips    ?? 0,
    vpip_percent:    totalHands > 0 ? Math.round(vpipCount / totalHands * 100) : 0,
    pfr_percent:     totalHands > 0 ? Math.round(pfrCount  / totalHands * 100) : 0,
  };
}

async function getAllPlayersWithStats() {
  const data = await q(
    supabase.from('leaderboard').select('*').order('net_chips', { ascending: false })
  );
  return (data || []).map(r => {
    const total = r.total_hands ?? 0;
    return {
      stableId:        r.player_id,
      name:            r.display_name,
      total_hands:     total,
      total_wins:      r.total_wins   ?? 0,
      total_net_chips: r.net_chips    ?? 0,
      vpip_percent:    total > 0 ? Math.round((r.vpip_count ?? 0) / total * 100) : 0,
      pfr_percent:     total > 0 ? Math.round((r.pfr_count  ?? 0) / total * 100) : 0,
      last_hand_at:    r.last_hand_at,
    };
  });
}

/**
 * Returns { allTime, session } for the PlayerSeat hover tooltip.
 * allTime — row from leaderboard table (or null)
 * session — row from session_player_stats (or null if no sessionId given)
 */
async function getPlayerHoverStats(stableId, sessionId) {
  const [allTimeResult, sessionResult] = await Promise.all([
    supabase.from('leaderboard').select('*').eq('player_id', stableId).maybeSingle(),
    sessionId
      ? supabase.from('session_player_stats').select('*').eq('session_id', sessionId).eq('player_id', stableId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    allTime: allTimeResult.data ?? null,
    session: sessionResult.data  ?? null,
  };
}

async function getPlayerHands(stableId, { limit = 20, offset = 0 } = {}) {
  const data = await q(
    supabase.from('hand_players')
      .select('*, hands(hand_id, started_at, ended_at, final_pot, winner_id, winner_name, phase_ended, board, table_id, hand_tags(tag, tag_type))')
      .eq('player_id', stableId)
      .order('started_at', { foreignTable: 'hands', ascending: false })
      .range(offset, offset + limit - 1)
  );

  return (data || []).map(hp => ({
    hand_id:     hp.hands?.hand_id,
    started_at:  hp.hands?.started_at,
    ended_at:    hp.hands?.ended_at,
    final_pot:   hp.hands?.final_pot,
    winner_id:   hp.hands?.winner_id,
    winner_name: hp.hands?.winner_name,
    phase_ended: hp.hands?.phase_ended,
    board:       hp.hands?.board || [],
    table_id:    hp.hands?.table_id,
    ...parseTags(hp.hands?.hand_tags),
    hole_cards:  hp.hole_cards || [],
    stack_start: hp.stack_start,
    stack_end:   hp.stack_end,
    is_winner:   hp.is_winner,
    vpip:        hp.vpip,
    pfr:         hp.pfr,
    wtsd:        hp.wtsd,
    wsd:         hp.wsd,
    seat:        hp.seat,
  }));
}

// ─── Roster Auth ──────────────────────────────────────────────────────────────

async function loginRosterPlayer(name) {
  const trimmed = name.trim();

  const existing = await q(
    supabase.from('player_profiles')
      .select('id, display_name')
      .eq('display_name', trimmed)
      .limit(1)
      .maybeSingle()
  );

  if (existing) {
    await q(supabase.from('player_profiles').update({
      is_roster: true,
      last_seen: new Date().toISOString(),
    }).eq('id', existing.id));
    return { stableId: existing.id, name: existing.display_name };
  }

  const stableId = uuidv4();
  await q(supabase.from('player_profiles').insert({
    id:           stableId,
    display_name: trimmed,
    is_roster:    true,
    last_seen:    new Date().toISOString(),
  }));
  return { stableId, name: trimmed };
}

async function isRegisteredPlayer(stableId) {
  if (!stableId) return false;
  const data = await q(
    supabase.from('player_profiles')
      .select('id, is_roster')
      .eq('id', stableId)
      .maybeSingle()
  );
  return !!(data && data.is_roster);
}

module.exports = {
  upsertPlayerIdentity, getPlayerStats, getAllPlayersWithStats,
  getPlayerHoverStats, getPlayerHands, loginRosterPlayer, isRegisteredPlayer,
};
