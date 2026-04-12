import React from 'react';
import { colors } from '../../lib/colors.js';
import { withOpacity } from './PLAYLIST_COLORS.js';

export default function ScenarioItem({ scenario, playlistColor, selected, onClick }) {
  const borderColor = playlistColor
    ? withOpacity(playlistColor, 0.2)
    : colors.borderDefault;

  return (
    <button
      onClick={onClick}
      data-testid={`scenario-item-${scenario.id}`}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 10px 6px 14px',
        marginLeft: 20,
        marginBottom: 2,
        borderRadius: 4,
        borderLeft: `2px solid ${borderColor}`,
        background: selected ? colors.goldTint : 'transparent',
        color: selected ? colors.gold : colors.textPrimary,
        fontSize: 12,
        cursor: 'pointer',
        border: 'none',
        borderLeftWidth: 2,
        borderLeftStyle: 'solid',
        borderLeftColor: borderColor,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = colors.bgSurfaceHover;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
      }}
    >
      {scenario.name || `Scenario ${scenario.id?.slice(0, 6)}`}
    </button>
  );
}
