import React from 'react';
import Card from './Card';
import { fmtChips } from '../utils/chips';

const ACTION_STYLES = {
  fold:    { label: 'FOLD',   color: '#f85149' },
  folded:  { label: 'FOLD',   color: '#f85149' },
  check:   { label: 'CHECK',  color: '#8b949e' },
  checked: { label: 'CHECK',  color: '#8b949e' },
  call:    { label: 'CALL',   color: '#58a6ff' },
  called:  { label: 'CALL',   color: '#58a6ff' },
  raise:   { label: 'RAISE',  color: '#fbbf24' },
  raised:  { label: 'RAISE',  color: '#fbbf24' },
  bet:     { label: 'BET',    color: '#fbbf24' },
  'all-in':{ label: 'ALL-IN', color: '#a855f7' },
  allin:   { label: 'ALL-IN', color: '#a855f7' },
};

/**
 * GhostSeat — renders a shadow player from a recorded replay hand.
 * Completely independent of who is currently seated at the table.
 *
 * Props:
 *   stableId        — player_id from the recorded hand (key in player_meta)
 *   name            — player name from the recorded hand
 *   isCoachSlot     — true if this ghost represents the coach position
 *   isCurrentAction — true if the current replay action belongs to this ghost
 *   holeCards       — string[] from replay_mode.original_hole_cards[stableId]
 *   action          — current displayed action string (e.g. 'raise', 'fold')
 *   stackAtCursor   — approximate stack value at current replay cursor
 *   style           — absolute positioning style from parent
 *   bbView          — bool
 *   bigBlind        — number
 */
export default function GhostSeat({
  stableId,
  name,
  isCoachSlot = false,
  isCurrentAction = false,
  holeCards = [],
  action = null,
  stackAtCursor = null,
  style = {},
  bbView = false,
  bigBlind = 10,
}) {
  const actionStyle = action ? ACTION_STYLES[action.toLowerCase()] : null;
  const isFolded = /fold/i.test(action || '');

  return (
    <div
      className="absolute flex flex-col items-center pointer-events-none select-none"
      style={{ width: 140, transform: 'translateX(-50%)', ...style }}
    >
      {/* Seat card */}
      <div
        style={{
          width: '100%',
          borderRadius: 12,
          padding: '8px 10px',
          background: 'rgba(13, 17, 23, 0.75)',
          border: isCurrentAction
            ? '1.5px solid rgba(167,139,250,0.7)'  // purple when acting
            : '1.5px dashed rgba(167,139,250,0.25)',
          boxShadow: isCurrentAction
            ? '0 0 12px rgba(167,139,250,0.25)'
            : 'none',
          opacity: isFolded ? 0.45 : 0.82,
          backdropFilter: 'blur(6px)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          transition: 'border 0.2s, box-shadow 0.2s',
        }}
      >
        {/* Ghost badge + name */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
          <span style={{
            fontSize: 11,
            color: '#8b949e',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {name}
          </span>
          {isCoachSlot && (
            <span style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#d4af37',
              background: 'rgba(212,175,55,0.1)',
              border: '1px solid rgba(212,175,55,0.3)',
              borderRadius: 4,
              padding: '1px 4px',
              flexShrink: 0,
            }}>COACH</span>
          )}
        </div>

        {/* Stack */}
        {stackAtCursor != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ color: 'rgba(167,139,250,0.6)', fontSize: 9 }}>●</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(167,139,250,0.8)',
            }}>
              {fmtChips(stackAtCursor, bigBlind, bbView)}
            </span>
          </div>
        )}

        {/* Hole cards */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {[0, 1].map(i => (
            <Card key={i} card={holeCards[i] ?? null} hidden={!holeCards[i]} small />
          ))}
        </div>
      </div>

      {/* Action badge */}
      {actionStyle && (
        <div style={{
          marginTop: 4,
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: actionStyle.color,
          background: `${actionStyle.color}18`,
          border: `1px solid ${actionStyle.color}40`,
        }}>
          {actionStyle.label}
        </div>
      )}

      {/* Turn indicator pulse ring */}
      {isCurrentAction && (
        <div style={{
          position: 'absolute',
          inset: -3,
          borderRadius: 14,
          border: '2px solid rgba(167,139,250,0.5)',
          animation: 'turnPulse 1.4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}
