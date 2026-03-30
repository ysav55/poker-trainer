import React from 'react';

/**
 * ModeratorControls — compact pause/resume panel shown to moderators
 * in uncoached sessions where a full coach sidebar isn't shown.
 *
 * Rendered by TablePage when user.role === 'moderator'.
 */
export default function ModeratorControls({ gameState, emit }) {
  if (!gameState) return null;

  const isPaused = gameState.paused === true;
  const phase = gameState.phase ?? 'waiting';
  const isActive = !['waiting', 'showdown'].includes(phase);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        alignItems: 'flex-end',
      }}
    >
      {/* Moderator badge */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.2em',
          color: 'rgba(212,175,55,0.55)',
          textTransform: 'uppercase',
        }}
      >
        MODERATOR
      </div>

      {/* Pause / Resume */}
      {isActive && (
        <button
          onClick={() => emit.togglePause?.()}
          style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.1em',
            borderRadius: 6,
            cursor: 'pointer',
            border: `1px solid ${isPaused ? '#3b82f6' : '#4b5563'}`,
            background: isPaused ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
            color: isPaused ? '#93c5fd' : '#9ca3af',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = isPaused ? 'rgba(59,130,246,0.28)' : 'rgba(255,255,255,0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = isPaused ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)';
          }}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      )}
    </div>
  );
}
