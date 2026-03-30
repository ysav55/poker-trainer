import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { apiFetch } from '../lib/api.js';

// ── Inline keyframe injection (single instance) ──────────────────────────────

const PULSE_STYLE_ID = 'tournament-panel-pulse-style';
if (typeof document !== 'undefined' && !document.getElementById(PULSE_STYLE_ID)) {
  const s = document.createElement('style');
  s.id = PULSE_STYLE_ID;
  s.textContent = `
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%       { opacity: 0.45; transform: scale(0.78); }
    }
  `;
  document.head.appendChild(s);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms) {
  if (ms == null || ms < 0) ms = 0;
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timerColor(remainingMs, totalMs) {
  if (!totalMs || totalMs <= 0) return '#3fb950';
  const pct = remainingMs / totalMs;
  if (pct > 0.5) return '#3fb950';
  if (pct > 0.25) return '#e3b341';
  return '#f85149';
}

function ordinal(n) {
  if (n == null) return '?';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Confirm modal ─────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

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
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
            aria-label="Close"
          >✕</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm" style={{ color: '#8b949e' }}>{body}</p>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: danger ? 'rgba(248,81,73,0.15)' : 'rgba(212,175,55,0.15)',
                border: `1px solid ${danger ? 'rgba(248,81,73,0.4)' : 'rgba(212,175,55,0.4)'}`,
                color: danger ? '#f85149' : '#d4af37',
                cursor: 'pointer',
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * TournamentInfoPanel — replaces CoachSidebar on tournament tables.
 *
 * Props:
 *   socket  — the raw socket.io client instance
 */
export default function TournamentInfoPanel({ socket }) {
  const { tableId, gameState } = useTable();
  const { hasPermission } = useAuth();

  // ── Tournament state ───────────────────────────────────────────────────────
  const [currentLevel, setCurrentLevel]   = useState(null);   // { level, sb, bb, ante, durationMs }
  const [nextLevel, setNextLevel]         = useState(null);   // { sb, bb, ante }
  const [isFinalLevel, setIsFinalLevel]   = useState(false);
  const [eliminations, setEliminations]   = useState([]);     // newest first, max 5
  const [winner, setWinner]               = useState(null);   // { winnerId, standings }

  // ── Countdown ─────────────────────────────────────────────────────────────
  const [remainingMs, setRemainingMs]     = useState(null);
  const [totalMs, setTotalMs]             = useState(null);
  const tickRef                           = useRef(null);

  const startCountdown = useCallback((ms) => {
    clearInterval(tickRef.current);
    setRemainingMs(ms);
    const end = Date.now() + ms;
    tickRef.current = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      setRemainingMs(left);
      if (left <= 0) clearInterval(tickRef.current);
    }, 1000);
  }, []);

  useEffect(() => () => clearInterval(tickRef.current), []);

  // ── Socket listeners ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onTimeRemaining = ({ level, remainingMs: ms, durationMs }) => {
      setCurrentLevel((prev) => (prev?.level === level ? prev : { ...prev, level }));
      if (durationMs) setTotalMs(durationMs);
      startCountdown(ms);
    };

    const onBlindUp = (levelObj) => {
      // levelObj may contain { level, sb, bb, ante, durationMs, next }
      setCurrentLevel(levelObj);
      if (levelObj.next) setNextLevel(levelObj.next);
      if (levelObj.durationMs) {
        setTotalMs(levelObj.durationMs);
        startCountdown(levelObj.durationMs);
      }
      setIsFinalLevel(false);
    };

    const onFinalLevel = () => setIsFinalLevel(true);

    const onElimination = ({ playerId, position, playerCount, playerName }) => {
      setEliminations((prev) => [{ playerId, position, playerCount, playerName, ts: Date.now() }, ...prev].slice(0, 5));
    };

    const onEnded = ({ winnerId, standings }) => {
      setWinner({ winnerId, standings });
      clearInterval(tickRef.current);
    };

    socket.on('tournament:time_remaining', onTimeRemaining);
    socket.on('tournament:blind_up',       onBlindUp);
    socket.on('tournament:final_level',    onFinalLevel);
    socket.on('tournament:elimination',    onElimination);
    socket.on('tournament:ended',          onEnded);

    return () => {
      socket.off('tournament:time_remaining', onTimeRemaining);
      socket.off('tournament:blind_up',       onBlindUp);
      socket.off('tournament:final_level',    onFinalLevel);
      socket.off('tournament:elimination',    onElimination);
      socket.off('tournament:ended',          onEnded);
    };
  }, [socket, startCountdown]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const pct = totalMs && totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const color = timerColor(remainingMs ?? 0, totalMs ?? 0);
  const criticalTime = remainingMs != null && remainingMs <= 120_000;

  const activePlayers = Array.isArray(gameState?.seated)
    ? gameState.seated.filter((p) => p && p.stack > 0).length
    : 0;

  // ── Coach overrides ────────────────────────────────────────────────────────
  const [confirmModal, setConfirmModal] = useState(null);
  const [actionError, setActionError]   = useState(null);

  const handleAdvanceLevel = useCallback(async () => {
    setActionError(null);
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/advance-level`, { method: 'POST' });
    } catch (err) {
      // Fallback: emit socket event if REST not available
      if (socket) socket.emit('tournament:advance_level', { tableId });
      setActionError(err.message);
    }
  }, [tableId, socket]);

  const handleEndTournament = useCallback(async () => {
    setActionError(null);
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/end`, { method: 'POST' });
    } catch (err) {
      if (socket) socket.emit('tournament:end', { tableId });
      setActionError(err.message);
    }
  }, [tableId, socket]);

  const isCoach = hasPermission('table:manage');

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        style={{
          width: '288px',        // w-72
          background: '#161b22',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#d4af37',
            }}
          >
            TOURNAMENT
          </span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#3fb950',
              display: 'inline-block',
              animation: 'pulse-dot 1.5s infinite',
              flexShrink: 0,
            }}
          />
        </div>

        {/* ── Winner banner ────────────────────────────────────────────────── */}
        {winner && (
          <div
            style={{
              borderRadius: '8px',
              padding: '10px 12px',
              background: 'rgba(212,175,55,0.12)',
              border: '1px solid rgba(212,175,55,0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', color: '#d4af37', marginBottom: '4px' }}>
              TOURNAMENT COMPLETE
            </div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f0ece3' }}>
              Winner: {winner.winnerId || 'TBD'}
            </div>
          </div>
        )}

        {/* ── Blind level ─────────────────────────────────────────────────── */}
        <div
          style={{
            borderRadius: '8px',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{ fontSize: '22px', fontWeight: 900, color: '#f0ece3', lineHeight: 1 }}>
              {currentLevel ? `Level ${currentLevel.level}` : 'Level —'}
            </span>
            {isFinalLevel && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#f85149',
                  background: 'rgba(248,81,73,0.14)',
                  border: '1px solid rgba(248,81,73,0.35)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                }}
              >
                FINAL LEVEL
              </span>
            )}
          </div>
          <div style={{ fontSize: '13px', color: '#8b949e', marginBottom: '4px' }}>
            {currentLevel
              ? `${currentLevel.sb ?? '?'} / ${currentLevel.bb ?? '?'}${currentLevel.ante ? ` · ante ${currentLevel.ante}` : ''}`
              : '— / —'}
          </div>
          {!isFinalLevel && nextLevel && (
            <div style={{ fontSize: '11px', color: '#6e7681' }}>
              Next: {nextLevel.sb}/{nextLevel.bb}{nextLevel.ante ? ` · ante ${nextLevel.ante}` : ''} in {formatMs(remainingMs)}
            </div>
          )}
        </div>

        {/* ── Countdown timer ─────────────────────────────────────────────── */}
        <div
          style={{
            borderRadius: '8px',
            padding: '10px 12px',
            background: criticalTime ? 'rgba(248,81,73,0.04)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${criticalTime ? 'rgba(248,81,73,0.14)' : 'rgba(255,255,255,0.05)'}`,
            transition: 'background 0.6s ease, border-color 0.6s ease',
          }}
        >
          <div style={{ fontSize: '28px', fontFamily: 'monospace', fontWeight: 700, color, lineHeight: 1, marginBottom: '8px' }}>
            {remainingMs != null ? formatMs(remainingMs) : '--:--'}
          </div>
          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: color,
                borderRadius: '3px',
                transition: 'width 0.9s linear, background 0.6s ease',
              }}
            />
          </div>
        </div>

        {/* ── Players remaining ────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', color: '#6e7681', marginBottom: '4px' }}>
            PLAYERS REMAINING
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#f0ece3' }}>
            {activePlayers}
          </div>
        </div>

        {/* ── Elimination feed ─────────────────────────────────────────────── */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', color: '#6e7681', marginBottom: '6px' }}>
            RECENT ELIMINATIONS
          </div>
          {eliminations.length === 0 ? (
            <div style={{ fontSize: '11px', color: '#6e7681' }}>No eliminations yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {eliminations.map((e, i) => (
                <div key={e.ts ?? i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#6e7681',
                      background: 'rgba(110,118,129,0.12)',
                      border: '1px solid rgba(110,118,129,0.25)',
                      borderRadius: '4px',
                      padding: '1px 5px',
                      flexShrink: 0,
                      fontFamily: 'monospace',
                    }}
                  >
                    {ordinal(e.position)}
                  </span>
                  <span style={{ fontSize: '12px', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.playerName || e.playerId || 'Unknown'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Coach overrides ──────────────────────────────────────────────── */}
        {isCoach && !winner && (
          <div
            style={{
              borderTop: '1px solid rgba(255,255,255,0.06)',
              paddingTop: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', color: '#6e7681', marginBottom: '2px' }}>
              COACH CONTROLS
            </div>

            {actionError && (
              <div
                style={{
                  fontSize: '11px',
                  color: '#f85149',
                  background: 'rgba(248,81,73,0.08)',
                  border: '1px solid rgba(248,81,73,0.25)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                }}
              >
                {actionError}
              </div>
            )}

            {/* Advance Level */}
            <button
              onClick={() =>
                setConfirmModal({
                  title: 'ADVANCE LEVEL',
                  body: 'Force-advance to the next blind level now?',
                  confirmLabel: 'ADVANCE',
                  danger: false,
                  onConfirm: handleAdvanceLevel,
                })
              }
              style={{
                background: 'none',
                border: '1px solid rgba(212,175,55,0.25)',
                borderRadius: '6px',
                color: '#d4af37',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '6px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.6)';
                e.currentTarget.style.background  = 'rgba(212,175,55,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212,175,55,0.25)';
                e.currentTarget.style.background  = 'none';
              }}
            >
              Advance Level
            </button>

            {/* End Tournament */}
            <button
              onClick={() =>
                setConfirmModal({
                  title: 'END TOURNAMENT',
                  body: 'Are you sure you want to end the tournament immediately? This cannot be undone.',
                  confirmLabel: 'END TOURNAMENT',
                  danger: true,
                  onConfirm: handleEndTournament,
                })
              }
              style={{
                background: 'none',
                border: '1px solid rgba(248,81,73,0.3)',
                borderRadius: '6px',
                color: '#f85149',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '6px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(248,81,73,0.65)';
                e.currentTarget.style.background  = 'rgba(248,81,73,0.06)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(248,81,73,0.3)';
                e.currentTarget.style.background  = 'none';
              }}
            >
              End Tournament
            </button>
          </div>
        )}
      </div>

      {/* ── Confirm modal (portal-free, rendered outside panel box) ─────────── */}
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
    </>
  );
}
