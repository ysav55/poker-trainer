import React, { useState } from 'react';

// ─── Mock data (replace with apiFetch when backend ships) ─────────────────────

const MOCK_PREP_BRIEF = {
  generatedAt: '2026-04-01T10:00:00Z',
  leaks: [
    { tag: 'EQUITY_FOLD',    studentRate: 8.2, schoolAvg: 3.1, delta: 5.1, trend: 'worsening' },
    { tag: 'COLD_CALL_3BET', studentRate: 5.4, schoolAvg: 2.8, delta: 2.6, trend: 'stable'    },
    { tag: 'OPEN_LIMP',      studentRate: 7.1, schoolAvg: 5.3, delta: 1.8, trend: 'improving' },
  ],
  flaggedHands: [
    { handId: 'h1', date: '2026-03-30', tags: ['EQUITY_FOLD', 'WENT_TO_SHOWDOWN'], netResult: -1200, reviewScore: 9 },
    { handId: 'h2', date: '2026-03-29', tags: ['COLD_CALL_3BET', 'C_BET'],          netResult:  -800, reviewScore: 7 },
    { handId: 'h3', date: '2026-03-28', tags: ['CHECK_RAISE', 'HERO_CALL'],          netResult:  2200, reviewScore: 6 },
    { handId: 'h4', date: '2026-03-27', tags: ['OPEN_LIMP', 'RIVER_RAISE'],          netResult:  -400, reviewScore: 5 },
    { handId: 'h5', date: '2026-03-26', tags: ['3BET_POT', 'SQUEEZE_POT'],           netResult:  1800, reviewScore: 4 },
  ],
  coachNotes: [
    { date: '2026-03-28', type: 'session_review', body: 'Showed improvement in PF aggression. Still folding too much to river bets.' },
    { date: '2026-03-21', type: 'weakness',       body: 'Equity folds are a major leak — 8/100 vs stable avg of 3/100. Focus here.' },
  ],
  statsSnapshot: [
    { stat: 'VPIP',       current: 25.1, previous: 23.8, delta:  1.3, direction: 'up'   },
    { stat: 'PFR',        current: 18.4, previous: 18.1, delta:  0.3, direction: 'up'   },
    { stat: '3bet%',      current: 10.2, previous:  8.7, delta:  1.5, direction: 'up'   },
    { stat: 'Fold to CB', current: 68.0, previous: 61.0, delta:  7.0, direction: 'up'   },
    { stat: 'Aggression', current:  2.1, previous:  2.3, delta: -0.2, direction: 'down' },
  ],
  sessionHistory: [
    { date: '2026-03-30', hands: 68, netChips:  -400, qualityScore: 62 },
    { date: '2026-03-28', hands: 55, netChips:  1200, qualityScore: 74 },
    { date: '2026-03-26', hands: 72, netChips:  -800, qualityScore: 58 },
    { date: '2026-03-24', hands: 44, netChips:   300, qualityScore: 70 },
    { date: '2026-03-22', hands: 61, netChips:  -900, qualityScore: 65 },
  ],
  activeAlerts: [
    { type: 'mistake_spike', detail: 'EQUITY_FOLD 2.6× baseline', severity: 0.87 },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function formatNet(n) {
  if (n == null) return '—';
  return (n >= 0 ? '+' : '') + Number(n).toLocaleString();
}

function trendColor(trend) {
  if (trend === 'improving') return '#3fb950';
  if (trend === 'worsening') return '#f85149';
  return '#8b949e';
}

function trendLabel(trend) {
  if (trend === 'improving') return '↑ improving';
  if (trend === 'worsening') return '↓ worsening';
  return '→ stable';
}

function statArrow(direction) {
  return direction === 'up' ? '▲' : direction === 'down' ? '▼' : '=';
}

const NOTE_TYPE_COLORS = {
  general:        { bg: 'rgba(88,166,255,0.08)',   border: 'rgba(88,166,255,0.25)',   text: '#58a6ff' },
  session_review: { bg: 'rgba(212,175,55,0.08)',   border: 'rgba(212,175,55,0.25)',   text: '#d4af37' },
  goal:           { bg: 'rgba(63,185,80,0.08)',    border: 'rgba(63,185,80,0.25)',    text: '#3fb950' },
  weakness:       { bg: 'rgba(248,81,73,0.08)',    border: 'rgba(248,81,73,0.25)',    text: '#f85149' },
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3
        className="text-xs font-bold tracking-widest uppercase mb-3"
        style={{ color: '#6e7681' }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─── PrepBriefTab ─────────────────────────────────────────────────────────────

export default function PrepBriefTab({ player }) {
  const [refreshing, setRefreshing] = useState(false);
  const brief = MOCK_PREP_BRIEF;

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div data-testid="prep-brief-tab">

      {/* Refresh + timestamp */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-xs" style={{ color: '#6e7681' }}>
          Generated {formatDate(brief.generatedAt)}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{
            background: 'rgba(212,175,55,0.12)',
            border: '1px solid rgba(212,175,55,0.3)',
            color: refreshing ? '#6e7681' : '#d4af37',
            cursor: refreshing ? 'not-allowed' : 'pointer',
            opacity: refreshing ? 0.6 : 1,
          }}
          data-testid="refresh-prep-brief"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      {/* Active Alerts */}
      {brief.activeAlerts.length > 0 && (
        <Section title="Active Alerts">
          {brief.activeAlerts.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg px-3 py-2 mb-2"
              style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)' }}
              data-testid="alert-row"
            >
              <span style={{ fontSize: 13 }}>⚠</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-semibold" style={{ color: '#f85149' }}>{a.detail}</span>
              </div>
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: '#f85149' }}
              >
                {a.severity.toFixed(2)}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Top Leaks */}
      <Section title="Top Leaks">
        <div className="flex flex-col gap-2">
          {brief.leaks.map((leak, i) => (
            <div
              key={leak.tag}
              className="rounded-lg px-3 py-2.5"
              style={{ background: '#161b22', border: '1px solid #30363d' }}
              data-testid={`leak-row-${i}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold font-mono" style={{ color: '#f0ece3' }}>
                  {leak.tag}
                </span>
                <span className="text-xs font-semibold" style={{ color: trendColor(leak.trend) }}>
                  {trendLabel(leak.trend)}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-xs" style={{ color: '#f85149' }}>
                  Student: {leak.studentRate}/100
                </span>
                <span className="text-xs" style={{ color: '#6e7681' }}>
                  Avg: {leak.schoolAvg}/100
                </span>
                <span className="text-xs font-semibold" style={{ color: '#f85149' }}>
                  +{leak.delta.toFixed(1)} above avg
                </span>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Stats Trend */}
      <Section title="Stats Snapshot">
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid #30363d' }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#161b22', color: '#6e7681' }}>
                <th className="px-3 py-2 text-left font-semibold tracking-widest uppercase">Stat</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Current</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Prev</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Δ</th>
              </tr>
            </thead>
            <tbody>
              {brief.statsSnapshot.map((s, i) => (
                <tr
                  key={s.stat}
                  style={{
                    borderTop: '1px solid #21262d',
                    background: i % 2 === 0 ? '#0d1117' : 'transparent',
                  }}
                  data-testid={`stat-row-${s.stat}`}
                >
                  <td className="px-3 py-2" style={{ color: '#f0ece3' }}>{s.stat}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#f0ece3' }}>
                    {s.current}
                    {s.stat !== 'Aggression' ? '%' : ''}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#6e7681' }}>
                    {s.previous}
                    {s.stat !== 'Aggression' ? '%' : ''}
                  </td>
                  <td
                    className="px-3 py-2 text-right font-mono font-semibold"
                    style={{
                      color: s.direction === 'up' ? '#d4af37' : '#8b949e',
                    }}
                  >
                    {statArrow(s.direction)} {Math.abs(s.delta).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Hands to Review */}
      <Section title="Hands to Review">
        <div className="flex flex-col gap-2">
          {brief.flaggedHands.map((hand, i) => (
            <div
              key={hand.handId}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              style={{ background: '#161b22', border: '1px solid #30363d' }}
              data-testid={`flagged-hand-${i}`}
            >
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}
              >
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {hand.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-xs px-1.5 py-0.5 rounded font-mono"
                      style={{ background: '#21262d', color: '#8b949e', border: '1px solid #30363d' }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
                  {formatDate(hand.date)}
                </span>
              </div>
              <div className="text-right flex-shrink-0">
                <div
                  className="text-sm font-bold font-mono"
                  style={{ color: hand.netResult >= 0 ? '#3fb950' : '#f85149' }}
                >
                  {formatNet(hand.netResult)}
                </div>
                <div className="text-xs" style={{ color: '#6e7681' }}>
                  score {hand.reviewScore}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Coach's Last Notes */}
      <Section title="Coach's Last Notes">
        <div className="flex flex-col gap-2">
          {brief.coachNotes.map((note, i) => {
            const c = NOTE_TYPE_COLORS[note.type] ?? NOTE_TYPE_COLORS.general;
            return (
              <div
                key={i}
                className="rounded-lg px-3 py-2.5"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}
                data-testid={`coach-note-${i}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold tracking-wider" style={{ color: c.text }}>
                    {note.type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-xs" style={{ color: '#6e7681' }}>
                    {formatDate(note.date)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: '#8b949e' }}>
                  {note.body}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Recent Sessions */}
      <Section title="Recent Sessions">
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: '1px solid #30363d' }}
        >
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: '#161b22', color: '#6e7681' }}>
                <th className="px-3 py-2 text-left font-semibold tracking-widest uppercase">Date</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Hands</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Net</th>
                <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Quality</th>
              </tr>
            </thead>
            <tbody>
              {brief.sessionHistory.map((s, i) => (
                <tr
                  key={s.date}
                  style={{
                    borderTop: '1px solid #21262d',
                    background: i % 2 === 0 ? '#0d1117' : 'transparent',
                  }}
                  data-testid={`session-row-${i}`}
                >
                  <td className="px-3 py-2" style={{ color: '#8b949e' }}>{formatDate(s.date)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#f0ece3' }}>{s.hands}</td>
                  <td
                    className="px-3 py-2 text-right font-mono font-semibold"
                    style={{ color: s.netChips >= 0 ? '#3fb950' : '#f85149' }}
                  >
                    {formatNet(s.netChips)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#d4af37' }}>
                    {s.qualityScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  );
}
