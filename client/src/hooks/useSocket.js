import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'

// In production (unified server), connect to the same host the page was served from.
// In development, connect to the Vite dev server's proxy target (localhost:3001).
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : ''
const MAX_ERRORS = 5
const MAX_NOTIFICATIONS = 8
const ERROR_TTL = 5000
const NOTIFICATION_TTL = 4000

export function useSocket() {
  const socketRef = useRef(null)
  const errorTimersRef = useRef({})
  const notifTimersRef = useRef({})
  // Stores last join params so the socket can auto-rejoin after a disconnect/reconnect
  const joinParamsRef = useRef(null)

  const [connected, setConnected] = useState(false)
  const [gameState, setGameState] = useState(null)
  const [myId, setMyId] = useState(null)
  const [isCoach, setIsCoach] = useState(false)
  const [errors, setErrors] = useState([])
  const [notifications, setNotifications] = useState([])
  const [sessionStats, setSessionStats] = useState(null)
  const [isSpectator, setIsSpectator] = useState(false)
  const [coachDisconnected, setCoachDisconnected] = useState(false)
  const [actionTimer, setActionTimer] = useState(null)  // { playerId, duration, startedAt } | null
  const [syncError, setSyncError] = useState(null)      // { message } | null — cleared on next game_state
  const [playlists, setPlaylists] = useState([])
  const [activeHandId, setActiveHandId]   = useState(null)  // handId of currently running hand (for tag saving)
  const [handTagsSaved, setHandTagsSaved] = useState(null)  // { handId, coach_tags } | null
  const [bbView, setBBView] = useState(() => localStorage.getItem('poker_trainer_bb_view') === '1')

  // ---------- helpers ----------

  const addError = useCallback((message) => {
    const id = `err-${Date.now()}-${Math.random()}`
    const entry = { id, message, timestamp: Date.now() }

    setErrors((prev) => {
      const next = [entry, ...prev]
      return next.slice(0, MAX_ERRORS)
    })

    const timer = setTimeout(() => {
      setErrors((prev) => prev.filter((e) => e.id !== id))
      delete errorTimersRef.current[id]
    }, ERROR_TTL)

    errorTimersRef.current[id] = timer
  }, [])

  const addNotification = useCallback((message) => {
    const id = `notif-${Date.now()}-${Math.random()}`
    const entry = { id, message, timestamp: Date.now() }

    setNotifications((prev) => {
      const next = [entry, ...prev]
      return next.slice(0, MAX_NOTIFICATIONS)
    })

    const timer = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      delete notifTimersRef.current[id]
    }, NOTIFICATION_TTL)

    notifTimersRef.current[id] = timer
  }, [])

  // ---------- socket lifecycle ----------

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      // Auto-rejoin if we were already seated (socket reconnected after a drop)
      if (joinParamsRef.current) {
        const { name, role, stableId } = joinParamsRef.current
        const isCoach = role === 'coach'
        const isSpectator = role === 'spectator'
        const freshToken = localStorage.getItem('poker_trainer_jwt') || ''
        socket.emit('join_room', { name, isCoach, isSpectator, stableId, token: freshToken })
      }
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('room_joined', ({ playerId, isCoach: coach, isSpectator: spectator }) => {
      setMyId(playerId)
      setIsCoach(Boolean(coach))
      setIsSpectator(Boolean(spectator))
    })

    socket.on('game_state', (state) => {
      setGameState(state)
      setSyncError(null)
      if (state.phase === 'waiting') setActiveHandId(null) // hand ended — clear tag target
      // ISS-62: clear coach-disconnected overlay only when confirmed coach is back in game_state
      const coachPresent = state.players?.some(p => p.is_coach)
      if (coachPresent) setCoachDisconnected(false)
    })

    socket.on('error', (payload) => {
      const message =
        typeof payload === 'string'
          ? payload
          : payload?.message ?? 'Unknown error'
      addError(message)
    })

    socket.on('notification', (payload) => {
      const message =
        typeof payload === 'string'
          ? payload
          : payload?.message ?? ''
      if (message) addNotification(message)
    })

    socket.on('session_stats', (stats) => {
      setSessionStats(stats)
    })

    socket.on('action_timer', (payload) => {
      setActionTimer(payload) // null = cancelled, obj = active timer
    })

    socket.on('coach_disconnected', (payload) => {
      setCoachDisconnected(true)
      const message = typeof payload === 'string' ? payload : payload?.message ?? 'Coach disconnected'
      addNotification(message)
    })

    socket.on('sync_error', (payload) => {
      const message = typeof payload === 'string' ? payload : payload?.message ?? 'Action rejected'
      setSyncError({ message })
      addError(message)
    })

    socket.on('playlist_state', (payload) => {
      setPlaylists(payload?.playlists ?? [])
    })

    socket.on('hand_started', ({ handId }) => {
      setActiveHandId(handId)
    })

    socket.on('hand_tags_saved', (payload) => {
      setHandTagsSaved(payload)
      setTimeout(() => setHandTagsSaved(null), 2000)
    })

    socket.on('replay_loaded', ({ handId, actionCount }) => {
      addNotification(`Replay loaded — hand #${handId} (${actionCount} actions)`)
    })

    return () => {
      // Clear all auto-remove timers
      Object.values(errorTimersRef.current).forEach(clearTimeout)
      Object.values(notifTimersRef.current).forEach(clearTimeout)
      errorTimersRef.current = {}
      notifTimersRef.current = {}

      socket.disconnect()
      socketRef.current = null
    }
  }, [addError, addNotification])

  // ---------- emit helpers ----------

  const joinRoom = useCallback((name, role = 'player', token = '') => {
    const stableId = role === 'spectator' ? `spectator_${Date.now()}` : null
    const isCoach = role === 'coach'
    const isSpectator = role === 'spectator'
    joinParamsRef.current = { name, role, stableId, token }
    socketRef.current?.emit('join_room', { name, isCoach, isSpectator, stableId, token })
  }, [])

  const leaveRoom = useCallback(() => {
    joinParamsRef.current = null  // prevent auto-rejoin
    setMyId(null)
    setGameState(null)
    setIsCoach(false)
    setIsSpectator(false)
    setSessionStats(null)
    setErrors([])
    setNotifications([])
    // Reconnect with a fresh socket so the server starts the 30s eviction TTL
    socketRef.current?.disconnect()
    socketRef.current?.connect()
  }, [])

  const startGame = useCallback((mode) => {
    socketRef.current?.emit('start_game', { mode })
  }, [])

  const placeBet = useCallback((action, amount) => {
    socketRef.current?.emit('place_bet', { action, amount })
  }, [])

  const manualDealCard = useCallback((targetType, targetId, position, card) => {
    socketRef.current?.emit('manual_deal_card', { targetType, targetId, position, card })
  }, [])

  const undoAction = useCallback(() => {
    socketRef.current?.emit('undo_action')
  }, [])

  const rollbackStreet = useCallback(() => {
    socketRef.current?.emit('rollback_street')
  }, [])

  const togglePause = useCallback(() => {
    socketRef.current?.emit('toggle_pause')
  }, [])

  const setMode = useCallback((mode) => {
    socketRef.current?.emit('set_mode', { mode })
  }, [])

  const forceNextStreet = useCallback(() => {
    socketRef.current?.emit('force_next_street')
  }, [])

  const awardPot = useCallback((winnerId) => {
    socketRef.current?.emit('award_pot', { winnerId })
  }, [])

  const resetHand = useCallback(() => {
    socketRef.current?.emit('reset_hand')
  }, [])

  const adjustStack = useCallback((playerId, amount) => {
    socketRef.current?.emit('adjust_stack', { playerId, amount })
  }, [])

  const openConfigPhase = useCallback(() => {
    socketRef.current?.emit('open_config_phase')
  }, [])

  const updateHandConfig = useCallback((config) => {
    socketRef.current?.emit('update_hand_config', { config })
  }, [])

  const startConfiguredHand = useCallback(() => {
    socketRef.current?.emit('start_configured_hand')
  }, [])

  const loadHandScenario = useCallback((handId, stackMode = 'keep') => {
    socketRef.current?.emit('load_hand_scenario', { handId, stackMode })
  }, [])

  const createPlaylist = useCallback((name, description = '') => {
    socketRef.current?.emit('create_playlist', { name, description })
  }, [])

  const getPlaylists = useCallback(() => {
    socketRef.current?.emit('get_playlists')
  }, [])

  const addToPlaylist = useCallback((playlistId, handId) => {
    socketRef.current?.emit('add_to_playlist', { playlistId, handId })
  }, [])

  const removeFromPlaylist = useCallback((playlistId, handId) => {
    socketRef.current?.emit('remove_from_playlist', { playlistId, handId })
  }, [])

  const deletePlaylist = useCallback((playlistId) => {
    socketRef.current?.emit('delete_playlist', { playlistId })
  }, [])

  const activatePlaylist = useCallback((playlistId) => {
    socketRef.current?.emit('activate_playlist', { playlistId })
  }, [])

  const deactivatePlaylist = useCallback(() => {
    socketRef.current?.emit('deactivate_playlist')
  }, [])

  const updateHandTags = useCallback((handId, tags) => {
    socketRef.current?.emit('update_hand_tags', { handId, tags })
  }, [])

  const setPlayerInHand = useCallback((playerId, inHand) => {
    socketRef.current?.emit('set_player_in_hand', { playerId, inHand })
  }, [])

  const loadReplay = useCallback((handId) => {
    socketRef.current?.emit('load_replay', { handId })
  }, [])

  const replayStepFwd = useCallback(() => {
    socketRef.current?.emit('replay_step_forward')
  }, [])

  const replayStepBack = useCallback(() => {
    socketRef.current?.emit('replay_step_back')
  }, [])

  const replayJumpTo = useCallback((cursor) => {
    socketRef.current?.emit('replay_jump_to', { cursor })
  }, [])

  const replayBranch = useCallback(() => {
    socketRef.current?.emit('replay_branch')
  }, [])

  const replayUnbranch = useCallback(() => {
    socketRef.current?.emit('replay_unbranch')
  }, [])

  const replayExit = useCallback(() => {
    socketRef.current?.emit('replay_exit')
  }, [])

  const toggleBBView = useCallback(() => {
    setBBView(prev => {
      const next = !prev
      localStorage.setItem('poker_trainer_bb_view', next ? '1' : '0')
      return next
    })
  }, [])

  const setBlindLevels = useCallback((sb, bb) => {
    socketRef.current?.emit('set_blind_levels', { sb, bb })
  }, [])

  // ---------- derived values ----------

  const myPlayer = gameState?.players?.find((p) => p.id === myId) ?? null

  return {
    // state
    connected,
    gameState,
    myId,
    isCoach,
    isSpectator,
    coachDisconnected,
    actionTimer,
    syncError,
    errors,
    notifications,
    sessionStats,
    playlists,
    activeHandId,
    handTagsSaved,
    bbView,
    // derived
    myPlayer,
    // actions
    joinRoom,
    leaveRoom,
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
    createPlaylist,
    getPlaylists,
    addToPlaylist,
    removeFromPlaylist,
    deletePlaylist,
    activatePlaylist,
    deactivatePlaylist,
    updateHandTags,
    setPlayerInHand,
    loadReplay,
    replayStepFwd,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
    toggleBBView,
    setBlindLevels,
  }
}
