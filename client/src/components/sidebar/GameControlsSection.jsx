import React, { useState, useCallback } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import HandConfigPanel from '../HandConfigPanel';
import { RangeMatrix } from '../RangeMatrix';

export default function GameControlsSection({
  gameState, emit, is_paused, phase,
  equityEnabled = false, setEquityEnabled = null, showToPlayers = false,
}) {
  const [mode, setMode] = useState('rng'); // 'rng' | 'manual'
  const [shareRangeOpen, setShareRangeOpen] = useState(false);
  const [shareRangeGroups, setShareRangeGroups] = useState(new Set());
  const [shareRangeLabel, setShareRangeLabel] = useState('');

  const handleModeToggle = useCallback(
    (newMode) => {
      setMode(newMode);
      if (emit.setMode) emit.setMode(newMode);
      // Auto-enter config phase when switching to manual so HandConfigPanel is live
      if (newMode === 'manual' && phase === 'WAITING' && emit.openConfigPhase) {
        emit.openConfigPhase();
      }
    },
    [emit, phase]
  );

  const handleStartGame = useCallback(() => {
    if (emit.startGame) emit.startGame(mode);
  }, [emit, mode]);

  const handleResetHand = useCallback(() => {
    if (emit.resetHand) emit.resetHand();
  }, [emit]);

  const handleTogglePause = useCallback(() => {
    if (emit.togglePause) emit.togglePause();
  }, [emit]);

  return (
    <CollapsibleSection title="GAME CONTROLS" defaultOpen={true}>
      {/* Mode toggle: RNG vs MANUAL */}
      <div className="flex mb-3">
        <button
          onClick={() => handleModeToggle('rng')}
          className="flex-1 py-1.5 text-xs font-semibold tracking-wider transition-all duration-150 rounded-l"
          style={{
            background: mode === 'rng' ? '#d4af37' : '#161b22',
            color: mode === 'rng' ? '#000' : '#6e7681',
            border: `1px solid ${mode === 'rng' ? '#d4af37' : '#30363d'}`,
            borderRight: 'none',
          }}
        >
          RNG MODE
        </button>
        <button
          onClick={() => handleModeToggle('manual')}
          className="flex-1 py-1.5 text-xs font-semibold tracking-wider transition-all duration-150 rounded-r"
          style={{
            background: mode === 'manual' ? '#d4af37' : '#161b22',
            color: mode === 'manual' ? '#000' : '#6e7681',
            border: `1px solid ${mode === 'manual' ? '#d4af37' : '#30363d'}`,
            borderLeft: '1px solid #21262d',
          }}
        >
          MANUAL MODE
        </button>
      </div>

      {/* MANUAL MODE: inline hand configuration (has its own Start Hand button) */}
      {mode === 'manual' && (
        <HandConfigPanel gameState={gameState} emit={emit} />
      )}

      {/* RNG MODE: simple Start Hand button */}
      {mode === 'rng' && (
        <div className="flex gap-2 mb-2">
          <button
            onClick={handleStartGame}
            className="btn-gold flex-1"
            style={{ padding: '7px 12px' }}
          >
            Start Hand
          </button>
          <button
            onClick={handleResetHand}
            className="btn-ghost"
            style={{ padding: '7px 12px' }}
          >
            Reset
          </button>
        </div>
      )}

      {/* EV Overlay — coach toggles visibility for self and players */}
      <div className="mb-3">
        <div className="text-[9px] font-bold tracking-[0.2em] uppercase mb-1.5" style={{ color: '#6e7681' }}>
          EV OVERLAY
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEquityEnabled?.(!equityEnabled)}
            className="flex-1 py-1 text-[10px] font-semibold tracking-wider rounded transition-all duration-150"
            style={{
              background: equityEnabled ? 'rgba(34,197,94,0.18)' : '#161b22',
              color: equityEnabled ? '#22c55e' : '#6e7681',
              border: `1px solid ${equityEnabled ? '#22c55e55' : '#30363d'}`,
            }}
          >
            Coach
          </button>
          <button
            onClick={() => emit.toggleEquityDisplay?.()}
            className="flex-1 py-1 text-[10px] font-semibold tracking-wider rounded transition-all duration-150"
            style={{
              background: showToPlayers ? 'rgba(34,197,94,0.18)' : '#161b22',
              color: showToPlayers ? '#22c55e' : '#6e7681',
              border: `1px solid ${showToPlayers ? '#22c55e55' : '#30363d'}`,
            }}
          >
            Players
          </button>
        </div>
      </div>

      {/* Share Range — broadcast a range to all players */}
      <button
        onClick={() => setShareRangeOpen(true)}
        className="w-full py-1.5 rounded text-[10px] font-semibold tracking-wider transition-all duration-150 mb-2"
        style={{
          background: 'rgba(212,175,55,0.08)',
          border: '1px solid rgba(212,175,55,0.25)',
          color: '#d4af37',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.08)'; }}
      >
        ⬡ Share Range
      </button>

      {/* Share Range modal */}
      {shareRangeOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShareRangeOpen(false); }}
        >
          <div
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 10,
              padding: '18px 20px',
              width: 360,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f0ece3', marginBottom: 12, letterSpacing: '0.08em' }}>
              BROADCAST RANGE
            </div>

            {/* Label input */}
            <input
              type="text"
              placeholder="Label (e.g. BTN open range)"
              value={shareRangeLabel}
              onChange={(e) => setShareRangeLabel(e.target.value)}
              style={{
                width: '100%', padding: '6px 10px', marginBottom: 12,
                background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
                color: '#f0ece3', fontSize: 12, outline: 'none',
                boxSizing: 'border-box',
              }}
            />

            {/* Matrix */}
            <RangeMatrix
              selected={shareRangeGroups}
              onToggle={(handGroup) => {
                setShareRangeGroups((prev) => {
                  const next = new Set(prev);
                  if (next.has(handGroup)) next.delete(handGroup);
                  else next.add(handGroup);
                  return next;
                });
              }}
              colorMode="selected"
            />

            <div style={{ fontSize: 10, color: '#6e7681', margin: '8px 0', textAlign: 'right' }}>
              {shareRangeGroups.size} hand group{shareRangeGroups.size !== 1 ? 's' : ''} selected
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                onClick={() => {
                  emit.shareRange?.([...shareRangeGroups], shareRangeLabel);
                  setShareRangeOpen(false);
                  setShareRangeGroups(new Set());
                  setShareRangeLabel('');
                }}
                disabled={shareRangeGroups.size === 0}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 6, cursor: shareRangeGroups.size ? 'pointer' : 'not-allowed',
                  background: shareRangeGroups.size ? '#d4af37' : '#333', color: shareRangeGroups.size ? '#000' : '#666',
                  border: 'none', fontWeight: 700, fontSize: 12,
                }}
              >
                Broadcast
              </button>
              <button
                onClick={() => { setShareRangeOpen(false); setShareRangeGroups(new Set()); setShareRangeLabel(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
                  background: '#21262d', color: '#8b949e', border: '1px solid #30363d', fontSize: 12,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause/Resume — always available */}
      <button
        onClick={handleTogglePause}
        className="w-full flex items-center justify-center gap-2 py-1.5 rounded text-sm transition-all duration-150"
        style={{
          background: is_paused ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${is_paused ? '#1d4ed8' : '#30363d'}`,
          color: is_paused ? '#93c5fd' : '#8b949e',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = is_paused
            ? 'rgba(59,130,246,0.2)'
            : 'rgba(255,255,255,0.07)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = is_paused
            ? 'rgba(59,130,246,0.12)'
            : 'rgba(255,255,255,0.04)';
        }}
      >
        {is_paused ? (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
            </svg>
            Resume Game
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
              <rect x="6.5" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
            </svg>
            Pause Game
          </>
        )}
      </button>
    </CollapsibleSection>
  );
}
