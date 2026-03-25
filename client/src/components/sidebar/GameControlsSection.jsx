import React, { useState, useCallback } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import HandConfigPanel from '../HandConfigPanel';

export default function GameControlsSection({ gameState, emit, is_paused, phase }) {
  const [mode, setMode] = useState('rng'); // 'rng' | 'manual'

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
