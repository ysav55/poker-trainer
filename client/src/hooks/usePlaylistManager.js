import { useState, useEffect, useCallback } from 'react'

export function usePlaylistManager(socket) {
  const { socketRef, socket: socketState } = socket ?? {}
  const [playlists, setPlaylists] = useState([])

  useEffect(() => {
    // Use the reactive socket state value so this effect re-runs when
    // the socket instance changes (C-8 fix — stale ref capture).
    const s = socketState
    if (!s) return

    s.on('playlist_state', (payload) => setPlaylists(payload?.playlists ?? []))
    s.emit('get_playlists')

    return () => {
      s.off('playlist_state')
    }
  }, [socketState])

  const reset = useCallback(() => setPlaylists([]), [])

  const createPlaylist      = useCallback((name, description = '') => socketRef.current?.emit('create_playlist', { name, description }), [socketRef])
  const getPlaylists        = useCallback(() => socketRef.current?.emit('get_playlists'), [socketRef])
  const addToPlaylist       = useCallback((playlistId, handId) => socketRef.current?.emit('add_to_playlist', { playlistId, handId }), [socketRef])
  const removeFromPlaylist  = useCallback((playlistId, handId) => socketRef.current?.emit('remove_from_playlist', { playlistId, handId }), [socketRef])
  const deletePlaylist      = useCallback((playlistId) => socketRef.current?.emit('delete_playlist', { playlistId }), [socketRef])
  const activatePlaylist    = useCallback((playlistId) => socketRef.current?.emit('activate_playlist', { playlistId }), [socketRef])
  const deactivatePlaylist  = useCallback(() => socketRef.current?.emit('deactivate_playlist'), [socketRef])

  return {
    playlists,
    reset,
    createPlaylist, getPlaylists, addToPlaylist, removeFromPlaylist,
    deletePlaylist, activatePlaylist, deactivatePlaylist,
  }
}
