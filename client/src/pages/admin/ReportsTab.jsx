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

function gradeColor(g) {
  if (g == null) return '#6e7681';
  if (g >= 80) return '#3fb950';
  if (g >= 60) return '#d4af37';
  return '#f85149';
}

function directionArrow(dir) {
  if (dir === 'improved')  return '▲';
  if (dir === 'regressed') return '▼';
  return '=';
}

function directionColor(dir) {
  if (dir === 'improved')  return '#3fb950';
  if (dir === 'regressed') return '#f85149';
  return '#8b949e';
}

function mistakeDirColor(dir) {
  if (dir === 'improved') return '#3fb950';
  if (dir === 'worsened') return '#f85149';
  return '#8b949e';
}

function mistakeDirLabel(dir) {
  if (dir === 'improved') return '↑ improved';
  if (dir === 'worsened') return '↓ worsened';
  return '→ stable';
}

function leakChangeColor(change) {
  if (change === 'improved') return '#3fb950';
  if (change === 'worsened') return '#f85149';
  return '#8b949e';
}

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

// ─── ReportDetail ─────────────────────────────────────────────────────────────

function ReportDetail({ report, onBack }) {
  return (
    <div data-testid="report-detail">

      {/* Back + title */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={onBack}
          className="text-xs"
          style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          data-testid="report-back"
        >
          ← Reports
        </button>
        <div>
          <div className="text-sm font-bold" style={{ color: '#f0ece3' }}>{report.period}</div>
          <div className="text-xs" style={{ color: '#6e7681' }}>
            {report.reportType.charAt(0).toUpperCase() + report.reportType.slice(1)} Report
          </div>
        </div>
      </div>

      {/* Grade + overview */}
      <div
        className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between gap-4"
        style={{ background: '#161b22', border: '1px solid #30363d' }}
      >
        <div>
          <div className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#6e7681' }}>
            Overall Grade
          </div>
          <div
            className="text-5xl font-black"
            style={{ color: gradeColor(report.grade), lineHeight: 1 }}
            data-testid="report-grade"
          >
            {report.grade ?? '—'}
            <span className="text-xl font-normal ml-1" style={{ color: '#6e7681' }}>/100</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-right">
          <span className="text-xs" style={{ color: '#8b949e' }}>
            {report.overview.sessions} sessions · {report.overview.hands.toLocaleString()} hands
          </span>
          <span
            className="text-sm font-bold font-mono"
            style={{ color: report.overview.netChips >= 0 ? '#3fb950' : '#f85149' }}
          >
            {formatNet(report.overview.netChips)} chips
          </span>
          <span className="text-xs" style={{ color: '#6e7681' }}>
            Quality avg: {report.overview.qualityAvg}
            {report.overview.qualityPrev && (
              <span style={{ color: report.overview.qualityAvg >= report.overview.qualityPrev ? '#3fb950' : '#f85149' }}>
                {' '}(prev: {report.overview.qualityPrev})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Stat changes */}
      {report.statChanges.length > 0 && (
        <Section title="Stat Changes vs Previous Week">
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#161b22', color: '#6e7681' }}>
                  <th className="px-3 py-2 text-left font-semibold tracking-widest uppercase">Stat</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">This wk</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Last wk</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Change</th>
                </tr>
              </thead>
              <tbody>
                {report.statChanges.map((s, i) => (
                  <tr
                    key={s.stat}
                    style={{
                      borderTop: '1px solid #21262d',
                      background: i % 2 === 0 ? '#0d1117' : 'transparent',
                    }}
                    data-testid={`stat-change-${s.stat}`}
                  >
                    <td className="px-3 py-2" style={{ color: '#f0ece3' }}>{s.stat}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: '#f0ece3' }}>
                      {s.thisWeek}{s.stat !== 'Aggression' ? '%' : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: '#6e7681' }}>
                      {s.lastWeek}{s.stat !== 'Aggression' ? '%' : ''}
                    </td>
                    <td
                      className="px-3 py-2 text-right font-mono font-semibold"
                      style={{ color: directionColor(s.direction) }}
                    >
                      {directionArrow(s.direction)} {Math.abs(s.change).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Mistake trends */}
      {report.mistakeTrends.length > 0 && (
        <Section title="Mistake Trends">
          <div className="flex flex-col gap-2">
            {report.mistakeTrends.map((m, i) => (
              <div
                key={m.tag}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: '#161b22', border: '1px solid #30363d' }}
                data-testid={`mistake-trend-${i}`}
              >
                <span className="text-xs font-mono font-bold" style={{ color: '#f0ece3' }}>{m.tag}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
                    {m.lastWeek}/100 → {m.thisWeek}/100
                  </span>
                  <span className="text-xs font-semibold" style={{ color: mistakeDirColor(m.direction) }}>
                    {mistakeDirLabel(m.direction)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Leak coaching effectiveness */}
      {report.leakEvolution.length > 0 && (
        <Section title="Leak Coaching Effectiveness">
          <div className="flex flex-col gap-2">
            {report.leakEvolution.map((l, i) => (
              <div
                key={l.tag}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: '#161b22', border: '1px solid #30363d' }}
                data-testid={`leak-evolution-${i}`}
              >
                <span className="text-xs font-mono font-bold" style={{ color: '#f0ece3' }}>{l.tag}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
                    {l.startRate}/100 → {l.endRate}/100
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded"
                    style={{
                      background: `${leakChangeColor(l.change)}18`,
                      color: leakChangeColor(l.change),
                      border: `1px solid ${leakChangeColor(l.change)}33`,
                    }}
                  >
                    {l.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Key Hands */}
      {report.topHands && (
        <Section title="Key Hands">
          <div className="flex flex-col gap-2">
            {[
              { label: 'Best Hand',            hand: report.topHands.best,            labelColor: '#3fb950' },
              { label: 'Worst Hand',           hand: report.topHands.worst,           labelColor: '#f85149' },
              { label: 'Most Instructive',     hand: report.topHands.mostInstructive, labelColor: '#d4af37' },
            ].map(({ label, hand, labelColor }) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: '#161b22', border: '1px solid #30363d' }}
                data-testid={`key-hand-${label.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div>
                  <span className="text-xs font-semibold" style={{ color: labelColor }}>{label}</span>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {hand.tags.map((t) => (
                      <span
                        key={t}
                        className="text-xs px-1.5 py-0.5 rounded font-mono"
                        style={{ background: '#21262d', color: '#8b949e', border: '1px solid #30363d' }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-sm font-bold font-mono"
                    style={{ color: hand.chips >= 0 ? '#3fb950' : '#f85149' }}
                  >
                    {formatNet(hand.chips)}
                  </div>
                  <div className="text-xs" style={{ color: '#6e7681' }}>{formatDate(hand.date)}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

    </div>
  );
}

// ─── ReportsTab ───────────────────────────────────────────────────────────────

export default function ReportsTab({ player }) {
  const [reports, setReports]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (!player?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/api/coach/students/${player.id}/reports?limit=10`);
        if (!cancelled) setReports(data?.reports ?? []);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [player?.id]);

  if (selected) {
    return <ReportDetail report={selected} onBack={() => setSelected(null)} />;
  }

  if (loading) {
    return <div className="py-16 text-center text-sm" style={{ color: '#6e7681' }}>Loading reports…</div>;
  }
  if (error) {
    return (
      <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', color: '#f85149' }}>
        {error}
      </div>
    );
  }

  return (
    <div data-testid="reports-tab">

      {/* Navigation: Prev / Next week */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.25)',
            color: '#d4af37',
            cursor: 'pointer',
          }}
          data-testid="prev-week"
        >
          ← Previous week
        </button>
        <span className="text-xs" style={{ color: '#6e7681' }}>
          {reports[0]?.period ?? 'No reports yet'}
        </span>
        <button
          onClick={() => setWeekOffset((o) => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{
            background: weekOffset === 0 ? 'rgba(110,118,129,0.08)' : 'rgba(212,175,55,0.08)',
            border: `1px solid ${weekOffset === 0 ? 'rgba(110,118,129,0.25)' : 'rgba(212,175,55,0.25)'}`,
            color: weekOffset === 0 ? '#6e7681' : '#d4af37',
            cursor: weekOffset === 0 ? 'not-allowed' : 'pointer',
            opacity: weekOffset === 0 ? 0.5 : 1,
          }}
          data-testid="next-week"
        >
          Next week →
        </button>
      </div>

      {/* Report list */}
      {reports.length === 0 ? (
        <div
          className="rounded-lg px-4 py-10 text-center text-sm"
          style={{ background: '#161b22', border: '1px solid #30363d', color: '#6e7681' }}
          data-testid="no-reports"
        >
          No reports yet. Reports are generated automatically each Sunday.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map((report) => (
            <button
              key={report.id}
              onClick={() => setSelected(report)}
              className="w-full text-left rounded-xl px-4 py-4 transition-colors hover:border-[rgba(212,175,55,0.4)]"
              style={{ background: '#161b22', border: '1px solid #30363d', cursor: 'pointer' }}
              data-testid={`report-card-${report.id}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: '#f0ece3' }}>
                    {report.period}
                  </div>
                  <div className="text-xs mt-1" style={{ color: '#6e7681' }}>
                    {report.overview.sessions} sessions · {report.overview.hands.toLocaleString()} hands
                    {' · '}
                    <span style={{ color: report.overview.netChips >= 0 ? '#3fb950' : '#f85149' }}>
                      {formatNet(report.overview.netChips)} chips
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="text-2xl font-black tabular-nums"
                    style={{ color: gradeColor(report.grade) }}
                  >
                    {report.grade ?? '—'}
                  </span>
                  <span className="text-xs" style={{ color: '#6e7681' }}>/ 100</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Share with Student placeholder */}
      <div className="mt-5 flex justify-end">
        <button
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{
            background: 'rgba(63,185,80,0.08)',
            border: '1px solid rgba(63,185,80,0.3)',
            color: '#3fb950',
            cursor: 'pointer',
          }}
          data-testid="share-report"
        >
          Share with Student →
        </button>
      </div>

    </div>
  );
}
