import React, { useState, useRef, useEffect } from 'react';
import { Plus, Share2 } from 'lucide-react';
import { colors } from '../../lib/colors.js';

export default function HandBuilderHeader({
  playlistCount,
  scenarioCount,
  selectedScenario,
  playlists,
  colorMap,
  onAlsoAddTo,
  onNewPlaylist,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const canCrossList = Boolean(selectedScenario) && selectedScenario !== 'new';

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function handlePick(pl) {
    setMenuOpen(false);
    onAlsoAddTo?.(pl, selectedScenario);
  }

  return (
    <div
      data-testid="handbuilder-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        borderBottom: `1px solid ${colors.borderDefault}`,
        background: colors.bgSurface,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, letterSpacing: '0.02em' }}>
          Scenarios
        </div>
        <div style={{ fontSize: 11, color: colors.textMuted }} data-testid="header-subtitle">
          {playlistCount} {playlistCount === 1 ? 'playlist' : 'playlists'} · {scenarioCount} {scenarioCount === 1 ? 'scenario' : 'scenarios'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {canCrossList && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              data-testid="also-add-to-btn"
              onClick={() => setMenuOpen((v) => !v)}
              style={secondaryBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSurfaceHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Share2 size={12} /> Also Add to…
            </button>

            {menuOpen && (
              <div
                data-testid="also-add-menu"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  minWidth: 200,
                  background: colors.bgSurfaceRaised,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: 4,
                  padding: 4,
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                {playlists.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 11, color: colors.textMuted }}>
                    No playlists yet.
                  </div>
                ) : (
                  playlists.map((pl) => (
                    <button
                      key={pl.playlist_id}
                      data-testid={`also-add-target-${pl.playlist_id}`}
                      onClick={() => handlePick(pl)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        padding: '6px 10px',
                        background: 'transparent',
                        border: 'none',
                        color: colors.textPrimary,
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                        borderRadius: 3,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgSurfaceHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: colorMap?.[pl.playlist_id] || colors.textMuted,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pl.name}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        <button
          data-testid="new-playlist-btn"
          onClick={onNewPlaylist}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
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
          <Plus size={12} strokeWidth={3} /> New Playlist
        </button>
      </div>
    </div>
  );
}

const secondaryBtnStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  borderRadius: 4,
  background: 'transparent',
  color: colors.textSecondary,
  border: `1px solid ${colors.borderStrong}`,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
  letterSpacing: '0.04em',
  transition: 'all 0.1s',
};
