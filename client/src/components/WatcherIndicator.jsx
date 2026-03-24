import React from 'react';

/**
 * WatcherIndicator — shown at a real player's seat position during non-branched replay.
 * The player is present at the table but is watching the replay, not participating.
 *
 * Props:
 *   player  — player object from gameState.players
 *   style   — absolute positioning style from parent
 *   isMe    — true if this is the local client's seat
 */
export default function WatcherIndicator({ player, style = {}, isMe = false }) {
  if (!player) return null;

  return (
    <div
      className="absolute flex flex-col items-center pointer-events-none select-none"
      style={{ width: 110, transform: 'translateX(-50%)', ...style }}
    >
      <div style={{
        padding: '5px 10px',
        borderRadius: 8,
        background: 'rgba(13,17,23,0.6)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        backdropFilter: 'blur(4px)',
      }}>
        <span style={{
          fontSize: 11,
          color: '#6e7681',
          maxWidth: 90,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {player.name}
          {isMe && (
            <span style={{ color: '#d4af37', marginLeft: 4, fontSize: 9 }}>YOU</span>
          )}
        </span>
        <span style={{
          fontSize: 8,
          fontWeight: 600,
          letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.2)',
          textTransform: 'uppercase',
        }}>
          WATCHING
        </span>
      </div>
    </div>
  );
}
