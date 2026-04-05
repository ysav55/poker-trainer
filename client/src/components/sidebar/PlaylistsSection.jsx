import React, { useState, useEffect, useRef } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { apiFetch } from '../../lib/api';

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

  // Drill Mode state
  const [drillStatus, setDrillStatus] = useState(null);   // null | drill session object
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState(null);

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

  // Poll drill status every 3s while there is an active table
  useEffect(() => {
    const tableId = gameState?.table_id;
    if (!tableId) return;
    const interval = setInterval(async () => {
      try {
        const data = await apiFetch(`/api/tables/${tableId}/drill`);
        setDrillStatus(data?.active ? data : null);
      } catch { /* ignore network errors */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [gameState?.table_id]);

  async function handleStartDrill(playlistId) {
    const tableId = gameState?.table_id;
    if (!tableId) return;
    setDrillLoading(true);
    setDrillError(null);
    try {
      const data = await apiFetch(`/api/tables/${tableId}/drill`, {
        method: 'POST',
        body: JSON.stringify({ playlist_id: playlistId }),
      });
      setDrillStatus(data?.active ? data : null);
    } catch (err) {
      setDrillError(err?.message ?? 'Failed to start drill');
    } finally {
      setDrillLoading(false);
    }
  }

  async function handleDrillAction(action) {
    const tableId = gameState?.table_id;
    if (!tableId) return;
    setDrillLoading(true);
    setDrillError(null);
    try {
      let data;
      if (action === 'stop') {
        await apiFetch(`/api/tables/${tableId}/drill`, { method: 'DELETE' });
        setDrillStatus(null);
      } else {
        data = await apiFetch(`/api/tables/${tableId}/drill/${action}`, { method: 'PATCH' });
        if (data?.status === 'completed' || data?.status === 'cancelled') {
          setDrillStatus(null);
        } else {
          setDrillStatus(data?.active ? data : null);
        }
      }
    } catch (err) {
      setDrillError(err?.message ?? `Failed to ${action} drill`);
    } finally {
      setDrillLoading(false);
    }
  }

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
        {/* ── Drill Mode ─────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #21262d', marginTop: 12, paddingTop: 10 }}>
          <div style={{ fontSize: 9, color: '#6e7681', letterSpacing: '0.08em', marginBottom: 6 }}>
            DRILL MODE
          </div>

          {/* Error banner */}
          {drillError && (
            <div style={{
              fontSize: 9,
              color: '#f87171',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 3,
              padding: '3px 6px',
              marginBottom: 6,
            }}>
              {drillError}
            </div>
          )}

          {/* Active drill status panel */}
          {drillStatus ? (
            <div style={{
              padding: '8px 10px',
              borderRadius: 4,
              border: '1px solid rgba(212,175,55,0.3)',
              background: 'rgba(212,175,55,0.06)',
            }}>
              {/* Header row: scenario name + position */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: '#f0ece3', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {drillStatus.current_scenario?.name ?? 'Scenario'}
                </span>
                <span style={{ fontSize: 9, color: '#6e7681', marginLeft: 6, whiteSpace: 'nowrap' }}>
                  {typeof drillStatus.current_position === 'number' ? drillStatus.current_position + 1 : '?'}
                  {drillStatus.playlist_hand_count ? ` / ${drillStatus.playlist_hand_count}` : ''}
                </span>
              </div>

              {/* Status badge */}
              <div style={{ marginBottom: 8 }}>
                <span style={{
                  fontSize: 9,
                  padding: '1px 5px',
                  borderRadius: 2,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  background: drillStatus.status === 'paused' ? 'rgba(234,179,8,0.15)' : 'rgba(74,222,128,0.12)',
                  color: drillStatus.status === 'paused' ? '#facc15' : '#4ade80',
                  border: drillStatus.status === 'paused' ? '1px solid rgba(234,179,8,0.3)' : '1px solid rgba(74,222,128,0.3)',
                }}>
                  {drillStatus.status === 'paused' ? '⏸ PAUSED' : '▶ ACTIVE'}
                </span>
                {drillStatus.next_scenario && (
                  <span style={{ fontSize: 9, color: '#6e7681', marginLeft: 6 }}>
                    Next: {drillStatus.next_scenario.name}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  disabled={drillLoading}
                  onClick={() => handleDrillAction('advance')}
                  style={{
                    flex: 1,
                    padding: '2px 6px',
                    fontSize: 9,
                    borderRadius: 3,
                    border: '1px solid rgba(74,222,128,0.4)',
                    color: '#4ade80',
                    background: 'none',
                    cursor: drillLoading ? 'not-allowed' : 'pointer',
                    opacity: drillLoading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!drillLoading) e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  ▶▶ Deal Next
                </button>
                <button
                  disabled={drillLoading}
                  onClick={() => handleDrillAction(drillStatus.status === 'paused' ? 'resume' : 'pause')}
                  style={{
                    flex: 1,
                    padding: '2px 6px',
                    fontSize: 9,
                    borderRadius: 3,
                    border: '1px solid rgba(234,179,8,0.4)',
                    color: '#facc15',
                    background: 'none',
                    cursor: drillLoading ? 'not-allowed' : 'pointer',
                    opacity: drillLoading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!drillLoading) e.currentTarget.style.background = 'rgba(234,179,8,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  {drillStatus.status === 'paused' ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button
                  disabled={drillLoading}
                  onClick={() => handleDrillAction('stop')}
                  style={{
                    padding: '2px 6px',
                    fontSize: 9,
                    borderRadius: 3,
                    border: '1px solid rgba(153,27,27,0.4)',
                    color: 'rgba(239,68,68,0.7)',
                    background: 'none',
                    cursor: drillLoading ? 'not-allowed' : 'pointer',
                    opacity: drillLoading ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!drillLoading) { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.5)'; e.currentTarget.style.color = '#f87171'; } }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(153,27,27,0.4)'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; }}
                >
                  ✕ Stop
                </button>
              </div>
            </div>
          ) : (
            /* Per-playlist "Start Drill" buttons */
            playlists.length === 0 ? (
              <p style={{ fontSize: 10, color: '#444', fontStyle: 'italic' }}>No playlists to drill</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {playlists.map(pl => {
                  const hasTable = !!gameState?.table_id;
                  return (
                    <div
                      key={pl.playlist_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                        <span style={{ fontSize: 11, color: '#e0ddd6', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pl.name}
                        </span>
                        <span style={{ fontSize: 9, color: '#6e7681' }}>{pl.hand_count ?? 0} hands</span>
                      </div>
                      <button
                        disabled={!hasTable || drillLoading}
                        title={!hasTable ? 'No active table' : undefined}
                        onClick={() => hasTable && handleStartDrill(pl.playlist_id)}
                        style={{
                          marginLeft: 8,
                          padding: '2px 6px',
                          fontSize: 9,
                          borderRadius: 3,
                          border: hasTable ? '1px solid rgba(212,175,55,0.4)' : '1px solid rgba(255,255,255,0.1)',
                          color: hasTable ? '#d4af37' : '#6e7681',
                          background: 'none',
                          cursor: hasTable && !drillLoading ? 'pointer' : 'not-allowed',
                          opacity: hasTable && !drillLoading ? 1 : 0.45,
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { if (hasTable && !drillLoading) e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        ▶ Start Drill
                      </button>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
