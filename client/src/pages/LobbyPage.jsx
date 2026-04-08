import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { apiFetch } from '../lib/api.js';
import StatPill from '../components/StatPill.jsx';
import FilterTabs from '../components/FilterTabs.jsx';
import TableCard from '../components/TableCard.jsx';
import NewTableCard from '../components/NewTableCard.jsx';
import { WizardModal } from './admin/TournamentSetup.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

const COACH_TABLE_TABS = [
  { id: 'all',        label: 'All' },
  { id: 'cash',       label: 'Cash' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'mine',       label: 'My Tables' },
  { id: 'school',     label: 'School' },
  { id: 'open',       label: 'Open' },
];

const STUDENT_TABLE_TABS = [
  { id: 'all',        label: 'All' },
  { id: 'cash',       label: 'Cash' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'available',  label: 'Available' },
  { id: 'mine',       label: 'My Tables' },
];

const TRIAL_TABLE_TABS = [
  { id: 'all',        label: 'All' },
  { id: 'cash',       label: 'Cash' },
  { id: 'tournament', label: 'Tournament' },
];

const MODE_OPTIONS = [
  { value: 'coached_cash',   label: 'Coached Cash' },
  { value: 'uncoached_cash', label: 'Auto Cash' },
];

// Tournament mode is handled separately via the WizardModal — not in the simple create flow.

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Roles that can manage (claim/steal management) a tournament table
const MANAGER_ROLES = new Set(['superadmin', 'admin', 'coach']);

function mapTableToCard(table, role, userId) {
  const isTournament = table.mode === 'tournament';
  const phase = (table.phase ?? 'waiting').toLowerCase();
  const status = ['waiting', 'paused'].includes(phase) ? phase : 'active';
  const tableType = isTournament ? 'Tournament' : 'Cash';
  const isSeated = table.players?.some?.((p) => p.stableId === userId || p.id === userId);
  const canManage = MANAGER_ROLES.has(role);
  const isCoachOrAdmin = role === 'coach' || role === 'admin' || role === 'superadmin';

  let actionLabel = 'JOIN';
  let secondaryActionLabel = null;

  if (isTournament && canManage) {
    // Tournament + eligible role: split Play / Manage
    actionLabel = 'PLAY';
    secondaryActionLabel = 'MANAGE';
  } else if (!isTournament && isCoachOrAdmin) {
    actionLabel = 'MANAGE';
    secondaryActionLabel = 'SPECTATE';
  } else if (isSeated) {
    actionLabel = 'PLAYING';
  } else if (isTournament) {
    actionLabel = 'REGISTER';
  }

  return {
    id: table.id ?? table.tableId,
    name: table.name ?? `Table ${table.id ?? table.tableId}`,
    status,
    privacy: table.privacy ?? 'open',
    gameType: 'NLHE',
    tableType,
    mode: table.mode,
    maxPlayers: table.maxPlayers ?? 9,
    playerCount: table.playerCount ?? table.player_count ?? 0,
    smallBlind: table.smallBlind ?? table.config?.sb ?? null,
    bigBlind: table.bigBlind ?? table.config?.bb ?? null,
    pot: table.pot ?? null,
    controller: table.controller ?? null,
    actionLabel,
    secondaryActionLabel,
  };
}

function filterTables(tables, tab, userId) {
  switch (tab) {
    case 'cash':       return tables.filter((t) => t.mode !== 'tournament');
    case 'tournament': return tables.filter((t) => t.mode === 'tournament');
    case 'mine':       return tables.filter((t) =>
      t.players?.some?.((p) => p.stableId === userId || p.id === userId)
    );
    case 'school':     return tables.filter((t) => t.privacy === 'school');
    case 'open':       return tables.filter((t) => t.privacy === 'open');
    case 'available':  return tables.filter((t) => {
      const count = t.playerCount ?? t.player_count ?? 0;
      const max = t.maxPlayers ?? 9;
      return count < max && !t.players?.some?.((p) => p.stableId === userId || p.id === userId);
    });
    default: return tables;
  }
}

