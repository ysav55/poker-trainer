'use strict';

/**
 * EquityBadge — absolute-positioned badge showing a player's win equity %.
 *
 * Visibility rules (caller must pass correct `visible` prop):
 *   Coach:   visible when coach has equityEnabled toggled ON (local pref)
 *   Player (own seat): visible when equityData.showToPlayers === true
 *   Player (other seats): visible when equityData.showToPlayers === true
 *   Showdown: always visible (cards are revealed anyway)
 */
export function EquityBadge({ equity, visible }) {
  if (!visible || equity == null) return null;

  const color =
    equity > 55 ? '#22c55e' :   // green
    equity > 40 ? '#f59e0b' :   // amber
    '#ef4444';                   // red

  return (
    <div
      style={{
        position: 'absolute',
        top: -22,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 6,
        display: 'flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 999,
        background: 'rgba(10,14,20,0.88)',
        border: `1.5px solid ${color}55`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color }}>
        {equity}%
      </span>
    </div>
  );
}
