import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

const GHOST_BUTTON_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 12px',
  height: 28,
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: '0.03em',
  background: 'transparent',
  color: '#8b949e',
  border: '1px solid #30363d',
  cursor: 'pointer',
  transition: 'color 0.15s, border-color 0.15s',
};

function GhostButton({ label, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...GHOST_BUTTON_STYLE,
        color: hovered ? '#d4af37' : '#8b949e',
        borderColor: hovered ? 'rgba(212,175,55,0.5)' : '#30363d',
      }}
    >
      {label}
    </button>
  );
}

/**
 * BroadcastBar — coach-only bar pinned at top of multi-table view.
 *
 * Props:
 *   tableRefs — array of socketRef objects (React.MutableRefObject<Socket>)
 *               collected from each TableProvider.
 */
export default function BroadcastBar({ tableRefs = [] }) {
  const { hasPermission } = useAuth();

  if (!hasPermission('table:manage')) return null;

  function emitAll(event) {
    tableRefs.forEach((ref) => {
      ref?.current?.emit(event);
    });
  }

  return (
    <div
      style={{
        height: 40,
        background: '#161b22',
        borderBottom: '1px solid rgba(212,175,55,0.2)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 8,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: 'rgba(212,175,55,0.6)',
          marginRight: 4,
          textTransform: 'uppercase',
        }}
      >
        Broadcast
      </span>

      <GhostButton label="Start All"   onClick={() => emitAll('start_game')} />
      <GhostButton label="Reset All"   onClick={() => emitAll('reset_hand')} />
      <GhostButton label="Pause All"   onClick={() => emitAll('toggle_pause')} />
      <GhostButton label="Advance All" onClick={() => emitAll('force_next_street')} />
    </div>
  );
}
