import React from 'react';
import { Copy, Trash2, ChevronRight } from 'lucide-react';
import { colors } from '../../lib/colors.js';

export default function ScenarioToolbar({
  scenario,
  playlist,
  playlistColor,
  onDuplicate,
  onDelete,
}) {
  if (!scenario || scenario === 'new') return null;

  return (
    <div
      data-testid="scenario-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        borderBottom: `1px solid ${colors.borderDefault}`,
        background: colors.bgSurface,
        flexShrink: 0,
      }}
    >
      <div
        data-testid="scenario-breadcrumb"
        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, minWidth: 0 }}
      >
        {playlist ? (
          <>
            <span
              data-testid="breadcrumb-dot"
              style={{
                width: 8, height: 8, borderRadius: '50%',
                background: playlistColor || colors.textMuted,
                flexShrink: 0,
              }}
            />
            <span style={{ color: colors.textSecondary, whiteSpace: 'nowrap' }}>{playlist.name}</span>
            <ChevronRight size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />
          </>
        ) : (
          <span style={{ color: colors.textMuted }}>Unassigned</span>
        )}
        <span
          style={{
            color: colors.textPrimary,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {scenario.name || `Scenario ${String(scenario.id).slice(0, 6)}`}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button
          data-testid="toolbar-duplicate"
          onClick={() => onDuplicate?.(scenario.id)}
          title="Duplicate"
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSurfaceHover; e.currentTarget.style.color = colors.textPrimary; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.textSecondary; }}
        >
          <Copy size={14} />
        </button>
        <button
          data-testid="toolbar-delete"
          onClick={() => onDelete?.(scenario.id)}
          title="Delete"
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.errorTint; e.currentTarget.style.color = colors.error; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.textSecondary; }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

const iconBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: 4,
  background: 'transparent',
  color: colors.textSecondary,
  border: '1px solid transparent',
  cursor: 'pointer',
  transition: 'all 0.1s',
};
