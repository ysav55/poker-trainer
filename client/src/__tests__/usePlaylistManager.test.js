/**
 * usePlaylistManager.test.js
 * Tests for socket event listeners, state management, and emit helpers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlaylistManager } from '../hooks/usePlaylistManager'

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockSocket() {
  const handlers = {}
  return {
    on: vi.fn((event, cb) => { handlers[event] = cb }),
    off: vi.fn(),
    emit: vi.fn(),
    _trigger: (event, ...args) => handlers[event]?.(...args),
  }
}

function renderPlaylistManager(socket) {
  const socketRef = { current: socket }
  const { result, unmount } = renderHook(() =>
    usePlaylistManager({ socketRef })
  )
  return { result, unmount }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePlaylistManager — initial state', () => {
  it('initializes playlists as empty array', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    expect(result.current.playlists).toEqual([])
  })

  it('returns all expected keys', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    expect(typeof result.current.reset).toBe('function')
    expect(typeof result.current.createPlaylist).toBe('function')
    expect(typeof result.current.getPlaylists).toBe('function')
    expect(typeof result.current.addToPlaylist).toBe('function')
    expect(typeof result.current.removeFromPlaylist).toBe('function')
    expect(typeof result.current.deletePlaylist).toBe('function')
    expect(typeof result.current.activatePlaylist).toBe('function')
    expect(typeof result.current.deactivatePlaylist).toBe('function')
  })
})

describe('usePlaylistManager — socket listeners', () => {
  it('registers playlist_state listener on mount', () => {
    const socket = createMockSocket()
    renderPlaylistManager(socket)
    expect(socket.on).toHaveBeenCalledWith('playlist_state', expect.any(Function))
  })

  it('cleans up playlist_state listener on unmount', () => {
    const socket = createMockSocket()
    const { unmount } = renderPlaylistManager(socket)
    unmount()
    expect(socket.off).toHaveBeenCalledWith('playlist_state')
  })

  it('receiving playlist_state event updates playlists from payload.playlists', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    const mockPlaylists = [
      { id: 'pl1', name: 'Squeeze Spots' },
      { id: 'pl2', name: 'River Raises' },
    ]
    act(() => {
      socket._trigger('playlist_state', { playlists: mockPlaylists })
    })
    expect(result.current.playlists).toEqual(mockPlaylists)
  })

  it('receiving playlist_state with no playlists key defaults to empty array', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    act(() => {
      socket._trigger('playlist_state', {})
    })
    expect(result.current.playlists).toEqual([])
  })

  it('receiving playlist_state with null payload defaults to empty array', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    act(() => {
      socket._trigger('playlist_state', null)
    })
    expect(result.current.playlists).toEqual([])
  })

  it('receiving multiple playlist_state events replaces state each time', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    act(() => {
      socket._trigger('playlist_state', { playlists: [{ id: 'pl1', name: 'A' }] })
    })
    expect(result.current.playlists).toHaveLength(1)
    act(() => {
      socket._trigger('playlist_state', { playlists: [{ id: 'pl2', name: 'B' }, { id: 'pl3', name: 'C' }] })
    })
    expect(result.current.playlists).toHaveLength(2)
    expect(result.current.playlists[0].id).toBe('pl2')
  })
})

describe('usePlaylistManager — reset()', () => {
  it('clears playlists back to empty array', () => {
    const socket = createMockSocket()
    const { result } = renderPlaylistManager(socket)
    act(() => {
      socket._trigger('playlist_state', { playlists: [{ id: 'pl1', name: 'A' }] })
    })
    expect(result.current.playlists).toHaveLength(1)
    act(() => { result.current.reset() })
    expect(result.current.playlists).toEqual([])
  })
})

describe('usePlaylistManager — emit helpers', () => {
  let socket

  beforeEach(() => { socket = createMockSocket() })

  it('createPlaylist emits create_playlist with name and description', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.createPlaylist('My List', 'A description') })
    expect(socket.emit).toHaveBeenCalledWith('create_playlist', { name: 'My List', description: 'A description' })
  })

  it('createPlaylist defaults description to empty string', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.createPlaylist('My List') })
    expect(socket.emit).toHaveBeenCalledWith('create_playlist', { name: 'My List', description: '' })
  })

  it('getPlaylists emits get_playlists with no payload', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.getPlaylists() })
    expect(socket.emit).toHaveBeenCalledWith('get_playlists')
  })

  it('addToPlaylist emits add_to_playlist with playlistId and handId', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.addToPlaylist('pl1', 42) })
    expect(socket.emit).toHaveBeenCalledWith('add_to_playlist', { playlistId: 'pl1', handId: 42 })
  })

  it('removeFromPlaylist emits remove_from_playlist with playlistId and handId', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.removeFromPlaylist('pl1', 42) })
    expect(socket.emit).toHaveBeenCalledWith('remove_from_playlist', { playlistId: 'pl1', handId: 42 })
  })

  it('deletePlaylist emits delete_playlist with playlistId', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.deletePlaylist('pl1') })
    expect(socket.emit).toHaveBeenCalledWith('delete_playlist', { playlistId: 'pl1' })
  })

  it('activatePlaylist emits activate_playlist with playlistId', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.activatePlaylist('pl2') })
    expect(socket.emit).toHaveBeenCalledWith('activate_playlist', { playlistId: 'pl2' })
  })

  it('deactivatePlaylist emits deactivate_playlist with no payload', () => {
    const { result } = renderPlaylistManager(socket)
    act(() => { result.current.deactivatePlaylist() })
    expect(socket.emit).toHaveBeenCalledWith('deactivate_playlist')
  })

  it('emit helpers are no-ops when socketRef.current is null', () => {
    const nullSocketRef = { current: null }
    const { result } = renderHook(() => usePlaylistManager({ socketRef: nullSocketRef }))
    // None of these should throw
    expect(() => {
      act(() => {
        result.current.createPlaylist('test')
        result.current.getPlaylists()
        result.current.addToPlaylist('pl1', 1)
        result.current.removeFromPlaylist('pl1', 1)
        result.current.deletePlaylist('pl1')
        result.current.activatePlaylist('pl1')
        result.current.deactivatePlaylist()
      })
    }).not.toThrow()
  })
})
