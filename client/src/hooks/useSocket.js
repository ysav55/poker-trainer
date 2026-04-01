import { useCallback } from 'react'
import { useNotifications }   from './useNotifications'
import { usePreferences }     from './usePreferences'
import { useConnectionManager } from './useConnectionManager'
import { useGameState }       from './useGameState'
import { usePlaylistManager } from './usePlaylistManager'
import { useReplay }          from './useReplay'
/**
 * useSocket — thin composition layer.
 *
 * Delegates all concerns to focused hooks:
 *   useNotifications   — errors / notifications + TTL timers
 *   usePreferences     — bbView (localStorage, no socket dependency)
 *   useConnectionManager — socket lifecycle, connect/disconnect, joinRoom
 *   useGameState       — game + session event listeners + all game emit helpers
 *   usePlaylistManager — playlist_state listener + playlist emit helpers
 *
 * leaveRoom is the only cross-hook operation: it resets state in useGameState,
 * useNotifications, and usePlaylistManager before reconnecting the socket.
 */
export function useSocket() {
  const { errors, notifications, addError, addNotification, reset: resetNotifications } = useNotifications()
  const { bbView, toggleBBView }                                                         = usePreferences()
  const socket                                                                           = useConnectionManager()
  const { socketRef, connected, joinRoom, clearJoinParams }                              = socket

  const {
    playlists,
    reset: resetPlaylists,
    createPlaylist, getPlaylists, addToPlaylist, removeFromPlaylist,
    deletePlaylist, activatePlaylist, deactivatePlaylist,
  } = usePlaylistManager(socket)

  const {
    gameState, myId, isCoach, isSpectator, coachDisconnected,
    actionTimer, syncError, sessionStats, activeHandId, handTagsSaved, tableMode, myPlayer,
    reset: resetGame,
    startGame, placeBet, manualDealCard, undoAction, rollbackStreet,
    togglePause, setMode, forceNextStreet, awardPot, resetHand,
    adjustStack, openConfigPhase, updateHandConfig, startConfiguredHand,
    loadHandScenario, updateHandTags, setPlayerInHand, setBlindLevels,
  } = useGameState({ ...socket, addError, addNotification })

  const {
    replayMeta,
    reset: resetReplay,
    loadReplay,
    replayStepForward,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
  } = useReplay(socket)

  // leaveRoom orchestrates a full session reset across all hooks, then bounces the socket
  // so the server starts the 30s eviction TTL on the old connection.
  const leaveRoom = useCallback(() => {
    clearJoinParams()      // prevent auto-rejoin on next connect event
    resetGame()
    resetNotifications()
    resetPlaylists()
    resetReplay()
    localStorage.removeItem('poker_trainer_jwt')
    localStorage.removeItem('poker_trainer_player_id')
    socketRef.current?.disconnect()
    socketRef.current?.connect()
  }, [clearJoinParams, resetGame, resetNotifications, resetPlaylists, resetReplay, socketRef])

  return {
    // connection
    connected,
    // game session
    gameState,
    myId,
    isCoach,
    isSpectator,
    coachDisconnected,
    actionTimer,
    syncError,
    sessionStats,
    activeHandId,
    handTagsSaved,
    tableMode,
    // derived
    myPlayer,
    // notifications
    errors,
    notifications,
    // playlists
    playlists,
    // preferences
    bbView,
    // connection actions
    joinRoom,
    leaveRoom,
    // game emit helpers
    startGame,
    placeBet,
    manualDealCard,
    undoAction,
    rollbackStreet,
    togglePause,
    setMode,
    forceNextStreet,
    awardPot,
    resetHand,
    adjustStack,
    openConfigPhase,
    updateHandConfig,
    startConfiguredHand,
    loadHandScenario,
    updateHandTags,
    setPlayerInHand,
    setBlindLevels,
    // playlist emit helpers
    createPlaylist,
    getPlaylists,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    activatePlaylist,
    deactivatePlaylist,
    // replay
    replayMeta,
    loadReplay,
    replayStepForward,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
    // preferences
    toggleBBView,
  }
}
