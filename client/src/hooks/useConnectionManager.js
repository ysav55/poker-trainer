import { useState, useEffect, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'

// In production (unified server), connect to the same host the page was served from.
// In development, connect to the Vite dev server's proxy target (localhost:3001).
const SOCKET_URL = import.meta.env.DEV ? 'http://localhost:3001' : ''

export function useConnectionManager() {
  const socketRef = useRef(null)
  // Stores last join params so the socket can auto-rejoin after a disconnect/reconnect
  const joinParamsRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      auth: (cb) => cb({ token: localStorage.getItem('poker_trainer_jwt') || '' }),
    })
    socketRef.current = socket

    // ── Global error capture for alpha testing ─────────────────────────────
    // Ship uncaught JS errors + unhandled promise rejections back to the server
    // so they appear in /api/alpha-report alongside server-side errors.
    const handleWindowError = (event) => {
      socket.emit('client_error', {
        message: event.message || String(event.error),
        stack:   event.error?.stack?.slice(0, 500),
        context: { type: 'uncaught', filename: event.filename, lineno: event.lineno },
      })
    }
    const handleUnhandledRejection = (event) => {
      const err = event.reason
      socket.emit('client_error', {
        message: err?.message || String(err),
        stack:   err?.stack?.slice(0, 500),
        context: { type: 'unhandledRejection' },
      })
    }
    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    socket.on('connect_error', (err) => {
      // If the server rejects the socket due to an expired or invalid JWT, clear
      // stale credentials so the user is prompted to log in again.
      if (err.message?.toLowerCase().includes('auth') || err.message?.toLowerCase().includes('token') || err.message?.toLowerCase().includes('unauthorized')) {
        localStorage.removeItem('poker_trainer_jwt')
        localStorage.removeItem('poker_trainer_player_id')
        joinParamsRef.current = null
      }
      console.error('[socket] connect_error', err.message)
    })

    socket.on('connect', () => {
      setConnected(true)
      // Auto-rejoin if we were already seated (socket reconnected after a drop)
      if (joinParamsRef.current) {
        const { name, role, stableId } = joinParamsRef.current
        socket.emit('join_room', {
          name,
          isCoach: role === 'coach',
          isSpectator: role === 'spectator',
          stableId,
        })
      }
    })

    socket.on('disconnect', () => setConnected(false))

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const joinRoom = useCallback((name, role = 'player') => {
    const stableId = role === 'spectator' ? `spectator_${Date.now()}` : null
    joinParamsRef.current = { name, role, stableId }
    socketRef.current?.emit('join_room', {
      name,
      isCoach: role === 'coach',
      isSpectator: role === 'spectator',
      stableId,
    })
  }, [])

  // Called by useSocket's leaveRoom to prevent auto-rejoin after intentional leave
  const clearJoinParams = useCallback(() => {
    joinParamsRef.current = null
  }, [])

  return { socketRef, connected, joinRoom, clearJoinParams }
}
