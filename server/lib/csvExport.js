'use strict';

/**
 * Escape a value for CSV output.
 * If the value contains comma, quote, or newline, wrap in quotes and escape quotes.
 */
function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Stream hands as CSV to the response.
 * Headers: hand_id, started_at, phase_ended, winner, pot_end, board, auto_tags
 *
 * @param {Object} res - Express response object
 * @param {Array} hands - Array of hand objects from DB
 */
async function streamCsv(res, hands) {
  const headers = ['hand_id', 'started_at', 'phase_ended', 'winner', 'pot_end', 'board', 'auto_tags'];
  res.write(headers.map(escapeCsv).join(',') + '\n');

  for (const h of hands) {
    const row = [
      h.hand_id,
      h.started_at,
      h.phase_ended,
      h.winner_name ?? h.winner ?? '',
      h.final_pot ?? h.pot_end ?? '',
      Array.isArray(h.board) ? h.board.join(' ') : (h.board ?? ''),
      Array.isArray(h.auto_tags) ? h.auto_tags.join('|') : (h.auto_tags ?? ''),
    ];
    res.write(row.map(escapeCsv).join(',') + '\n');
  }
  res.end();
}

module.exports = { streamCsv };
