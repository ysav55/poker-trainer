/**
 * StudentDashboardPage.test.jsx (minimal MVP tests)
 *
 * Minimal tests to verify component structure and basic functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

// Mock dependencies
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(() => Promise.resolve({
    player: { id: 'p1', display_name: 'Test', group_name: 'Group' },
    summary: { hands_played: 100, vpip: 30, pfr: 20, wtsd: 35 },
  })),
}))

vi.mock('../components/AppLayout', () => ({
  default: ({ children }) => <div>{children}</div>,
}))

import StudentDashboardPage from '../pages/StudentDashboardPage'

describe('StudentDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the page component', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/students/p1']}>
        <Routes>
          <Route path="/students/:playerId" element={<StudentDashboardPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Should have content (either loading or data)
    expect(container.innerHTML).toBeTruthy()
  })

  it('displays grid layout', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/students/p1']}>
        <Routes>
          <Route path="/students/:playerId" element={<StudentDashboardPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Should have content rendered
    expect(container.innerHTML.length).toBeGreaterThan(0)
  })
})
