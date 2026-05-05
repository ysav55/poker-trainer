'use strict';

/**
 * server/jobs/snapshotJob.js
 *
 * Weekly performance-snapshot job.
 * Aggregates session_player_stats + mistake hand_tags per player into
 * player_performance_snapshots for the rolling 7-day window ending at run time.
 *
 * Schedule: every Sunday at 00:00 UTC (first fire delayed until next Sunday).
 * Call scheduleSundaySnapshot() once at server start.
 */

const supabase   = require('../db/supabase');
const CRMRepo    = require('../db/repositories/CRMRepository');
const PlayerRepo = require('../db/repositories/PlayerRepository');

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a Date set to the next Sunday 00:00:00.000 UTC after `from`.
 * If `from` is already a Sunday, the *following* Sunday is returned so the
 * job fires one week later (not immediately on server start).
 */
function getNextSundayUTC(from) {
  const d = new Date(from);
  // Sunday = 0 in getUTCDay()
  const daysUntilSunday = (7 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSunday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Aggregate an array of session_player_stats rows into a single snapshot object.
 */
function aggregateStats(rows) {
  if (!rows || rows.length === 0) {
    return {
      hands_played:         0,
      net_chips:            0,
      vpip_pct:             null,
      pfr_pct:              null,
      wtsd_pct:             null,
      wsd_pct:              null,
      three_bet_pct:        null,
      avg_decision_time_ms: null,
    };
  }

  let totalHands = 0;
  let totalNetChips = 0;
  let vpipSum = 0, pfrSum = 0, wtsdSum = 0, wsdSum = 0;
  let rowsWithVpip = 0, rowsWithPfr = 0, rowsWithWtsd = 0, rowsWithWsd = 0;

  for (const r of rows) {
    const h = r.hands_played ?? 0;
    totalHands    += h;
    totalNetChips += r.net_chips ?? 0;

    if (r.vpip != null) { vpipSum += r.vpip; rowsWithVpip++; }
    if (r.pfr  != null) { pfrSum  += r.pfr;  rowsWithPfr++;  }
    if (r.wtsd != null) { wtsdSum += r.wtsd; rowsWithWtsd++; }
    if (r.wsd  != null) { wsdSum  += r.wsd;  rowsWithWsd++;  }
  }

  return {
    hands_played:         totalHands,
    net_chips:            totalNetChips,
    vpip_pct:             rowsWithVpip > 0 ? parseFloat((vpipSum / rowsWithVpip).toFixed(2)) : null,
    pfr_pct:              rowsWithPfr  > 0 ? parseFloat((pfrSum  / rowsWithPfr ).toFixed(2)) : null,
    wtsd_pct:             rowsWithWtsd > 0 ? parseFloat((wtsdSum / rowsWithWtsd).toFixed(2)) : null,
    wsd_pct:              rowsWithWsd  > 0 ? parseFloat((wsdSum  / rowsWithWsd ).toFixed(2)) : null,
    three_bet_pct:        null, // not stored in session_player_stats; derived from hand_tags if needed
    avg_decision_time_ms: null, // not yet captured at session level
  };
}

/**
 * Count tag occurrences and return the top-N most frequent.
 * @param {{ tag: string }[]} tagRows
 * @param {number} n
 * @returns {string[]}
 */
function getTopN(tagRows, n) {
  const freq = {};
  for (const { tag } of tagRows) {
    freq[tag] = (freq[tag] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag]) => tag);
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Compute and upsert weekly snapshots for all active players.
 * Safe to call manually (idempotent via ON CONFLICT upsert).
 */
async function computeAllSnapshots() {
  const periodEnd   = new Date();
  const periodStart = new Date(periodEnd.getTime() - ONE_WEEK_MS);

  const periodStartStr = periodStart.toISOString().split('T')[0];
  const periodEndStr   = periodEnd.toISOString().split('T')[0];

  console.log(`[snapshotJob] Computing snapshots for period ${periodStartStr} – ${periodEndStr}`);

  let players;
  try {
    players = await PlayerRepo.listPlayers({ status: 'active', limit: 1000 });
  } catch (err) {
    console.error('[snapshotJob] Failed to list players:', err.message);
    return;
  }

  let succeeded = 0;
  let failed    = 0;

  for (const player of players) {
    try {
      // 1. Session stats for the period
      const { data: statsRows, error: statsErr } = await supabase
        .from('session_player_stats')
        .select('hands_played, net_chips, vpip, pfr, wtsd, wsd')
        .eq('player_id', player.id)
        .gte('created_at', periodStart.toISOString());

      if (statsErr) throw new Error(statsErr.message);

      const snapshot = aggregateStats(statsRows ?? []);

      // 2. Top mistake tags for the period
      const { data: tagRows, error: tagErr } = await supabase
        .from('hand_tags')
        .select('tag')
        .eq('player_id', player.id)
        .eq('tag_type', 'mistake')
        .gte('created_at', periodStart.toISOString());

      if (tagErr) throw new Error(tagErr.message);

      snapshot.most_common_mistakes = getTopN(tagRows ?? [], 3);

      // 3. Upsert
      await CRMRepo.upsertSnapshot(player.id, periodStartStr, periodEndStr, snapshot);
      succeeded++;
    } catch (err) {
      console.error(`[snapshotJob] Failed for player ${player.id}:`, err.message);
      failed++;
    }
  }

  console.log(`[snapshotJob] Done — ${succeeded} succeeded, ${failed} failed`);
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

/**
 * Schedule the snapshot job to fire every Sunday at 00:00 UTC.
 * Call once at server start.
 */
function scheduleSundaySnapshot() {
  const now        = new Date();
  const nextSunday = getNextSundayUTC(now);
  const delayMs    = nextSunday - now;

  console.log(`[snapshotJob] Next snapshot scheduled for ${nextSunday.toISOString()} (in ${Math.round(delayMs / 3600000)}h)`);

  setTimeout(() => {
    computeAllSnapshots().catch(err =>
      console.error('[snapshotJob] Weekly run failed:', err.message)
    );
    // Repeat every 7 days after the first fire
    setInterval(() => {
      computeAllSnapshots().catch(err =>
        console.error('[snapshotJob] Weekly run failed:', err.message)
      );
    }, ONE_WEEK_MS);
  }, delayMs);
}

module.exports = { scheduleSundaySnapshot, computeAllSnapshots, aggregateStats, getTopN, getNextSundayUTC };