function fmtStat(v, pct = false) {
  if (v == null) return '—';
  return pct ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString();
}

// ─── Create Table Modal ───────────────────────────────────────────────────────

const PRIVACY_OPTIONS = [
  { value: 'open',    label: 'Open',    desc: 'Anyone can join' },
  { value: 'school',  label: 'School',  desc: 'Same school only' },
  { value: 'private', label: 'Private', desc: 'Invitation only' },
];

function CreateTableModal({ onClose, onCreated }) {
  const [name, setName]             = useState('');
  const [mode, setMode]             = useState('coached_cash');
  const [sb, setSb]                 = useState(25);
  const [bb, setBb]                 = useState(50);
  const [startingStack, setStack]   = useState(5000);
  const [privacy, setPrivacy]       = useState('open');
  const [presets, setPresets]       = useState([]);
  const [saveAsPreset, setSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState('');

  // Load presets on mount
  useEffect(() => {
    apiFetch('/api/table-presets').then((d) => setPresets(d?.presets ?? [])).catch(() => {});
  }, []);

  const applyPreset = (preset) => {
    const cfg = preset.config ?? {};
    if (cfg.sb)            setSb(cfg.sb);
    if (cfg.bb)            setBb(cfg.bb);
    if (cfg.startingStack) setStack(cfg.startingStack);
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Table name is required.'); return; }
    if (sb <= 0 || bb <= sb) { setError('Big blind must be greater than small blind.'); return; }
    setBusy(true);
    setError('');
    try {
      const table = await apiFetch('/api/tables', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          mode,
          privacy,
          config: { sb, bb, startingStack },
        }),
      });
      if (saveAsPreset && presetName.trim()) {
        apiFetch('/api/table-presets', {
          method: 'POST',
          body: JSON.stringify({ name: presetName.trim(), config: { sb, bb, startingStack } }),
        }).catch(() => {});
      }
      onCreated(table);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' };

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

        {/* Preset loader */}
        {presets.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Load Preset</label>
            <select
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              defaultValue=""
              onChange={(e) => {
                const p = presets.find((x) => String(x.id) === e.target.value);
                if (p) applyPreset(p);
              }}
            >
              <option value="" disabled>Select a preset…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Table name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Table Name</label>
          <input
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main Table"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        {/* Mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Mode</label>
          <div className="flex gap-2 flex-wrap">
            {MODE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                style={
                  mode === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Blinds */}
        <div className="flex gap-3">
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Small Blind</label>
            <input
              type="number" min="1"
              className="rounded-lg px-3 py-2 text-sm outline-none w-full"
              style={inputStyle}
              value={sb}
              onChange={(e) => setSb(Number(e.target.value))}
            />
          </div>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Big Blind</label>
            <input
              type="number" min="1"
              className="rounded-lg px-3 py-2 text-sm outline-none w-full"
              style={inputStyle}
              value={bb}
              onChange={(e) => setBb(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Starting Stack */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>
            Starting Stack <span style={{ color: '#8b949e' }}>({(startingStack / bb).toFixed(0)} BB)</span>
          </label>
          <input
            type="number" min="1"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={inputStyle}
            value={startingStack}
            onChange={(e) => setStack(Number(e.target.value))}
          />
        </div>

        {/* Privacy */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>Privacy</label>
          <div className="flex gap-2 flex-wrap">
            {PRIVACY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPrivacy(opt.value)}
                className="text-xs px-3 py-1.5 rounded-full font-semibold transition-colors"
                title={opt.desc}
                style={
                  privacy === opt.value
                    ? { background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }
                    : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Save as preset */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsPreset}
              onChange={(e) => setSavePreset(e.target.checked)}
              style={{ accentColor: GOLD }}
            />
            <span className="text-xs" style={{ color: '#8b949e' }}>Save config as preset</span>
          </label>
          {saveAsPreset && (
            <input
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name…"
            />
          )}
        </div>

        {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}

        <div className="flex gap-3 justify-end">
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
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }}
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Buy-In Modal ────────────────────────────────────────────────────────────

function BuyInModal({ table, userId, onConfirm, onClose }) {
  const bb = table.bigBlind ?? table.config?.bb ?? 50;
  const [multiplier, setMultiplier] = useState(100);
  const [chipBalance, setChipBalance] = useState(null);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/api/players/${userId}/stats`).then((d) => {
      setChipBalance(d?.chip_bank ?? d?.chipBank ?? null);
    }).catch(() => {});
  }, [userId]);

  const buyInAmount = Math.round(multiplier * bb);
  const canAfford = chipBalance == null || chipBalance >= buyInAmount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col gap-5 rounded-xl w-full max-w-xs"
        style={{ background: '#161b22', border: '1px solid #30363d', padding: 24 }}
      >
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: GOLD }}>
          Buy In — {table.name}
        </h2>

        {chipBalance != null && (
          <p className="text-xs" style={{ color: '#8b949e' }}>
            Your chip bank: <span style={{ color: '#e6edf3' }}>{Number(chipBalance).toLocaleString()}</span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>
            Amount: <span style={{ color: '#e6edf3' }}>{buyInAmount.toLocaleString()} chips ({multiplier} BB)</span>
          </label>
          <input
            type="range" min="50" max="200" step="10"
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            style={{ accentColor: GOLD, width: '100%' }}
          />
          <div className="flex justify-between text-xs" style={{ color: '#6e7681' }}>
            <span>50 BB</span><span>200 BB</span>
          </div>
        </div>

        {!canAfford && (
          <p className="text-xs" style={{ color: '#f87171' }}>
            Insufficient chips — you need {buyInAmount.toLocaleString()} but have {Number(chipBalance).toLocaleString()}.
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(buyInAmount)}
            disabled={!canAfford}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: GOLD }}
          >
            Join Table
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Feed Widget ────────────────────────────────────────────────────────

function AlertFeedWidget({ alerts, onSeeAll }) {
  if (!alerts || alerts.length === 0) return null;
  const top = alerts.slice(0, 3);

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2
          className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5"
          style={{ color: '#f87171' }}
        >
          ⚠ Needs Attention
        </h2>
        {alerts.length > 3 && (
          <button
            onClick={onSeeAll}
            className="text-xs transition-colors"
            style={{ color: '#8b949e' }}
          >
            See All →
          </button>
        )}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d', background: '#0d1117' }}>
        {top.map((alert, i) => {
          const severity = alert.severity ?? 0;
          const dot = severity >= 0.75 ? '#f85149' : severity >= 0.4 ? '#d4af37' : '#3fb950';
          return (
            <div
              key={alert.id ?? i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: i < top.length - 1 ? '1px solid #21262d' : 'none' }}
            >
              <span style={{ color: dot, fontSize: 10 }}>●</span>
              <span className="text-sm" style={{ color: '#e6edf3' }}>
                {alert.player_name ?? alert.playerName ?? 'Unknown'}
              </span>
              <span className="text-xs" style={{ color: '#8b949e' }}>
                — {alert.detail ?? alert.type ?? 'Needs review'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

function ActivityFeed({ hands }) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8b949e' }}>
        📋 Recent Activity
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d', background: '#0d1117' }}>
        {hands.length === 0 ? (
          <p className="px-4 py-3 text-sm" style={{ color: '#6e7681' }}>No recent activity.</p>
        ) : (
          hands.slice(0, 5).map((h, i) => {
            const net = h.net_chips ?? h.netChips ?? null;
            const netN = net != null ? Number(net) : null;
            const color = netN == null ? '#8b949e' : netN >= 0 ? '#4ade80' : '#f87171';
            return (
              <div
                key={h.id ?? i}
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: i < Math.min(hands.length, 5) - 1 ? '1px solid #21262d' : 'none' }}
              >
                <span className="text-sm" style={{ color: '#e6edf3' }}>
                  Hand #{String(h.id).slice(0, 8)}
                </span>
                {netN != null && (
                  <span className="text-xs font-mono tabular-nums" style={{ color }}>
                    {netN >= 0 ? '+' : ''}{netN.toLocaleString()}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Announcement Banner ──────────────────────────────────────────────────────

function AnnouncementBanner({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-lg px-4 py-3"
      style={{ background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.25)' }}
    >
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 14 }}>📢</span>
        <p className="text-sm leading-snug" style={{ color: '#93c5fd' }}>{message}</p>
      </div>
      <button onClick={onDismiss} className="text-xs shrink-0 mt-0.5" style={{ color: '#6e7681' }}>
        Dismiss
      </button>
    </div>
  );
}

// ─── Trial Banner ─────────────────────────────────────────────────────────────

function TrialBanner({ handsLeft, daysLeft }) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-lg px-4 py-3"
      style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.35)' }}
      data-testid="trial-banner"
    >
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 16 }}>⏰</span>
        <span className="text-sm font-semibold" style={{ color: GOLD }}>
          Trial: {daysLeft ?? '?'} days · {handsLeft ?? '?'} hands remaining
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/register')}
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{ background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.4)`, color: GOLD }}
        >
          Subscribe →
        </button>
        <button
          onClick={() => navigate('/register')}
          className="text-xs px-3 py-1.5 rounded font-semibold"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
        >
          Join a Coach →
        </button>
      </div>
    </div>
  );
}

// ─── Session Widget ───────────────────────────────────────────────────────────

function SessionWidget({ sessions }) {
  if (!sessions || sessions.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8b949e' }}>
        📅 Upcoming
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d', background: '#0d1117' }}>
        {sessions.slice(0, 3).map((s, i) => (
          <div
            key={s.id ?? i}
            className="flex items-center justify-between px-4 py-2.5"
            style={{ borderBottom: i < Math.min(sessions.length, 3) - 1 ? '1px solid #21262d' : 'none' }}
          >
            <span className="text-sm" style={{ color: '#e6edf3' }}>
              {s.title ?? s.description ?? 'Session'}
            </span>
            <span className="text-xs" style={{ color: '#8b949e' }}>
              {s.scheduled_at
                ? new Date(s.scheduled_at).toLocaleDateString(undefined, {
                    weekday: 'short', hour: '2-digit', minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Tables Section ───────────────────────────────────────────────────────────

function TablesSection({ tables, role, userId, canCreate, onAction, onManageAction, onNewTable, onNewTournament }) {
  const [tab, setTab] = useState('all');

  const tabDefs = (role === 'coach' || role === 'admin' || role === 'superadmin')
    ? COACH_TABLE_TABS
    : role === 'trial'
      ? TRIAL_TABLE_TABS
      : STUDENT_TABLE_TABS;

  const showController = role === 'coach' || role === 'admin' || role === 'superadmin';
  const baseTables = role === 'trial'
    ? tables.filter((t) => t.privacy === 'open' || t.privacy == null)
    : tables;

  const visible = filterTables(baseTables, tab, userId);

  const tabsWithBadges = tabDefs.map((t) => ({
    ...t,
    badge: t.id !== 'all' ? (filterTables(baseTables, t.id, userId).length || null) : null,
  }));

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: '#8b949e' }}>
        Tables
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d', background: '#0d1117' }}>
        <FilterTabs tabs={tabsWithBadges} active={tab} onChange={setTab} />

        <div className="p-4">
          {visible.length === 0 && !canCreate ? (
            <p className="text-sm text-center py-4" style={{ color: '#6e7681' }}>
              No tables in this view.
            </p>
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}
            >
              {visible.map((t) => {
                const cardData = mapTableToCard(t, role, userId);
                return (
                  <TableCard
                    key={t.id ?? t.tableId}
                    table={cardData}
                    onAction={onAction}
                    onSecondaryAction={cardData.secondaryActionLabel ? onManageAction : undefined}
                    showController={showController}
                  />
                );
              })}
              {canCreate && (
                <NewTableCard
                  onClick={tab === 'tournament' ? onNewTournament : onNewTable}
                  label={tab === 'tournament' ? '+ New Tournament' : '+ New Table'}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Main LobbyPage ───────────────────────────────────────────────────────────

export default function LobbyPage() {
  const { user, hasPermission } = useAuth();
  const { activeTables, refreshTables } = useLobby();
  const navigate = useNavigate();

  const role      = user?.role ?? 'player';
  const userId    = user?.id;
  const isCoach   = role === 'coach';
  const isAdmin   = role === 'admin' || role === 'superadmin';
  const isTrial   = role === 'trial';
  const isCoachOrAdmin = isCoach || isAdmin;
  const canCreate = hasPermission('table:create');

  // ── State ──────────────────────────────────────────────────────────────────
  const [stats, setStats]               = useState(null);
  const [rank, setRank]                 = useState(null);
  const [alerts, setAlerts]             = useState([]);
  const [hands, setHands]               = useState([]);
  const [sessions, setSessions]         = useState([]);
  const [announcement, setAnnouncement] = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [showTournamentWizard, setShowTournamentWizard] = useState(false);
  const [buyInTable, setBuyInTable]     = useState(null); // table object for buy-in modal

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    apiFetch(`/api/players/${userId}/stats`).then(setStats).catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId || isCoachOrAdmin) return;
    apiFetch('/api/players')
      .then((d) => {
        const list = d?.players ?? d ?? [];
        const sorted = [...list].sort(
          (a, b) => Number(b.total_net_chips ?? 0) - Number(a.total_net_chips ?? 0),
        );
        const pos = sorted.findIndex((p) => p.stable_id === userId || p.id === userId);
        setRank(pos >= 0 ? pos + 1 : null);
      })
      .catch(() => {});
  }, [userId, isCoachOrAdmin]);

  useEffect(() => {
    if (!isCoachOrAdmin) return;
    apiFetch('/api/admin/alerts')
      .then((d) => setAlerts(d?.alerts ?? d ?? []))
      .catch(() => {});
  }, [isCoachOrAdmin]);

  useEffect(() => {
    apiFetch('/api/hands?limit=10')
      .then((d) => setHands(d?.hands ?? d ?? []))
      .catch(() => {});
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTableAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/tournament/${tableId}/lobby`);
    } else if (table?.mode === 'uncoached_cash' && !isCoachOrAdmin) {
      // Non-coach player joining an uncoached table must buy in first
      setBuyInTable(table);
    } else {
      navigate(`/table/${tableId}`);
    }
  }, [activeTables, navigate, isCoachOrAdmin]);

  // "Manage" action on a tournament card — joins as manager-spectator
  // "Spectate" action on a cash table — joins as spectator
  const handleManageAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/table/${tableId}?manager=true`);
    } else {
      navigate(`/table/${tableId}?spectate=true`);
    }
  }, [activeTables, navigate]);

  const handleBuyInConfirm = useCallback((buyInAmount) => {
    if (!buyInTable) return;
    const tableId = buyInTable.id ?? buyInTable.tableId;
    setBuyInTable(null);
    navigate(`/table/${tableId}`, { state: { buyInAmount } });
  }, [buyInTable, navigate]);

  const handleCreated = useCallback((table) => {
    setShowModal(false);
    refreshTables();
    const tableId = table.id ?? table.tableId;
    if (tableId) navigate(`/table/${tableId}`);
  }, [navigate, refreshTables]);

  const handleTournamentCreated = useCallback(({ groupId }) => {
    setShowTournamentWizard(false);
    refreshTables();
    if (groupId) navigate(`/tournaments/${groupId}`);
  }, [navigate, refreshTables]);

  // ── Build stats rows ───────────────────────────────────────────────────────
  const alertCount = alerts.filter((a) => (a.severity ?? 0) >= 0.4).length;
  const chipBalance = stats?.chip_bank ?? stats?.chipBank ?? null;

  const coachStats = [
    { value: activeTables.length, label: 'Active\nTables' },
    { value: stats?.students_online ?? '—', label: 'Students\nOnline' },
    { value: fmtStat(stats?.hands_this_week), label: 'Hands\nThis Wk' },
    { value: stats?.avg_grade ?? '—', label: 'Avg\nGrade' },
    { value: String(alertCount), label: 'Alerts', trend: alertCount > 0 ? 'up' : null },
  ];

  const adminStats = [
    { value: activeTables.length, label: 'Active\nTables' },
    { value: fmtStat(stats?.total_users), label: 'Total\nUsers' },
    { value: fmtStat(stats?.hands_total), label: 'Hands\nTotal' },
    { value: stats?.online_now ?? '—', label: 'Online\nNow' },
  ];

  const studentStats = [
    { value: chipBalance != null ? Number(chipBalance).toLocaleString() : '—', label: 'Chip\nBank' },
    { value: fmtStat(stats?.hands_played), label: 'Hands\nPlayed' },
    { value: fmtStat(stats?.vpip, true), label: 'VPIP' },
    { value: fmtStat(stats?.pfr, true), label: 'PFR' },
    { value: rank != null ? `#${rank}` : '—', label: 'Leader\nboard' },
  ];

  const trialStats = [
    { value: stats?.trial_days_left ?? '?', label: 'Trial\nLeft' },
    { value: stats?.trial_hands_left ?? '?', label: 'Hands\nLeft' },
    { value: rank != null ? `#${rank}` : '#—', label: 'Leader\nboard' },
  ];

  const statRow = isAdmin ? adminStats : isCoach ? coachStats : isTrial ? trialStats : studentStats;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">

      {/* ── Trial Banner ───────────────────────────────────────────────────── */}
      {isTrial && (
        <TrialBanner
          daysLeft={stats?.trial_days_left}
          handsLeft={stats?.trial_hands_left}
        />
      )}

      {/* ── Announcement Banner (coached students) ─────────────────────────── */}
      {!isCoachOrAdmin && !isTrial && announcement && (
        <AnnouncementBanner
          message={announcement}
          onDismiss={() => setAnnouncement(null)}
        />
      )}

      {/* ── Quick Stats ────────────────────────────────────────────────────── */}
      <section>
        <h2
          className="text-xs font-semibold tracking-widest uppercase mb-3"
          style={{ color: '#8b949e' }}
        >
          Quick Stats
        </h2>
        <div className="flex flex-wrap gap-3">
          {statRow.map((s, i) => (
            <StatPill key={i} value={s.value} label={s.label} trend={s.trend} />
          ))}
        </div>
      </section>

      {/* ── Needs Attention (coach / admin) ────────────────────────────────── */}
      {isCoachOrAdmin && (
        <AlertFeedWidget
          alerts={alerts}
          onSeeAll={() => navigate('/admin/alerts')}
        />
      )}

      {/* ── Upcoming Sessions (coached students only) ──────────────────────── */}
      {!isCoachOrAdmin && !isTrial && (
        <SessionWidget sessions={sessions} />
      )}

      {/* ── Tables Grid ────────────────────────────────────────────────────── */}
      <TablesSection
        tables={activeTables}
        role={role}
        userId={userId}
        canCreate={canCreate}
        onAction={handleTableAction}
        onManageAction={handleManageAction}
        onNewTable={() => setShowModal(true)}
        onNewTournament={() => setShowTournamentWizard(true)}
      />

      {/* ── Recent Activity (coach / admin) ────────────────────────────────── */}
      {isCoachOrAdmin && <ActivityFeed hands={hands} />}

      {/* ── Create Table Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <CreateTableModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* ── Buy-In Modal (uncoached tables, non-coach players) ─────────────── */}
      {buyInTable && (
        <BuyInModal
          table={buyInTable}
          userId={userId}
          onConfirm={handleBuyInConfirm}
          onClose={() => setBuyInTable(null)}
        />
      )}

      {/* ── Tournament Wizard (inline) ─────────────────────────────────────── */}
      {showTournamentWizard && (
        <WizardModal
          onClose={() => setShowTournamentWizard(false)}
          onCreated={handleTournamentCreated}
        />
      )}
    </div>
  );
}
