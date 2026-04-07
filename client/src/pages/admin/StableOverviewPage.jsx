import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

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

function trendIcon(t) {
  if (t > 0) return '▲';
  if (t < 0) return '▼';
  return '=';
}

function formatNet(n) {
  if (n == null) return '—';
  const sign = n >= 0 ? '+' : '-';
  return sign + Math.abs(n).toLocaleString();
}

// ─── PanelHeader ──────────────────────────────────────────────────────────────

function PanelHeader({ title, titleColor = '#6e7681' }) {
  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: '1px solid #30363d', background: '#1a2233' }}
    >
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: titleColor }}>
        {title}
      </span>
    </div>
  );
}

// ─── StudentMiniRow ───────────────────────────────────────────────────────────

function StudentMiniRow({ rank, name, grade, delta, note, onClick }) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid #21262d', cursor: 'pointer' }}
      onClick={onClick}
      data-testid={`mini-row-${name.replace(/\s+/g, '-').toLowerCase()}`}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
        style={{ background: 'rgba(212,175,55,0.12)', color: GOLD }}
      >
        {rank}
      </span>
      <span className="flex-1 text-sm font-semibold truncate" style={{ color: '#f0ece3' }}>
        {name}
      </span>
      {note && (
        <span
          className="text-xs px-2 py-0.5 rounded flex-shrink-0"
          style={{ background: 'rgba(110,118,129,0.12)', color: '#6e7681', border: '1px solid rgba(110,118,129,0.25)' }}
        >
          {note}
        </span>
      )}
      {delta != null && (
        <span className="text-xs font-semibold flex-shrink-0" style={{ color: deltaColor(delta) }}>
          {deltaLabel(delta)}
        </span>
      )}
      <span
        className="text-base font-black tabular-nums flex-shrink-0"
        style={{ color: gradeColor(grade), minWidth: 28, textAlign: 'right' }}
      >
        {grade ?? '—'}
      </span>
    </div>
  );
}

// ─── AllStudentsTable ─────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'grade-desc', label: 'Grade ↓' },
  { value: 'grade-asc',  label: 'Grade ↑' },
  { value: 'delta-desc', label: 'Delta ↓' },
  { value: 'hands-desc', label: 'Hands ↓' },
  { value: 'name-asc',   label: 'Name A–Z' },
];

