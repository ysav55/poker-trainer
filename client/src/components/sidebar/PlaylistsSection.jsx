import React, { useState, useEffect, useRef } from 'react';
import CollapsibleSection from '../CollapsibleSection';

export default function PlaylistsSection({
  playlists,
  gameState,
  myId,
  emit,
}) {
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState(null);
  const [coachPlaylistMode, setCoachPlaylistMode] = useState('play'); // 'play' | 'monitor'
  const [autoStartCountdown, setAutoStartCountdown] = useState(null); // null | number
  const prevConfigPhaseRef = useRef(false);

  // Fetch playlists on mount
  useEffect(() => { emit.getPlaylists?.(); }, []);

  // Auto-start countdown: triggered when config_phase becomes true during active playlist
  useEffect(() => {
    const configPhase = gameState?.config_phase ?? false;
    const playlistActive = gameState?.playlist_mode?.active ?? false;
    if (!prevConfigPhaseRef.current && configPhase && playlistActive) {
      setAutoStartCountdown(5);
    }
    if (!configPhase) setAutoStartCountdown(null); // reset if scenario cleared
    prevConfigPhaseRef.current = configPhase;
  }, [gameState?.config_phase, gameState?.playlist_mode?.active]);

  // Countdown tick
  useEffect(() => {
    if (autoStartCountdown === null) return;
    if (autoStartCountdown <= 0) {
      // Apply monitor mode before starting
      if (coachPlaylistMode === 'monitor' && myId && emit.setPlayerInHand) {
        emit.setPlayerInHand(myId, false);
      }
      emit.startConfiguredHand?.();
      setAutoStartCountdown(null);
      return;
    }
    const t = setTimeout(() => setAutoStartCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [autoStartCountdown]);

  function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return;
    emit.createPlaylist?.(newPlaylistName.trim());
    setNewPlaylistName('');
  }

  return (
    <CollapsibleSection title="PLAYLISTS" defaultOpen={false}>
      <div className="space-y-2">
        {/* Create new playlist */}
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="New playlist name..."
            value={newPlaylistName}
            onChange={e => setNewPlaylistName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
            className="flex-1 min-w-0 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none"
            style={{
              background: '#161b22',
              border: '1px solid #30363d',
              color: '#f0ece3',
            }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
            onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
          />
          <button
            onClick={handleCreatePlaylist}
            disabled={!newPlaylistName.trim()}
            style={{
              padding: '4px 8px',
              fontSize: '10px',
              borderRadius: '4px',
              border: '1px solid rgba(212,175,55,0.4)',
              color: '#d4af37',
              background: 'none',
              cursor: newPlaylistName.trim() ? 'pointer' : 'not-allowed',
              opacity: newPlaylistName.trim() ? 1 : 0.4,
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => { if (newPlaylistName.trim()) e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            + Create
          </button>
        </div>

        {/* Playlist list */}
        {playlists.length === 0 ? (
          <p style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>No playlists yet</p>
        ) : (
          <div style={{ maxHeight: '12rem', overflowY: 'auto' }} className="space-y-1">
            {playlists.map(pl => (
              <div
                key={pl.playlist_id}
                className="flex items-center justify-between px-2 rounded"
                style={{
                  padding: '6px 8px',
                  border: activePlaylistId === pl.playlist_id
                    ? '1px solid rgba(212,175,55,0.5)'
                    : '1px solid rgba(255,255,255,0.08)',
                  background: activePlaylistId === pl.playlist_id
                    ? 'rgba(212,175,55,0.1)'
                    : 'rgba(255,255,255,0.03)',
                  borderRadius: '4px',
                  transition: 'all 0.1s',
                }}
              >
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: '11px', fontWeight: 500, color: '#e0ddd6' }} className="truncate">{pl.name}</span>
                  <span style={{ fontSize: '9px', color: '#6e7681' }}>
                    {pl.hand_count ?? 0} hands
                    {activePlaylistId === pl.playlist_id && gameState.playlist_mode?.active && (
                      <span style={{ color: '#d4af37', marginLeft: 4 }}>
                        ▶ {(gameState.playlist_mode.currentIndex ?? 0) + 1}/{gameState.playlist_mode.hands?.length ?? pl.hand_count ?? '?'}
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {activePlaylistId === pl.playlist_id ? (
                    <button
                      onClick={() => { emit.deactivatePlaylist?.(); setActivePlaylistId(null); }}
                      style={{
                        padding: '2px 6px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        border: '1px solid rgba(202,138,4,0.5)',
                        color: '#facc15',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(234,179,8,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => { emit.activatePlaylist?.(pl.playlist_id); setActivePlaylistId(pl.playlist_id); }}
                      style={{
                        padding: '2px 6px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        border: '1px solid rgba(22,163,74,0.5)',
                        color: '#4ade80',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      Play
                    </button>
                  )}
                  <button
                    onClick={() => { emit.deletePlaylist?.(pl.playlist_id); if (activePlaylistId === pl.playlist_id) setActivePlaylistId(null); }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '9px',
                      borderRadius: '3px',
                      border: '1px solid rgba(153,27,27,0.4)',
                      color: 'rgba(239,68,68,0.7)',
                      background: 'none',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.5)'; e.currentTarget.style.color = '#f87171'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(153,27,27,0.4)'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coach participation mode (only shown when a playlist is active) */}
        {gameState?.playlist_mode?.active && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, color: '#6e7681', letterSpacing: '0.08em', marginBottom: 4 }}>
              COACH ROLE
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['play', 'monitor'].map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setCoachPlaylistMode(m);
                    // Apply immediately to current hand if active
                    if (myId && emit.setPlayerInHand) {
                      emit.setPlayerInHand(myId, m === 'play');
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: coachPlaylistMode === m
                      ? '1px solid rgba(212,175,55,0.5)'
                      : '1px solid rgba(255,255,255,0.08)',
                    background: coachPlaylistMode === m
                      ? 'rgba(212,175,55,0.12)'
                      : 'transparent',
                    color: coachPlaylistMode === m ? '#d4af37' : '#6e7681',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 'play' ? '▶ Play' : '👁 Monitor'}
                </button>
              ))}
            </div>

            {/* Auto-start countdown */}
            {autoStartCountdown !== null && (
              <div style={{
                marginTop: 8,
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(212,175,55,0.08)',
                border: '1px solid rgba(212,175,55,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 11, color: '#d4af37' }}>
                  Starting in {autoStartCountdown}s…
                </span>
                <button
                  onClick={() => setAutoStartCountdown(null)}
                  style={{
                    fontSize: 9,
                    color: '#6e7681',
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 3,
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Resume button after cancel */}
            {autoStartCountdown === null && gameState?.config_phase && gameState?.playlist_mode?.active && (
              <button
                onClick={() => setAutoStartCountdown(5)}
                style={{
                  marginTop: 6,
                  width: '100%',
                  padding: '5px 0',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  borderRadius: 4,
                  cursor: 'pointer',
                  border: '1px solid rgba(212,175,55,0.3)',
                  background: 'transparent',
                  color: '#d4af37',
                }}
              >
                ▶ Resume Playlist
              </button>
            )}
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
