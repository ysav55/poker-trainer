import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

// ── Move Player Modal ─────────────────────────────────────────────────────────

function MovePlayerModal({ tables, onClose, onMove }) {
  const [fromTable, setFromTable]   = useState('');
  const [toTable, setToTable]       = useState('');
  const [playerId, setPlayerId]     = useState('');
  const [error, setError]           = useState('');

  const fromPlayers = fromTable
    ? (tables.find(t => t.id === fromTable)?.players ?? [])
    : [];

  const handleMove = () => {
    if (!fromTable || !toTable || !playerId) {
      setError('All fields are required.');
      return;
    }
    onMove({ fromTableId: fromTable, toTableId: toTable, playerId });
    onClose();
  };

  const sel = (value, onChange, options, placeholder) => (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: 6,
        color: value ? '#f0ece3' : '#6e7681',
        padding: '7px 10px',
        fontSize: 13,
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1px solid #30363d', paddingBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: GOLD }}>MOVE PLAYER</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: '#6e7681', display: 'block', marginBottom: 4 }}>FROM TABLE</label>
            {sel(fromTable, val => { setFromTable(val); setPlayerId(''); }, tables.map(t => ({ value: t.id, label: t.name ?? t.id })), 'Select source table')}
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6e7681', display: 'block', marginBottom: 4 }}>PLAYER</label>
            {sel(playerId, setPlayerId, fromPlayers.map(p => ({ value: p.id, label: p.name ?? p.id })), fromTable ? 'Select player' : 'Select source table first')}
          </div>
          <div>
            <label style={{ fontSize: 11, color: '#6e7681', display: 'block', marginBottom: 4 }}>TO TABLE</label>
            {sel(toTable, setToTable, tables.filter(t => t.id !== fromTable).map(t => ({ value: t.id, label: t.name ?? t.id })), 'Select target table')}
          </div>

          {error && <p style={{ fontSize: 12, color: '#f85149', margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '7px 16px', fontSize: 12 }}
            >Cancel</button>
            <button
              onClick={handleMove}
              style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)', borderRadius: 6, color: GOLD, cursor: 'pointer', padding: '7px 16px', fontSize: 12, fontWeight: 700 }}
            >Move Player</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Table Card ────────────────────────────────────────────────────────────────

function TournamentTableCard({ table, onAdvanceLevel, onEndTournament, onMovePlayer, onNavigate }) {
  const [advancing, setAdvancing]   = useState(false);
  const [ending, setEnding]         = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const handleAdvance = async () => {
    setAdvancing(true);
    try { await onAdvanceLevel(table.id); } finally { setAdvancing(false); }
  };

  const handleEnd = async () => {
    if (!confirmEnd) { setConfirmEnd(true); return; }
    setEnding(true);
    try { await onEndTournament(table.id); } finally { setEnding(false); setConfirmEnd(false); }
  };

  const activePlayers = (table.players ?? []).filter(p => (p.stack ?? 0) > 0).length;
  const totalPlayers  = (table.players ?? []).length;

  return (
    <div style={{ background: '#161b22', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3' }}>{table.name ?? table.id}</span>
        <span style={{ fontSize: 10, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 4, padding: '2px 7px', color: GOLD, fontWeight: 700, letterSpacing: '0.1em' }}>
          TOURNAMENT
        </span>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 16 }}>
        <Stat label="Active" value={`${activePlayers} / ${totalPlayers}`} />
        {table.currentLevel && (
          <Stat label="Level" value={table.currentLevel.level ?? '—'} />
        )}
        {table.currentLevel && (
          <Stat label="Blinds" value={`${table.currentLevel.sb}/${table.currentLevel.bb}`} />
        )}
      </div>

      {/* Player list */}
      {totalPlayers > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(table.players ?? []).map((p, i) => (
            <div key={p.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
              <span style={{ color: (p.stack ?? 0) > 0 ? '#c9d1d9' : '#6e7681', textDecoration: (p.stack ?? 0) <= 0 ? 'line-through' : 'none' }}>
                {p.name ?? p.id ?? `Player ${i + 1}`}
              </span>
              <span style={{ color: '#8b949e', fontFamily: 'monospace', fontSize: 11 }}>
                {(p.stack ?? 0).toLocaleString('en-US')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <ActionBtn onClick={() => onNavigate(table.id)} label="Monitor" color="#58a6ff" />
        <ActionBtn onClick={() => onMovePlayer(table)} label="Move Player" color="#8b949e" />
        <ActionBtn onClick={handleAdvance} label={advancing ? '…' : 'Adv. Level'} color={GOLD} disabled={advancing} />
        <ActionBtn
          onClick={handleEnd}
          label={confirmEnd ? (ending ? '…' : 'Confirm End') : 'End'}
          color="#f85149"
          disabled={ending}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681' }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3' }}>{value}</span>
    </div>
  );
}

function ActionBtn({ onClick, label, color, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && !disabled ? `rgba(${hexToRgb(color)},0.1)` : 'none',
        border: `1px solid ${disabled ? 'rgba(110,118,129,0.3)' : `${color}55`}`,
        borderRadius: 5,
        color: disabled ? '#6e7681' : color,
        fontSize: 11,
        fontWeight: 700,
        padding: '5px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.06em',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RefereeDashboard() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [tables, setTables]           = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [moveTarget, setMoveTarget]   = useState(null); // table to move player FROM (opens modal)
  const [notification, setNotification] = useState(null);
  const socketRef = useRef(null);

  const canManage = hasPermission('tournament:manage');

  const fetchTables = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tables');
      const all  = Array.isArray(data) ? data : (data.tables ?? data.data ?? []);
      // Filter to tournament tables only
      setTables(all.filter(t => t.mode === 'tournament' || t.table_mode === 'tournament'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  // Auto-refresh every 10s
  useEffect(() => {
    const id = setInterval(fetchTables, 10_000);
    return () => clearInterval(id);
  }, [fetchTables]);

  const notify = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleAdvanceLevel = async (tableId) => {
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/advance-level`, { method: 'POST' });
      notify(`Blind level advanced on ${tableId}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleEndTournament = async (tableId) => {
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/end`, { method: 'POST' });
      notify(`Tournament ended on ${tableId}`);
      fetchTables();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleMovePlayer = ({ fromTableId, toTableId, playerId }) => {
    // We don't have a socket here — emit via REST proxy or direct socket
    // For now: show notification that the move was requested (socket event from table view)
    notify(`Move requested: player ${playerId.slice(0, 8)} → ${toTableId}`);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0ece3', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.12em', color: GOLD, margin: 0 }}>
            REFEREE DASHBOARD
          </h1>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
            {tables.length} active tournament table{tables.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchTables}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
          >
            Refresh
          </button>
          <button
            onClick={() => navigate('/lobby')}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
          >
            ← Lobby
          </button>
        </div>
      </div>

      {/* Notification toast */}
      {notification && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 99,
          background: notification.type === 'error' ? 'rgba(248,81,73,0.15)' : 'rgba(63,185,80,0.15)',
          border: `1px solid ${notification.type === 'error' ? 'rgba(248,81,73,0.4)' : 'rgba(63,185,80,0.4)'}`,
          color: notification.type === 'error' ? '#f85149' : '#3fb950',
          borderRadius: 8, padding: '10px 16px', fontSize: 13, maxWidth: 320,
        }}>
          {notification.msg}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6e7681', fontSize: 14 }}>Loading tables…</p>
      ) : tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: '#6e7681', fontSize: 14, marginBottom: 16 }}>No active tournament tables.</p>
          <button
            onClick={() => navigate('/admin/tournaments')}
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)', borderRadius: 8, color: GOLD, cursor: 'pointer', padding: '10px 20px', fontSize: 13, fontWeight: 700 }}
          >
            Create Tournament
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {tables.map(table => (
            <TournamentTableCard
              key={table.id}
              table={table}
              onAdvanceLevel={handleAdvanceLevel}
              onEndTournament={handleEndTournament}
              onMovePlayer={(t) => setMoveTarget(t)}
              onNavigate={(id) => navigate(`/table/${id}`)}
            />
          ))}
        </div>
      )}

      {moveTarget && (
        <MovePlayerModal
          tables={tables}
          onClose={() => setMoveTarget(null)}
          onMove={handleMovePlayer}
        />
      )}
    </div>
  );
}
