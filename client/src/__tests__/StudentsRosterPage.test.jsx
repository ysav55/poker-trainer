/**
 * StudentsRosterPage.test.jsx
 *
 * Tests for the Students roster data table with filtering and search.
 * - Renders columns: Name, Group, Grade, Alert, Last Active
 * - Supports text search, group filter, sorting
 * - Click row → navigate to /students/:playerId
 * - Loading/empty/error states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import React from 'react'

// Mock components and hooks
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}))

vi.mock('../components/AppLayout', () => ({
  default: ({ children }) => <div data-testid="app-layout">{children}</div>,
}))

import { apiFetch } from '../lib/api'
import StudentsRosterPage from '../pages/StudentsRosterPage'

// Mock page for navigation test
function StudentDetailPage() {
  return <div data-testid="student-detail">Student Detail</div>
}

describe('StudentsRosterPage', () => {
  const mockPlayers = [
    {
      id: 'p1',
      display_name: 'Alice Johnson',
      group_name: 'Group A',
      grade: 85,
      alert_severity: 'high',
      last_active: '2026-04-12T10:30:00Z',
    },
    {
      id: 'p2',
      display_name: 'Bob Smith',
      group_name: 'Group B',
      grade: 92,
      alert_severity: null,
      last_active: '2026-04-11T14:22:00Z',
    },
    {
      id: 'p3',
      display_name: 'Carol Davis',
      group_name: 'Group A',
      grade: 78,
      alert_severity: 'moderate',
      last_active: '2026-04-10T08:15:00Z',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading skeleton while fetching', async () => {
    apiFetch.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    )

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByTestId('students-loading')).toBeInTheDocument()
  })

  it('renders data table with all columns', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    // Check all columns exist
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Group')).toBeInTheDocument()
    expect(screen.getByText('Grade')).toBeInTheDocument()
    expect(screen.getByText('Alert')).toBeInTheDocument()
    expect(screen.getByText('Last Active')).toBeInTheDocument()

    // Check data rows
    expect(screen.getByText('Bob Smith')).toBeInTheDocument()
    expect(screen.getByText('Carol Davis')).toBeInTheDocument()
  })

  it('navigates to /students/:playerId on row click', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
          <Route path="/students/:playerId" element={<StudentDetailPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    const row = screen.getByText('Alice Johnson').closest('tr')
    fireEvent.click(row)

    await waitFor(() => {
      expect(screen.getByTestId('student-detail')).toBeInTheDocument()
    })
  })

  it('filters by search text', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search/i)
    await userEvent.type(searchInput, 'Bob')

    await waitFor(() => {
      expect(screen.getByText('Bob Smith')).toBeInTheDocument()
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument()
    })
  })

  it('renders empty state when no players', async () => {
    apiFetch.mockResolvedValueOnce({ players: [] })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/no students/i)).toBeInTheDocument()
    })
  })

  it('renders error state with retry button', async () => {
    apiFetch.mockRejectedValueOnce(new Error('Network error'))

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })

    const retryButton = screen.getByRole('button', { name: /retry/i })
    expect(retryButton).toBeInTheDocument()

    // Click retry
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })
    fireEvent.click(retryButton)

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })
  })

  it('filters by group', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    // Find group filter dropdown
    const groupFilter = screen.getByDisplayValue('All Groups')
    fireEvent.change(groupFilter, { target: { value: 'Group A' } })

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
      expect(screen.getByText('Carol Davis')).toBeInTheDocument()
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument()
    })
  })

  it('sorts by grade and alert', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    // Find grade header and click to sort
    const gradeHeader = screen.getByRole('columnheader', { name: /grade/i })
    fireEvent.click(gradeHeader)

    // After sort, higher grade should come first
    const rows = screen.getAllByRole('row')
    const lastRowName = rows[rows.length - 1].textContent
    expect(lastRowName).toContain('Carol Davis') // Grade 78
  })

  it('displays alert severity dots', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    // Check for alert indicators (high = red, moderate = gold, etc.)
    expect(screen.getByTestId('alert-high')).toBeInTheDocument()
    expect(screen.getByTestId('alert-moderate')).toBeInTheDocument()
  })

  it('formats last active time', async () => {
    apiFetch.mockResolvedValueOnce({ players: mockPlayers })

    render(
      <MemoryRouter initialEntries={['/students']}>
        <Routes>
          <Route path="/students" element={<StudentsRosterPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument()
    })

    // Should show relative time (e.g., "2 hours ago") not absolute ISO
    expect(screen.queryByText(/2026-04-12T10:30:00Z/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/ago|today|yesterday/i).length).toBeGreaterThan(0)
  })
})
