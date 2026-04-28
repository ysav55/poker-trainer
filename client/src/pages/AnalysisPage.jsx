import React, { useState, useCallback, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ── Constants ──────────────────────────────────────────────────────────────────

const GOLD   = '#d4af37';
const RED    = '#f85149';
const BLUE   = '#58a6ff';
const GREEN  = '#3fb950';
const PANEL  = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

const TAG_TYPE_COLORS = {
  auto:    '#58a6ff',
  mistake: '#f85149',
  sizing:  '#3fb950',
  coach:   '#d4af37',
};

// Max mistake tags to fetch hands for in the flagged-hands query
const MAX_MISTAKE_FETCH = 5;

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

// ── Custom chart label ─────────────────────────────────────────────────────────

function HorizBarLabel({ x, y, width, height, value }) {
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2 + 1}
      fontSize={10}
      fill="#8b949e"
      dominantBaseline="middle"
    >
      {value}
    </text>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

// ── Pill style helpers ─────────────────────────────────────────────────────────

const PILL_INACTIVE = {
  background: 'rgba(255,255,255,0.04)',
  border:     '1px solid rgba(255,255,255,0.1)',
  color:      '#6e7681',
  cursor:     'pointer',
  borderRadius: 4,
  padding:    '2px 10px',
  fontSize:   12,
  fontWeight: 500,
  lineHeight: '22px',
  transition: 'all 0.15s',
};

const PILL_ACTIVE = {
  background: 'rgba(212,175,55,0.15)',
  border:     '1px solid rgba(212,175,55,0.4)',
  color:      '#d4af37',
  cursor:     'pointer',
  borderRadius: 4,
  padding:    '2px 10px',
  fontSize:   12,
  fontWeight: 600,
  lineHeight: '22px',
  transition: 'all 0.15s',
};

function Pill({ label, active, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      style={active ? PILL_ACTIVE : PILL_INACTIVE}
    >
      {label}
    </button>
  );
}

// ── Period quick-pick helpers ──────────────────────────────────────────────────

function isoDate(d) {
  return d.toISOString().split('T')[0];
}

function getDateRange(period) {
  const today = new Date();
  if (period === '7d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 7);
    return { dateFrom: isoDate(from), dateTo: isoDate(today) };
  }
  if (period === '30d') {
    const from = new Date(today);
    from.setDate(today.getDate() - 30);
    return { dateFrom: isoDate(from), dateTo: isoDate(today) };
  }
  // 'all' or unknown
  return { dateFrom: '', dateTo: '' };
}

function FilterBar({ players, filters, onChange, onRun, loading }) {
  function handlePeriod(period) {
    const { dateFrom, dateTo } = getDateRange(period);
    onChange('period',   period);
    onChange('dateFrom', dateFrom);
    onChange('dateTo',   dateTo);
  }

  function handleDateInput(key, value) {
    onChange(key, value);
    onChange('period', 'custom');
  }

  return (
    <div
      className="flex flex-col gap-3 px-4 py-3 rounded-lg"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      {/* Row 1: Student + date range + run button */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Student selector */}
        <select
          value={filters.playerId}
          onChange={e => onChange('playerId', e.target.value)}
          data-testid="filter-player"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', minWidth: 160 }}
        >
          <option value="">Select Student ▾</option>
          {players.map(p => (
            <option key={p.stableId} value={p.stableId}>{p.name}</option>
          ))}
        </select>

        {/* Date range */}
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => handleDateInput('dateFrom', e.target.value)}
          data-testid="filter-date-from"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />
        <span className="text-xs text-gray-600">–</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => handleDateInput('dateTo', e.target.value)}
          data-testid="filter-date-to"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />

        <button
          onClick={onRun}
          disabled={loading}
          data-testid="run-analysis-btn"
          className="ml-auto rounded px-4 py-1.5 text-sm font-semibold transition-opacity"
          style={{
            background: loading ? 'rgba(212,175,55,0.3)' : 'rgba(212,175,55,0.2)',
            border: `1px solid rgba(212,175,55,0.5)`,
            color: GOLD,
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Analysing…' : 'Run Analysis'}
        </button>
      </div>

      {/* Row 2: Period + Game Type + Tag Type pills */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Period quick-picks */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Period</span>
          <Pill label="All time" active={filters.period === 'all'}    onClick={() => handlePeriod('all')}  testId="period-all" />
          <Pill label="7d"       active={filters.period === '7d'}     onClick={() => handlePeriod('7d')}   testId="period-7d" />
          <Pill label="30d"      active={filters.period === '30d'}    onClick={() => handlePeriod('30d')}  testId="period-30d" />
        </div>

        {/* Game type */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Game</span>
          <Pill label="All"        active={filters.gameType === ''}           onClick={() => onChange('gameType', '')}           testId="game-all" />
          <Pill label="Cash"       active={filters.gameType === 'cash'}       onClick={() => onChange('gameType', 'cash')}       testId="game-cash" />
          <Pill label="Tournament" active={filters.gameType === 'tournament'} onClick={() => onChange('gameType', 'tournament')} testId="game-tournament" />
        </div>

        {/* Tag type */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Tags</span>
          <Pill label="All"      active={filters.tagType === ''}        onClick={() => onChange('tagType', '')}        testId="tagtype-all" />
          <Pill label="Mistakes" active={filters.tagType === 'mistake'} onClick={() => onChange('tagType', 'mistake')} testId="tagtype-mistake" />
          <Pill label="Auto"     active={filters.tagType === 'auto'}    onClick={() => onChange('tagType', 'auto')}    testId="tagtype-auto" />
          <Pill label="Sizing"   active={filters.tagType === 'sizing'}  onClick={() => onChange('tagType', 'sizing')}  testId="tagtype-sizing" />
          <Pill label="Coach"    active={filters.tagType === 'coach'}   onClick={() => onChange('tagType', 'coach')}   testId="tagtype-coach" />
        </div>
      </div>
    </div>
  );
}

function ResultsSummary({ playerName, filters, totalHands, tagCount }) {
  const parts = [];
  if (playerName) parts.push(playerName);
  else parts.push('All Students');
  if (filters.dateFrom && filters.dateTo)
    parts.push(`${formatDate(filters.dateFrom)} – ${formatDate(filters.dateTo)}`);
  else if (filters.dateFrom)
    parts.push(`From ${formatDate(filters.dateFrom)}`);
  else if (filters.dateTo)
    parts.push(`Until ${formatDate(filters.dateTo)}`);

  return (
    <div
      className="px-4 py-2.5 rounded-lg text-sm flex items-center gap-4"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
      data-testid="summary-bar"
    >
      <span className="font-semibold text-gray-300">RESULTS: {parts.join(' · ')}</span>
      <span className="text-gray-500">
        <span className="font-mono text-gray-200 font-bold">{totalHands}</span> hands
      </span>
      <span className="text-gray-500">
        <span className="font-mono text-gray-200 font-bold">{tagCount}</span> unique tags
      </span>
    </div>
  );
}

function TagDistributionChart({ tags, onBarClick, selectedTag }) {
  const data = useMemo(() =>
    tags.slice(0, 12).map(t => ({
      name: t.tag,
      count: t.count,
      pct: t.pct,
      tag_type: t.tag_type,
    })),
    [tags]
  );

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-600" data-testid="tag-dist-empty">
        No tags found.
      </div>
    );
  }

  return (
    <div data-testid="tag-distribution-chart">
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 26)}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
          onClick={e => e?.activePayload?.[0] && onBarClick(e.activePayload[0].payload)}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#21262d" />
          <XAxis
            type="number"
            tick={{ fill: '#6e7681', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#e6edf3', fontSize: 11 }}
            width={100}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
            labelStyle={{ color: '#e6edf3', fontSize: 12 }}
            itemStyle={{ color: GOLD, fontSize: 12 }}
            formatter={(v, _, { payload }) => [`${v} hands (${payload.pct}%)`, payload.tag_type]}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]} cursor="pointer" label={<HorizBarLabel />}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={TAG_TYPE_COLORS[entry.tag_type] ?? GOLD}
                opacity={!selectedTag || selectedTag === entry.name ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MistakeBreakdownChart({ tags, onBarClick, selectedTag }) {
  const data = useMemo(() =>
    tags.filter(t => t.tag_type === 'mistake').slice(0, 10).map(t => ({
      name: t.tag,
      count: t.count,
      pct: t.pct,
      tag_type: t.tag_type,
    })),
    [tags]
  );

  if (data.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-gray-600" data-testid="mistake-chart-empty">
        No mistakes detected.
      </div>
    );
  }

  return (
    <div data-testid="mistake-breakdown-chart">
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 26)}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 0, right: 48, left: 8, bottom: 0 }}
          onClick={e => e?.activePayload?.[0] && onBarClick(e.activePayload[0].payload)}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#21262d" />
          <XAxis
            type="number"
            tick={{ fill: '#6e7681', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#f85149', fontSize: 11 }}
            width={100}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
            labelStyle={{ color: '#e6edf3', fontSize: 12 }}
            itemStyle={{ color: RED, fontSize: 12 }}
            formatter={(v, _, { payload }) => [`${v} hands (${payload.pct}%)`, 'Mistakes']}
          />
          <Bar dataKey="count" fill={RED} radius={[0, 3, 3, 0]} cursor="pointer" label={<HorizBarLabel />}>
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={RED}
                opacity={!selectedTag || selectedTag === entry.name ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FlaggedHandsList({ hands, loading, tagFilter }) {
  const navigate = useNavigate();

  const displayed = useMemo(() => {
    if (!tagFilter) return hands;
    return hands.filter(h => h.tags.includes(tagFilter));
  }, [hands, tagFilter]);

  return (
    <div style={PANEL} className="rounded-lg overflow-hidden" data-testid="flagged-hands">
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid #21262d' }}
      >
        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: RED }}>
          Flagged Hands {displayed.length > 0 && `(${displayed.length})`}
        </span>
        {tagFilter && (
          <span className="text-xs text-gray-500">Filtered: {tagFilter}</span>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-600">Loading hands…</div>
      ) : displayed.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-600" data-testid="flagged-hands-empty">
          {tagFilter ? `No hands found for ${tagFilter}.` : 'No flagged hands.'}
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: '#21262d' }}>
          {displayed.slice(0, 30).map(h => (
            <div
              key={h.hand_id}
              className="px-4 py-3 flex items-center justify-between group cursor-pointer"
              style={{ background: 'transparent', transition: 'background 0.1s' }}
              onClick={() => {
                const handIds = displayed.slice(0, 30).map(d => d.hand_id);
                const currentIndex = handIds.indexOf(h.hand_id);
                navigate(`/review?handId=${h.hand_id}`, { state: { handIds, currentIndex } });
              }}
              data-testid={`flagged-hand-${h.hand_id}`}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-mono text-gray-200">
                    Hand #{h.hand_number ?? h.hand_id?.slice(-6)}
                  </span>
                  {h.mistakeTags.map(tag => (
                    <span
                      key={tag}
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.3)', color: RED }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="text-xs text-gray-600">{formatDate(h.started_at)}</span>
              </div>
              <span
                className="text-xs font-semibold ml-4 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: GOLD }}
              >
                Open in Review Table →
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compare Players panel ──────────────────────────────────────────────────────

const COMPARE_COLORS = ['#58a6ff', '#3fb950', '#d4af37', '#f85149'];

function ComparePlayersPanel({ players }) {
  const MAX = 4;
  const [selectedIds, setSelectedIds] = useState(['', '']);
  const [results, setResults]         = useState([]); // [{ name, totalHands, tags }]
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  function setPlayer(idx, id) {
    setSelectedIds(prev => {
      const next = [...prev];
      next[idx] = id;
      return next;
    });
  }

  function addSlot() {
    if (selectedIds.length < MAX) setSelectedIds(prev => [...prev, '']);
  }

  function removeSlot(idx) {
    setSelectedIds(prev => prev.filter((_, i) => i !== idx));
    setResults([]);
  }

  async function handleCompare() {
    const ids = selectedIds.filter(Boolean);
    if (ids.length < 2) { setError('Select at least 2 players.'); return; }
    if (new Set(ids).size !== ids.length) { setError('Duplicate players selected.'); return; }
    setLoading(true);
    setError('');
    setResults([]);
    try {
      const fetches = ids.map(id =>
        apiFetch(`/api/analysis/tags?playerId=${id}`)
          .then(d => ({
            name: players.find(p => p.stableId === id)?.name ?? id,
            totalHands: d?.totalHands ?? 0,
            tags: d?.tags ?? [],
          }))
      );
      const data = await Promise.all(fetches);
      setResults(data);
    } catch (err) {
      setError(err.message ?? 'Failed to compare players.');
    } finally {
      setLoading(false);
    }
  }

  // Build a unified tag list from all players (top 10 by max occurrence across any player)
  const allTagNames = useMemo(() => {
    if (results.length === 0) return [];
    const tagMap = new Map();
    for (const r of results) {
      for (const t of r.tags) {
        const prev = tagMap.get(t.tag) ?? { maxPct: 0, tag_type: t.tag_type };
        tagMap.set(t.tag, { maxPct: Math.max(prev.maxPct, t.pct), tag_type: t.tag_type });
      }
    }
    return [...tagMap.entries()]
      .sort((a, b) => b[1].maxPct - a[1].maxPct)
      .slice(0, 12)
      .map(([tag, meta]) => ({ tag, tag_type: meta.tag_type }));
  }, [results]);

  return (
    <div style={PANEL} className="rounded-lg overflow-hidden">
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid #21262d' }}
      >
        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: BLUE }}>
          Compare Players
        </span>
        {selectedIds.length < MAX && (
          <button
            onClick={addSlot}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #30363d', color: '#8b949e' }}
          >
            + Add Player
          </button>
        )}
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Player selectors */}
        <div className="flex flex-wrap gap-2 items-center">
          {selectedIds.map((id, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: COMPARE_COLORS[idx] }}
              />
              <select
                value={id}
                onChange={e => setPlayer(idx, e.target.value)}
                className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
                style={{ background: '#0d1117', border: `1px solid ${COMPARE_COLORS[idx]}44`, minWidth: 150 }}
              >
                <option value="">Player {idx + 1} ▾</option>
                {players.map(p => (
                  <option key={p.stableId} value={p.stableId}>{p.name}</option>
                ))}
              </select>
              {selectedIds.length > 2 && (
                <button
                  onClick={() => removeSlot(idx)}
                  style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            onClick={handleCompare}
            disabled={loading}
            className="ml-auto rounded px-4 py-1.5 text-sm font-semibold transition-opacity"
            style={{
              background: loading ? 'rgba(88,166,255,0.15)' : 'rgba(88,166,255,0.2)',
              border: '1px solid rgba(88,166,255,0.4)',
              color: BLUE,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Loading…' : 'Compare'}
          </button>
        </div>

        {error && (
          <div className="text-xs px-3 py-2 rounded" style={{ background: 'rgba(248,81,73,0.1)', color: RED }}>
            {error}
          </div>
        )}

        {/* Results table */}
        {results.length > 0 && (
          <div className="overflow-x-auto">
            {/* Header row — player names + hand counts */}
            <div
              className="grid gap-px text-xs font-bold uppercase tracking-wider"
              style={{ gridTemplateColumns: `180px repeat(${results.length}, 1fr)`, color: '#6e7681' }}
            >
              <div className="px-2 py-2">Tag</div>
              {results.map((r, i) => (
                <div key={i} className="px-2 py-2 text-center" style={{ color: COMPARE_COLORS[i] }}>
                  {r.name}
                  <span className="block text-[9px] font-normal mt-0.5" style={{ color: '#6e7681' }}>
                    {r.totalHands} hands
                  </span>
                </div>
              ))}
            </div>

            <div style={{ border: '1px solid #21262d', borderRadius: 6, overflow: 'hidden' }}>
              {allTagNames.map(({ tag, tag_type }, rowIdx) => (
                <div
                  key={tag}
                  className="grid gap-px text-sm"
                  style={{
                    gridTemplateColumns: `180px repeat(${results.length}, 1fr)`,
                    background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                    borderBottom: rowIdx < allTagNames.length - 1 ? '1px solid #21262d' : 'none',
                  }}
                >
                  <div className="px-3 py-2 flex items-center gap-2">
                    <span
                      className="text-[9px] font-bold px-1 py-0.5 rounded uppercase"
                      style={{
                        background: `${TAG_TYPE_COLORS[tag_type] ?? GOLD}18`,
                        border: `1px solid ${TAG_TYPE_COLORS[tag_type] ?? GOLD}44`,
                        color: TAG_TYPE_COLORS[tag_type] ?? GOLD,
                      }}
                    >
                      {tag_type}
                    </span>
                    <span className="text-xs text-gray-300 font-mono">{tag}</span>
                  </div>
                  {results.map((r, ci) => {
                    const entry = r.tags.find(t => t.tag === tag);
                    return (
                      <div
                        key={ci}
                        className="px-3 py-2 text-center text-xs font-mono"
                        style={{ color: entry ? COMPARE_COLORS[ci] : '#3d444d' }}
                      >
                        {entry ? `${entry.pct}%` : '—'}
                        {entry && (
                          <span className="block text-[9px]" style={{ color: '#6e7681' }}>
                            {entry.count}×
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { user } = useAuth();
  const isCoachPlus = COACH_ROLES.has(user?.role);

  if (!isCoachPlus) return <Navigate to="/lobby" replace />;

  return <AnalysisPageInner />;
}

function AnalysisPageInner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isCoachPlus = COACH_ROLES.has(user?.role);

  // Filter state
  const [filters, setFilters]   = useState({
    playerId: '',
    dateFrom: '',
    dateTo:   '',
    period:   'all',
    gameType: '',
    tagType:  '',
  });
  const [players, setPlayers]   = useState([]);
  const [playersLoaded, setPlayersLoaded] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Results state
  const [hasRun, setHasRun]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [tagData, setTagData]       = useState({ totalHands: 0, tags: [] });
  const [flaggedHands, setFlaggedHands] = useState([]);
  const [handsLoading, setHandsLoading] = useState(false);

  // Interaction state
  const [selectedTag, setSelectedTag] = useState(null);

  // Load players once on first render (needed for the dropdown)
  React.useEffect(() => {
    if (playersLoaded) return;
    setPlayersLoaded(true);
    apiFetch('/api/players')
      .then(d => setPlayers(d?.players ?? []))
      .catch(() => {});
  }, [playersLoaded]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Run analysis: fetch tags, then fetch flagged hands for top mistake tags
  const handleRun = useCallback(async () => {
    setLoading(true);
    setError('');
    setHasRun(true);
    setSelectedTag(null);
    setFlaggedHands([]);

    const params = new URLSearchParams();
    if (filters.playerId) params.set('playerId', filters.playerId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.set('dateTo',   filters.dateTo);
    if (filters.gameType) params.set('gameType', filters.gameType);
    if (filters.tagType)  params.set('tagType',  filters.tagType);

    let fetchedTags = { totalHands: 0, tags: [] };
    try {
      fetchedTags = await apiFetch(`/api/analysis/tags?${params}`) ?? { totalHands: 0, tags: [] };
      setTagData(fetchedTags);
    } catch (err) {
      setError(err.message ?? 'Failed to load analysis data.');
      setLoading(false);
      return;
    }
    setLoading(false);

    // Fetch flagged hands (hands with mistake tags)
    const mistakeTags = fetchedTags.tags
      .filter(t => t.tag_type === 'mistake')
      .slice(0, MAX_MISTAKE_FETCH)
      .map(t => t.tag);

    if (mistakeTags.length === 0) return;

    setHandsLoading(true);
    try {
      const results = await Promise.allSettled(
        mistakeTags.map(tag => {
          const p = new URLSearchParams({ tag });
          if (filters.playerId) p.set('playerId', filters.playerId);
          if (filters.dateFrom) p.set('dateFrom', filters.dateFrom);
          if (filters.dateTo)   p.set('dateTo',   filters.dateTo);
          if (filters.gameType) p.set('gameType', filters.gameType);
          return apiFetch(`/api/analysis/hands-by-tag?${p}`)
            .then(d => ({ tag, hands: d?.hands ?? [] }));
        })
      );

      // Merge + deduplicate hands by hand_id
      const handMap = new Map();
      for (const res of results) {
        if (res.status !== 'fulfilled') continue;
        const { tag, hands } = res.value;
        for (const h of hands) {
          if (!handMap.has(h.hand_id)) {
            handMap.set(h.hand_id, { ...h, mistakeTags: [] });
          }
          handMap.get(h.hand_id).mistakeTags.push(tag);
        }
      }

      const merged = [...handMap.values()].sort(
        (a, b) => new Date(b.started_at) - new Date(a.started_at)
      );
      setFlaggedHands(merged);
    } catch {
      // non-fatal — flagged hands just stay empty
    } finally {
      setHandsLoading(false);
    }
  }, [filters]);

  const handleBarClick = useCallback((payload) => {
    setSelectedTag(prev => prev === payload?.name ? null : payload?.name ?? null);
  }, []);

  const selectedPlayerName = useMemo(
    () => players.find(p => p.stableId === filters.playerId)?.name,
    [players, filters.playerId]
  );

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-5xl mx-auto px-4 py-5 flex flex-col gap-4">

        {/* Page title */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/lobby')}
            className="text-sm"
            style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            data-testid="back-to-lobby"
          >
            ← Lobby
          </button>
          <h1 className="text-lg font-bold tracking-wide" style={{ color: '#e6edf3' }}>
            AI Hand Analysis
          </h1>
          {isCoachPlus && (
            <button
              onClick={() => setShowCompare(v => !v)}
              className="ml-auto text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                background: showCompare ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${showCompare ? 'rgba(88,166,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                color: showCompare ? BLUE : '#6b7280',
              }}
              data-testid="toggle-compare"
            >
              Compare Players
            </button>
          )}
        </div>

        {/* Filter bar — hidden in compare mode */}
        {!showCompare && (
          <FilterBar
            players={players}
            filters={filters}
            onChange={handleFilterChange}
            onRun={handleRun}
            loading={loading}
          />
        )}

        {/* Compare panel */}
        {showCompare && <ComparePlayersPanel players={players} />}

        {/* Error */}
        {error && (
          <div
            className="px-4 py-3 rounded-lg text-sm"
            style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: RED }}
          >
            {error}
          </div>
        )}

        {/* Results — hidden in compare mode */}
        {!showCompare && hasRun && !loading && (
          <>
            {/* Summary line */}
            <ResultsSummary
              playerName={selectedPlayerName}
              filters={filters}
              totalHands={tagData.totalHands}
              tagCount={tagData.tags.length}
            />

            {/* Charts */}
            <div className="grid grid-cols-2 gap-4">
              {/* Tag Distribution */}
              <div style={PANEL} className="rounded-lg overflow-hidden">
                <div
                  className="px-4 py-2.5 text-xs font-bold tracking-wider uppercase text-gray-500"
                  style={{ borderBottom: '1px solid #21262d' }}
                >
                  Tag Distribution
                </div>
                <div className="px-2 py-3">
                  <TagDistributionChart
                    tags={tagData.tags}
                    onBarClick={handleBarClick}
                    selectedTag={selectedTag}
                  />
                </div>
              </div>

              {/* Mistake Breakdown */}
              <div style={PANEL} className="rounded-lg overflow-hidden">
                <div
                  className="px-4 py-2.5 text-xs font-bold tracking-wider uppercase"
                  style={{ borderBottom: '1px solid #21262d', color: RED }}
                >
                  Mistake Breakdown
                </div>
                <div className="px-2 py-3">
                  <MistakeBreakdownChart
                    tags={tagData.tags}
                    onBarClick={handleBarClick}
                    selectedTag={selectedTag}
                  />
                </div>
              </div>
            </div>

            {/* Flagged Hands */}
            <FlaggedHandsList
              hands={flaggedHands}
              loading={handsLoading}
              tagFilter={selectedTag}
            />
          </>
        )}

        {/* Idle state — hidden in compare mode */}
        {!showCompare && !hasRun && !loading && (
          <div
            className="py-16 text-center text-sm text-gray-600 rounded-lg"
            style={{ border: '1px solid #21262d' }}
            data-testid="idle-state"
          >
            Select a student and date range, then click <strong className="text-gray-500">Run Analysis</strong>.
          </div>
        )}

      </div>
    </div>
  );
}
