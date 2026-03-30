import React, { useState, useEffect } from 'react';
import { RangeMatrix } from './RangeMatrix';

/**
 * SharedRangeOverlay — floating overlay shown to all clients when the coach
 * broadcasts a range via 'share_range'. Dismissable per-client (local state).
 * Coach can re-broadcast at any time to show a new range.
 *
 * Props:
 *   sharedRange  {null | { handGroups: string[], label: string, sharedBy: string }}
 *   gamePhase    {string}  — used to show "Warmup" label when phase === 'waiting'
 */
export function SharedRangeOverlay({ sharedRange, gamePhase }) {
  const [dismissed, setDismissed] = useState(false);

  // Re-show whenever a new range is broadcast (sharedRange reference changes)
  useEffect(() => {
    if (sharedRange) setDismissed(false);
  }, [sharedRange]);

  if (!sharedRange || dismissed) return null;

  const selected = new Set(sharedRange.handGroups ?? []);
  const isWarmup = gamePhase === 'waiting';

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 80,
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 10,
        padding: '14px 16px',
        minWidth: 320,
        maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          {isWarmup && (
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: '#d4af37', textTransform: 'uppercase', marginBottom: 2 }}>
              Warmup
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f0ece3' }}>
            {sharedRange.label || 'Shared Range'}
          </div>
          {sharedRange.sharedBy && (
            <div style={{ fontSize: 10, color: '#6e7681', marginTop: 1 }}>
              Shared by {sharedRange.sharedBy}
            </div>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss shared range"
          style={{
            background: 'none',
            border: 'none',
            color: '#6e7681',
            cursor: 'pointer',
            fontSize: 18,
            lineHeight: 1,
            padding: '2px 4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
        >
          ✕
        </button>
      </div>

      {/* Matrix — read-only */}
      <div style={{ width: '100%' }}>
        <RangeMatrix
          selected={selected}
          colorMode="selected"
          readOnly
        />
      </div>

      {/* Combo count */}
      <div style={{ fontSize: 10, color: '#6e7681', marginTop: 8, textAlign: 'right' }}>
        {selected.size} hand group{selected.size !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
