import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { apiFetch } from '../lib/api.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const ROLE_LABEL = { coach: 'Coach', player: 'Player', admin: 'Admin' };

const ROLE_STYLE = {
  coach:      { background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.35)' },
  player:     { background: 'rgba(48,54,61,0.6)',    color: '#8b949e', border: '1px solid rgba(48,54,61,0.9)' },
  admin:      { background: 'rgba(212,175,55,0.1)',  color: '#c9a227', border: '1px solid rgba(212,175,55,0.25)' },
  superadmin: { background: 'rgba(212,175,55,0.2)',  color: '#d4af37', border: '1px solid rgba(212,175,55,0.5)' },
  moderator:  { background: 'rgba(48,54,61,0.6)',    color: '#8b949e', border: '1px solid rgba(48,54,61,0.9)' },
  referee:    { background: 'rgba(48,54,61,0.6)',    color: '#8b949e', border: '1px solid rgba(48,54,61,0.9)' },
  trial:      { background: 'rgba(48,54,61,0.4)',    color: '#6e7681', border: '1px solid rgba(48,54,61,0.6)' },
};

const PHASE_STYLE = {
  waiting:  { background: 'rgba(100,116,139,0.2)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)' },
  preflop:  { background: 'rgba(59,130,246,0.2)',  color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' },
  flop:     { background: 'rgba(34,197,94,0.2)',   color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' },
  turn:     { background: 'rgba(245,158,11,0.2)',  color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' },
  river:    { background: 'rgba(239,68,68,0.2)',   color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)' },
  showdown: { background: 'rgba(212,175,55,0.2)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.35)' },
};

const MODE_LABEL = { coached: 'COACHED', auto: 'AUTO', tournament: 'TOURNAMENT' };

// Navigation tiles config
// permission:null  — visible to all authenticated users
// roles:[...]      — visible only to users with one of these roles
const NAV_TILES = [
  { icon: '🏆', label: 'Leaderboard',    desc: 'Rankings & net chips',          path: '/leaderboard',       permission: null,           roles: null },
  { icon: '🎮', label: 'Multi Table',    desc: 'Review multiple tables',        path: '/multi',             permission: null,           roles: null },
  { icon: '🤖', label: 'Play vs Bots',  desc: 'Practice against bot players',  path: '/bot-lobby',         permission: null,           roles: null },
  { icon: '🧠', label: 'AI Analysis',   desc: 'Tag insights & mistakes',        path: '/analysis',          permission: null,           roles: ['coach', 'admin', 'superadmin'] },
  { icon: '👥', label: 'Stable / CRM',   desc: 'Roster & player management',   path: '/admin/crm',         permission: 'admin:access', roles: null },
  { icon: '⚠️', label: 'Coach Alerts',  desc: 'Students needing attention',    path: '/admin/alerts',      permission: 'admin:access', roles: null },
  { icon: '📊', label: 'Stable Report', desc: 'Weekly overview — all students', path: '/admin/crm',         permission: 'admin:access', roles: null },
  { icon: '📖', label: 'Hand Scenarios', desc: 'Build & review hands',          path: '/admin/hands',       permission: 'admin:access', roles: null },
  { icon: '🏅', label: 'Tournaments',    desc: 'Setup & manage',                path: '/admin/tournaments', permission: 'admin:access', roles: null },
  { icon: '🦺', label: 'Referee',        desc: 'Tournament referee',            path: '/admin/referee',     permission: 'admin:access', roles: null },
  { icon: '👤', label: 'Users',          desc: 'User management',               path: '/admin/users',       permission: 'admin:access', roles: null },
];

const GOLD  = '#d4af37';
const PANEL = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

// ── Small helpers ──────────────────────────────────────────────────────────────

function Pill({ children, style }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={style}
    >
      {children}
    </span>
  );
}

// ── Trial Banner ──────────────────────────────────────────────────────────────

function TrialBanner() {
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-4 py-3"
      style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.3)' }}
      data-testid="trial-banner"
    >
      <span style={{ fontSize: 16 }}>⚠️</span>
      <div>
        <span className="text-sm font-semibold" style={{ color: GOLD }}>Trial Account</span>
        <span className="text-xs text-gray-500 ml-2">
          Your access is limited. Contact your coach to unlock full features.
        </span>
      </div>
    </div>
  );
}