function AllStudentsTable({ students, onStudentClick }) {
  const [search, setSearch]   = useState('');
  const [group,  setGroup]    = useState('All');
  const [sort,   setSort]     = useState('grade-desc');

  const groups = useMemo(
    () => ['All', ...Array.from(new Set(students.map(s => s.group)))],
    [students]
  );

  const rows = useMemo(() => {
    let list = students;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => s.name.toLowerCase().includes(q));
    }
    if (group !== 'All') {
      list = list.filter(s => s.group === group);
    }
    const [field, dir] = sort.split('-');
    list = [...list].sort((a, b) => {
      let av = field === 'name' ? a.name : (a[field] ?? -Infinity);
      let bv = field === 'name' ? b.name : (b[field] ?? -Infinity);
      if (field === 'name') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'desc' ? bv - av : av - bv;
    });
    return list;
  }, [students, search, group, sort]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
      data-testid="all-students-table"
    >
      <PanelHeader title="ALL STUDENTS" />

      {/* Controls */}
      <div className="flex flex-wrap gap-2 px-4 py-3" style={{ borderBottom: '1px solid #30363d' }}>
        {/* Search */}
        <input
          type="text"
          placeholder="🔍 Search students…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-0 text-sm rounded px-3 py-1.5 outline-none"
          style={{
            background: '#0d1117',
            border: '1px solid #30363d',
            color: '#e5e7eb',
            minWidth: 140,
          }}
          data-testid="student-search"
        />

        {/* Group filter */}
        <select
          value={group}
          onChange={e => setGroup(e.target.value)}
          className="text-sm rounded px-2 py-1.5 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' }}
          data-testid="group-filter"
        >
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="text-sm rounded px-2 py-1.5 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' }}
          data-testid="sort-select"
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table header */}
      <div
        className="grid text-xs font-semibold uppercase tracking-widest px-4 py-2"
        style={{
          gridTemplateColumns: '2rem 1fr 3.5rem 3rem 4rem 5rem 4rem',
          borderBottom: '1px solid #30363d',
          color: '#6e7681',
        }}
      >
        <span>#</span>
        <span>Student</span>
        <span className="text-right">Grade</span>
        <span className="text-right">Δ</span>
        <span className="text-right">Hands</span>
        <span className="text-right">Net</span>
        <span className="text-right">VPIP</span>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-center" style={{ color: '#6e7681' }}>
          No students match your filters.
        </div>
      ) : (
        rows.map((s, i) => (
          <div
            key={s.id}
            className="grid items-center px-4 py-2.5 cursor-pointer"
            style={{
              gridTemplateColumns: '2rem 1fr 3.5rem 3rem 4rem 5rem 4rem',
              borderBottom: '1px solid #21262d',
              background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
            }}
            onClick={() => onStudentClick(s)}
            data-testid={`student-row-${s.id}`}
          >
            <span className="text-xs" style={{ color: '#6e7681' }}>{i + 1}</span>
            <span className="text-sm font-semibold truncate" style={{ color: '#f0ece3' }}>{s.name}</span>
            <span className="text-sm font-black tabular-nums text-right" style={{ color: gradeColor(s.grade) }}>
              {s.grade ?? '—'}
            </span>
            <span className="text-xs font-semibold tabular-nums text-right" style={{ color: deltaColor(s.delta) }}>
              {deltaLabel(s.delta)}
            </span>
            <span className="text-xs tabular-nums text-right" style={{ color: '#e5e7eb' }}>
              {s.hands > 0 ? s.hands.toLocaleString() : '—'}
            </span>
            <span className="text-xs tabular-nums text-right" style={{ color: s.net == null ? '#6e7681' : s.net >= 0 ? '#3fb950' : '#f85149' }}>
              {formatNet(s.net)}
            </span>
            <span className="text-xs tabular-nums text-right" style={{ color: '#e5e7eb' }}>
              {s.vpip != null ? `${s.vpip}%` : '—'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

// ─── GroupBreakdownTable ──────────────────────────────────────────────────────

function GroupBreakdownTable({ groups, onGroupClick }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
      data-testid="group-breakdown-table"
    >
      <PanelHeader title="GROUP BREAKDOWN" />

      {/* Table header */}
      <div
        className="grid text-xs font-semibold uppercase tracking-widest px-4 py-2"
        style={{
          gridTemplateColumns: '1fr 5rem 5.5rem 5rem',
          borderBottom: '1px solid #30363d',
          color: '#6e7681',
        }}
      >
        <span>Group</span>
        <span className="text-right">Students</span>
        <span className="text-right">Avg Grade</span>
        <span className="text-right">Trend</span>
      </div>

      {groups.map((g, i) => (
        <div
          key={g.name}
          className="grid items-center px-4 py-3 cursor-pointer"
          style={{
            gridTemplateColumns: '1fr 5rem 5.5rem 5rem',
            borderBottom: '1px solid #21262d',
            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
          }}
          onClick={() => onGroupClick(g)}
          data-testid={`group-row-${g.name.replace(/\s+/g, '-').toLowerCase()}`}
        >
          <span className="text-sm font-semibold" style={{ color: '#f0ece3' }}>{g.name}</span>
          <span className="text-sm tabular-nums text-right" style={{ color: '#e5e7eb' }}>{g.students}</span>
          <span className="text-sm font-black tabular-nums text-right" style={{ color: gradeColor(g.avgGrade) }}>
            {g.avgGrade}
          </span>
          <span
            className="text-sm font-semibold tabular-nums text-right"
            style={{ color: deltaColor(g.trend) }}
          >
            {trendIcon(g.trend)} {deltaLabel(g.trend)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── StableOverviewPage ───────────────────────────────────────────────────────

export default function StableOverviewPage() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    apiFetch('/api/coach/reports/stable')
      .then(data => setOverview(data))
      .catch(err => setError(err.message ?? 'Failed to load overview'))
      .finally(() => setLoading(false));
  }, []);

  function goToCRM() { navigate('/admin/crm'); }

  if (loading) {
    return <div style={{ color: '#6e7681', padding: 24 }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ color: '#f85149', padding: 24 }}>{error}</div>;
  }

  // Map API shape → component-friendly shapes
  const students = (overview?.students ?? []).map(s => ({
    id:    s.player_id,
    name:  s.display_name,
    grade: s.overall_grade ?? null,
    delta: null,
    hands: null,
    net:   null,
    vpip:  null,
    group: 'Unassigned',
  }));

  const topPerformers = (overview?.top_performers ?? []).map(s => ({
    id:    s.player_id,
    name:  s.display_name,
    grade: s.overall_grade ?? null,
  }));

  const concerns = (overview?.concerns ?? []).map(s => ({
    id:    s.player_id,
    name:  s.display_name,
    grade: s.overall_grade ?? null,
  }));

  const activeCount = students.filter(s => s.grade != null).length;
  const avgGrade    = overview?.avg_grade ?? null;
  const gradeDelta  = null; // prev-period grade not returned by this endpoint

  // Calculate week label from period dates
  const weekLabel = (() => {
    const reports = overview?.students ?? [];
    if (reports.length === 0) return 'Week of —';
    const first = reports[0];
    if (!first.period_start || !first.period_end) return 'Week of —';
    const start = new Date(first.period_start);
    const end = new Date(first.period_end);
    const startMo = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endMo = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `Week of ${startMo}–${endMo}`;
  })();

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Page title */}
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Stable Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>{weekLabel}</p>
        </div>

        {/* Summary stats — 3 pills */}
        <div
          className="grid grid-cols-1 sm:grid-cols-3 gap-px rounded-xl overflow-hidden"
          style={{ background: '#30363d', border: '1px solid #30363d' }}
          data-testid="stable-averages"
        >
          {[
            {
              label: 'Avg Grade',
              value: avgGrade ?? '—',
              sub: 'no prior data',
              valueColor: gradeColor(avgGrade),
            },
            {
              label: 'Grade Δ',
              value: deltaLabel(gradeDelta),
              sub: 'vs last week',
              valueColor: deltaColor(gradeDelta),
            },
            {
              label: 'Active Students',
              value: `${activeCount}/${students.length}`,
              sub: 'enrolled',
              valueColor: '#f0ece3',
            },
          ].map(({ label, value, sub, valueColor }) => (
            <div
              key={label}
              className="flex flex-col gap-1 px-4 py-4"
              style={{ background: '#161b22' }}
              data-testid={`avg-${label.toLowerCase().replace(/[\s/]+/g, '-').replace(/[^a-z0-9-]/g, '')}`}
            >
              <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: '#6e7681' }}>
                {label}
              </span>
              <span className="text-2xl font-black" style={{ color: valueColor }}>
                {value}
              </span>
              <span className="text-xs" style={{ color: '#6e7681' }}>{sub}</span>
            </div>
          ))}
        </div>

        {/* Top Performers + Needs Attention — side-by-side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Top Performers */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
            data-testid="top-improvers"
          >
            <PanelHeader title="TOP PERFORMERS" titleColor="#3fb950" />
            {topPerformers.slice(0, 3).map((s, i) => (
              <StudentMiniRow
                key={s.id}
                rank={i + 1}
                name={s.name}
                grade={s.grade}
                delta={null}
                note={null}
                onClick={goToCRM}
              />
            ))}
            {topPerformers.length === 0 && (
              <p className="text-xs px-4 py-3" style={{ color: '#6e7681' }}>No data yet.</p>
            )}
          </div>

          {/* Needs Attention */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
            data-testid="needs-attention"
          >
            <PanelHeader title="NEEDS ATTENTION" titleColor="#f85149" />
            {concerns.slice(0, 3).map((s, i) => (
              <StudentMiniRow
                key={s.id}
                rank={i + 1}
                name={s.name}
                grade={s.grade}
                delta={null}
                note={null}
                onClick={goToCRM}
              />
            ))}
            {concerns.length === 0 && (
              <p className="text-xs px-4 py-3" style={{ color: '#6e7681' }}>No data yet.</p>
            )}
          </div>
        </div>

        {/* All Students table */}
        <AllStudentsTable
          students={students}
          onStudentClick={goToCRM}
        />

        {/* Group Breakdown table */}
        <GroupBreakdownTable
          groups={[]}
          onGroupClick={goToCRM}
        />

      </div>
    </div>
  );
}
