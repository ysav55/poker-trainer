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
 *   useReplay          — replay emit helpers (no listeners)
 *
 * leaveRoom is the only cross-hook operation: it resets state in useGameState,
 * useNotifications, and usePlaylistManager before reconnecting the socket.
 */
export function useSocket() {
  const { errors, notifications, addError, addNotification, reset: resetNotifications } = useNotifications()
  const { bbView, toggleBBView }                                                         = usePreferences()
  const { socketRef, connected, joinRoom, clearJoinParams }                              = useConnectionManager()

  const {
    playlists,
    reset: resetPlaylists,
    createPlaylist, getPlaylists, addToPlaylist, removeFromPlaylist,
    deletePlaylist, activatePlaylist, deactivatePlaylist,
  } = usePlaylistManager({ socketRef })

  const {
    loadReplay, replayStepFwd, replayStepBack, replayJumpTo,
    replayBranch, replayUnbranch, replayExit,
  } = useReplay({ socketRef })

  const {
    gameState, myId, isCoach, isSpectator, coachDisconnected,
    actionTimer, syncError, sessionStats, activeHandId, handTagsSaved, myPlayer,
    reset: resetGame,
    startGame, placeBet, manualDealCard, undoAction, rollbackStreet,
    togglePause, setMode, forceNextStreet, awardPot, resetHand,
    adjustStack, openConfigPhase, updateHandConfig, startConfiguredHand,
    loadHandScenario, updateHandTags, setPlayerInHand, setBlindLevels,
  } = useGameState({ socketRef, addError, addNotification })

  // leaveRoom orchestrates a full session reset across all hooks, then bounces the socket
  // so the server starts the 30s eviction TTL on the old connection.
  const leaveRoom = useCallback(() => {
    clearJoinParams()      // prevent auto-rejoin on next connect event
    resetGame()
    resetNotifications()
    resetPlaylists()
    socketRef.current?.disconnect()
    socketRef.current?.connect()
  }, [clearJoinParams, resetGame, resetNotifications, resetPlaylists, socketRef])

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
    // replay emit helpers
    loadReplay,
    replayStepFwd,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
    // preferences
    toggleBBView,
  }
}
