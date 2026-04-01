import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Constants ──────────────────────────────────────────────────────────────────

const GOLD  = '#d4af37';
const PANEL = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

const TAG_TYPE_LABELS = {
  '':       'All Types',
  auto:     'Auto',
  mistake:  'Mistake',
  sizing:   'Sizing',
  coach:    'Coach',
};

const TAG_TYPE_COLORS = {
  auto:    { color: '#58a6ff', bg: 'rgba(88,166,255,0.12)',  border: 'rgba(88,166,255,0.3)'  },
  mistake: { color: '#f85149', bg: 'rgba(248,81,73,0.12)',   border: 'rgba(248,81,73,0.3)'   },
  sizing:  { color: '#3fb950', bg: 'rgba(63,185,80,0.12)',   border: 'rgba(63,185,80,0.3)'   },
  coach:   { color: '#d4af37', bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.3)'  },
};

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function TagTypePill({ type }) {
  const c = TAG_TYPE_COLORS[type] || TAG_TYPE_COLORS.auto;
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
    >
      {type?.toUpperCase()}
    </span>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function FilterBar({ players, filters, onChange }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      {/* Player selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Player</span>
        <select
          value={filters.playerId}
          onChange={e => onChange('playerId', e.target.value)}
          data-testid="filter-player"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', minWidth: 140 }}
        >
          <option value="">All Players</option>
          {players.map(p => (
            <option key={p.stableId} value={p.stableId}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">From</span>
        <input
          type="date"
          value={filters.dateFrom}
          onChange={e => onChange('dateFrom', e.target.value)}
          data-testid="filter-date-from"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">To</span>
        <input
          type="date"
          value={filters.dateTo}
          onChange={e => onChange('dateTo', e.target.value)}
          data-testid="filter-date-to"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />
      </div>

      {/* Tag type filter */}
      <div className="flex gap-1.5 ml-auto">
        {Object.entries(TAG_TYPE_LABELS).map(([val, label]) => (
          <button
            key={val}
            onClick={() => onChange('tagType', val)}
            data-testid={`filter-tagtype-${val || 'all'}`}
            className="text-xs px-3 py-1 rounded-full font-semibold transition-colors"
            style={
              filters.tagType === val
                ? { background: 'rgba(212,175,55,0.18)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TagTable({ tags, selectedTag, onSelectTag, loading }) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-gray-600">Loading…</div>;
  }
  if (tags.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-gray-600" data-testid="tag-table-empty">
        No tags found for the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" data-testid="tag-table">
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #30363d', background: '#0d1117' }}>
            {[
              { label: 'Tag', w: null },
              { label: 'Type', w: 80 },
              { label: 'Hands', w: 70 },
              { label: '% Hands', w: 90 },
              { label: 'Trend', w: 60 },
            ].map(({ label, w }) => (
              <th
                key={label}
                style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  color: '#6e7681',
                  fontWeight: 600,
                  fontSize: 10,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  width: w ?? undefined,
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tags.map(t => {
            const isSelected = selectedTag?.tag === t.tag && selectedTag?.tag_type === t.tag_type;
            return (
              <tr
                key={`${t.tag_type}-${t.tag}`}
                onClick={() => onSelectTag(isSelected ? null : t)}
                data-testid={`tag-row-${t.tag}`}
                style={{
                  borderBottom: '1px solid #21262d',
                  background: isSelected ? 'rgba(212,175,55,0.07)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(212,175,55,0.07)' : 'transparent'; }}
              >
                <td style={{ padding: '8px 12px', color: '#e6edf3', fontWeight: isSelected ? 700 : 400 }}>
                  {t.tag}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <TagTypePill type={t.tag_type} />
                </td>
                <td style={{ padding: '8px 12px', color: '#8b949e', fontFamily: 'monospace' }}>
                  {t.count}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div className="flex items-center gap-2">
                    <div
                      style={{
                        width: `${Math.min(t.pct, 100) * 0.6}px`,
                        height: 4,
                        background: TAG_TYPE_COLORS[t.tag_type]?.color ?? GOLD,
                        borderRadius: 2,
                        minWidth: 2,
                      }}
                    />
                    <span style={{ color: '#8b949e', fontFamily: 'monospace', fontSize: 12 }}>
                      {t.pct}%
                    </span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px', color: '#6e7681', fontSize: 12 }}>
                  {t.pct >= 50 ? '↑' : t.pct >= 20 ? '→' : '↓'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MistakeSpotlight({ tags }) {
  const top3 = useMemo(
    () => tags.filter(t => t.tag_type === 'mistake').slice(0, 3),
    [tags]
  );

  if (top3.length === 0) {
    return (
      <div
        className="rounded-lg p-4 text-center"
        style={{ background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.15)' }}
        data-testid="mistake-spotlight-empty"
      >
        <div className="text-xs text-gray-600">No mistakes detected in this sample.</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'rgba(248,81,73,0.05)', border: '1px solid rgba(248,81,73,0.2)' }}
      data-testid="mistake-spotlight"
    >
      <div className="text-xs font-bold tracking-wider uppercase mb-3" style={{ color: '#f85149' }}>
        Mistake Spotlight
      </div>
      <div className="flex flex-col gap-2">
        {top3.map((t, i) => (
          <div key={t.tag} className="flex items-center gap-3">
            <span className="text-lg">{['🔴', '🟠', '🟡'][i]}</span>
            <div className="flex-1">
              <span className="text-sm font-semibold text-gray-200">{t.tag}</span>
              <span className="ml-2 text-xs text-gray-500">{t.count} hands ({t.pct}%)</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HandBreakdownPanel({ tag, hands, loading, navigate }) {
  if (!tag) return null;

  const c = TAG_TYPE_COLORS[tag.tag_type] || TAG_TYPE_COLORS.auto;

  return (
    <div
      className="rounded-lg p-4"
      style={{ ...PANEL }}
      data-testid="hand-breakdown-panel"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-100">{tag.tag}</span>
          <TagTypePill type={tag.tag_type} />
        </div>
        <span className="text-xs text-gray-500">{tag.count} matching hand{tag.count !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-gray-600">Loading hands…</div>
      ) : hands.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-600">No hands found.</div>
      ) : (
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          {hands.map(h => (
            <div
              key={h.hand_id}
              className="flex items-center justify-between rounded px-3 py-2 cursor-pointer"
              style={{ background: '#0d1117', border: '1px solid #21262d' }}
              onClick={() => h.table_id && navigate(`/table/${h.table_id}`)}
              data-testid={`hand-row-${h.hand_id}`}
            >
              <div className="flex flex-col">
                <span className="text-xs text-gray-400">{formatDate(h.started_at)}</span>
                {h.winner_name && (
                  <span className="text-xs text-gray-600">Won: {h.winner_name}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {h.final_pot != null && (
                  <span className="text-xs font-mono" style={{ color: c.color }}>
                    Pot {h.final_pot}
                  </span>
                )}
                {h.table_id && (
                  <span className="text-xs text-gray-600">→</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SizingChart({ tags }) {
  const SIZING_ORDER = ['PROBE_BET', 'THIRD_POT_BET', 'HALF_POT_BET', 'POT_BET', 'OVERBET', 'OVERBET_JAM'];
  const SIZING_LABELS = {
    PROBE_BET:    '<25%',
    THIRD_POT_BET:'33%',
    HALF_POT_BET: '50%',
    POT_BET:      'Pot',
    OVERBET:      'Over',
    OVERBET_JAM:  'Jam',
  };

  const data = useMemo(() => {
    const tagMap = new Map(tags.filter(t => t.tag_type === 'sizing').map(t => [t.tag, t]));
    return SIZING_ORDER.map(key => ({
      name:  SIZING_LABELS[key] || key,
      hands: tagMap.get(key)?.count ?? 0,
      pct:   tagMap.get(key)?.pct ?? 0,
      tag:   key,
    }));
  }, [tags]);

  const hasData = data.some(d => d.hands > 0);

  return (
    <div style={PANEL} className="p-4 rounded-lg" data-testid="sizing-chart">
      <div className="text-xs font-bold tracking-wider uppercase mb-3 text-gray-500">
        Sizing Distribution
      </div>
      {!hasData ? (
        <div className="py-4 text-center text-xs text-gray-600">No sizing data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: '#6e7681', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#6e7681', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}
              labelStyle={{ color: '#e6edf3', fontSize: 12 }}
              itemStyle={{ color: '#3fb950', fontSize: 12 }}
              formatter={(v) => [`${v} hands`, 'Count']}
            />
            <Bar dataKey="hands" fill="#3fb950" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function ComparePanel({ players, filters }) {
  const [player2Id, setPlayer2Id] = useState('');
  const [data2, setData2] = useState(null);
  const [loading2, setLoading2] = useState(false);

  useEffect(() => {
    if (!player2Id) { setData2(null); return; }
    setLoading2(true);
    const params = new URLSearchParams({ playerId: player2Id });
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.set('dateTo', filters.dateTo);
    if (filters.tagType)  params.set('tagType', filters.tagType);

    apiFetch(`/api/analysis/tags?${params}`)
      .then(setData2)
      .catch(() => setData2(null))
      .finally(() => setLoading2(false));
  }, [player2Id, filters.dateFrom, filters.dateTo, filters.tagType]);

  const player1Name = players.find(p => p.stableId === filters.playerId)?.name ?? 'All Players';
  const player2Name = players.find(p => p.stableId === player2Id)?.name ?? '—';

  return (
    <div style={PANEL} className="p-4 rounded-lg" data-testid="compare-panel">
      <div className="text-xs font-bold tracking-wider uppercase mb-3 text-gray-500">
        Player Comparison
      </div>

      <div className="mb-4">
        <select
          value={player2Id}
          onChange={e => setPlayer2Id(e.target.value)}
          data-testid="compare-player2"
          className="rounded px-2 py-1 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', minWidth: 160 }}
        >
          <option value="">Select player to compare…</option>
          {players
            .filter(p => p.stableId !== filters.playerId)
            .map(p => (
              <option key={p.stableId} value={p.stableId}>{p.name}</option>
            ))}
        </select>
      </div>

      {player2Id && (
        loading2 ? (
          <div className="py-4 text-center text-xs text-gray-600">Loading comparison…</div>
        ) : data2 ? (
          <CompareGrid player1Name={player1Name} player2Name={player2Name} data2={data2} />
        ) : null
      )}
    </div>
  );
}

function CompareGrid({ player1Name, player2Name, data1, data2 }) {
  // Build unified tag list
  const tagSet = new Map();
  (data1?.tags || []).forEach(t => tagSet.set(t.tag, { tag: t.tag, tag_type: t.tag_type, pct1: t.pct, pct2: 0 }));
  (data2?.tags || []).forEach(t => {
    if (tagSet.has(t.tag)) tagSet.get(t.tag).pct2 = t.pct;
    else tagSet.set(t.tag, { tag: t.tag, tag_type: t.tag_type, pct1: 0, pct2: t.pct });
  });

  const rows = [...tagSet.values()].sort((a, b) => Math.abs(b.pct1 - b.pct2) - Math.abs(a.pct1 - a.pct2));

  if (rows.length === 0) {
    return <div className="text-xs text-gray-600 text-center">No overlapping tags.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #21262d' }}>
            <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6e7681', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>Tag</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#58a6ff', fontSize: 10, fontWeight: 600 }}>{player1Name}</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#d4af37', fontSize: 10, fontWeight: 600 }}>{player2Name}</th>
            <th style={{ padding: '6px 8px', textAlign: 'right', color: '#6e7681', fontSize: 10, fontWeight: 600 }}>Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 15).map(r => {
            const diff = r.pct1 - r.pct2;
            const diffColor = diff > 0 ? '#58a6ff' : diff < 0 ? '#d4af37' : '#6e7681';
            return (
              <tr key={r.tag} style={{ borderBottom: '1px solid #21262d' }}>
                <td style={{ padding: '5px 8px', color: '#e6edf3' }}>
                  <span className="mr-1">{r.tag}</span>
                  <TagTypePill type={r.tag_type} />
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#58a6ff' }}>{r.pct1}%</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#d4af37' }}>{r.pct2}%</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontFamily: 'monospace', color: diffColor, fontWeight: 600 }}>
                  {diff > 0 ? '+' : ''}{diff}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const isCoachPlus = COACH_ROLES.has(user?.role);

  // Filter state
  const [filters, setFilters] = useState({ playerId: '', dateFrom: '', dateTo: '', tagType: '' });

  // Data state
  const [players, setPlayers]     = useState([]);
  const [tagData, setTagData]     = useState({ totalHands: 0, tags: [] });
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Tag breakdown state
  const [selectedTag, setSelectedTag]   = useState(null);
  const [handsForTag, setHandsForTag]   = useState([]);
  const [handsLoading, setHandsLoading] = useState(false);

  // Comparison mode
  const [compareMode, setCompareMode] = useState(false);

  // Load players once
  useEffect(() => {
    apiFetch('/api/players')
      .then(d => setPlayers(d?.players ?? []))
      .catch(() => {});
  }, []);

  // Load tag data whenever filters change
  const fetchTags = useCallback(() => {
    setLoading(true);
    setError('');
    setSelectedTag(null);
    setHandsForTag([]);

    const params = new URLSearchParams();
    if (filters.playerId) params.set('playerId', filters.playerId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.set('dateTo', filters.dateTo);
    if (filters.tagType)  params.set('tagType', filters.tagType);

    apiFetch(`/api/analysis/tags?${params}`)
      .then(d => setTagData(d ?? { totalHands: 0, tags: [] }))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  // Load hands for selected tag
  useEffect(() => {
    if (!selectedTag) { setHandsForTag([]); return; }
    setHandsLoading(true);

    const params = new URLSearchParams({ tag: selectedTag.tag });
    if (filters.playerId) params.set('playerId', filters.playerId);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.set('dateTo', filters.dateTo);

    apiFetch(`/api/analysis/hands-by-tag?${params}`)
      .then(d => setHandsForTag(d?.hands ?? []))
      .catch(() => setHandsForTag([]))
      .finally(() => setHandsLoading(false));
  }, [selectedTag, filters.playerId, filters.dateFrom, filters.dateTo]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const selectedPlayerName = useMemo(
    () => players.find(p => p.stableId === filters.playerId)?.name,
    [players, filters.playerId]
  );

  return (
    <div
      className="min-h-screen w-screen flex flex-col"
      style={{ background: '#0d1117', color: '#e5e7eb' }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,175,55,0.02) 0%, transparent 60%)' }}
      />

      {/* Top bar */}
      <header
        className="relative z-40 flex items-center justify-between px-5 flex-shrink-0"
        style={{ height: 48, background: '#0d1117', borderBottom: '1px solid #30363d' }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/lobby')}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            data-testid="back-to-lobby"
          >
            ← Lobby
          </button>
          <span style={{ color: '#30363d' }}>|</span>
          <span className="text-base font-black tracking-[0.15em] uppercase" style={{ color: GOLD }}>
            AI Analysis
          </span>
          {selectedPlayerName && (
            <span className="text-xs text-gray-500">— {selectedPlayerName}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isCoachPlus && (
            <button
              onClick={() => setCompareMode(m => !m)}
              data-testid="toggle-compare"
              className="text-xs px-3 py-1 rounded-full transition-colors font-semibold"
              style={
                compareMode
                  ? { background: 'rgba(212,175,55,0.18)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d', color: '#8b949e' }
              }
            >
              Compare Players
            </button>
          )}
          <span className="text-sm text-gray-400 hidden sm:inline">{user?.name}</span>
        </div>
      </header>

      {/* Body */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-5 flex flex-col gap-4">

          {/* Filters */}
          <FilterBar players={players} filters={filters} onChange={handleFilterChange} />

          {/* Summary bar */}
          {!loading && tagData.totalHands > 0 && (
            <div
              className="flex items-center gap-6 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: '#161b22', border: '1px solid #30363d' }}
              data-testid="summary-bar"
            >
              <span className="text-gray-500">
                <span className="font-mono text-gray-200 font-bold">{tagData.totalHands}</span>
                {' '}hands analyzed
              </span>
              <span className="text-gray-500">
                <span className="font-mono text-gray-200 font-bold">{tagData.tags.length}</span>
                {' '}unique tags
              </span>
              {tagData.tags[0] && (
                <span className="text-gray-500">
                  Top tag: <span className="text-gray-200 font-semibold">{tagData.tags[0].tag}</span>
                  <span className="ml-1 font-mono text-gray-400">({tagData.tags[0].pct}%)</span>
                </span>
              )}
            </div>
          )}

          {error && (
            <div
              className="px-4 py-3 rounded-lg text-sm"
              style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
            >
              {error}
            </div>
          )}

          {/* Main content grid */}
          <div className="grid gap-4" style={{ gridTemplateColumns: compareMode ? '1fr 1fr' : '1fr 320px' }}>

            {/* Left: Tag table + breakdown */}
            <div className="flex flex-col gap-4">
              {/* Tag frequency table */}
              <div style={PANEL} className="rounded-lg overflow-hidden">
                <div
                  className="px-4 py-2.5 text-xs font-bold tracking-wider uppercase text-gray-500"
                  style={{ borderBottom: '1px solid #21262d' }}
                >
                  Tag Frequency
                </div>
                <TagTable
                  tags={tagData.tags}
                  selectedTag={selectedTag}
                  onSelectTag={setSelectedTag}
                  loading={loading}
                />
              </div>

              {/* Tag breakdown */}
              {selectedTag && (
                <HandBreakdownPanel
                  tag={selectedTag}
                  hands={handsForTag}
                  loading={handsLoading}
                  navigate={navigate}
                />
              )}
            </div>

            {/* Right: Spotlight + Chart + Compare */}
            <div className="flex flex-col gap-4">
              {compareMode && isCoachPlus ? (
                <ComparePanel players={players} filters={filters} data1={tagData} />
              ) : (
                <>
                  <MistakeSpotlight tags={tagData.tags} />
                  <SizingChart tags={tagData.tags} />
                </>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
