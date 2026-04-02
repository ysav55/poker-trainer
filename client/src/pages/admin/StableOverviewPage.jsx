import React from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

// ─── Mock data (replace with apiFetch('/api/coach/reports/stable') when backend ships) ──

const MOCK_STABLE = {
  weekLabel: 'Week of Mar 24–30',
  topImprovers: [
    { name: 'Sam P.',    grade: 84, delta: +12 },
    { name: 'Taylor W.', grade: 79, delta:  +8 },
    { name: 'Riley C.',  grade: 75, delta:  +5 },
  ],
  needsAttention: [
    { name: 'Alex K.',   grade: 54,   delta: -17, note: null      },
    { name: 'Jordan L.', grade: null, delta: null, note: 'inactive' },
    { name: 'Marcus T.', grade: 61,   delta: -6,  note: null      },
  ],
  averages: {
    avgGrade:           71,
    prevAvgGrade:       73,
    activeStudents:     28,
    totalStudents:      32,
    totalHands:         8247,
    avgHandsPerStudent: 295,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(g) {
  if (g == null) return '#6e7681';
  if (g >= 80) return '#3fb950';
  if (g >= 60) return GOLD;
  return '#f85149';
}

function deltaColor(d) {
  if (d == null) return '#6e7681';
  return d >= 0 ? '#3fb950' : '#f85149';
}

function deltaLabel(d) {
  if (d == null) return '—';
  return (d >= 0 ? '+' : '') + d;
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, titleColor = '#6e7681', children }) {
  return (
    <div className="mb-2">
      <div
        className="px-4 py-3"
        style={{ borderBottom: '1px solid #30363d', background: '#1a2233' }}
      >
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: titleColor }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

// ─── StudentRow ───────────────────────────────────────────────────────────────

function StudentRow({ rank, name, grade, delta, note, onClick }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid #21262d', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
      data-testid={`student-row-${name.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(212,175,55,0.12)', color: GOLD }}
      >
        {rank}
      </span>
      <span className="flex-1 text-sm font-semibold" style={{ color: '#f0ece3' }}>
        {name}
      </span>
      {note && (
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: 'rgba(110,118,129,0.12)', color: '#6e7681', border: '1px solid rgba(110,118,129,0.25)' }}
        >
          {note}
        </span>
      )}
      <div className="flex items-center gap-2 flex-shrink-0">
        {delta != null && (
          <span className="text-xs font-semibold" style={{ color: deltaColor(delta) }}>
            {deltaLabel(delta)}
          </span>
        )}
        <span
          className="text-base font-black tabular-nums"
          style={{ color: gradeColor(grade), minWidth: 32, textAlign: 'right' }}
        >
          {grade ?? '—'}
        </span>
      </div>
    </div>
  );
}

// ─── StableOverviewPage ───────────────────────────────────────────────────────

export default function StableOverviewPage() {
  const navigate = useNavigate();
  const data = MOCK_STABLE;
  const { averages: avg } = data;

  const gradeDelta = avg.avgGrade - avg.prevAvgGrade;

  return (
    <div style={{ color: '#e5e7eb' }}>

      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Summary stats */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
          data-testid="stable-averages"
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: '1px solid #30363d', background: '#1a2233' }}
          >
            <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>
              STABLE AVERAGES
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px" style={{ background: '#30363d' }}>
            {[
              {
                label: 'Avg Grade',
                value: avg.avgGrade,
                sub: `prev week: ${avg.prevAvgGrade}`,
                valueColor: gradeColor(avg.avgGrade),
              },
              {
                label: 'Grade Δ',
                value: deltaLabel(gradeDelta),
                valueColor: deltaColor(gradeDelta),
              },
              {
                label: 'Active Students',
                value: `${avg.activeStudents}/${avg.totalStudents}`,
                valueColor: '#f0ece3',
              },
              {
                label: 'Total Hands',
                value: avg.totalHands.toLocaleString(),
                sub: `~${avg.avgHandsPerStudent} avg/student`,
                valueColor: '#f0ece3',
              },
            ].map(({ label, value, sub, valueColor }) => (
              <div
                key={label}
                className="flex flex-col gap-1 px-4 py-3"
                style={{ background: '#161b22' }}
                data-testid={`avg-${label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#6e7681' }}>
                  {label}
                </span>
                <span className="text-xl font-black" style={{ color: valueColor }}>
                  {value}
                </span>
                {sub && <span className="text-xs" style={{ color: '#6e7681' }}>{sub}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Top Improvers */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
          data-testid="top-improvers"
        >
          <Section title="TOP IMPROVERS" titleColor="#3fb950">
            {data.topImprovers.map((s, i) => (
              <StudentRow
                key={s.name}
                rank={i + 1}
                name={s.name}
                grade={s.grade}
                delta={s.delta}
                note={null}
                onClick={() => navigate('/admin/crm')}
              />
            ))}
          </Section>
        </div>

        {/* Needs Attention */}
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
          data-testid="needs-attention"
        >
          <Section title="NEEDS ATTENTION" titleColor="#f85149">
            {data.needsAttention.map((s, i) => (
              <StudentRow
                key={s.name}
                rank={i + 1}
                name={s.name}
                grade={s.grade}
                delta={s.delta}
                note={s.note}
                onClick={() => navigate('/admin/crm')}
              />
            ))}
          </Section>
        </div>

      </div>
    </div>
  );
}
