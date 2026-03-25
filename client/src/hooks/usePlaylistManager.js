import { useState, useEffect, useCallback } from 'react'

export function usePlaylistManager({ socketRef }) {
  const [playlists, setPlaylists] = useState([])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    socket.on('playlist_state', (payload) => setPlaylists(payload?.playlists ?? []))

    return () => {
      socket.off('playlist_state')
    }
  }, [socketRef])

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
