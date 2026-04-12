'use strict';

/**
 * AlphaReporter — generates a self-contained HTML report for alpha-testing insights.
 *
 * Queries both:
 *   • Supabase alpha_logs table (persisted events across restarts)
 *   • In-memory logger stats (current process uptime — fast, no DB round-trip)
 *
 * Endpoint: GET /api/alpha-report
 * Returns:  text/html — open directly in a browser tab
 */

const supabase  = require('../db/supabase');
const logger    = require('./logger');

// ─── Data Fetchers ─────────────────────────────────────────────────────────────

async function fetchSummary(since) {
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('level, category, event, created_at')
    .gte('created_at', since);
  if (error) throw error;
  return data || [];
}

async function fetchErrors(since, limit = 200) {
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('*')
    .in('level', ['error', 'warn'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

async function fetchHttpStats(since) {
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('event, data, duration_ms, created_at')
    .eq('category', 'http')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function fetchAuthEvents(since) {
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('event, data, created_at')
    .eq('category', 'auth')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function fetchGameEvents(since) {
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('event, data, created_at, table_id, player_id')
    .eq('category', 'game')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function fetchHourlyBuckets(since) {
  // Bucket log counts by hour using Supabase RPC or manual grouping
  const { data, error } = await supabase
    .from('alpha_logs')
    .select('created_at, level')
    .gte('created_at', since)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ─── Aggregation helpers ───────────────────────────────────────────────────────

function countBy(rows, key) {
  const map = {};
  for (const row of rows) {
    const val = row[key] || 'unknown';
    map[val] = (map[val] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function topN(pairs, n = 10) {
  return pairs.slice(0, n);
}

function buildHourlyBuckets(rows) {
  const buckets = {};
  for (const row of rows) {
    const h = row.created_at.slice(0, 13); // "2026-03-24T15"
    if (!buckets[h]) buckets[h] = { total: 0, error: 0, warn: 0, info: 0 };
    buckets[h].total++;
    buckets[h][row.level] = (buckets[h][row.level] || 0) + 1;
  }
  return Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));
}

function avgMs(rows) {
  const valid = rows.filter(r => r.duration_ms != null);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((s, r) => s + r.duration_ms, 0) / valid.length);
}

function p95Ms(rows) {
  const sorted = rows.filter(r => r.duration_ms != null).map(r => r.duration_ms).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(level) {
  const colors = { error: '#e74c3c', warn: '#f39c12', info: '#3498db', debug: '#95a5a6' };
  const bg = colors[level] || '#95a5a6';
  return `<span style="background:${bg};color:#fff;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600">${esc(level)}</span>`;
}

function table(headers, rows, emptyMsg = 'No data') {
  if (!rows.length) return `<p style="color:#888;font-style:italic">${emptyMsg}</p>`;
  const ths = headers.map(h => `<th>${esc(h)}</th>`).join('');
  const trs = rows.map(r =>
    `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`
  ).join('');
  return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}

function section(title, content, id = '') {
  return `
    <section id="${id || title.replace(/\s+/g, '-').toLowerCase()}">
      <h2>${esc(title)}</h2>
      ${content}
    </section>`;
}

function statCard(label, value, sub = '', color = '#3498db') {
  return `
    <div class="stat-card">
      <div class="stat-value" style="color:${color}">${esc(String(value))}</div>
      <div class="stat-label">${esc(label)}</div>
      ${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}
    </div>`;
}

function sparkline(buckets) {
  if (!buckets.length) return '';
  const totals  = buckets.map(([, b]) => b.total);
  const maxVal  = Math.max(...totals, 1);
  const W = 600, H = 60, pad = 4;
  const barW = Math.max(2, Math.floor((W - pad * 2) / buckets.length) - 1);

  const bars = buckets.map(([hour, b], i) => {
    const x     = pad + i * (barW + 1);
    const errH  = Math.round((b.error / maxVal) * (H - pad * 2));
    const warnH = Math.round((b.warn  / maxVal) * (H - pad * 2));
    const infoH = Math.round((b.total / maxVal) * (H - pad * 2));
    return `
      <rect x="${x}" y="${H - pad - infoH}" width="${barW}" height="${infoH}" fill="#3498db22" />
      <rect x="${x}" y="${H - pad - warnH}" width="${barW}" height="${warnH}" fill="#f39c1288" />
      <rect x="${x}" y="${H - pad - errH}"  width="${barW}" height="${errH}"  fill="#e74c3ccc" />
      <title>${esc(hour)}: ${b.total} events (${b.error} errors, ${b.warn} warns)</title>`;
  }).join('');

  const labels = [buckets[0]?.[0]?.slice(11) + 'h', buckets[buckets.length - 1]?.[0]?.slice(11) + 'h'];

  return `
    <div class="sparkline-wrap">
      <svg width="${W}" height="${H}" style="display:block">
        ${bars}
      </svg>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#aaa">
        <span>${esc(labels[0])}</span><span>${esc(labels[1])}</span>
      </div>
    </div>`;
}

// ─── Main report builder ───────────────────────────────────────────────────────

/**
 * Generate a full HTML alpha report.
 * @param {number} [windowHours=72] — how far back to look in Supabase logs
 */
async function generateReport(windowHours = 72) {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const now   = new Date().toISOString();
  const mem   = logger.getMemStats();

  // Parallel DB fetch
  const [allRows, errors, httpRows, authRows, gameRows, hourlyRaw] = await Promise.all([
    fetchSummary(since),
    fetchErrors(since),
    fetchHttpStats(since),
    fetchAuthEvents(since),
    fetchGameEvents(since),
    fetchHourlyBuckets(since),
  ]);

  // ── Overview ─────────────────────────────────────────────────────────────────
  const totalLogs   = allRows.length;
  const errorCount  = allRows.filter(r => r.level === 'error').length;
  const warnCount   = allRows.filter(r => r.level === 'warn').length;
  const uniqueEvts  = new Set(allRows.map(r => r.event)).size;

  const overviewCards = [
    statCard('Total events', totalLogs, `last ${windowHours}h`),
    statCard('Errors', errorCount, 'persisted', errorCount > 0 ? '#e74c3c' : '#27ae60'),
    statCard('Warnings', warnCount, 'persisted', warnCount > 0 ? '#f39c12' : '#27ae60'),
    statCard('Unique event types', uniqueEvts),
    statCard('Uptime (this process)', _formatMs(mem.uptimeMs), 'since last restart'),
    statCard('In-mem errors', mem.counts['total:error'] || 0, 'current process'),
  ].join('');

  const hourlyBuckets = buildHourlyBuckets(hourlyRaw);

  // ── Error breakdown ───────────────────────────────────────────────────────────
  const errorsByEvent    = topN(countBy(errors, 'event'));
  const errorsByCategory = topN(countBy(errors, 'category'));

  const errorTable = table(
    ['Time', 'Level', 'Category', 'Event', 'Message', 'Data'],
    errors.slice(0, 50).map(r => [
      esc(r.created_at?.slice(0, 19)?.replace('T', ' ')),
      badge(r.level),
      esc(r.category),
      `<code>${esc(r.event)}</code>`,
      esc(r.message?.slice(0, 120)),
      r.data ? `<details><summary>…</summary><pre>${esc(JSON.stringify(r.data, null, 2))}</pre></details>` : '',
    ])
  );

  // ── HTTP stats ────────────────────────────────────────────────────────────────
  const httpAvg = avgMs(httpRows);
  const httpP95 = p95Ms(httpRows);
  const slowRequests = httpRows
    .filter(r => r.duration_ms > 500)
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 20);

  // ── Auth events ───────────────────────────────────────────────────────────────
  const loginOk   = authRows.filter(r => r.event === 'login_ok').length;
  const loginFail = authRows.filter(r => r.event === 'login_fail').length;
  const rateLimited = authRows.filter(r => r.event === 'rate_limited').length;

  // ── Game events ───────────────────────────────────────────────────────────────
  const handsStarted   = gameRows.filter(r => r.event === 'hand_start').length;
  const handsCompleted = gameRows.filter(r => r.event === 'hand_complete').length;
  const handAborted    = gameRows.filter(r => r.event === 'hand_aborted').length;
  const joins          = gameRows.filter(r => r.event === 'player_join').length;
  const disconnects    = gameRows.filter(r => r.event === 'player_disconnect').length;

  // ── In-memory socket event leaderboard ────────────────────────────────────────
  const socketCounts = Object.entries(mem.counts)
    .filter(([k]) => k.startsWith('socket:'))
    .map(([k, v]) => [k.replace('socket:', ''), v])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  // ── Recent client errors ──────────────────────────────────────────────────────
  const clientErrors = errors.filter(r => r.category === 'client').slice(0, 20);

  // ── Recent in-mem errors ──────────────────────────────────────────────────────
  const memErrors = mem.recentErrors.slice(0, 20);

  // ─── HTML Assembly ─────────────────────────────────────────────────────────────

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Poker Trainer — Alpha Report</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f1117; color: #e0e0e0; line-height: 1.5; font-size: 14px; }
    a { color: #3498db; }

    /* ── Nav ── */
    nav { background: #1a1d26; border-bottom: 1px solid #2d3040;
          padding: 12px 24px; display: flex; gap: 20px; align-items: center;
          position: sticky; top: 0; z-index: 100; }
    nav .logo { font-weight: 700; font-size: 16px; color: #fff; }
    nav .sub  { font-size: 12px; color: #888; margin-left: auto; }
    nav a { font-size: 13px; text-decoration: none; color: #aaa; }
    nav a:hover { color: #fff; }

    /* ── Layout ── */
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    section { margin-bottom: 40px; }
    h2 { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 16px;
         border-bottom: 1px solid #2d3040; padding-bottom: 8px; }
    h3 { font-size: 14px; font-weight: 600; color: #ccc; margin: 12px 0 8px; }

    /* ── Stat cards ── */
    .stat-grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    .stat-card { background: #1a1d26; border: 1px solid #2d3040; border-radius: 8px;
                 padding: 16px 20px; min-width: 140px; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-label { font-size: 12px; color: #888; margin-top: 4px; }
    .stat-sub   { font-size: 11px; color: #666; margin-top: 2px; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #1e2130; }
    th { text-align: left; padding: 8px 12px; color: #aaa; font-weight: 500;
         font-size: 12px; border-bottom: 1px solid #2d3040; }
    td { padding: 7px 12px; border-bottom: 1px solid #1e2130; vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1e2130; }
    code { background: #23263a; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
    pre  { background: #23263a; padding: 8px; border-radius: 4px; font-size: 11px;
           overflow: auto; max-height: 200px; white-space: pre-wrap; }
    details summary { cursor: pointer; color: #3498db; font-size: 12px; }

    /* ── Sparkline ── */
    .sparkline-wrap { background: #1a1d26; border: 1px solid #2d3040;
                      border-radius: 8px; padding: 12px; margin-bottom: 16px; }
    .sparkline-legend { display: flex; gap: 16px; font-size: 11px; margin-top: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 2px; display: inline-block; margin-right: 4px; }

    /* ── Two-col layout ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }

    /* ── Alert bar ── */
    .alert { padding: 10px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 13px; }
    .alert-ok   { background: #1a3a2a; border-left: 3px solid #27ae60; }
    .alert-warn { background: #3a2f1a; border-left: 3px solid #f39c12; }
    .alert-err  { background: #3a1a1a; border-left: 3px solid #e74c3c; }
  </style>
</head>
<body>

<nav>
  <span class="logo">♠ Poker Trainer — Alpha Report</span>
  <a href="#overview">Overview</a>
  <a href="#errors">Errors</a>
  <a href="#http">HTTP</a>
  <a href="#auth">Auth</a>
  <a href="#game">Game</a>
  <a href="#realtime">Real-time</a>
  <a href="#client">Client</a>
  <span class="sub">Generated ${esc(now.replace('T', ' ').slice(0, 19))} UTC · window: last ${windowHours}h</span>
</nav>

<div class="container">

  ${section('Overview', `
    ${errorCount > 10 ? `<div class="alert alert-err">⚠ ${errorCount} errors logged in the last ${windowHours}h — check the Errors section.</div>` :
      errorCount > 0  ? `<div class="alert alert-warn">⚠ ${errorCount} errors logged in the last ${windowHours}h.</div>` :
                        `<div class="alert alert-ok">✓ No errors logged in the last ${windowHours}h.</div>`}
    <div class="stat-grid">${overviewCards}</div>
    <h3>Event volume by hour</h3>
    ${sparkline(hourlyBuckets)}
    <div class="sparkline-legend">
      <span><span class="dot" style="background:#3498db22"></span>info/debug</span>
      <span><span class="dot" style="background:#f39c1288"></span>warn</span>
      <span><span class="dot" style="background:#e74c3ccc"></span>error</span>
    </div>
  `, 'overview')}

  ${section('Errors & Warnings', `
    <div class="two-col">
      <div>
        <h3>Top error events</h3>
        ${table(['Event', 'Count'], errorsByEvent, 'No errors 🎉')}
      </div>
      <div>
        <h3>Errors by category</h3>
        ${table(['Category', 'Count'], errorsByCategory, 'No errors 🎉')}
      </div>
    </div>
    <h3>Recent errors & warnings (last 50)</h3>
    ${errorTable}
  `, 'errors')}

  ${section('HTTP Performance', `
    <div class="stat-grid">
      ${statCard('Total requests', httpRows.length, `last ${windowHours}h`)}
      ${statCard('Avg latency', httpAvg + ' ms')}
      ${statCard('p95 latency', httpP95 + ' ms', '', httpP95 > 1000 ? '#e74c3c' : '#27ae60')}
      ${statCard('Slow (>500ms)', slowRequests.length, 'requests', slowRequests.length > 5 ? '#f39c12' : '#27ae60')}
      ${statCard('HTTP 4xx', mem.counts['http:4xx'] || 0, 'in-memory')}
      ${statCard('HTTP 5xx', mem.counts['http:5xx'] || 0, 'in-memory', (mem.counts['http:5xx'] || 0) > 0 ? '#e74c3c' : '#27ae60')}
    </div>
    ${slowRequests.length ? `
      <h3>Slow requests (>500ms)</h3>
      ${table(['Time', 'Method', 'Path', 'Status', 'ms'],
        slowRequests.map(r => [
          esc(r.created_at?.slice(0, 19).replace('T',' ')),
          esc(r.data?.method || '?'),
          esc(r.data?.path   || '?'),
          esc(r.data?.status || '?'),
          `<strong>${esc(r.duration_ms)}</strong>`,
        ])
      )}` : ''}
    <h3>Recent requests (in-memory, current process)</h3>
    ${table(['Time', 'Method', 'Path', 'Status', 'ms', 'User'],
      mem.recentRequests.map(r => [
        esc(r.ts?.slice(0, 19).replace('T',' ')),
        esc(r.method),
        esc(r.path),
        `<span style="color:${r.status >= 500 ? '#e74c3c' : r.status >= 400 ? '#f39c12' : '#27ae60'}">${esc(r.status)}</span>`,
        esc(r.durationMs),
        esc(r.userId || '—'),
      ])
    , 'No requests recorded yet')}
  `, 'http')}

  ${section('Auth Activity', `
    <div class="stat-grid">
      ${statCard('Successful logins', loginOk, `last ${windowHours}h`, '#27ae60')}
      ${statCard('Failed logins', loginFail, `last ${windowHours}h`, loginFail > 5 ? '#e74c3c' : '#888')}
      ${statCard('Rate-limited', rateLimited, `last ${windowHours}h`, rateLimited > 0 ? '#f39c12' : '#888')}
    </div>
    <h3>Auth events log</h3>
    ${table(['Time', 'Event', 'Data'],
      authRows.slice(0, 30).map(r => [
        esc(r.created_at?.slice(0, 19).replace('T',' ')),
        `<code>${esc(r.event)}</code>`,
        r.data ? `<code style="font-size:11px">${esc(JSON.stringify(r.data).slice(0, 150))}</code>` : '—',
      ])
    , 'No auth events recorded')}
  `, 'auth')}

  ${section('Game Activity', `
    <div class="stat-grid">
      ${statCard('Hands started', handsStarted, `last ${windowHours}h`)}
      ${statCard('Hands completed', handsCompleted, `last ${windowHours}h`, '#27ae60')}
      ${statCard('Hands aborted', handAborted, `last ${windowHours}h`, handAborted > 0 ? '#f39c12' : '#888')}
      ${statCard('Player joins', joins, `last ${windowHours}h`)}
      ${statCard('Disconnects', disconnects, `last ${windowHours}h`)}
    </div>
    <h3>Game event log (recent)</h3>
    ${table(['Time', 'Event', 'Table', 'Data'],
      gameRows.slice(0, 40).map(r => [
        esc(r.created_at?.slice(0, 19).replace('T',' ')),
        `<code>${esc(r.event)}</code>`,
        esc(r.table_id || '—'),
        r.data ? `<details><summary>details</summary><pre>${esc(JSON.stringify(r.data, null, 2))}</pre></details>` : '—',
      ])
    , 'No game events recorded')}
  `, 'game')}

  ${section('Real-time Socket Events (in-memory)', `
    <p style="color:#888;font-size:12px;margin-bottom:12px">
      In-memory counters reset on every server restart. Useful for spotting hot events during a live session.
    </p>
    <div class="two-col">
      <div>
        <h3>Socket event leaderboard</h3>
        ${table(['Event', 'Count'], socketCounts, 'No socket events yet')}
      </div>
      <div>
        <h3>Recent socket events</h3>
        ${table(['Time', 'Event', 'Table', 'Player'],
          mem.recentSockets.map(r => [
            esc(r.ts?.slice(0, 19).replace('T',' ')),
            `<code>${esc(r.event)}</code>`,
            esc(r.tableId || '—'),
            esc(r.playerId?.slice(0, 8) || '—'),
          ])
        , 'No socket events recorded yet')}
      </div>
    </div>
  `, 'realtime')}

  ${section('Client-Side Errors', `
    ${clientErrors.length === 0
      ? `<div class="alert alert-ok">✓ No client errors reported.</div>`
      : table(['Time', 'Message', 'Stack', 'Context'],
          clientErrors.map(r => [
            esc(r.created_at?.slice(0, 19).replace('T',' ')),
            esc(r.message?.slice(0, 200)),
            r.data?.stack ? `<details><summary>stack</summary><pre>${esc(r.data.stack)}</pre></details>` : '—',
            r.data?.context ? `<code style="font-size:11px">${esc(JSON.stringify(r.data.context).slice(0, 120))}</code>` : '—',
          ])
        )}
  `, 'client')}

  <section style="margin-top:40px;padding-top:20px;border-top:1px solid #2d3040;color:#555;font-size:12px">
    <p>Alpha Report · Poker Trainer · Generated ${esc(now)} · Window: last ${windowHours}h</p>
    <p style="margin-top:4px">Tip: add <code>?hours=24</code> or <code>?hours=168</code> to the URL to change the window.</p>
  </section>

</div>
</body>
</html>`;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function _formatMs(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

module.exports = { generateReport };
