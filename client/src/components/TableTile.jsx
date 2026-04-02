import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
 */
export default function TableTile({ focused, onFocus }) {
  const { gameState: hookState, tableId, socket, playlist } = useTable();
  const { user } = useAuth();
  const { bbView } = usePreferences();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // hookState is the full useGameState() return; gameState is the raw server state
  const gameState = hookState?.gameState ?? null;

  const isCoach = user?.role === 'coach';
  const tableMode = gameState?.table_mode ?? hookState?.tableMode ?? 'coached_cash';
  const actionTimer = hookState?.actionTimer ?? null;

  // myId comes from the room_joined server event, stored in hookState
  const myId = hookState?.myId ?? user?.id ?? null;

  // Action timer urgency: show gold pulse when < 15 s remaining
  const remainingMs = actionTimer?.remainingMs
    ?? (actionTimer?.duration && actionTimer?.startedAt
      ? Math.max(0, actionTimer.duration - (Date.now() - actionTimer.startedAt))
      : null);
  const isUrgent = remainingMs !== null && remainingMs < 15000;

  // ── Mini tile: is it my turn? ──────────────────────────────────────────────
  const isMyTurn = gameState?.current_player != null
    && myId != null
    && gameState.current_player === myId;

  const currentBet = gameState?.current_bet ?? 0;
  const myPlayer = gameState?.players?.find((p) => p.id === myId) ?? null;
  const playerBetThisRound = myPlayer?.total_bet_this_round ?? 0;
  const toCall = Math.max(0, currentBet - playerBetThisRound);
  const canCheck = toCall === 0;

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

  // Tile border style
  const borderColor = focused
    ? '#d4af37'
    : isUrgent || isMyTurn
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
        {/* Focused header bar: table name + navigate-to-full-table button */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: isCoach && tableMode === 'coached_cash' ? 280 : 0,
            height: 36,
            background: 'rgba(6,10,15,0.92)',
            borderBottom: '1px solid #21262d',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 10px',
            gap: 8,
            zIndex: 10,
          }}
        >
          <span className="text-xs font-semibold truncate" style={{ color: '#e6edf3', flex: 1 }}>
            {gameState?.table_name ?? gameState?.room ?? tableId}
          </span>
          <button
            onClick={() => navigate(`/table/${tableId}`)}
            className="text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#8b949e', border: '1px solid #30363d', flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
            title="Open full table view"
          >
            ⤢ Full Table
          </button>
        </div>

        {/* Main table — offset top to clear the focused header */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', paddingTop: 36 }}>
          <PokerTable
            gameState={gameState}
            myId={myId}
            isCoach={isCoach}
            actionTimer={actionTimer}
            emit={emit}
            bbView={bbView}
            equityData={hookState?.equityData}
            equityEnabled={hookState?.equityEnabled}
            sharedRange={hookState?.sharedRange}
            equitySettings={hookState?.equitySettings}
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

  // ── Mini (unfocused) tile ──────────────────────────────────────────────────
  return (
    <div
      style={tileStyle}
      className={isUrgent || isMyTurn ? 'pulse-gold' : ''}
      onClick={onFocus}
      onMouseEnter={(e) => {
        if (!isUrgent && !isMyTurn) e.currentTarget.style.borderColor = '#d4af37';
      }}
      onMouseLeave={(e) => {
        if (!isUrgent && !isMyTurn) e.currentTarget.style.borderColor = '#30363d';
      }}
    >
      <div style={{ padding: 8, flex: 1, minWidth: 0 }}>
        <TableStatusChip
          gameState={gameState}
          tableId={tableId}
          tableName={gameState?.table_name ?? gameState?.room ?? tableId}
        />
      </div>

      {/* Action buttons — only shown when it's this player's turn */}
      {isMyTurn && (
        <div
          style={{ padding: '0 8px 8px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 3 }}>
            <MiniActionBtn
              label="Fold"
              color="#f85149"
              onClick={() => socket.emit('place_bet', { action: 'fold', amount: 0 })}
            />
            <MiniActionBtn
              label={canCheck ? 'Check' : `Call ${toCall > 0 ? toCall.toLocaleString() : ''}`}
              color="#3fb950"
              onClick={() => socket.emit('place_bet', { action: canCheck ? 'check' : 'call', amount: 0 })}
            />
          </div>
          <p style={{ fontSize: 9, color: '#6e7681', lineHeight: 1 }}>
            Click tile for full controls
          </p>
        </div>
      )}
    </div>
  );
}

function MiniActionBtn({ label, color, onClick }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1,
        height: 22,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        background: hovered ? `${color}33` : `${color}1a`,
        color,
        border: `1px solid ${color}66`,
        cursor: 'pointer',
        transition: 'background 0.15s',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </button>
  );
}