// ── Nav Tile ──────────────────────────────────────────────────────────────────

function NavTile({ icon, label, desc, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 rounded-xl p-4 text-left w-full transition-all hover:border-[rgba(212,175,55,0.4)]"
      style={{ background: '#161b22', border: '1px solid #30363d', cursor: 'pointer' }}
      data-testid={`nav-tile-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="text-xs text-gray-500 leading-tight">{desc}</span>
    </button>
  );
}

function fmtNet(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (Number.isNaN(v)) return '—';
  return (v >= 0 ? '+' : '') + v.toLocaleString('en-US');
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, valueStyle }) {
  return (
    <div style={{ ...PANEL, flex: 1, padding: 16 }}>
      <div className="text-xs text-gray-500 tracking-widest uppercase mb-1">{label}</div>
      <div className="text-2xl font-bold text-white" style={valueStyle}>{value ?? '—'}</div>
    </div>
  );
}

// ── Table Card ─────────────────────────────────────────────────────────────────

function TableCard({ table, onJoin }) {
  const tableId   = table.id ?? table.tableId;
  const name      = table.name ?? `Table ${tableId}`;
  const count     = table.playerCount ?? table.player_count ?? 0;
  const phase     = (table.phase ?? 'waiting').toLowerCase();
  const mode      = (table.mode ?? 'coached').toLowerCase();
  const pot       = table.pot ?? 0;
  const phaseStyle = PHASE_STYLE[phase] ?? PHASE_STYLE.waiting;

  return (
    <div
      style={{
        ...PANEL,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        cursor: 'default',
      }}
    >
      {/* Name + player count */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">
          {name}
        </span>
        <Pill style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: '1px solid rgba(212,175,55,0.35)', flexShrink: 0 }}>
          {count} {count === 1 ? 'player' : 'players'}
        </Pill>
      </div>

      {/* Phase + mode row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill style={phaseStyle}>{phase.toUpperCase()}</Pill>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{MODE_LABEL[mode] ?? mode}</span>
      </div>

      {/* Pot */}
      {pot > 0 && (
        <div className="text-xs font-mono" style={{ color: 'rgba(212,175,55,0.7)' }}>
          Pot: {Number(pot).toLocaleString('en-US')}
        </div>
      )}

      {/* Join button */}
      <div className="flex justify-end mt-auto">
        <button
          onClick={() => onJoin(tableId, mode)}
          className="text-xs px-3 py-1.5 rounded font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: GOLD }}
        >
          {mode === 'tournament' ? 'LOBBY' : 'JOIN'}
        </button>
      </div>
    </div>
  );
}

// ── Ghost/create tile ──────────────────────────────────────────────────────────

function GhostTile({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center rounded-lg transition-colors hover:bg-[rgba(212,175,55,0.05)]"
      style={{
        border: '1px dashed rgba(212,175,55,0.35)',
        color: GOLD,
        minHeight: 130,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.05em',
        cursor: 'pointer',
        background: 'transparent',
      }}
    >
      + New Table
    </button>
  );
}

// ── Create Table Modal ─────────────────────────────────────────────────────────

const MODE_OPTIONS = [
  { value: 'coached',    label: 'Coached Cash' },
  { value: 'auto',       label: 'Auto Cash' },
  { value: 'tournament', label: 'Tournament' },
];

function CreateTableModal({ onClose, onCreated }) {
  const [name, setName]           = useState('');
  const [mode, setMode]           = useState('coached');
  const [scheduled, setScheduled] = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Table name is required.'); return; }
    setBusy(true);
    setError('');
    try {
      const body = { name: name.trim(), mode };
      if (scheduled) body.scheduled_for = scheduled;
      const table = await apiFetch('/api/tables', { method: 'POST', body: JSON.stringify(body) });
      onCreated(table);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col gap-5 rounded-xl w-full max-w-sm"
        style={{ background: '#161b22', border: '1px solid #30363d', padding: 24 }}
      >
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: GOLD }}>
          New Table
        </h2>

        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500 tracking-widest uppercase">Table Name</label>
          <input
            className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none focus:ring-1"
            style={{ background: '#0d1117', border: '1px solid #30363d', focusRingColor: GOLD }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Table 1"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {/* Mode pills */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500 tracking-widest uppercase">Mode</label>
          <div className="flex gap-2 flex-wrap">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                style={
                  mode === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: '1px solid rgba(212,175,55,0.5)', color: GOLD }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scheduled for (optional) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-500 tracking-widest uppercase">
            Scheduled For <span className="text-gray-600">(optional)</span>
          </label>
          <input
            type="datetime-local"
            className="rounded-lg px-3 py-2 text-sm text-gray-100 outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d' }}
            value={scheduled}
            onChange={(e) => setScheduled(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex gap-3 justify-end mt-1">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider transition-opacity hover:opacity-80 disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: '1px solid rgba(212,175,55,0.5)', color: GOLD }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Lobby ─────────────────────────────────────────────────────────────────

export default function MainLobby() {
  const { user, logout, hasPermission } = useAuth();
  const { activeTables, refreshTables } = useLobby();
  const navigate = useNavigate();

  const [stats, setStats]               = useState(null);
  const [rank, setRank]                 = useState(null);
  const [recentHands, setRecentHands]   = useState([]);
  const [playlists, setPlaylists]       = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError]               = useState('');
  const [showModal, setShowModal]       = useState(false);

  // user.id holds the stableId (see AuthContext — `id: payload.stableId`)
  const userId = user?.id;
  const isTrial = user?.role === 'trial' || user?.trialStatus === 'active';
  const isAdmin = hasPermission('admin:access');

  useEffect(() => {
    if (!userId) return;
    const load = async () => {
      setLoadingStats(true);
      try {
        const [statsData, handsData] = await Promise.all([
          apiFetch(`/api/players/${userId}/stats`),
          apiFetch('/api/hands?limit=5'),
        ]);
        setStats(statsData);
        setRecentHands(handsData?.hands ?? handsData ?? []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingStats(false);
      }
    };
    load();
  }, [userId]);

  // Fetch leaderboard rank for non-admin users
  useEffect(() => {
    if (!userId || isAdmin) return;
    apiFetch('/api/players')
      .then((data) => {
        const players = data?.players ?? data ?? [];
        const sorted = [...players].sort(
          (a, b) => Number(b.total_net_chips ?? b.net_chips ?? 0) - Number(a.total_net_chips ?? a.net_chips ?? 0)
        );
        const pos = sorted.findIndex((p) => p.stableId === userId || p.stable_id === userId || p.id === userId);
        setRank(pos >= 0 ? pos + 1 : null);
      })
      .catch(() => {});
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!hasPermission('playlist:manage')) return;
    apiFetch('/api/playlists')
      .then((data) => setPlaylists(data?.playlists ?? data ?? []))
      .catch(() => {});
  }, [hasPermission]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleJoin = useCallback((tableId, mode) => {
    if (mode === 'tournament') {
      navigate(`/tournament/${tableId}/lobby`);
    } else {
      navigate(`/table/${tableId}`);
    }
  }, [navigate]);

  const handleCreated = useCallback((table) => {
    setShowModal(false);
    refreshTables();
    const tableId = table.id ?? table.tableId;
    if (tableId) navigate(`/table/${tableId}`);
  }, [navigate, refreshTables]);

  const canCreateTable = hasPermission('table:create');
  const roleBadgeStyle = ROLE_STYLE[user?.role] ?? ROLE_STYLE.player;

  // Net chips color
  const netChips  = stats?.net_chips ?? stats?.netChips ?? null;
  const netNum    = netChips != null ? Number(netChips) : null;
  const netColor  = netNum == null ? '#fff' : netNum >= 0 ? '#4ade80' : '#f87171';

  return (
    <div style={{ color: '#e5e7eb' }}>

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(212,175,55,0.03) 0%, transparent 60%)' }}
      />

      <div className="relative max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* ── Trial Banner ─────────────────────────────────────────────────── */}
        {isTrial && <TrialBanner />}

        {/* ── Stats row ──────────────────────────────────────────────────────── */}
        <section className="flex gap-4 flex-wrap">
          {loadingStats ? (
            <p className="text-sm text-gray-500">Loading stats…</p>
          ) : (
            <>
              <StatCard
                label="Hands Played"
                value={(stats?.hands_played ?? stats?.handsPlayed)?.toLocaleString('en-US')}
              />
              <StatCard
                label="Net Chips"
                value={fmtNet(netChips)}
                valueStyle={{ color: netColor }}
              />
              <StatCard
                label="VPIP %"
                value={stats?.vpip != null ? `${stats.vpip}%` : null}
              />
              {!isAdmin && rank != null && (
                <StatCard
                  label="Leaderboard Rank"
                  value={`#${rank}`}
                  valueStyle={{ color: GOLD }}
                />
              )}
            </>
          )}
        </section>

        {/* ── Navigation Tiles ──────────────────────────────────────────────── */}
        <section data-testid="nav-tiles">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 10,
            }}
          >
            {NAV_TILES.filter((t) => {
              if (t.permission != null && !hasPermission(t.permission)) return false;
              if (t.roles != null && !t.roles.includes(user?.role)) return false;
              return true;
            }).map((tile) => (
              <NavTile
                key={tile.path}
                icon={tile.icon}
                label={tile.label}
                desc={tile.desc}
                onClick={() => navigate(tile.path)}
              />
            ))}
          </div>
        </section>

        {/* ── Active Tables ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: 24 }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase">
              Active Tables
            </h2>
            {canCreateTable && (
              <button
                onClick={() => setShowModal(true)}
                className="text-xs px-3 py-1 rounded font-semibold tracking-wider transition-opacity hover:opacity-80"
                style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.35)', color: GOLD }}
              >
                + New Table
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {activeTables.map((table) => (
              <TableCard
                key={table.id ?? table.tableId}
                table={table}
                onJoin={handleJoin}
              />
            ))}

            {/* Ghost tile — only for coaches/admins with table:create permission */}
            {canCreateTable && (
              <GhostTile onClick={() => setShowModal(true)} />
            )}

            {/* Empty state (no tables, no create permission) */}
            {activeTables.length === 0 && !canCreateTable && (
              <p className="text-sm text-gray-600 col-span-full py-2">No active tables.</p>
            )}
          </div>
        </section>

        {/* ── Two-column: Recent Hands + Playlists ──────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Recent Hands */}
          <div className="flex flex-col gap-3 p-5 rounded-xl" style={PANEL}>
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase">
              Recent Hands
            </h2>
            {recentHands.length === 0 ? (
              <p className="text-sm text-gray-600">No hands recorded yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recentHands.slice(0, 5).map((hand) => {
                  const net = hand.net_chips ?? hand.netChips ?? null;
                  const netN = net != null ? Number(net) : null;
                  const hColor = netN == null ? '#9ca3af' : netN >= 0 ? '#4ade80' : '#f87171';
                  const tags   = hand.tags ?? [];
                  return (
                    <li
                      key={hand.id}
                      className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      <div className="flex flex-col gap-1 min-w-0">
                        <span className="text-xs font-mono text-gray-400 truncate">
                          #{String(hand.id).slice(0, 8)}
                        </span>
                        {tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {netN != null && (
                          <span className="text-xs font-mono" style={{ color: hColor }}>
                            {netN >= 0 ? '+' : ''}{netN.toLocaleString('en-US')}
                          </span>
                        )}
                        <span className="text-xs text-gray-600">
                          {hand.created_at
                            ? new Date(hand.created_at).toLocaleDateString()
                            : ''}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Playlists (coach/admin only) */}
          {hasPermission('playlist:manage') ? (
            <div className="flex flex-col gap-3 p-5 rounded-xl" style={PANEL}>
              <h2 className="text-xs font-semibold text-gray-500 tracking-widest uppercase">
                Playlists
              </h2>
              {playlists.length === 0 ? (
                <p className="text-sm text-gray-600">No playlists yet.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {playlists.map((pl) => (
                    <li
                      key={pl.id}
                      className="text-sm text-gray-300 py-1.5 px-3 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      {pl.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            /* Spacer column so layout stays symmetric for players */
            <div />
          )}
        </section>


      </div>

      {/* ── Create Table Modal ────────────────────────────────────────────────── */}
      {showModal && (
        <CreateTableModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
