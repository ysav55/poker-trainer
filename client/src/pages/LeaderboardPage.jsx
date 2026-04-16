import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

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

// Map config metric names to player data fields
const METRIC_FIELD_MAP = {
  'net_chips': 'total_net_chips',
  'hands_played': 'total_hands',
  'win_rate': null,  // Computed: total_wins / total_hands
  'bb_per_100': null, // Computed: total_net_chips / total_hands * 100
};

// Medal colors for top 3
const RANK_STYLE = {
  1: { color: '#ffd700', bg: 'rgba(255,215,0,0.12)'  },
  2: { color: '#c0c0c0', bg: 'rgba(192,192,192,0.1)' },
  3: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)'  },
};

const MEDAL = ['🥇', '🥈', '🥉'];

function fmtNum(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return Number.isNaN(v) ? '—' : v.toLocaleString('en-US');
}

function fmtNet(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toLocaleString('en-US');
}

function fmtPct(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  return Number.isNaN(v) ? '—' : `${v}%`;
}

/** Chips per 100 hands — the primary score metric */
function computeScore(netChips, hands) {
  const h = Number(hands) || 0;
  const c = Number(netChips) || 0;
  if (h === 0) return null;
  return Math.round(c / h * 100);
}

/** Win rate as a percent */
function computeWinRate(wins, hands) {
  const h = Number(hands) || 0;
  const w = Number(wins)  || 0;
  if (h === 0) return null;
  return Math.round(w / h * 100);
}

/** Compute a metric value for a player given the metric name */
function computeMetricValue(player, metricName) {
  const h = Number(player.total_hands ?? 0);
  const c = Number(player.total_net_chips ?? player.net_chips ?? 0);
  const w = Number(player.total_wins ?? player.wins ?? 0);

  if (metricName === 'net_chips') {
    return c;
  }
  if (metricName === 'hands_played') {
    return h;
  }
  if (metricName === 'win_rate') {
    if (h === 0) return 0;
    return (w / h) * 100; // Return as percentage for consistent sorting
  }
  if (metricName === 'bb_per_100') {
    if (h === 0) return 0;
    return c / h * 100;
  }
  return 0;
}

/** Format a metric value for display based on metric name */
function formatMetricValue(value, metricName) {
  if (value == null || value === '') return '—';
  const v = Number(value);
  if (Number.isNaN(v)) return '—';

  if (metricName === 'win_rate') {
    // Value is already a percentage (0-100), just add % sign
    return `${Math.round(v)}%`;
  }
  if (metricName === 'bb_per_100') {
    // Value is already computed as (netChips / hands * 100)
    return Math.round(v).toString();
  }
  if (metricName === 'net_chips') {
    return (v >= 0 ? '+' : '') + v.toLocaleString('en-US');
  }
  return v.toLocaleString('en-US');
}

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

  const filtered = useMemo(() => {
    let list = players;

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.name || p.display_name || '').toLowerCase().includes(q));
    }

    // Determine primary metric from config, default to net_chips
    const primaryMetric = leaderboardConfig?.value?.primary_metric ?? 'net_chips';

    // Sort by primary metric descending
    return [...list].sort((a, b) => {
      const av = computeMetricValue(a, primaryMetric);
      const bv = computeMetricValue(b, primaryMetric);
      return bv - av;
    });
  }, [players, search, leaderboardConfig]);

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
                    {(() => {
                      // Determine the secondary metric for the Score column
                      const secondaryMetric = leaderboardConfig?.value?.secondary_metric ?? 'bb_per_100';
                      const scoreLabels = {
                        'net_chips': 'Net Chips',
                        'hands_played': 'Hands',
                        'win_rate': 'Win Rate',
                        'bb_per_100': 'Score',
                      };
                      const scoreLabel = scoreLabels[secondaryMetric] || 'Score';
                      const scoreTitles = {
                        'net_chips': 'Total chips won/lost',
                        'hands_played': 'Total hands played',
                        'win_rate': 'Percentage of hands won',
                        'bb_per_100': 'Chips won per 100 hands',
                      };
                      const scoreTitle = scoreTitles[secondaryMetric] || 'Chips won per 100 hands';

                      return [
                        { label: '#',          w: 48   },
                        { label: 'Player',     w: null },
                        { label: 'Hands',      w: 80   },
                        { label: 'Win Rate',   w: 90   },
                        { label: 'Net Chips',  w: 110  },
                        { label: scoreLabel,   w: 90, title: scoreTitle },
                      ].map(({ label, w, title }) => (
                        <th
                          key={label}
                          style={{
                            padding: '10px 14px',
                            textAlign: label === '#' ? 'center' : 'left',
                            color: '#6e7681',
                            fontWeight: 600,
                            fontSize: 10,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            whiteSpace: 'nowrap',
                            width: w ?? undefined,
                          }}
                          title={title}
                        >
                          {label}
                          {title && (
                            <span
                              title={title}
                              style={{ marginLeft: 3, cursor: 'help', opacity: 0.5 }}
                            >
                              ⓘ
                            </span>
                          )}
                        </th>
                      ));
                    })()}
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
                    const netRaw   = Number(player.total_net_chips ?? player.net_chips ?? 0);
                    const netColor = netRaw > 0 ? '#4ade80' : netRaw < 0 ? '#f87171' : '#9ca3af';
                    const name     = player.name || player.display_name || '—';
                    const hands    = player.total_hands ?? 0;
                    const wins     = player.total_wins  ?? player.wins ?? 0;
                    const winRate  = computeWinRate(wins, hands);

                    // Compute score based on secondary_metric from config
                    const secondaryMetric = leaderboardConfig?.value?.secondary_metric ?? 'bb_per_100';
                    let score = null;
                    let scoreColor = '#6e7681';
                    if (secondaryMetric === 'net_chips') {
                      score = netRaw;
                    } else if (secondaryMetric === 'hands_played') {
                      score = hands;
                    } else if (secondaryMetric === 'win_rate') {
                      score = computeWinRate(wins, hands);
                    } else if (secondaryMetric === 'bb_per_100') {
                      score = computeScore(netRaw, hands);
                    }

                    if (score != null) {
                      scoreColor = score > 0 ? '#4ade80' : score < 0 ? '#f87171' : '#9ca3af';
                    }

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

                        {/* Hands */}
                        <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                          {fmtNum(hands)}
                        </td>

                        {/* Win Rate */}
                        <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                          {winRate == null ? '—' : fmtPct(winRate)}
                        </td>

                        {/* Net Chips */}
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: netColor,
                          }}
                        >
                          {fmtNet(netRaw)}
                        </td>

                        {/* Score */}
                        <td
                          style={{
                            padding: '10px 14px',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: scoreColor,
                          }}
                        >
                          {score == null ? '—' : formatMetricValue(score, secondaryMetric)}
                        </td>
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
