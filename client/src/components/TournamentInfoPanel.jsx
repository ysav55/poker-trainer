import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTable } from '../contexts/TableContext.jsx';
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

// ── Main component ────────────────────────────────────────────────────────────

/**
 * TournamentInfoPanel — replaces CoachSidebar on tournament tables.
 * Gets socket from TableContext directly (no prop needed).
 */
export default function TournamentInfoPanel() {
  const { tableId, gameState, socket: tableSocket } = useTable();
  const socketRef = tableSocket?.socketRef;
  const navigate = useNavigate();

  // ── Tournament state ───────────────────────────────────────────────────────
  const [currentLevel, setCurrentLevel]   = useState(null);   // { level, sb, bb, ante, durationMs }
  const [nextLevel, setNextLevel]         = useState(null);   // { sb, bb, ante }
  const [isFinalLevel, setIsFinalLevel]   = useState(false);
  const [eliminations, setEliminations]   = useState([]);     // newest first, max 5
  const [winner, setWinner]               = useState(null);   // { winnerId, standings }

  // ── Late registration state ────────────────────────────────────────────────
  const [lateRegOpen, setLateRegOpen]     = useState(false);
  const [lateRegEndsAt, setLateRegEndsAt] = useState(null);

  // ── Re-entry state ────────────────────────────────────────────────────────
  const [reentryAvailable, setReentryAvailable] = useState(false);
  const [reentryStack, setReentryStack]         = useState(0);
  const [reentryEndsAt, setReentryEndsAt]       = useState(null);
  const [showReentryModal, setShowReentryModal] = useState(false);

  // ── Add-on state ──────────────────────────────────────────────────────────
  const [addonOpen, setAddonOpen]   = useState(false);
  const [addonStack, setAddonStack] = useState(0);
  const [addonTaken, setAddonTaken] = useState(false); // track if this user already took it

  // ── Paused state ─────────────────────────────────────────────────────────────
  const [isPaused, setIsPaused]           = useState(false);

  // ── ICM overlay state ──────────────────────────────────────────────────────
  const [icmOverlay, setIcmOverlay]       = useState(null);   // array of { playerId, icmPct, icmChips }

  // ── Deal proposal state ────────────────────────────────────────────────────
  const [dealProposal, setDealProposal]   = useState(null);
  const [dealLoading, setDealLoading]     = useState(false);
  const [showDealModal, setShowDealModal] = useState(false);
  const [actionError, setActionError]     = useState(null);

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
    const socket = socketRef?.current;
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
      // Navigate to standings page after a short delay
      setTimeout(() => navigate(`/tournament/${tableId}/standings`), 3000);
    };

    const onIcmUpdate = ({ overlay }) => setIcmOverlay(Array.isArray(overlay) ? overlay : null);

    const onLateRegOpen = ({ endsAt }) => { setLateRegOpen(true); setLateRegEndsAt(endsAt); };
    const onLateRegClosed = () => { setLateRegOpen(false); setLateRegEndsAt(null); };

    const currentUserId = sessionStorage.getItem('poker_trainer_player_id');

    const onReentryAvailable = ({ playerId, reentryStack: stack, endsAt }) => {
      if (playerId === currentUserId) {
        setReentryStack(stack);
        setReentryEndsAt(endsAt);
        setReentryAvailable(true);
        setShowReentryModal(true);
      }
    };

    const onReentryConfirmed = () => {
      setShowReentryModal(false);
      setReentryAvailable(false);
      setActionError(null);
    };

    const onReentryRejected = ({ reason }) => {
      setShowReentryModal(false);
      setReentryAvailable(false);
      setActionError(`Re-entry failed: ${reason}`);
    };

    const onAddonOpen = ({ addonStack: stack }) => {
      setAddonStack(stack);
      setAddonOpen(true);
      setAddonTaken(false);
    };

    const onAddonClosed = () => {
      setAddonOpen(false);
    };

    const onAddonConfirmed = () => {
      setAddonTaken(true);
      setAddonOpen(false);
    };

    const onAddonRejected = ({ reason }) => {
      setActionError(`Add-on failed: ${reason}`);
    };

    const onPaused   = () => setIsPaused(true);
    const onResumed  = () => setIsPaused(false);

    socket.on('tournament:paused',   onPaused);
    socket.on('tournament:resumed',  onResumed);
    socket.on('tournament:time_remaining', onTimeRemaining);
    socket.on('tournament:blind_up',       onBlindUp);
    socket.on('tournament:final_level',    onFinalLevel);
    socket.on('tournament:elimination',    onElimination);
    socket.on('tournament:ended',          onEnded);
    socket.on('tournament:icm_update',     onIcmUpdate);
    socket.on('tournament:late_reg_open',  onLateRegOpen);
    socket.on('tournament:late_reg_closed', onLateRegClosed);
    socket.on('tournament:reentry_available', onReentryAvailable);
    socket.on('tournament:reentry_confirmed', onReentryConfirmed);
    socket.on('tournament:reentry_rejected',  onReentryRejected);
    socket.on('tournament:addon_open',     onAddonOpen);
    socket.on('tournament:addon_closed',   onAddonClosed);
    socket.on('tournament:addon_confirmed', onAddonConfirmed);
    socket.on('tournament:addon_rejected', onAddonRejected);

    return () => {
      socket.off('tournament:time_remaining', onTimeRemaining);
      socket.off('tournament:blind_up',       onBlindUp);
      socket.off('tournament:final_level',    onFinalLevel);
      socket.off('tournament:elimination',    onElimination);
      socket.off('tournament:ended',          onEnded);
      socket.off('tournament:icm_update',     onIcmUpdate);
      socket.off('tournament:late_reg_open',  onLateRegOpen);
      socket.off('tournament:late_reg_closed', onLateRegClosed);
      socket.off('tournament:reentry_available', onReentryAvailable);
      socket.off('tournament:reentry_confirmed', onReentryConfirmed);
      socket.off('tournament:reentry_rejected',  onReentryRejected);
      socket.off('tournament:addon_open',     onAddonOpen);
      socket.off('tournament:addon_closed',   onAddonClosed);
      socket.off('tournament:addon_confirmed', onAddonConfirmed);
      socket.off('tournament:addon_rejected', onAddonRejected);
    socket.off('tournament:paused',         onPaused);
    socket.off('tournament:resumed',        onResumed);
    };
  }, [socketRef, startCountdown, tableId, navigate]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const pct = totalMs && totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;
  const color = timerColor(remainingMs ?? 0, totalMs ?? 0);
  const criticalTime = remainingMs != null && remainingMs <= 120_000;

  const seatedPlayers = Array.isArray(gameState?.seated)
    ? gameState.seated.filter((p) => p && p.stack > 0)
    : [];
  const activePlayers = seatedPlayers.length;

  const tournamentConfig = gameState?.tournamentConfig ?? null;
  const dealThreshold = tournamentConfig?.deal_threshold ?? 0;
  const showDealButton = dealThreshold > 0 && activePlayers > 0 && activePlayers <= dealThreshold;

  // ── Deal proposal handler ──────────────────────────────────────────────────
  const handleProposeDeal = useCallback(async () => {
    setDealLoading(true);
    try {
      const result = await apiFetch(`/api/tables/${tableId}/tournament/deal-proposal`);
      setDealProposal(result);
      setShowDealModal(true);
    } catch (err) {
      setActionError(err.message ?? 'Failed to fetch deal proposal');
    } finally {
      setDealLoading(false);
    }
  }, [tableId]);

  const handleAcceptDeal = useCallback(async () => {
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/deal-proposal/accept`, { method: 'POST' });
      setShowDealModal(false);
      setDealProposal(null);
    } catch (err) {
      setActionError(err.message ?? 'Failed to accept deal');
    }
  }, [tableId]);

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
        {/* ── Paused banner ──────────────────────────────────────────────── */}
        {isPaused && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
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

        {/* ── Late registration banner ─────────────────────────────────── */}
        {lateRegOpen && (
          <div className="bg-yellow-500 text-black text-sm px-3 py-2 rounded mb-2">
            Late registration open — closes {lateRegEndsAt ? new Date(lateRegEndsAt).toLocaleTimeString() : 'soon'}
          </div>
        )}

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
              Winner: {winner.winnerName ?? winner.winnerId ?? 'TBD'}
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

        {/* ── ICM Equity overlay ───────────────────────────────────────────── */}
        {icmOverlay && icmOverlay.length > 0 && (
          <div>
            <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.15em', color: '#6e7681', marginBottom: '6px' }}>
              ICM EQUITY
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {seatedPlayers.map((player) => {
                const icm = icmOverlay.find((o) => o.playerId === player.id);
                return (
                  <div
                    key={player.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}
                  >
                    <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {player.name || player.id || 'Unknown'}
                    </span>
                    {icm ? (
                      <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                        {(icm.icmPct * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: '#6e7681', flexShrink: 0, marginLeft: 8 }}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Propose Deal button ──────────────────────────────────────────── */}
        {showDealButton && !winner && (
          <div>
            <button
              onClick={handleProposeDeal}
              disabled={dealLoading}
              style={{
                width: '100%',
                background: dealLoading ? 'rgba(63,185,80,0.05)' : 'none',
                border: '1px solid rgba(63,185,80,0.4)',
                borderRadius: '6px',
                color: '#3fb950',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '7px 12px',
                cursor: dealLoading ? 'not-allowed' : 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!dealLoading) {
                  e.currentTarget.style.borderColor = 'rgba(63,185,80,0.75)';
                  e.currentTarget.style.background  = 'rgba(63,185,80,0.07)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(63,185,80,0.4)';
                e.currentTarget.style.background  = 'none';
              }}
            >
              {dealLoading ? 'Loading…' : 'Propose Deal'}
            </button>
          </div>
        )}

        {/* ── Add-on button ───────────────────────────────────────────────── */}
        {addonOpen && !addonTaken && !winner && (
          <div>
            <button
              onClick={() => socketRef?.current?.emit('tournament:request_addon')}
              style={{
                width: '100%',
                background: 'none',
                border: '1px solid rgba(63,185,80,0.4)',
                borderRadius: '6px',
                color: '#3fb950',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                padding: '7px 12px',
                cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(63,185,80,0.75)';
                e.currentTarget.style.background  = 'rgba(63,185,80,0.07)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(63,185,80,0.4)';
                e.currentTarget.style.background  = 'none';
              }}
            >
              Add-on available (+{addonStack.toLocaleString()} chips)
            </button>
          </div>
        )}

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

        {/* Error display (add-on/reentry errors) */}
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
      </div>

      {/* ── Re-entry modal ───────────────────────────────────────────────────── */}
      {showReentryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowReentryModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
            style={{ background: '#161b22', border: '1px solid rgba(212,175,55,0.35)', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
              <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#d4af37' }}>
                RE-ENTRY AVAILABLE
              </span>
              <button
                onClick={() => setShowReentryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
                aria-label="Close"
              >✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-sm" style={{ color: '#8b949e' }}>
                You have been eliminated. You may re-enter the tournament with {reentryStack.toLocaleString()} chips.
                {reentryEndsAt ? ` Re-entry closes at ${new Date(reentryEndsAt).toLocaleTimeString()}.` : ''}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowReentryModal(false)}
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
                >
                  Sit Out
                </button>
                <button
                  onClick={() => {
                    socketRef?.current?.emit('tournament:request_reentry');
                    setShowReentryModal(false);
                  }}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: 'rgba(212,175,55,0.15)',
                    border: '1px solid rgba(212,175,55,0.4)',
                    color: '#d4af37',
                    cursor: 'pointer',
                  }}
                >
                  Re-enter ({reentryStack.toLocaleString()} chips)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Deal proposal modal ───────────────────────────────────────────────── */}
      {showDealModal && dealProposal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDealModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
            style={{ background: '#161b22', border: '1px solid rgba(63,185,80,0.35)', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
              <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#3fb950' }}>
                DEAL PROPOSAL
              </span>
              <button
                onClick={() => setShowDealModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
                aria-label="Close"
              >✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
                Proposed prize distribution based on current chip counts:
              </p>
              {Array.isArray(dealProposal.prizes) && dealProposal.prizes.map((prize, i) => (
                <div
                  key={prize.playerId ?? i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#0d1117',
                    border: '1px solid #21262d',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
                    {prize.playerName || prize.playerId || `Player ${i + 1}`}
                  </span>
                  <span style={{ color: '#3fb950', fontFamily: 'monospace', fontWeight: 700 }}>
                    {typeof prize.chips === 'number' ? prize.chips.toLocaleString() : prize.chips}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-end gap-3" style={{ marginTop: 8 }}>
                <button
                  onClick={() => setShowDealModal(false)}
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAcceptDeal}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: 'rgba(63,185,80,0.15)',
                    border: '1px solid rgba(63,185,80,0.4)',
                    color: '#3fb950',
                    cursor: 'pointer',
                  }}
                >
                  Accept Deal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
