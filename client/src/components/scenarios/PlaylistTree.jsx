import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { colors } from '../../lib/colors.js';
import { generatePlaylistColor } from './PLAYLIST_COLORS.js';
import PlaylistNode from './PlaylistNode.jsx';
import ScenarioItem from './ScenarioItem.jsx';

const UNASSIGNED_KEY = '__unassigned__';

export default function PlaylistTree({
  playlists,
  scenarios,
  search,
  onSearchChange,
  selectedPlaylistId,
  selectedScenarioId,
  onSelectPlaylist,
  onSelectScenario,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  const toggle = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Color map: each playlist gets its position-based color.
  const colorMap = useMemo(() => {
    const map = new Map();
    playlists.forEach((pl, i) => map.set(pl.playlist_id, generatePlaylistColor(i)));
    return map;
  }, [playlists]);

  // Group scenarios by primary_playlist_id.
  const grouped = useMemo(() => {
    const byPlaylist = new Map();
    const unassigned = [];
    for (const sc of scenarios) {
      if (sc.primary_playlist_id) {
        if (!byPlaylist.has(sc.primary_playlist_id)) byPlaylist.set(sc.primary_playlist_id, []);
        byPlaylist.get(sc.primary_playlist_id).push(sc);
      } else {
        unassigned.push(sc);
      }
    }
    return { byPlaylist, unassigned };
  }, [scenarios]);

  const normalized = search.trim().toLowerCase();
  const matchesSearch = (name) => !normalized || (name ?? '').toLowerCase().includes(normalized);

  // A playlist is visible if its name matches OR any of its scenarios match.
  const visiblePlaylists = playlists.filter(pl => {
    if (matchesSearch(pl.name)) return true;
    const children = grouped.byPlaylist.get(pl.playlist_id) ?? [];
    return children.some(sc => matchesSearch(sc.name));
  });

  const visibleUnassigned = grouped.unassigned.filter(sc => matchesSearch(sc.name));

  // When searching, auto-expand any playlist with a matching child.
  const isExpanded = (plId) => {
    if (expanded.has(plId)) return true;
    if (!normalized) return false;
    const children = grouped.byPlaylist.get(plId) ?? [];
    return children.some(sc => matchesSearch(sc.name));
  };

  return (
    <div className="flex flex-col h-full" style={{ overflow: 'hidden' }}>
      {/* Search */}
      <div style={{ padding: '10px 12px', flexShrink: 0, position: 'relative' }}>
        <Search
          size={12}
          style={{ position: 'absolute', left: 22, top: 16, color: colors.textMuted }}
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search playlists & scenarios…"
          data-testid="playlist-tree-search"
          style={{
            width: '100%',
            padding: '6px 10px 6px 28px',
            borderRadius: 4,
            border: `1px solid ${colors.borderStrong}`,
            background: colors.bgPrimary,
            color: colors.textPrimary,
            fontSize: 11,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }} data-testid="playlist-tree">
        {visiblePlaylists.length === 0 && visibleUnassigned.length === 0 && (
          <div style={{ color: colors.textMuted, fontSize: 11, padding: 20, textAlign: 'center' }}>
            {normalized ? 'No matches.' : 'No playlists yet.'}
          </div>
        )}

        {visiblePlaylists.map(pl => {
          const children = grouped.byPlaylist.get(pl.playlist_id) ?? [];
          const filteredChildren = normalized
            ? children.filter(sc => matchesSearch(sc.name) || matchesSearch(pl.name))
            : children;
          return (
            <PlaylistNode
              key={pl.playlist_id}
              playlist={pl}
              color={colorMap.get(pl.playlist_id)}
              scenarios={filteredChildren}
              expanded={isExpanded(pl.playlist_id)}
              onToggle={toggle}
              selectedPlaylistId={selectedPlaylistId}
              selectedScenarioId={selectedScenarioId}
              onSelectPlaylist={onSelectPlaylist}
              onSelectScenario={onSelectScenario}
            />
          );
        })}

        {/* Unassigned */}
        {visibleUnassigned.length > 0 && (
          <div style={{ marginTop: 12 }} data-testid="unassigned-section">
            <div
              style={{
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: colors.textMuted,
                padding: '6px 8px 4px',
              }}
            >
              Unassigned
            </div>
            {visibleUnassigned.map(sc => (
              <ScenarioItem
                key={sc.id}
                scenario={sc}
                playlistColor={null}
                selected={selectedScenarioId === sc.id}
                onClick={() => onSelectScenario(sc)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

PlaylistTree.UNASSIGNED_KEY = UNASSIGNED_KEY;
