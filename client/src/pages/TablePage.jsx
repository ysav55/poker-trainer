import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TableProvider, useTable } from '../contexts/TableContext.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { usePreferences } from '../hooks/usePreferences.js';
import PokerTable from '../components/PokerTable.jsx';
import CoachSidebar from '../components/CoachSidebar.jsx';
import TournamentInfoPanel from '../components/TournamentInfoPanel.jsx';
import ModeratorControls from '../components/ModeratorControls.jsx';

export default function TablePage() {
  const { tableId } = useParams();
  return (
    <TableProvider tableId={tableId}>
      <FullTableView />
    </TableProvider>
  );
}

function FullTableView() {
  const { gameState: hookState, socket, tableId, playlist } = useTable();
  const { user } = useAuth();
  const { bbView } = usePreferences();

  // Destructure hook return — hookState is the full useGameState() return value
  const {
    gameState,          // raw game state object
    isCoach: hookIsCoach,
    actionTimer,
    equityData,
    equityEnabled,
    setEquityEnabled,
    sharedRange,
    toggleEquityDisplay,
    toggleRangeDisplay,
    toggleHeatmapDisplay,
    shareRange,
    clearSharedRange,
  } = hookState ?? {};

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();

  const tableMode = gameState?.table_mode ?? gameState?.tableMode ?? hookState?.tableMode ?? 'coached_cash';

  // A user with the coach role only *acts* as coach (controls the game) in coached_cash mode.
  // In tournament and uncoached_cash they join as a regular seated player.
  const actingAsCoach = (user?.role === 'coach' || hookIsCoach) && tableMode === 'coached_cash';

  // Find this user's player entry in the game state.
  const myId = useMemo(() => {
    if (!gameState?.players) return user?.id ?? null;
    const me = gameState.players.find((p) =>
      actingAsCoach ? p.is_coach : p.stable_id === user?.id
    );
    return me?.id ?? user?.id ?? null;
  }, [gameState, actingAsCoach, user]);

  // Build emit object expected by PokerTable / CoachSidebar
  const emit = useMemo(() => ({
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
    // equity helpers
    toggleEquityDisplay,
    toggleRangeDisplay,
    toggleHeatmapDisplay,
    shareRange,
    clearSharedRange,
  }), [socket, toggleEquityDisplay, toggleRangeDisplay, toggleHeatmapDisplay, shareRange, clearSharedRange]);

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        background: '#0d1117',
        overflow: 'hidden',
      }}
    >
      {/* Main table — always rendered so all roles see their seat and cards */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <PokerTable
          gameState={gameState}
          myId={myId}
          isCoach={actingAsCoach}
          actionTimer={actionTimer}
          emit={emit}
          bbView={bbView}
          equityData={equityData}
          equityEnabled={equityEnabled}
          sharedRange={sharedRange}
          equitySettings={hookState?.equitySettings}
        />
      </div>

      {/* Coach sidebar — only in coached_cash mode where the coach runs the game */}
      {actingAsCoach && (
        <CoachSidebar
          gameState={gameState ?? {}}
          emit={emit}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          playlists={playlist?.playlists ?? []}
          myId={myId}
          setBlindLevels={emit.setBlindLevels}
          onOpenScenarioBuilder={() => navigate('/admin/hands')}
          equityEnabled={equityEnabled ?? false}
          setEquityEnabled={setEquityEnabled}
          equitySettings={hookState?.equitySettings}
        />
      )}

      {/* Tournament overlay — shows blind timer, eliminations, level info */}
      {tableMode === 'tournament' && (
        <TournamentInfoPanel socket={socket} />
      )}

      {/* Moderator controls — pause/resume for uncoached sessions */}
      {user?.role === 'moderator' && !actingAsCoach && (
        <ModeratorControls gameState={gameState} emit={emit} />
      )}
    </div>
  );
}
