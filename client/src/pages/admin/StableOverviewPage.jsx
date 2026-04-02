import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

// ─── Mock data (replace with apiFetch('/api/coach/reports/stable') when backend ships) ──

const MOCK_STUDENTS = [
  { id: 1,  name: 'Sam Patel',     grade: 84, delta: +12, hands: 312, net: +18200, vpip: 21, group: 'MTT Beginners'  },
  { id: 2,  name: 'Taylor Wong',   grade: 79, delta:  +8, hands: 287, net: +11400, vpip: 23, group: 'Cash Advanced'  },
  { id: 3,  name: 'Riley Chen',    grade: 75, delta:  +5, hands: 198, net:  +8100, vpip: 22, group: 'MTT Beginners'  },
  { id: 4,  name: 'Marcus Torres', grade: 61, delta:  -6, hands: 203, net:  -3800, vpip: 27, group: 'River Defense'  },
  { id: 5,  name: 'Alex Kim',      grade: 54, delta: -17, hands: 142, net:  -1600, vpip: 25, group: 'River Defense'  },
  { id: 6,  name: 'Jordan Lee',    grade: null, delta: null, hands: 0, net: null, vpip: null, group: 'Unassigned' },
  { id: 7,  name: 'Jamie Davis',   grade: 71, delta:  +1, hands: 241, net:  +3200, vpip: 24, group: 'Cash Advanced'  },
  { id: 8,  name: 'Morgan Silva',  grade: 68, delta:  -2, hands: 178, net:  -900,  vpip: 26, group: 'MTT Beginners'  },
  { id: 9,  name: 'Casey Brown',   grade: 73, delta:  +3, hands: 195, net:  +4700, vpip: 20, group: 'Cash Advanced'  },
  { id: 10, name: 'Drew Martinez', grade: 66, delta:  -4, hands: 163, net:  -2100, vpip: 29, group: 'River Defense'  },
  { id: 11, name: 'Quinn Johnson', grade: 77, delta:  +7, hands: 224, net:  +7300, vpip: 22, group: 'MTT Beginners'  },
  { id: 12, name: 'Avery Williams',grade: 58, delta:  -9, hands: 117, net:  -4200, vpip: 31, group: 'Unassigned'     },
];

const MOCK_GROUPS = [
  { name: 'MTT Beginners', students: 12, avgGrade: 68, trend: +3  },
  { name: 'Cash Advanced', students:  8, avgGrade: 79, trend:  0  },
  { name: 'River Defense', students:  6, avgGrade: 61, trend: -4  },
  { name: 'Unassigned',    students:  6, avgGrade: 72, trend: +1  },
];

const MOCK_AVERAGES = {
  weekLabel:         'Week of Mar 24–30',
  avgGrade:           71,
  prevAvgGrade:       73,
  activeStudents:     28,
  totalStudents:      32,
  totalHands:        8247,
  avgHandsPerStudent: 295,
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
  const avg = MOCK_AVERAGES;
  const gradeDelta = avg.avgGrade - avg.prevAvgGrade;

  function goToCRM() {
    navigate('/admin/crm');
  }

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Page title */}
        <div>
          <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Stable Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>{avg.weekLabel}</p>
        </div>

        {/* Summary stats — 4 pills */}
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xl overflow-hidden"
          style={{ background: '#30363d', border: '1px solid #30363d' }}
          data-testid="stable-averages"
        >
          {[
            {
              label: 'Avg Grade',
              value: avg.avgGrade,
              sub: `prev: ${avg.prevAvgGrade}`,
              valueColor: gradeColor(avg.avgGrade),
            },
            {
              label: 'Grade Δ',
              value: deltaLabel(gradeDelta),
              sub: 'vs last week',
              valueColor: deltaColor(gradeDelta),
            },
            {
              label: 'Active Students',
              value: `${avg.activeStudents}/${avg.totalStudents}`,
              sub: 'enrolled',
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

        {/* Top Improvers + Needs Attention — side-by-side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Top Improvers */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
            data-testid="top-improvers"
          >
            <PanelHeader title="TOP IMPROVERS" titleColor="#3fb950" />
            {MOCK_STUDENTS
              .filter(s => s.delta != null && s.delta > 0)
              .sort((a, b) => b.delta - a.delta)
              .slice(0, 3)
              .map((s, i) => (
                <StudentMiniRow
                  key={s.id}
                  rank={i + 1}
                  name={s.name}
                  grade={s.grade}
                  delta={s.delta}
                  note={null}
                  onClick={goToCRM}
                />
              ))}
          </div>

          {/* Needs Attention */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
            data-testid="needs-attention"
          >
            <PanelHeader title="NEEDS ATTENTION" titleColor="#f85149" />
            {MOCK_STUDENTS
              .filter(s => (s.delta != null && s.delta < 0) || s.hands === 0)
              .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
              .slice(0, 3)
              .map((s, i) => (
                <StudentMiniRow
                  key={s.id}
                  rank={i + 1}
                  name={s.name}
                  grade={s.grade}
                  delta={s.delta}
                  note={s.hands === 0 ? 'inactive' : null}
                  onClick={goToCRM}
                />
              ))}
          </div>
        </div>

        {/* All Students table */}
        <AllStudentsTable
          students={MOCK_STUDENTS}
          onStudentClick={goToCRM}
        />

        {/* Group Breakdown table */}
        <GroupBreakdownTable
          groups={MOCK_GROUPS}
          onGroupClick={goToCRM}
        />

      </div>
    </div>
  );
}
