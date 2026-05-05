import React from 'react';

export default function PendingBlindsBanner({ pending, liveBlinds, onDiscard }) {
  if (!pending) return null;
  const { sb, bb } = pending;
  return (
    <div
      role="status"
      style={{
        background: 'var(--accent-hot-faint, rgba(240,208,96,0.1))',
        border: '1px solid var(--accent-hot, #f0d060)',
        borderRadius: 6,
        padding: '8px 10px',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span style={{ flex: 1, fontSize: 11, lineHeight: 1.4 }}>
        Blinds change queued: <b>{liveBlinds.sb}/{liveBlinds.bb} → {sb}/{bb}</b> (applies at next hand)
      </span>
      <button className="btn ghost sm" onClick={onDiscard}>Discard Pending</button>
    </div>
  );
}
