import React from 'react';
import { FilePlus } from 'lucide-react';
import { colors } from '../../lib/colors.js';

export default function EmptyBuilder({ onNewScenario }) {
  return (
    <div
      data-testid="empty-builder"
      className="flex flex-col items-center justify-center h-full"
      style={{ color: colors.textMuted }}
    >
      <FilePlus size={36} strokeWidth={1.3} style={{ opacity: 0.35, color: colors.gold, marginBottom: 14 }} />
      <div style={{ fontSize: 13, marginBottom: 4, color: colors.textSecondary }}>
        Select a scenario to edit
      </div>
      <div style={{ fontSize: 12, marginBottom: 16, color: colors.textMuted }}>
        or start a new one from scratch.
      </div>
      <button
        data-testid="empty-new-btn"
        onClick={onNewScenario}
        style={{
          padding: '8px 20px',
          borderRadius: 4,
          background: colors.gold,
          color: '#000',
          border: 'none',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = colors.goldHover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = colors.gold; }}
      >
        + New Scenario
      </button>
    </div>
  );
}
