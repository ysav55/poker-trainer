'use strict';

const ExcelJS = require('exceljs');

/**
 * Stream hands as XLSX (Excel) to the response.
 * Workbook includes 4 sheets:
 *  1. Hands: Per-hand rows
 *  2. Auto-tag breakdown: Aggregated tag frequency
 *  3. Stats: Summary stats (hand count, biggest pot)
 *  4. Players: Player aggregates (hands played, biggest pot won)
 *
 * @param {Object} res - Express response object
 * @param {Array} hands - Array of hand objects from DB
 */
async function streamXlsx(res, hands) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: false,
    useSharedStrings: false,
  });

  // ─── Sheet 1: Hands (per-hand rows)
  const handsSheet = workbook.addWorksheet('Hands');
  handsSheet.addRow(['hand_id', 'started_at', 'phase_ended', 'winner', 'pot_end', 'board', 'auto_tags']).commit();

  for (const h of hands) {
    handsSheet.addRow([
      h.hand_id,
      h.started_at,
      h.phase_ended,
      h.winner_name ?? h.winner ?? '',
      h.final_pot ?? h.pot_end ?? '',
      Array.isArray(h.board) ? h.board.join(' ') : (h.board ?? ''),
      Array.isArray(h.auto_tags) ? h.auto_tags.join('|') : (h.auto_tags ?? ''),
    ]).commit();
  }
  handsSheet.commit();

  // ─── Sheet 2: Auto-tag breakdown
  const tagSheet = workbook.addWorksheet('Auto-tag breakdown');
  tagSheet.addRow(['tag', 'count']).commit();

  const tagCounts = new Map();
  for (const h of hands) {
    const tags = Array.isArray(h.auto_tags) ? h.auto_tags : [];
    for (const t of tags) {
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
  }

  const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tag, count] of sortedTags) {
    tagSheet.addRow([tag, count]).commit();
  }
  tagSheet.commit();

  // ─── Sheet 3: Stats
  const statsSheet = workbook.addWorksheet('Stats');
  statsSheet.addRow(['metric', 'value']).commit();

  const biggestPot = hands.reduce((max, h) => Math.max(max, h.final_pot ?? h.pot_end ?? 0), 0);
  const completedNormally = hands.filter(h => h.completed_normally === true).length;

  statsSheet.addRow(['Total hands', hands.length]).commit();
  statsSheet.addRow(['Completed normally', completedNormally]).commit();
  statsSheet.addRow(['Biggest pot', biggestPot]).commit();
  statsSheet.commit();

  // ─── Sheet 4: Players
  const playersSheet = workbook.addWorksheet('Players');
  playersSheet.addRow(['name', 'hands_played', 'hands_won', 'biggest_pot']).commit();

  const playerStats = new Map();
  for (const h of hands) {
    const winner = h.winner_name ?? h.winner;
    if (!winner) continue;

    if (!playerStats.has(winner)) {
      playerStats.set(winner, { played: 0, won: 0, biggestPot: 0 });
    }
    const stats = playerStats.get(winner);
    stats.played += 1;
    stats.won += 1; // Counting winner instances
    stats.biggestPot = Math.max(stats.biggestPot, h.final_pot ?? h.pot_end ?? 0);
  }

  const sortedPlayers = [...playerStats.entries()].sort((a, b) => b[1].won - a[1].won);
  for (const [name, stats] of sortedPlayers) {
    playersSheet.addRow([name, stats.played, stats.won, stats.biggestPot]).commit();
  }
  playersSheet.commit();

  await workbook.commit();
}

module.exports = { streamXlsx };
