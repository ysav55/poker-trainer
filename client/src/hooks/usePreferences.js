import { useState, useCallback } from 'react'

export function usePreferences() {
  const [bbView, setBBView] = useState(() => localStorage.getItem('poker_trainer_bb_view') === '1')

  const toggleBBView = useCallback(() => {
    setBBView((prev) => {
      const next = !prev
      localStorage.setItem('poker_trainer_bb_view', next ? '1' : '0')
      return next
    })
  }, [])

  return { bbView, toggleBBView }
}
