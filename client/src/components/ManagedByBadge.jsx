import React, { useState, useEffect, useRef } from 'react';
import { useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

/**
 * ManagedByBadge — floating badge for non-managers on tournament tables.
 *
 * Shows:
 *   - "Managed by [name]" + "Take Over" button (if eligible)
 *   - "Orphaned — Claim Control" button (if no manager and eligible)
 *   - Disconnect countdown when manager drops (with "Claim Now")
 */
export default function ManagedByBadge({ managedBy, managerName, onClaimSuccess }) {
  const { socket: tableSocket } = useTable();
  const socketRef = tableSocket?.socketRef;
  const { hasPermission } = useAuth();

  const [disconnectCountdown, setDisconnectCountdown] = useState(null); // expiresAt timestamp
  const [showStealModal, setShowStealModal]           = useState(false);
  const [password, setPassword]                       = useState('');
  const [stealError, setStealError]                   = useState(null);
  const [stealLoading, setStealLoading]               = useState(false);
  const [timeLeft, setTimeLeft]                       = useState(null);
  const tickRef                                        = useRef(null);

  const canManage = hasPermission('table:manage') || hasPermission('tournament:manage');

  // Listen for disconnect / steal result events
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onDisconnected = ({ expiresAt }) => {
      setDisconnectCountdown(expiresAt);
      setTimeLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
      clearInterval(tickRef.current);
      tickRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
        setTimeLeft(left);
        if (left <= 0) {
          clearInterval(tickRef.current);
          setDisconnectCountdown(null);
        }
      }, 500);
    };

    const onManagerChanged = () => {
      // Manager has been set (claim/steal/reconnect) — clear disconnect state
      clearInterval(tickRef.current);
      setDisconnectCountdown(null);
      setTimeLeft(null);
      setShowStealModal(false);
    };

    const onStealResult = ({ granted, reason }) => {
      setStealLoading(false);
      if (granted) {
        setShowStealModal(false);
        setPassword('');
        setStealError(null);
        if (onClaimSuccess) onClaimSuccess();
      } else {
        setStealError(reason ?? 'Denied');
      }
    };

    const onClaimResult = ({ granted }) => {
      if (granted && onClaimSuccess) onClaimSuccess();
    };

    socket.on('tournament:manager_disconnected', onDisconnected);
    socket.on('tournament:manager_changed',      onManagerChanged);
    socket.on('tournament:steal_result',         onStealResult);
    socket.on('tournament:claim_result',         onClaimResult);

    return () => {
      socket.off('tournament:manager_disconnected', onDisconnected);
      socket.off('tournament:manager_changed',      onManagerChanged);
      socket.off('tournament:steal_result',         onStealResult);
      socket.off('tournament:claim_result',         onClaimResult);
      clearInterval(tickRef.current);
    };
  }, [socketRef, onClaimSuccess]);

  const handleClaim = () => {
    socketRef?.current?.emit('tournament:claim_management');
  };

  const handleStealSubmit = (e) => {
    e.preventDefault();
    if (!password.trim()) { setStealError('Password required'); return; }
    setStealLoading(true);
    setStealError(null);
    socketRef?.current?.emit('tournament:steal_management', { password });
  };

  // Nothing to show if table is orphaned and user can't manage
  if (!managedBy && !canManage) return null;

  return (
    <>
      <div
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          zIndex: 30,
          background: 'rgba(22,27,34,0.96)',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 200,
          maxWidth: 280,
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        {/* Disconnect countdown banner */}
        {disconnectCountdown && (
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: '#e3b341',
              background: 'rgba(227,179,65,0.1)',
              border: '1px solid rgba(227,179,65,0.3)',
              borderRadius: 4,
              padding: '3px 8px',
              textAlign: 'center',
            }}
          >
            Manager disconnected — {timeLeft}s to claim
          </div>
        )}

        {/* Manager status */}
        {managedBy ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: disconnectCountdown ? '#e3b341' : '#3fb950',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: '#8b949e', flex: 1 }}>
              Managed by{' '}
              <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{managerName ?? 'Unknown'}</span>
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f85149', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#8b949e' }}>Orphaned — no manager</span>
          </div>
        )}

        {/* Action buttons */}
        {canManage && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Claim (orphaned) or Claim during grace window */}
            {(!managedBy || disconnectCountdown) && (
              <button
                onClick={handleClaim}
                style={{
                  flex: 1,
                  background: 'rgba(63,185,80,0.12)',
                  border: '1px solid rgba(63,185,80,0.4)',
                  borderRadius: 5,
                  color: '#3fb950',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(63,185,80,0.2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(63,185,80,0.12)'; }}
              >
                {disconnectCountdown ? 'Claim Now' : 'Claim Control'}
              </button>
            )}

            {/* Steal (managed by someone else) */}
            {managedBy && !disconnectCountdown && (
              <button
                onClick={() => { setShowStealModal(true); setStealError(null); setPassword(''); }}
                style={{
                  flex: 1,
                  background: 'rgba(248,81,73,0.08)',
                  border: '1px solid rgba(248,81,73,0.3)',
                  borderRadius: 5,
                  color: '#f85149',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.15)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.08)'; }}
              >
                Take Over
              </button>
            )}
          </div>
        )}
      </div>

      {/* Steal modal (password confirmation) */}
      {showStealModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowStealModal(false); }}
        >
          <form
            onSubmit={handleStealSubmit}
            className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
            style={{ background: '#161b22', border: '1px solid rgba(248,81,73,0.35)', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
              <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#f85149' }}>
                TAKE OVER MANAGEMENT
              </span>
              <button type="button" onClick={() => setShowStealModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
              >✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <p className="text-sm" style={{ color: '#8b949e' }}>
                Enter your password to take over management from{' '}
                <strong style={{ color: '#c9d1d9' }}>{managerName ?? 'the current manager'}</strong>.
                They will lose control immediately.
              </p>
              <input
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                style={{
                  width: '100%',
                  background: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#e6edf3',
                  fontSize: 13,
                  padding: '8px 12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {stealError && (
                <div style={{ fontSize: 11, color: '#f85149', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 4, padding: '4px 8px' }}>
                  {stealError}
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => setShowStealModal(false)}
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
                >Cancel</button>
                <button
                  type="submit"
                  disabled={stealLoading || !password.trim()}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: 'rgba(248,81,73,0.15)',
                    border: '1px solid rgba(248,81,73,0.4)',
                    color: '#f85149',
                    cursor: stealLoading || !password.trim() ? 'not-allowed' : 'pointer',
                    opacity: stealLoading || !password.trim() ? 0.6 : 1,
                  }}
                >{stealLoading ? 'Verifying…' : 'Take Over'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
