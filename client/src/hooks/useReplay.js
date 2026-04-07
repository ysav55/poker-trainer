import { useState, useEffect, useCallback } from 'react'

/**
 * useReplay — manages replay-mode state and socket emitters.
 *
 * Listens for `replay_loaded` to track {handId, actionCount}.
 * The full game state (cursor position, actions, replay_mode object)
 * arrives via the normal `game_state` socket event handled in useGameState.
 *
 * Emitters:
 *   loadReplay(handId)       — load a hand into replay mode
 *   replayStepForward()      — advance cursor by one action
 *   replayStepBack()         — rewind cursor by one action
 *   replayJumpTo(cursor)     — jump to specific action index
 *   replayBranch()           — branch to live play from current cursor
 *   replayUnbranch()         — return to replay after branch
 *   replayExit()             — exit replay mode entirely
 */
export function useReplay(socket) {
  const { socketRef, socket: socketState } = socket ?? {}

  // Meta about the currently-loaded replay (set by replay_loaded event)
  const [replayMeta, setReplayMeta] = useState(null) // { handId, actionCount } | null

  useEffect(() => {
    const s = socketState
    if (!s) return

    const onReplayLoaded = ({ handId, actionCount }) => {
      setReplayMeta({ handId, actionCount })
    }

    s.on('replay_loaded', onReplayLoaded)

    return () => {
      s.off('replay_loaded', onReplayLoaded)
    }
  }, [socketState])

  const reset = useCallback(() => {
    setReplayMeta(null)
  }, [])

  // ── emit helpers ──────────────────────────────────────────────────────────

  const loadReplay = useCallback(
    (handId) => socketRef?.current?.emit('load_replay', { handId }),
    [socketRef]
  )

  const replayStepForward = useCallback(
    () => socketRef?.current?.emit('replay_step_forward', {}),
    [socketRef]
  )

  const replayStepBack = useCallback(
    () => socketRef?.current?.emit('replay_step_back', {}),
    [socketRef]
  )

  const replayJumpTo = useCallback(
    (cursor) => socketRef?.current?.emit('replay_jump_to', { cursor }),
    [socketRef]
  )

  const replayBranch = useCallback(
    () => socketRef?.current?.emit('replay_branch', {}),
    [socketRef]
  )

  const replayUnbranch = useCallback(
    () => socketRef?.current?.emit('replay_unbranch', {}),
    [socketRef]
  )

  const replayExit = useCallback(
    () => {
      socketRef?.current?.emit('replay_exit', {})
      setReplayMeta(null)
    },
    [socketRef]
  )

  return {
    replayMeta,
    reset,
    loadReplay,
    replayStepForward,
    replayStepBack,
    replayJumpTo,
    replayBranch,
    replayUnbranch,
    replayExit,
  }
}
