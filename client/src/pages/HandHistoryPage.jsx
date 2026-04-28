import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import SaveAsScenarioModal from '../components/scenarios/SaveAsScenarioModal.jsx';

// ── Constants ──────────────────────────────────────────────────────────────────

const GOLD  = '#d4af37';
const PANEL = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };
const PAGE_SIZE = 25;

const TAG_TYPE_COLORS = {
  auto:    { color: '#58a6ff', bg: 'rgba(88,166,255,0.12)',  border: 'rgba(88,166,255,0.3)'  },
  mistake: { color: '#f85149', bg: 'rgba(248,81,73,0.12)',   border: 'rgba(248,81,73,0.3)'   },
  sizing:  { color: '#3fb950', bg: 'rgba(63,185,80,0.12)',   border: 'rgba(63,185,80,0.3)'   },
  coach:   { color: '#d4af37', bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.3)'  },
};

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function formatNet(net) {
  if (net == null) return '—';
  const n = Number(net);
  const s = Math.abs(n).toLocaleString();
  return n >= 0 ? `+${s}` : `-${s}`;
}

function netColor(net) {
  if (net == null) return '#8b949e';
  return Number(net) >= 0 ? '#3fb950' : '#f85149';
}

function shortHandId(handId) {
  if (!handId) return '—';
  // Show last 8 chars of UUID for display, or use a hash-like number
  const clean = handId.replace(/-/g, '');
  return '#' + parseInt(clean.slice(-8), 16).toString().slice(-5).padStart(4, '0');
}

// ── Tag Pill ───────────────────────────────────────────────────────────────────

function TagPill({ tag, tagType }) {
  const c = TAG_TYPE_COLORS[tagType] || TAG_TYPE_COLORS.auto;
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
    >
      {tag}
    </span>
  );
}

// ── Tag Multi-Select ───────────────────────────────────────────────────────────

