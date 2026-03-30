import { useState, useCallback, useRef } from 'react'

const MAX_ERRORS = 5
const MAX_NOTIFICATIONS = 8
const ERROR_TTL = 5000
const NOTIFICATION_TTL = 4000

// eslint-disable-next-line no-unused-vars
export function useNotifications(_socket) {
  const errorTimersRef = useRef({})
  const notifTimersRef = useRef({})
  const [errors, setErrors] = useState([])
  const [notifications, setNotifications] = useState([])

  const addError = useCallback((message) => {
    const id = `err-${Date.now()}-${Math.random()}`
    const entry = { id, message, timestamp: Date.now() }
    setErrors((prev) => [entry, ...prev].slice(0, MAX_ERRORS))
    const timer = setTimeout(() => {
      setErrors((prev) => prev.filter((e) => e.id !== id))
      delete errorTimersRef.current[id]
    }, ERROR_TTL)
    errorTimersRef.current[id] = timer
  }, [])

  const addNotification = useCallback((message) => {
    const id = `notif-${Date.now()}-${Math.random()}`
    const entry = { id, message, timestamp: Date.now() }
    setNotifications((prev) => [entry, ...prev].slice(0, MAX_NOTIFICATIONS))
    const timer = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id))
      delete notifTimersRef.current[id]
    }, NOTIFICATION_TTL)
    notifTimersRef.current[id] = timer
  }, [])

  const reset = useCallback(() => {
    Object.values(errorTimersRef.current).forEach(clearTimeout)
    Object.values(notifTimersRef.current).forEach(clearTimeout)
    errorTimersRef.current = {}
    notifTimersRef.current = {}
    setErrors([])
    setNotifications([])
  }, [])

  return { errors, notifications, addError, addNotification, reset }
}
