import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';

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
  const [brief, setBrief]         = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchBrief = async (refresh = false) => {
    if (!player?.id) return;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const url    = `/api/coach/students/${player.id}/prep-brief`;
      const method = refresh ? 'POST' : 'GET';
      const data   = await apiFetch(refresh ? `${url}/refresh` : url, refresh ? { method } : undefined);
      setBrief(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchBrief(false); }, [player?.id]);

  const handleRefresh = () => fetchBrief(true);

  if (loading) {
    return <div className="py-16 text-center text-sm" style={{ color: '#6e7681' }}>Loading prep brief…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', color: '#f85149' }}>
        {error}
      </div>
    );
  }
  if (!brief) {
    return <div className="py-16 text-center text-sm" style={{ color: '#6e7681' }}>No prep brief available.</div>;
  }

  return (
    <div data-testid="prep-brief-tab">

      {/* Refresh + timestamp */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-xs" style={{ color: '#6e7681' }}>
          Generated {formatDate(brief.generatedAt ?? brief.generated_at ?? brief.created_at)}
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
      {(brief.activeAlerts ?? brief.active_alerts ?? []).length > 0 && (
        <Section title="Active Alerts">
          {(brief.activeAlerts ?? brief.active_alerts ?? []).map((a, i) => (
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
                {a.severity?.toFixed(2) ?? '—'}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Top Leaks */}
      <Section title="Top Leaks">
        <div className="flex flex-col gap-2">
          {(brief.leaks ?? brief.top_leaks ?? []).map((leak, i) => (
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
                  Student: {(leak.studentRate ?? leak.student_rate ?? 0)}/100
                </span>
                <span className="text-xs" style={{ color: '#6e7681' }}>
                  Avg: {(leak.schoolAvg ?? leak.school_avg ?? 0)}/100
                </span>
                <span className="text-xs font-semibold" style={{ color: '#f85149' }}>
                  +{(leak.delta ?? 0).toFixed(1)} above avg
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
              {(brief.statsSnapshot ?? brief.stats_snapshot ?? []).map((s, i) => (
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
          {(brief.flaggedHands ?? brief.flagged_hands ?? brief.hands_to_review ?? []).map((hand, i) => (
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
                  style={{ color: (hand.netResult ?? hand.net_result ?? hand.net_chips ?? 0) >= 0 ? '#3fb950' : '#f85149' }}
                >
                  {formatNet(hand.netResult ?? hand.net_result ?? hand.net_chips)}
                </div>
                <div className="text-xs" style={{ color: '#6e7681' }}>
                  score {hand.reviewScore ?? hand.review_score ?? '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Coach's Last Notes */}
      <Section title="Coach's Last Notes">
        <div className="flex flex-col gap-2">
          {(brief.coachNotes ?? brief.coach_notes ?? brief.last_notes ?? []).map((note, i) => {
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
              {(brief.sessionHistory ?? brief.session_history ?? brief.recent_sessions ?? []).map((s, i) => (
                <tr
                  key={s.date}
                  style={{
                    borderTop: '1px solid #21262d',
                    background: i % 2 === 0 ? '#0d1117' : 'transparent',
                  }}
                  data-testid={`session-row-${i}`}
                >
                  <td className="px-3 py-2" style={{ color: '#8b949e' }}>{formatDate(s.date ?? s.ended_at)}</td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#f0ece3' }}>{s.hands ?? s.hands_played ?? '—'}</td>
                  <td
                    className="px-3 py-2 text-right font-mono font-semibold"
                    style={{ color: (s.netChips ?? s.net_chips ?? 0) >= 0 ? '#3fb950' : '#f85149' }}
                  >
                    {formatNet(s.netChips ?? s.net_chips)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono" style={{ color: '#d4af37' }}>
                    {s.qualityScore ?? s.quality_score ?? '—'}
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
