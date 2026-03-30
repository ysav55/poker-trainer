import React, { useState } from 'react';
import { useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePreferences } from '../hooks/usePreferences.js';
import TableStatusChip from './TableStatusChip.jsx';
import PokerTable from './PokerTable.jsx';
import CoachSidebar from './CoachSidebar.jsx';

/**
 * TableTile — renders a single table inside the multi-table grid.
 *
 * Props:
 *   focused  — bool: when true, renders full PokerTable + optional CoachSidebar
 *   onFocus  — fn: called when the unfocused tile is clicked
 *   socketRef — the socketRef from TableProvider (passed in for BroadcastBar collection)
 */
export default function TableTile({ focused, onFocus }) {
  const { gameState, tableId, socket, playlist } = useTable();
  const { user } = useAuth();
  const { bbView } = usePreferences();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isCoach = user?.role === 'coach';
  const tableMode = gameState?.table_mode ?? gameState?.tableMode ?? 'coached_cash';

  // Action timer urgency: show gold pulse when < 15 s remaining
  const actionTimer = gameState?.actionTimer ?? null;
  const remainingMs = actionTimer?.remainingMs
    ?? (actionTimer?.duration && actionTimer?.startedAt
      ? Math.max(0, actionTimer.duration - (Date.now() - actionTimer.startedAt))
      : null);
  const isUrgent = remainingMs !== null && remainingMs < 15000;

  // Build an emit-object (named helpers) expected by PokerTable / CoachSidebar
  const emit = React.useMemo(() => ({
    startGame:           (mode) => socket.emit('start_game', { mode }),
    placeBet:            (action, amount) => socket.emit('place_bet', { action, amount }),
    manualDealCard:      (targetType, targetId, position, card) =>
                           socket.emit('manual_deal_card', { targetType, targetId, position, card }),
    undoAction:          () => socket.emit('undo_action'),
    rollbackStreet:      () => socket.emit('rollback_street'),
    togglePause:         () => socket.emit('toggle_pause'),
    setMode:             (mode) => socket.emit('set_mode', { mode }),
    forceNextStreet:     () => socket.emit('force_next_street'),
    awardPot:            (winnerId) => socket.emit('award_pot', { winnerId }),
    resetHand:           () => socket.emit('reset_hand'),
    adjustStack:         (playerId, amount) => socket.emit('adjust_stack', { playerId, amount }),
    openConfigPhase:     () => socket.emit('open_config_phase'),
    updateHandConfig:    (config) => socket.emit('update_hand_config', { config }),
    startConfiguredHand: () => socket.emit('start_configured_hand'),
    loadHandScenario:    (handId, stackMode = 'keep') =>
                           socket.emit('load_hand_scenario', { handId, stackMode }),
    updateHandTags:      (handId, tags) => socket.emit('update_hand_tags', { handId, tags }),
    setPlayerInHand:     (playerId, inHand) => socket.emit('set_player_in_hand', { playerId, inHand }),
    setBlindLevels:      (sb, bb) => socket.emit('set_blind_levels', { sb, bb }),
    // playlist helpers
    createPlaylist:      (name, description = '') =>
                           socket.emit('create_playlist', { name, description }),
    addToPlaylist:       (playlistId, handId) =>
                           socket.emit('add_to_playlist', { playlistId, handId }),
    removeFromPlaylist:  (playlistId, handId) =>
                           socket.emit('remove_from_playlist', { playlistId, handId }),
    deletePlaylist:      (playlistId) => socket.emit('delete_playlist', { playlistId }),
    activatePlaylist:    (playlistId) => socket.emit('activate_playlist', { playlistId }),
    deactivatePlaylist:  () => socket.emit('deactivate_playlist'),
    getPlaylists:        () => socket.emit('get_playlists'),
  }), [socket]);

  // myId is stored in gameState after room_joined; fall back to user.id
  const myId = gameState?.myId ?? user?.id ?? null;

  // Tile border style
  const borderColor = focused
    ? '#d4af37'
    : isUrgent
    ? '#d4af37'
    : '#30363d';

  const tileStyle = {
    border: `1px solid ${borderColor}`,
    borderRadius: 8,
    overflow: 'hidden',
    background: '#0d1117',
    cursor: focused ? 'default' : 'pointer',
    transition: 'all 0.25s ease',
    display: 'flex',
    flexDirection: focused ? 'row' : 'column',
    height: '100%',
    width: '100%',
    position: 'relative',
  };

  if (focused) {
    return (
      <div style={tileStyle}>
        {/* Main table */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <PokerTable
            gameState={gameState}
            myId={myId}
            isCoach={isCoach}
            actionTimer={actionTimer}
            emit={emit}
            bbView={bbView}
          />
        </div>

        {/* Coach sidebar — only for coaches in coached_cash mode */}
        {isCoach && tableMode === 'coached_cash' && (
          <CoachSidebar
            gameState={gameState ?? {}}
            emit={emit}
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            playlists={playlist?.playlists ?? []}
            myId={myId}
            setBlindLevels={emit.setBlindLevels}
          />
        )}
      </div>
    );
  }

  return (
    <div
      style={tileStyle}
      className={isUrgent ? 'pulse-gold' : ''}
      onClick={onFocus}
      onMouseEnter={(e) => {
        if (!isUrgent) e.currentTarget.style.borderColor = '#d4af37';
      }}
      onMouseLeave={(e) => {
        if (!isUrgent) e.currentTarget.style.borderColor = '#30363d';
      }}
    >
      <div style={{ padding: 8, flex: 1, minWidth: 0 }}>
        <TableStatusChip
          gameState={gameState}
          tableId={tableId}
          tableName={gameState?.tableName ?? tableId}
        />
      </div>
    </div>
  );
}
