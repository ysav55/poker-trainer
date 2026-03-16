'use strict';

/**
 * SessionReport.js — generates a self-contained dark-theme HTML report
 * from the data object returned by HandLogger.getSessionReport().
 */

/** Escape user-supplied strings before interpolating into HTML to prevent XSS. */
function esc(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const TAG_DESCRIPTIONS = {
  WALK:           'Walk (BB wins uncontested)',
  '3BET_POT':     '3-Bet Pot',
  C_BET:          'Continuation Bet',
  CHECK_RAISE:    'Check-Raise',
  BLUFF_CATCH:    'Bluff Catch',
  WHALE_POT:      'Whale Pot (150+ BB)',
  MULTIWAY:       'Multiway Pot (3+ players)',
  ALL_IN_PREFLOP: 'All-In Preflop',
  LIMPED_POT:     'Limped Pot',
  DONK_BET:       'Donk Bet',
  MONOTONE_BOARD: 'Monotone Board',
  PAIRED_BOARD:   'Paired Board',
  RIVER_RAISE:    'River Raise',
  OVERBET:        'Overbet (>2× pot)',
  UNDO_USED:      'Undo Used',
  OPEN_LIMP:      'Open Limp',
  MIN_RAISE:      'Min-Raise',
};

// Card suit colours for inline card rendering
const SUIT_COLOR = { h: '#ef4444', d: '#ef4444', c: '#e2e8f0', s: '#e2e8f0' };
const SUIT_SYMBOL = { h: '♥', d: '♦', c: '♣', s: '♠' };

function renderCard(card) {
  if (!card || card.length < 2) return '<span class="card empty">?</span>';
  const rank = card[0];
  const suit = card[1];
  const color = SUIT_COLOR[suit] || '#e2e8f0';
  const sym   = SUIT_SYMBOL[suit] || suit;
  return `<span class="card" style="color:${color}">${rank}${sym}</span>`;
}

function renderBoard(board) {
  if (!board || board.length === 0) return '<span style="color:#4b5563">—</span>';
  return board.filter(Boolean).map(renderCard).join(' ');
}

function renderCards(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return '<span style="color:#4b5563">—</span>';
  return cards.filter(Boolean).map(renderCard).join(' ');
}

function fmtTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const secs = Math.round((end - start) / 1000);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function chip(label, color = '#d4af37') {
  return `<span class="tag" style="border-color:${color};color:${color}">${label}</span>`;
}

function renderTagChips(tags, isAutoTag = true) {
  if (!tags || tags.length === 0) return '';
  return tags.map(t => {
    const color = isAutoTag ? '#d4af37' : '#f87171';
    return chip(TAG_DESCRIPTIONS[t] || t, color);
  }).join('');
}

/**
 * generateHTMLReport(reportData) → string (full HTML page)
 *
 * reportData shape: same as HandLogger.getSessionReport() return value.
 */
function generateHTMLReport(reportData) {
  const { session, players, hands, tag_summary, mistake_summary } = reportData;
  const totalHands = session.hand_count || hands.length;

  // Key hands: hands with coach tags OR ≥2 auto tags
  const keyHands = hands.filter(h => h.coach_tags.length > 0 || h.auto_tags.length >= 2);

  // Tag summary sorted by count
  const sortedTags = Object.entries(tag_summary)
    .sort((a, b) => b[1] - a[1]);

  // ── CSS ──────────────────────────────────────────────────────────────────────
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0d1117; color: #e2e8f0; font-size: 14px; line-height: 1.5;
           padding: 24px; max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 22px; font-weight: 700; color: #d4af37; letter-spacing: 0.06em; }
    h2 { font-size: 15px; font-weight: 700; color: #d4af37; letter-spacing: 0.1em;
         text-transform: uppercase; margin-bottom: 12px; padding-bottom: 6px;
         border-bottom: 1px solid #21262d; }
    h3 { font-size: 13px; font-weight: 600; color: #94a3b8; margin-bottom: 8px; }
    section { background: #161b22; border: 1px solid #21262d; border-radius: 8px;
              padding: 20px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; font-weight: 700; color: #6e7681;
         letter-spacing: 0.08em; text-transform: uppercase; padding: 6px 8px;
         border-bottom: 1px solid #21262d; }
    td { padding: 7px 8px; border-bottom: 1px solid #161b22; font-size: 13px; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .num  { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: 'Courier New', monospace; }
    .pos  { color: #3fb950; }
    .neg  { color: #f85149; }
    .gold { color: #d4af37; font-weight: 600; }
    .dim  { color: #6e7681; }
    .card { font-family: 'Courier New', monospace; font-weight: 700; font-size: 13px;
            margin-right: 2px; }
    .card.empty { color: #4b5563; }
    .tag  { display: inline-block; border: 1px solid; border-radius: 4px;
            padding: 1px 6px; font-size: 10px; font-weight: 600; margin: 1px 2px;
            letter-spacing: 0.04em; white-space: nowrap; }
    .bar-wrap { background: #0d1117; border-radius: 3px; height: 6px;
                display: inline-block; width: 120px; vertical-align: middle; margin-left: 8px; }
    .bar  { height: 6px; border-radius: 3px; background: #d4af37; display: block; }
    .hand-detail { background: #0d1117; border: 1px solid #21262d; border-radius: 6px;
                   padding: 14px; margin-bottom: 12px; }
    summary { cursor: pointer; list-style: none; color: #6e7681; font-size: 11px;
              margin-top: 6px; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▸ '; }
    details[open] summary::before { content: '▾ '; }
    .header-meta { color: #8b949e; font-size: 13px; margin-top: 4px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 640px) { .grid-2 { grid-template-columns: 1fr; } body { padding: 12px; } }
    @media print { body { background: white; color: black; }
                   section { border-color: #ccc; background: #f9f9f9; }
                   h1,h2,.gold { color: #9a7d1a; } }
  `;

  // ── Header ───────────────────────────────────────────────────────────────────
  const headerHTML = `
    <section>
      <h1>Session Report</h1>
      <div class="header-meta">
        ${fmtDate(session.started_at)} &nbsp;·&nbsp;
        ${fmtTime(session.started_at)} – ${fmtTime(session.ended_at)} &nbsp;·&nbsp;
        Duration: ${fmtDuration(session.started_at, session.ended_at)} &nbsp;·&nbsp;
        <span class="gold">${totalHands}</span> hand${totalHands !== 1 ? 's' : ''}
        ${session.table_id ? `&nbsp;·&nbsp; Table: <span class="gold">${session.table_id}</span>` : ''}
      </div>
    </section>
  `;

  // ── Chip Leaderboard ──────────────────────────────────────────────────────────
  const leaderRows = players.map((p, i) => {
    const net = p.net_chips || 0;
    const netClass = net > 0 ? 'pos' : net < 0 ? 'neg' : '';
    const netStr = net > 0 ? `+${net}` : `${net}`;
    const winPct = p.hands_played > 0 ? Math.round(p.hands_won / p.hands_played * 100) : 0;
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(p.name)}</td>
        <td class="num mono">${p.stack_start ?? '—'}</td>
        <td class="num mono">${p.stack_end ?? '—'}</td>
        <td class="num mono ${netClass}">${netStr}</td>
        <td class="num">${winPct}%</td>
        <td class="num">${p.hands_played}</td>
      </tr>
    `;
  }).join('');

  const leaderHTML = `
    <section>
      <h2>Chip Leaderboard</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Player</th><th class="num">Start</th><th class="num">End</th>
          <th class="num">Net</th><th class="num">Win%</th><th class="num">Hands</th>
        </tr></thead>
        <tbody>${leaderRows}</tbody>
      </table>
    </section>
  `;

  // ── Stats Comparison ──────────────────────────────────────────────────────────
  const statsRows = players.map(p => `
    <tr>
      <td>${esc(p.name)}</td>
      <td class="num">${p.vpip}%</td>
      <td class="num">${p.pfr}%</td>
      <td class="num">${p.wtsd}%</td>
      <td class="num">${p.wsd}%</td>
    </tr>
  `).join('');

  const statsHTML = `
    <section>
      <h2>Stats Comparison</h2>
      <table>
        <thead><tr>
          <th>Player</th>
          <th class="num" title="Voluntarily Put $ In Pot preflop">VPIP</th>
          <th class="num" title="Pre-Flop Raise">PFR</th>
          <th class="num" title="Went to Showdown">WTSD</th>
          <th class="num" title="Won $ at Showdown (of showdowns seen)">WSD</th>
        </tr></thead>
        <tbody>${statsRows}</tbody>
      </table>
    </section>
  `;

  // ── Pattern Summary ───────────────────────────────────────────────────────────
  const maxCount = sortedTags.length > 0 ? sortedTags[0][1] : 1;
  const patternRows = sortedTags.map(([tag, count]) => {
    const pct = totalHands > 0 ? Math.round(count / totalHands * 100) : 0;
    const barW = Math.round(count / maxCount * 120);
    return `
      <tr>
        <td>${TAG_DESCRIPTIONS[tag] || tag}</td>
        <td class="num gold">${count}</td>
        <td class="num dim">${pct}%</td>
        <td>
          <span class="bar-wrap"><span class="bar" style="width:${barW}px"></span></span>
        </td>
      </tr>
    `;
  }).join('');

  const patternHTML = sortedTags.length > 0 ? `
    <section>
      <h2>Pattern Summary</h2>
      <table>
        <thead><tr>
          <th>Pattern</th><th class="num">Count</th><th class="num">% of Hands</th><th></th>
        </tr></thead>
        <tbody>${patternRows}</tbody>
      </table>
    </section>
  ` : '';

  // ── Mistake Flags ─────────────────────────────────────────────────────────────
  const mistakeEntries = Object.entries(mistake_summary);
  const mistakeHTML = mistakeEntries.length > 0 ? `
    <section>
      <h2>Mistake Flags</h2>
      ${mistakeEntries.map(([tag, info]) => {
        const handNums = info.hands.map(hid => {
          const idx = hands.findIndex(h => h.hand_id === hid);
          return idx >= 0 ? `<a href="#hand-${idx + 1}" style="color:#d4af37">#${idx + 1}</a>` : hid.slice(0, 8);
        }).join(', ');
        return `
          <div style="margin-bottom:10px">
            <div class="gold" style="font-weight:700">${TAG_DESCRIPTIONS[tag] || tag}</div>
            <div class="dim" style="font-size:12px;margin-top:2px">
              ${info.count} occurrence${info.count !== 1 ? 's' : ''} &nbsp;·&nbsp; Hands: ${handNums}
            </div>
          </div>
        `;
      }).join('')}
    </section>
  ` : '';

  // ── Key Hands ─────────────────────────────────────────────────────────────────
  const keyHandsHTML = keyHands.length > 0 ? `
    <section>
      <h2>Key Hands</h2>
      ${keyHands.map(h => {
        const handNum = hands.findIndex(x => x.hand_id === h.hand_id) + 1;
        const allTags = [
          ...h.auto_tags.map(t => chip(TAG_DESCRIPTIONS[t] || t, '#d4af37')),
          ...h.mistake_tags.map(t => chip(TAG_DESCRIPTIONS[t] || t, '#f87171')),
          ...h.coach_tags.map(t => chip(t, '#60a5fa')),
        ].join('');

        const playerLines = h.players.map(p => `
          <span${p.is_winner ? ' class="gold"' : ''}>
            ${esc(p.player_name)}${p.hole_cards.length ? ': ' + renderCards(p.hole_cards) : ''}
            ${p.is_winner ? ' 🏆' : ''}
          </span>
        `).join(' &nbsp;|&nbsp; ');

        return `
          <div class="hand-detail" id="hand-${handNum}">
            <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
              <span class="gold" style="font-size:15px;font-weight:700">#${handNum}</span>
              <span>Board: ${renderBoard(h.board)}</span>
              <span class="dim">Pot: <span class="gold">${h.final_pot || 0}</span></span>
              <span class="dim">${h.phase_ended || ''}</span>
            </div>
            <div style="margin-top:6px;font-size:12px">${playerLines}</div>
            <div style="margin-top:6px">${allTags}</div>
          </div>
        `;
      }).join('')}
    </section>
  ` : '';

  // ── Full Hand List ────────────────────────────────────────────────────────────
  const handListRows = hands.map((h, i) => {
    const isKey = keyHands.some(k => k.hand_id === h.hand_id);
    const numLink = isKey
      ? `<a href="#hand-${i + 1}" style="color:#d4af37;font-weight:700">#${i + 1}</a>`
      : `<span class="dim">#${i + 1}</span>`;
    const allTagChips = [
      ...h.auto_tags.map(t => chip(TAG_DESCRIPTIONS[t] || t, '#d4af37')),
      ...h.mistake_tags.map(t => chip(TAG_DESCRIPTIONS[t] || t, '#f87171')),
      ...h.coach_tags.map(t => chip(t, '#60a5fa')),
    ].join('');
    return `
      <tr>
        <td>${numLink}</td>
        <td>${renderBoard(h.board)}</td>
        <td class="mono">${esc(h.winner_name) || '—'}</td>
        <td class="num gold">${h.final_pot || 0}</td>
        <td>${allTagChips}</td>
      </tr>
    `;
  }).join('');

  const handListHTML = `
    <section>
      <h2>All Hands</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Board</th><th>Winner</th><th class="num">Pot</th><th>Tags</th>
        </tr></thead>
        <tbody>${handListRows}</tbody>
      </table>
    </section>
  `;

  // ── Assemble ──────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Report — ${fmtDate(session.started_at)}</title>
  <style>${css}</style>
</head>
<body>
  ${headerHTML}
  ${leaderHTML}
  ${statsHTML}
  ${patternHTML}
  ${mistakeHTML}
  ${keyHandsHTML}
  ${handListHTML}
  <div style="text-align:center;color:#4b5563;font-size:11px;margin-top:24px">
    Generated by Poker Trainer &nbsp;·&nbsp; ${new Date().toLocaleString()}
  </div>
</body>
</html>`;
}

module.exports = { generateHTMLReport };
