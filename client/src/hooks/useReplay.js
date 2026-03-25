import { useCallback } from 'react'

export function useReplay({ socketRef }) {
  const loadReplay    = useCallback((handId) => socketRef.current?.emit('load_replay', { handId }), [socketRef])
  const replayStepFwd = useCallback(() => socketRef.current?.emit('replay_step_forward'), [socketRef])
  const replayStepBack = useCallback(() => socketRef.current?.emit('replay_step_back'), [socketRef])
  const replayJumpTo  = useCallback((cursor) => socketRef.current?.emit('replay_jump_to', { cursor }), [socketRef])
  const replayBranch  = useCallback(() => socketRef.current?.emit('replay_branch'), [socketRef])
  const replayUnbranch = useCallback(() => socketRef.current?.emit('replay_unbranch'), [socketRef])
  const replayExit    = useCallback(() => socketRef.current?.emit('replay_exit'), [socketRef])

  return { loadReplay, replayStepFwd, replayStepBack, replayJumpTo, replayBranch, replayUnbranch, replayExit }
}
