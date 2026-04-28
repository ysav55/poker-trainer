import React, { useState, useCallback } from 'react';
import { useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

// ── Shared button style helpers ───────────────────────────────────────────────

function ctrlButton(color, danger = false) {
  return {
    base: {
      width: '100%',
      background: 'none',
      border: `1px solid rgba(${color},0.25)`,
      borderRadius: '6px',
      color: `rgba(${color},1)`,
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.1em',
      padding: '7px 12px',
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'border-color 0.15s, background 0.15s',
    },
    hover: {
      borderColor: `rgba(${color},0.6)`,
      background: `rgba(${color},0.06)`,
    },
    leave: {
      borderColor: `rgba(${color},0.25)`,
      background: 'none',
    },
  };
}

function CtrlBtn({ colorRgb, label, onClick, disabled = false }) {
  const s = ctrlButton(colorRgb);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ ...s.base, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      onMouseEnter={(e) => { if (!disabled) Object.assign(e.currentTarget.style, s.hover); }}
      onMouseLeave={(e) => { if (!disabled) Object.assign(e.currentTarget.style, s.leave); }}
    >
      {label}
    </button>
  );
}

// ── Confirm modal (inline, no portal) ────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: danger ? '#f85149' : '#d4af37' }}>
            {title}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
          >✕</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm" style={{ color: '#8b949e' }}>{body}</p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
            >Cancel</button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: danger ? 'rgba(248,81,73,0.15)' : 'rgba(212,175,55,0.15)',
                border: `1px solid ${danger ? 'rgba(248,81,73,0.4)' : 'rgba(212,175,55,0.4)'}`,
                color: danger ? '#f85149' : '#d4af37',
                cursor: 'pointer',
              }}
            >{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Eliminate player modal ────────────────────────────────────────────────────

function EliminateModal({ players, tableId, onClose }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState(null);

  const handleEliminate = async () => {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/eliminate-player`, {
        method: 'POST',
        body: JSON.stringify({ stableId: selected }),
      });
      onClose();
    } catch (e) {
      setErr(e.message ?? 'Failed to eliminate player');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#161b22', border: '1px solid rgba(248,81,73,0.35)', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#f85149' }}>ELIMINATE PLAYER</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
          >✕</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          <p style={{ fontSize: 12, color: '#8b949e' }}>Select a player to manually eliminate:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {players.map((p) => (
              <button
                key={p.stable_id ?? p.id}
                onClick={() => setSelected(p.stable_id ?? p.id)}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                  background: selected === (p.stable_id ?? p.id) ? 'rgba(248,81,73,0.12)' : '#0d1117',
                  border: `1px solid ${selected === (p.stable_id ?? p.id) ? 'rgba(248,81,73,0.5)' : '#21262d'}`,
                  color: selected === (p.stable_id ?? p.id) ? '#f85149' : '#c9d1d9',
                  transition: 'all 0.12s',
                }}
              >
                {p.name ?? p.id} — {(p.stack ?? 0).toLocaleString()} chips
              </button>
            ))}
          </div>
          {err && (
            <div style={{ fontSize: 11, color: '#f85149', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 4, padding: '4px 8px' }}>
              {err}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
            >Cancel</button>
            <button
              onClick={handleEliminate}
              disabled={!selected || loading}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: 'rgba(248,81,73,0.15)',
                border: '1px solid rgba(248,81,73,0.4)',
                color: '#f85149',
                cursor: !selected || loading ? 'not-allowed' : 'pointer',
                opacity: !selected || loading ? 0.6 : 1,
              }}
            >{loading ? 'Eliminating…' : 'Eliminate'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Toggle switch ─────────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#8b949e' }}>{label}</span>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: checked ? 'rgba(63,185,80,0.35)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${checked ? 'rgba(63,185,80,0.6)' : 'rgba(255,255,255,0.12)'}`,
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.15s',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 1,
            left: checked ? 14 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: checked ? '#3fb950' : '#6e7681',
            transition: 'left 0.15s, background 0.15s',
          }}
        />
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * TournamentSidebar — manager-only controls panel for tournament tables.
 * Shown alongside the poker table, styled like CoachSidebar.
 */
export default function TournamentSidebar({
  isPaused,
  icmOverlayEnabled,
  managerHandVisible,
  spectatorHandVisible,
  isStarted,
}) {
  const { tableId, gameState, socket: tableSocket } = useTable();
  const { user } = useAuth();
  const socketRef = tableSocket?.socketRef;

  const [confirmModal, setConfirmModal]       = useState(null);
  const [showEliminateModal, setShowEliminate] = useState(false);
  const [actionError, setActionError]         = useState(null);
  const [loading, setLoading]                 = useState(false);

  const emit = useCallback((event, payload) => {
    socketRef?.current?.emit(event, payload ?? {});
  }, [socketRef]);

  const apiAction = useCallback(async (path, method = 'POST') => {
    setActionError(null);
    setLoading(true);
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/${path}`, { method });
    } catch (err) {
      setActionError(err.message ?? 'Action failed');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  // Active (non-eliminated) players for the eliminate modal
  const activePlayers = (gameState?.seated ?? gameState?.players ?? [])
    .filter((p) => p && (p.stack ?? 0) > 0 && !p.is_coach);

  return (
    <>
      <div
        style={{
          width: 272,
          flexShrink: 0,
          background: '#161b22',
          borderLeft: '1px solid rgba(212,175,55,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden auto',
          padding: '14px 12px',
          gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', color: '#d4af37' }}>
            TOURNAMENT CONTROLS
          </span>
          <span
            style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#d4af37',
              display: 'inline-block',
              animation: 'pulse-dot 1.5s infinite',
            }}
          />
        </div>

        {/* Paused banner */}
        {isPaused && (
          <div
            style={{
              fontSize: 11, fontWeight: 700, letterSpacing: '0.14em',
              color: '#e3b341',
              background: 'rgba(227,179,65,0.08)',
              border: '1px solid rgba(227,179,65,0.3)',
              borderRadius: 6,
              padding: '6px 10px',
              textAlign: 'center',
            }}
          >
            ⏸ TOURNAMENT PAUSED
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div
            style={{
              fontSize: 11, color: '#f85149',
              background: 'rgba(248,81,73,0.08)',
              border: '1px solid rgba(248,81,73,0.25)',
              borderRadius: 4,
              padding: '4px 8px',
            }}
          >
            {actionError}
          </div>
        )}

        {/* ── Primary controls ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', color: '#6e7681', marginBottom: 2 }}>
            GAME FLOW
          </div>

          {/* Start (only before tournament is started) */}
          {!isStarted && (
            <CtrlBtn
              colorRgb="63,185,80"
              label="▶ Start Tournament"
              disabled={loading}
              onClick={() =>
                setConfirmModal({
                  title: 'START TOURNAMENT',
                  body: 'Start the tournament now? The first hand will be dealt automatically.',
                  confirmLabel: 'START',
                  danger: false,
                  onConfirm: () => apiAction('start'),
                })
              }
            />
          )}

          {/* Pause / Resume */}
          {isStarted && (
            <CtrlBtn
              colorRgb={isPaused ? '63,185,80' : '227,179,65'}
              label={isPaused ? '▶ Resume Tournament' : '⏸ Pause Tournament'}
              disabled={loading}
              onClick={() => emit(isPaused ? 'tournament:resume' : 'tournament:pause')}
            />
          )}

          {/* Advance Level */}
          {isStarted && (
            <CtrlBtn
              colorRgb="212,175,55"
              label="⏭ Advance Level"
              disabled={loading}
              onClick={() =>
                setConfirmModal({
                  title: 'ADVANCE LEVEL',
                  body: 'Force-advance to the next blind level now?',
                  confirmLabel: 'ADVANCE',
                  danger: false,
                  onConfirm: () => apiAction('advance-level'),
                })
              }
            />
          )}

          {/* End Tournament */}
          {isStarted && (
            <CtrlBtn
              colorRgb="248,81,73"
              label="⏹ End Tournament"
              disabled={loading}
              onClick={() =>
                setConfirmModal({
                  title: 'END TOURNAMENT',
                  body: 'End the tournament immediately? This cannot be undone.',
                  confirmLabel: 'END TOURNAMENT',
                  danger: true,
                  onConfirm: () => apiAction('end'),
                })
              }
            />
          )}

          {/* Eliminate Player */}
          {isStarted && activePlayers.length > 0 && (
            <CtrlBtn
              colorRgb="248,81,73"
              label="✕ Eliminate Player…"
              disabled={loading}
              onClick={() => setShowEliminate(true)}
            />
          )}
        </div>

        {/* ── Visibility controls ──────────────────────────────────────────── */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.14em', color: '#6e7681', marginBottom: 2 }}>
            VISIBILITY
          </div>
          <Toggle
            label="Show all cards to manager"
            checked={managerHandVisible}
            onChange={(v) => emit('tournament:set_hand_visibility', { type: 'manager', value: v })}
          />
          <Toggle
            label="Show all cards to spectators"
            checked={spectatorHandVisible}
            onChange={(v) => emit('tournament:set_hand_visibility', { type: 'spectator', value: v })}
          />
          <Toggle
            label="Live ICM overlay"
            checked={icmOverlayEnabled}
            onChange={(v) => emit('tournament:set_icm_overlay', { enabled: v })}
          />
        </div>
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          body={confirmModal.body}
          confirmLabel={confirmModal.confirmLabel}
          danger={confirmModal.danger}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}

      {/* Eliminate player modal */}
      {showEliminateModal && (
        <EliminateModal
          players={activePlayers}
          tableId={tableId}
          onClose={() => setShowEliminate(false)}
        />
      )}
    </>
  );
}
