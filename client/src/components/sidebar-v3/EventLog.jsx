import React from 'react';

const PHASE_GLYPH = {
  hand_started: '▶',
  hand_ended: '✓',
  playlist_advanced: '→',
  coach_role_changed: '👤',
};

function relTime(ts) {
  const ms = Date.now() - ts;
  if (ms < 60000) return Math.floor(ms / 1000) + 's';
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm';
  return Math.floor(ms / 3600000) + 'h';
}

export default function EventLog({ events = [], max = 3 }) {
  const recent = events.slice(-max).reverse();

  if (recent.length === 0) {
    return (
      <div
        style={{
          fontSize: 10,
          color: 'var(--ink-faint)',
          textAlign: 'center',
          padding: '6px 0',
        }}
      >
        No drill events yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
      {recent.map((e, i) => (
        <div
          key={`${e.ts}-${i}`}
          style={{ display: 'flex', gap: 6, fontSize: 10, color: 'var(--ink-dim)' }}
        >
          <span style={{ fontFamily: 'var(--mono)', minWidth: 14 }}>
            {PHASE_GLYPH[e.type] || '·'}
          </span>
          <span style={{ flex: 1 }}>{e.message ?? e.type}</span>
          <span
            style={{
              color: 'var(--ink-faint)',
              fontFamily: 'var(--mono)',
            }}
          >
            {relTime(e.ts)}
          </span>
        </div>
      ))}
    </div>
  );
}
