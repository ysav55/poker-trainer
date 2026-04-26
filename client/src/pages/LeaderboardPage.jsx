import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';
import { STAT_CATALOG, getStatValue, formatStatValue, DEFAULT_COLUMNS, DEFAULT_SORT_BY } from '../lib/leaderboardStats.js';

const GOLD  = '#d4af37';
const PANEL = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

const PERIODS = [
  { label: '7 Days',    value: '7d'  },
  { label: '30 Days',   value: '30d' },
  { label: 'All Time',  value: 'all' },
];

const GAME_TYPES = [
  { label: 'All',        value: 'all'        },
  { label: 'Cash',       value: 'cash'       },
  { label: 'Tournament', value: 'tournament' },
];

// Medal colors for top 3
const RANK_STYLE = {
  1: { color: '#ffd700', bg: 'rgba(255,215,0,0.12)'  },
  2: { color: '#c0c0c0', bg: 'rgba(192,192,192,0.1)' },
  3: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)'  },
};

const MEDAL = ['🥇', '🥈', '🥉'];

// Tab button component
function TabBtn({ active, onClick, children, ...rest }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
      style={
        active
          ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
          : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
      }
      {...rest}
    >
      {children}
    </button>
  );
}

// Stub notice for unimplemented server-side filters
function StubNotice({ children }) {
  return (
    <span
      title="Requires server-side filter support — coming soon"
      style={{
        fontSize: 9,
        color: '#6b7280',
        border: '1px dashed #30363d',
        borderRadius: 3,
        padding: '1px 5px',
        marginLeft: 4,
        verticalAlign: 'middle',
        cursor: 'help',
      }}
    >
      {children}
    </span>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const isCoach = user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin';

  const [players,   setPlayers]   = useState([]);
  const [leaderboardConfig, setLeaderboardConfig] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [period,    setPeriod]    = useState('all');
  const [gameType,  setGameType]  = useState('all');
  const [coachView, setCoachView] = useState('all'); // 'all' | 'mySchool' | 'custom'
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (period   !== 'all') params.set('period',   period);
    if (gameType !== 'all') params.set('gameType', gameType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    apiFetch(`/api/players${qs}`)
      .then((data) => {
        setPlayers(data?.players ?? data ?? []);
        setLeaderboardConfig(data?.leaderboardConfig ?? null);
      })
      .catch((err)  => setError(err.message))
      .finally(()   => setLoading(false));
  }, [period, gameType]);

  const columns = leaderboardConfig?.value?.columns ?? DEFAULT_COLUMNS;
  const sortBy  = leaderboardConfig?.value?.sort_by ?? DEFAULT_SORT_BY;

  const filtered = useMemo(() => {
    let list = players;

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.name || p.display_name || '').toLowerCase().includes(q));
    }

    // Sort by sort_by metric (ascending for leak stats, descending otherwise)
    const asc = STAT_CATALOG[sortBy]?.sortAsc;
    return [...list].sort((a, b) => {
      const av = getStatValue(a, sortBy);
      const bv = getStatValue(b, sortBy);
      if (asc) return (av ?? Infinity) - (bv ?? Infinity);
      return (bv ?? -Infinity) - (av ?? -Infinity);
    });
  }, [players, search, sortBy]);

  function handleRowClick(player) {
    if (!isCoach) return;
    // Navigate to CRM, passing the player's stableId via state so CRM can auto-select
    navigate('/admin/crm', {
      state: { playerId: player.stableId ?? player.stable_id ?? player.id },
    });
  }

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Page header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => navigate('/lobby')}
            className="text-sm"
            style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← Lobby
          </button>
          <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Leaderboard</h1>
        </div>

        {/* Filter row 1 — period + game type */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Period tabs */}
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <TabBtn key={p.value} active={period === p.value} onClick={() => setPeriod(p.value)} data-testid={`period-${p.value}`}>
                {p.label}
              </TabBtn>
            ))}
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 20, background: '#30363d' }} />

          {/* Game type tabs */}
          <div className="flex gap-1.5">
            {GAME_TYPES.map((g) => (
              <TabBtn key={g.value} active={gameType === g.value} onClick={() => setGameType(g.value)}>
                {g.label}
              </TabBtn>
            ))}
          </div>
        </div>

        {/* Filter row 2 — coach extras + search */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          {isCoach ? (
            <div className="flex gap-1.5 items-center">
              <TabBtn active={coachView === 'all'} onClick={() => setCoachView('all')}>
                All Students
              </TabBtn>
              <TabBtn active={coachView === 'mySchool'} onClick={() => setCoachView('mySchool')}>
                My School
                <StubNotice>soon</StubNotice>
              </TabBtn>
              <TabBtn active={coachView === 'custom'} onClick={() => setCoachView('custom')}>
                Custom Group
                <StubNotice>soon</StubNotice>
              </TabBtn>
            </div>
          ) : (
            <div />
          )}

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            data-testid="leaderboard-search"
            className="rounded-lg px-3 py-1.5 text-sm text-gray-100 placeholder-gray-600 outline-none"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              width: 180,
              caretColor: GOLD,
            }}
          />
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Table */}
        <div style={{ ...PANEL, overflow: 'hidden' }}>
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-600">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-600" data-testid="empty-state">
              No players found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #30363d', background: '#0d1117' }}>
                    <th
                      style={{
                        padding: '10px 14px',
                        textAlign: 'center',
                        color: '#6e7681',
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        width: 48,
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        color: '#6e7681',
                        fontWeight: 600,
                        fontSize: 10,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Player
                    </th>
                    {columns.map((col) => {
                      const meta = STAT_CATALOG[col];
                      if (!meta) return null;
                      const isSorted = col === sortBy;
                      return (
                        <th
                          key={col}
                          style={{
                            padding: '10px 14px',
                            textAlign: 'left',
                            color: isSorted ? GOLD : '#6e7681',
                            fontWeight: 600,
                            fontSize: 10,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            width: 90,
                          }}
                        >
                          {meta.label}{isSorted ? (meta.sortAsc ? ' \u25B2' : ' \u25BC') : ''}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((player, idx) => {
                    const rank     = idx + 1;
                    const isMe     = user && (
                      player.stableId === user.id ||
                      player.stable_id === user.id ||
                      player.id === user.id
                    );
                    const rankSt   = RANK_STYLE[rank];
                    const name     = player.name || player.display_name || '—';

                    return (
                      <tr
                        key={player.stableId ?? player.stable_id ?? player.id ?? idx}
                        data-testid={isMe ? 'current-user-row' : undefined}
                        onClick={isCoach ? () => handleRowClick(player) : undefined}
                        style={{
                          borderBottom: '1px solid #21262d',
                          background: isMe
                            ? 'rgba(212,175,55,0.07)'
                            : rankSt ? rankSt.bg : 'transparent',
                          transition: 'background 0.1s',
                          cursor: isCoach ? 'pointer' : 'default',
                        }}
                        onMouseEnter={(e) => {
                          if (isCoach) {
                            e.currentTarget.style.background = isMe
                              ? 'rgba(212,175,55,0.12)'
                              : rankSt ? rankSt.bg : 'rgba(255,255,255,0.05)';
                          } else if (!isMe && !rankSt) {
                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isMe
                            ? 'rgba(212,175,55,0.07)'
                            : rankSt ? rankSt.bg : 'transparent';
                        }}
                      >
                        {/* Rank */}
                        <td
                          style={{
                            padding: '10px 14px',
                            textAlign: 'center',
                            fontWeight: 700,
                            fontFamily: 'monospace',
                            color: rankSt?.color ?? '#6e7681',
                            fontSize: 12,
                          }}
                        >
                          {rank <= 3 ? MEDAL[rank - 1] : rank}
                        </td>

                        {/* Name */}
                        <td style={{ padding: '10px 14px' }}>
                          <div className="flex items-center gap-2">
                            <span
                              style={{
                                color: isMe ? GOLD : '#e6edf3',
                                fontWeight: isMe ? 700 : 500,
                              }}
                            >
                              {name}
                            </span>
                            {isMe && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  color: GOLD,
                                  background: 'rgba(212,175,55,0.15)',
                                  border: `1px solid rgba(212,175,55,0.4)`,
                                  borderRadius: 3,
                                  padding: '1px 4px',
                                  letterSpacing: '0.06em',
                                }}
                              >
                                YOU
                              </span>
                            )}
                            {isCoach && (
                              <span
                                style={{
                                  fontSize: 9,
                                  color: '#6b7280',
                                  opacity: 0,
                                  transition: 'opacity 0.15s',
                                }}
                                className="crm-hint"
                              >
                                → CRM
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Dynamic stat columns */}
                        {columns.map((col) => {
                          const val = getStatValue(player, col);
                          const display = formatStatValue(val, col);
                          const meta = STAT_CATALOG[col];
                          const color = meta?.colorCoded && val != null
                            ? (val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#9ca3af')
                            : '#8b949e';
                          return (
                            <td key={col} style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: col === sortBy ? 600 : 400, color }}>
                              {display}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-center text-gray-700">
          {filtered.length} player{filtered.length !== 1 ? 's' : ''}
          {search ? ` matching "${search}"` : ''}
          {isCoach && (
            <span style={{ marginLeft: 8, color: '#4b5563' }}>· Click a row to open CRM</span>
          )}
        </p>
      </div>
    </div>
  );
}
