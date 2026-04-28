import React from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { colors } from '../../lib/colors.js';
import ScenarioItem from './ScenarioItem.jsx';

export default function PlaylistNode({
  playlist,
  color,
  scenarios,
  expanded,
  onToggle,
  selectedScenarioId,
  selectedPlaylistId,
  onSelectPlaylist,
  onSelectScenario,
}) {
  const selected = selectedPlaylistId === playlist.playlist_id;
  const count = scenarios.length;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div data-testid={`playlist-node-${playlist.playlist_id}`}>
      <button
        onClick={() => {
          onSelectPlaylist(playlist);
          onToggle(playlist.playlist_id);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 8px',
          marginBottom: 2,
          borderRadius: 4,
          borderLeft: `3px solid ${color}`,
          background: selected ? colors.goldTint : 'transparent',
          color: colors.textPrimary,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          border: 'none',
          borderLeftWidth: 3,
          borderLeftStyle: 'solid',
          borderLeftColor: color,
          transition: 'background 0.1s',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          if (!selected) e.currentTarget.style.background = colors.bgSurfaceHover;
        }}
        onMouseLeave={(e) => {
          if (!selected) e.currentTarget.style.background = 'transparent';
        }}
      >
        <Chevron size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {playlist.name}
        </span>
        <span style={{ fontSize: 10, color: colors.textMuted, flexShrink: 0 }}>{count}</span>
      </button>
      {expanded && scenarios.map(sc => (
        <ScenarioItem
          key={sc.id}
          scenario={sc}
          playlistColor={color}
          selected={selectedScenarioId === sc.id}
          onClick={() => onSelectScenario(sc)}
        />
      ))}
    </div>
  );
}