function TagMultiSelect({ availableTags, selectedTags, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (tag) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter(t => t !== tag)
      : [...selectedTags, tag];
    onChange(next);
  };

  const label = selectedTags.length === 0
    ? 'All Tags'
    : selectedTags.length === 1
      ? selectedTags[0]
      : `${selectedTags.length} tags`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-sm outline-none"
        style={{
          background: '#0d1117',
          border: `1px solid ${open ? GOLD : '#30363d'}`,
          color: selectedTags.length > 0 ? GOLD : '#c9d1d9',
          minWidth: 110,
        }}
      >
        <span className="flex-1 text-left truncate">{label}</span>
        <span className="text-[10px] text-gray-500">▾</span>
      </button>

      {open && (
        <div
          className="absolute z-20 mt-1 rounded overflow-y-auto"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            minWidth: 200,
            maxHeight: 280,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {availableTags.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No tags yet</p>
          ) : (
            availableTags.map(({ tag, tag_type }) => {
              const checked = selectedTags.includes(tag);
              const c = TAG_TYPE_COLORS[tag_type] || TAG_TYPE_COLORS.auto;
              return (
                <label
                  key={tag}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(tag)}
                    className="accent-yellow-400"
                  />
                  <span
                    className="text-xs font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
                  >
                    {tag}
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase">{tag_type}</span>
                </label>
              );
            })
          )}
          {selectedTags.length > 0 && (
            <button
              type="button"
              className="w-full text-xs text-gray-500 py-1.5 hover:text-gray-300 border-t border-[#30363d]"
              onClick={() => { onChange([]); setOpen(false); }}
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter Bar ─────────────────────────────────────────────────────────────────

function FilterBar({ isCoach, players, tableIds, availableTags, filters, onFilterChange, onSearch, loading }) {
  return (
    <div
      className="flex flex-wrap items-end gap-3 px-4 py-3 rounded-lg"
      style={PANEL}
    >
      {/* Student filter — coach only */}
      {isCoach && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Student</span>
          <select
            value={filters.playerId}
            onChange={e => onFilterChange('playerId', e.target.value)}
            className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', minWidth: 150 }}
          >
            <option value="">All Students</option>
            {players.map(p => (
              <option key={p.stableId} value={p.stableId}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Table filter */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Table</span>
        <select
          value={filters.tableId}
          onChange={e => onFilterChange('tableId', e.target.value)}
          className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', minWidth: 130 }}
        >
          <option value="">All Tables</option>
          {tableIds.map(id => (
            <option key={id} value={id}>{id}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">From</span>
        <input
          type="date"
          value={filters.startDate}
          onChange={e => onFilterChange('startDate', e.target.value)}
          className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">To</span>
        <input
          type="date"
          value={filters.endDate}
          onChange={e => onFilterChange('endDate', e.target.value)}
          className="rounded px-2 py-1.5 text-sm text-gray-200 outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', colorScheme: 'dark' }}
        />
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Tags</span>
        <TagMultiSelect
          availableTags={availableTags}
          selectedTags={filters.tags}
          onChange={v => onFilterChange('tags', v)}
        />
      </div>

      {/* Checkboxes */}
      <div className="flex flex-col gap-1.5 pb-0.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.scenariosOnly}
            onChange={e => onFilterChange('scenariosOnly', e.target.checked)}
            className="accent-yellow-400"
          />
          <span className="text-xs text-gray-300">Scenarios only</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.mistakesOnly}
            onChange={e => onFilterChange('mistakesOnly', e.target.checked)}
            className="accent-yellow-400"
          />
          <span className="text-xs text-gray-300">Mistakes only</span>
        </label>
      </div>

      {/* Search button */}
      <button
        type="button"
        onClick={onSearch}
        disabled={loading}
        className="px-4 py-1.5 rounded text-sm font-semibold transition-opacity"
        style={{
          background: GOLD,
          color: '#0d1117',
          opacity: loading ? 0.6 : 1,
          alignSelf: 'flex-end',
        }}
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </div>
  );
}

// ── Results Table ──────────────────────────────────────────────────────────────

function ResultsTable({ hands, showNet, onHandClick, isCoach, onSaveAsScenario }) {
  if (hands.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
        No hands match your filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #30363d' }}>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Hand</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Date</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">Table</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tags</th>
            {showNet && (
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Net</th>
            )}
            {isCoach && (
              <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {hands.map((hand) => {
            const allTags = [
              ...(hand.auto_tags    || []).map(t => ({ tag: t, type: 'auto'    })),
              ...(hand.mistake_tags || []).map(t => ({ tag: t, type: 'mistake' })),
              ...(hand.sizing_tags  || []).map(t => ({ tag: t, type: 'sizing'  })),
              ...(hand.coach_tags   || []).map(t => ({ tag: t, type: 'coach'   })),
            ];
            return (
              <tr
                key={hand.hand_id}
                onClick={() => onHandClick(hand.hand_id)}
                className="cursor-pointer transition-colors"
                style={{ borderBottom: '1px solid #21262d' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td className="px-3 py-2.5">
                  <span style={{ color: GOLD, fontFamily: 'monospace', fontSize: 13 }}>
                    {shortHandId(hand.hand_id)}
                  </span>
                  {hand.is_scenario && (
                    <span
                      className="ml-1.5 text-[9px] font-bold px-1 py-0.5 rounded"
                      style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: '1px solid rgba(212,175,55,0.3)' }}
                    >
                      SCN
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-gray-400 text-xs">{formatDate(hand.started_at)}</td>
                <td className="px-3 py-2.5 text-gray-300 text-xs truncate max-w-[140px]">{hand.table_id || '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {allTags.slice(0, 6).map(({ tag, type }) => (
                      <TagPill key={tag} tag={tag} tagType={type} />
                    ))}
                    {allTags.length > 6 && (
                      <span className="text-[10px] text-gray-500">+{allTags.length - 6}</span>
                    )}
                  </div>
                </td>
                {showNet && (
                  <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold" style={{ color: netColor(hand.net) }}>
                    {formatNet(hand.net)}
                  </td>
                )}
                {isCoach && (
                  <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      data-testid={`save-as-scenario-btn-${hand.hand_id}`}
                      onClick={(e) => { e.stopPropagation(); onSaveAsScenario?.(hand.hand_id); }}
                      className="text-[10px] font-semibold px-2 py-1 rounded transition-colors"
                      style={{
                        background: 'rgba(212,175,55,0.1)',
                        border: '1px solid rgba(212,175,55,0.35)',
                        color: GOLD,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
                    >
                      + Save
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────

function Pagination({ offset, total, pageSize, onPrev, onNext }) {
  if (total === 0) return null;
  const from = offset + 1;
  const to   = Math.min(offset + pageSize, total);
  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  return (
    <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500">
      <span>Showing {from}–{to} of {total.toLocaleString()}</span>
      <div className="flex gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="px-3 py-1 rounded transition-colors"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            color: hasPrev ? '#c9d1d9' : '#484f58',
            cursor: hasPrev ? 'pointer' : 'not-allowed',
          }}
        >
          ← Prev
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="px-3 py-1 rounded transition-colors"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            color: hasNext ? '#c9d1d9' : '#484f58',
            cursor: hasNext ? 'pointer' : 'not-allowed',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  playerId:     '',
  tableId:      '',
  startDate:    '',
  endDate:      '',
  tags:         [],
  scenariosOnly: false,
  mistakesOnly:  false,
};

export default function HandHistoryPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();
  const isCoach   = COACH_ROLES.has(user?.role);

  // ── Meta data for filter dropdowns
  const [players,       setPlayers]       = useState([]);
  const [tableIds,      setTableIds]      = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  // ── Filter state
  const [filters, setFilters] = useState(() => {
    // Pre-populate playerId for students
    if (!isCoach) return { ...EMPTY_FILTERS, playerId: user?.id ?? '' };
    return EMPTY_FILTERS;
  });

  // ── Results state
  const [hands,   setHands]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [searched, setSearched] = useState(false);

  // ── Load filter meta on mount
  useEffect(() => {
    const promises = [
      apiFetch('/api/hands/tables').then(r => setTableIds(r.tableIds || [])).catch(() => {}),
      apiFetch('/api/hands/tags').then(r => setAvailableTags(r.tags || [])).catch(() => {}),
    ];
    if (isCoach) {
      promises.push(
        apiFetch('/api/players').then(r => setPlayers(r.players || [])).catch(() => {})
      );
    }
    Promise.all(promises);
  }, [isCoach]);

  // ── Fetch results
  const fetchResults = useCallback(async (currentOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.playerId)    params.set('playerId',     filters.playerId);
      if (filters.tableId)     params.set('tableId',      filters.tableId);
      if (filters.startDate)   params.set('startDate',    filters.startDate);
      if (filters.endDate)     params.set('endDate',      filters.endDate);
      if (filters.tags.length) params.set('tags',         filters.tags.join(','));
      if (filters.scenariosOnly) params.set('scenariosOnly', 'true');
      if (filters.mistakesOnly)  params.set('mistakesOnly',  'true');
      params.set('limit',  String(PAGE_SIZE));
      params.set('offset', String(currentOffset));

      const result = await apiFetch(`/api/hands/history?${params}`);
      setHands(result.hands  || []);
      setTotal(result.total  || 0);
      setOffset(currentOffset);
      setSearched(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Auto-search on first load (shows recent hands by default)
  useEffect(() => {
    fetchResults(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => fetchResults(0);
  const handlePrev   = () => fetchResults(Math.max(0, offset - PAGE_SIZE));
  const handleNext   = () => fetchResults(offset + PAGE_SIZE);

  const handleHandClick = (handId) => {
    navigate(`/review?handId=${encodeURIComponent(handId)}`);
  };

  // Save-as-scenario modal state (coach only)
  const [saveModalHand, setSaveModalHand] = useState(null);
  const [saveModalLoading, setSaveModalLoading] = useState(false);
  const openSaveAsScenario = useCallback(async (handId) => {
    setSaveModalLoading(true);
    try {
      const detail = await apiFetch(`/api/hands/${encodeURIComponent(handId)}`);
      setSaveModalHand(detail);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaveModalLoading(false);
    }
  }, []);

  // Show net column only when a specific player is in scope
  const showNet = isCoach ? !!filters.playerId : true;

  return (
    <div className="flex flex-col gap-4 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-100 tracking-wide">HAND HISTORY</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          {isCoach ? 'Browse all hands across your stable.' : 'Your hand history.'}
        </p>
      </div>

      {/* Filters */}
      <FilterBar
        isCoach={isCoach}
        players={players}
        tableIds={tableIds}
        availableTags={availableTags}
        filters={filters}
        onFilterChange={handleFilterChange}
        onSearch={handleSearch}
        loading={loading}
      />

      {/* Error */}
      {error && (
        <div
          className="px-4 py-3 rounded text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
        >
          {error}
        </div>
      )}

      {/* Save as Scenario modal (coach only) */}
      {isCoach && saveModalHand && (
        <SaveAsScenarioModal
          hand={saveModalHand}
          onClose={() => setSaveModalHand(null)}
          onSaved={() => setSaveModalHand(null)}
        />
      )}
      {saveModalLoading && (
        <div
          data-testid="save-modal-loading"
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 55 }}
        >
          <div className="text-xs text-gray-400 px-3 py-2 rounded" style={{ background: 'rgba(0,0,0,0.7)' }}>
            Loading hand…
          </div>
        </div>
      )}

      {/* Results */}
      {(searched || loading) && (
        <div style={PANEL}>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 text-sm">
              Loading…
            </div>
          ) : (
            <>
              <ResultsTable
                hands={hands}
                showNet={showNet}
                onHandClick={handleHandClick}
                isCoach={isCoach}
                onSaveAsScenario={openSaveAsScenario}
              />
              <Pagination
                offset={offset}
                total={total}
                pageSize={PAGE_SIZE}
                onPrev={handlePrev}
                onNext={handleNext}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
