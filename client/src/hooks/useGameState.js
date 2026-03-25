import { useState, useEffect, useCallback } from 'react'

export function useGameState({ socketRef, addError, addNotification }) {
  const [gameState, setGameState] = useState(null)
  const [myId, setMyId] = useState(null)
  const [isCoach, setIsCoach] = useState(false)
  const [isSpectator, setIsSpectator] = useState(false)
  const [coachDisconnected, setCoachDisconnected] = useState(false)
  const [actionTimer, setActionTimer] = useState(null)  // { playerId, duration, startedAt } | null
  const [syncError, setSyncError] = useState(null)      // { message } | null — cleared on next game_state
  const [sessionStats, setSessionStats] = useState(null)
  const [activeHandId, setActiveHandId] = useState(null)
  const [handTagsSaved, setHandTagsSaved] = useState(null)

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

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
      const message = typeof payload === 'string' ? payload : payload?.message ?? 'Unknown error'
      addError(message)
    })

    socket.on('notification', (payload) => {
      const message = typeof payload === 'string' ? payload : payload?.message ?? ''
      if (message) addNotification(message)
    })

    socket.on('session_stats', (stats) => setSessionStats(stats))

    socket.on('action_timer', (payload) => setActionTimer(payload)) // null = cancelled

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

    socket.on('hand_started', ({ handId }) => setActiveHandId(handId))

    socket.on('hand_tags_saved', (payload) => {
      setHandTagsSaved(payload)
      setTimeout(() => setHandTagsSaved(null), 2000)
    })

    socket.on('replay_loaded', ({ handId, actionCount }) => {
      addNotification(`Replay loaded — hand #${handId} (${actionCount} actions)`)
    })

    return () => {
      socket.off('room_joined')
      socket.off('game_state')
      socket.off('error')
      socket.off('notification')
      socket.off('session_stats')
      socket.off('action_timer')
      socket.off('coach_disconnected')
      socket.off('sync_error')
      socket.off('hand_started')
      socket.off('hand_tags_saved')
      socket.off('replay_loaded')
    }
  }, [socketRef, addError, addNotification])

  const reset = useCallback(() => {
    setMyId(null)
    setGameState(null)
    setIsCoach(false)
    setIsSpectator(false)
    setSessionStats(null)
    setCoachDisconnected(false)
    setActionTimer(null)
    setSyncError(null)
    setActiveHandId(null)
    setHandTagsSaved(null)
  }, [])

  // ── emit helpers ──────────────────────────────────────────────────────────

  const startGame           = useCallback((mode) => socketRef.current?.emit('start_game', { mode }), [socketRef])
  const placeBet            = useCallback((action, amount) => socketRef.current?.emit('place_bet', { action, amount }), [socketRef])
  const manualDealCard      = useCallback((targetType, targetId, position, card) => socketRef.current?.emit('manual_deal_card', { targetType, targetId, position, card }), [socketRef])
  const undoAction          = useCallback(() => socketRef.current?.emit('undo_action'), [socketRef])
  const rollbackStreet      = useCallback(() => socketRef.current?.emit('rollback_street'), [socketRef])
  const togglePause         = useCallback(() => socketRef.current?.emit('toggle_pause'), [socketRef])
  const setMode             = useCallback((mode) => socketRef.current?.emit('set_mode', { mode }), [socketRef])
  const forceNextStreet     = useCallback(() => socketRef.current?.emit('force_next_street'), [socketRef])
  const awardPot            = useCallback((winnerId) => socketRef.current?.emit('award_pot', { winnerId }), [socketRef])
  const resetHand           = useCallback(() => socketRef.current?.emit('reset_hand'), [socketRef])
  const adjustStack         = useCallback((playerId, amount) => socketRef.current?.emit('adjust_stack', { playerId, amount }), [socketRef])
  const openConfigPhase     = useCallback(() => socketRef.current?.emit('open_config_phase'), [socketRef])
  const updateHandConfig    = useCallback((config) => socketRef.current?.emit('update_hand_config', { config }), [socketRef])
  const startConfiguredHand = useCallback(() => socketRef.current?.emit('start_configured_hand'), [socketRef])
  const loadHandScenario    = useCallback((handId, stackMode = 'keep') => socketRef.current?.emit('load_hand_scenario', { handId, stackMode }), [socketRef])
  const updateHandTags      = useCallback((handId, tags) => socketRef.current?.emit('update_hand_tags', { handId, tags }), [socketRef])
  const setPlayerInHand     = useCallback((playerId, inHand) => socketRef.current?.emit('set_player_in_hand', { playerId, inHand }), [socketRef])
  const setBlindLevels      = useCallback((sb, bb) => socketRef.current?.emit('set_blind_levels', { sb, bb }), [socketRef])

  const myPlayer = gameState?.players?.find((p) => p.id === myId) ?? null

  return {
    // state
    gameState, myId, isCoach, isSpectator, coachDisconnected,
    actionTimer, syncError, sessionStats, activeHandId, handTagsSaved,
    // derived
    myPlayer,
    // lifecycle
    reset,
    // emit
    startGame, placeBet, manualDealCard, undoAction, rollbackStreet,
    togglePause, setMode, forceNextStreet, awardPot, resetHand,
    adjustStack, openConfigPhase, updateHandConfig, startConfiguredHand,
    loadHandScenario, updateHandTags, setPlayerInHand, setBlindLevels,
  }
}
