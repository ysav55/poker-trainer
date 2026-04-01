import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

const GOLD   = '#d4af37';
const PANEL  = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

const PERIODS = [
  { label: 'All Time',  value: 'all' },
  { label: '30 Days',   value: '30d' },
  { label: '7 Days',    value: '7d'  },
];

// Medal colors for top 3
const RANK_STYLE = {
  1: { color: '#ffd700', bg: 'rgba(255,215,0,0.12)'  },
  2: { color: '#c0c0c0', bg: 'rgba(192,192,192,0.1)' },
  3: { color: '#cd7f32', bg: 'rgba(205,127,50,0.1)'  },
};

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

function filterByPeriod(players, period) {
  // Server already returns all-time stats. Period filtering beyond "all" is a
  // best-effort client-side stub: we can't filter without timestamped per-hand
  // data from the server. For now, all periods show the same data — the feature
  // is wired and ready for a server-side param once the API supports it.
  return players;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [period, setPeriod]   = useState('all');
  const [search, setSearch]   = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/players')
      .then((data) => setPlayers(data?.players ?? data ?? []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = filterByPeriod(players, period);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) => (p.display_name || p.name || '').toLowerCase().includes(q));
    }
    // Sort by net chips descending
    return [...list].sort((a, b) => {
      const av = Number(a.total_net_chips ?? a.net_chips ?? 0);
      const bv = Number(b.total_net_chips ?? b.net_chips ?? 0);
      return bv - av;
    });
  }, [players, period, search]);

  return (
    <div
      className="min-h-screen w-screen flex flex-col"
      style={{ background: '#0d1117', color: '#e5e7eb' }}
    >
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,175,55,0.025) 0%, transparent 60%)' }}
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
          >
            ← Lobby
          </button>
          <span style={{ color: '#30363d' }}>|</span>
          <span className="text-base font-black tracking-[0.15em] uppercase" style={{ color: GOLD }}>
            Leaderboard
          </span>
        </div>
        <span className="text-sm text-gray-400 hidden sm:inline">{user?.name}</span>
      </header>

      {/* Body */}
      <main className="relative flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-5">

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-3 justify-between">
            {/* Period tabs */}
            <div className="flex gap-1.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  data-testid={`period-${p.value}`}
                  className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                  style={
                    period === p.value
                      ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>

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

          {/* Table */}
          {error && <p className="text-sm text-red-400">{error}</p>}

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
                      {[
                        { label: '#',           w: 40  },
                        { label: 'Player',      w: null },
                        { label: 'Hands',       w: 80  },
                        { label: 'Wins',        w: 70  },
                        { label: 'Net Chips',   w: 100 },
                        { label: 'VPIP',        w: 70  },
                        { label: 'PFR',         w: 60  },
                      ].map(({ label, w }) => (
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
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((player, idx) => {
                      const rank    = idx + 1;
                      const isMe    = user && (player.stable_id === user.id || player.id === user.id);
                      const rankSt  = RANK_STYLE[rank];
                      const netRaw  = Number(player.total_net_chips ?? player.net_chips ?? 0);
                      const netColor = netRaw > 0 ? '#4ade80' : netRaw < 0 ? '#f87171' : '#9ca3af';
                      const name    = player.display_name || player.name || '—';

                      return (
                        <tr
                          key={player.stable_id ?? player.id ?? idx}
                          data-testid={isMe ? 'current-user-row' : undefined}
                          style={{
                            borderBottom: '1px solid #21262d',
                            background: isMe
                              ? 'rgba(212,175,55,0.07)'
                              : rankSt
                              ? rankSt.bg
                              : 'transparent',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={(e) => {
                            if (!isMe && !rankSt) e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
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
                            {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : rank}
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
                            </div>
                          </td>

                          {/* Total hands */}
                          <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                            {fmtNum(player.total_hands)}
                          </td>

                          {/* Wins */}
                          <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                            {fmtNum(player.total_wins ?? player.wins)}
                          </td>

                          {/* Net chips */}
                          <td
                            style={{
                              padding: '10px 14px',
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: netColor,
                            }}
                          >
                            {fmtNet(player.total_net_chips ?? player.net_chips)}
                          </td>

                          {/* VPIP */}
                          <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                            {fmtPct(player.vpip_percent ?? player.vpip)}
                          </td>

                          {/* PFR */}
                          <td style={{ padding: '10px 14px', color: '#8b949e', fontFamily: 'monospace' }}>
                            {fmtPct(player.pfr_percent ?? player.pfr)}
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
          </p>
        </div>
      </main>
    </div>
  );
}
