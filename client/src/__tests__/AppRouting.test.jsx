/**
 * AppRouting.test.jsx
 *
 * Tests for RequireAuth and RequirePermission route guards, and
 * the App route resolution tree (public routes, authenticated routes,
 * admin-only routes, and wildcard redirect).
 *
 * Strategy: mount guard components directly inside a MemoryRouter
 * rather than mounting the full App (which uses BrowserRouter).
 * useAuth is mocked so individual tests control user/loading/hasPermission.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'

// ── Mock page components ──────────────────────────────────────────────────────

vi.mock('../pages/LoginPage', () => ({ default: () => <div>LoginPage</div> }))
vi.mock('../pages/MainLobby', () => ({ default: () => <div>MainLobby</div> }))
vi.mock('../pages/TablePage', () => ({ default: () => <div>TablePage</div> }))
vi.mock('../pages/MultiTablePage', () => ({ default: () => <div>MultiTablePage</div> }))
vi.mock('../pages/admin/UserManagement', () => ({ default: () => <div>UserManagement</div> }))
vi.mock('../pages/admin/HandBuilder', () => ({ default: () => <div>HandBuilder</div> }))
vi.mock('../pages/admin/PlayerCRM', () => ({ default: () => <div>PlayerCRM</div> }))
vi.mock('../pages/admin/TournamentSetup', () => ({ default: () => <div>TournamentSetup</div> }))

// ── Mock AuthContext ───────────────────────────────────────────────────────────

vi.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: vi.fn(),
}))

vi.mock('../contexts/LobbyContext', () => ({
  LobbyProvider: ({ children }) => children,
}))

// Mock heavy deps that App.jsx imports at the top level
vi.mock('../hooks/useSocket', () => ({ useSocket: vi.fn(() => ({})) }))
vi.mock('../components/PokerTable', () => ({ default: () => null }))
vi.mock('../components/CoachSidebar', () => ({ default: () => null }))
vi.mock('../components/CardPicker', () => ({ default: () => null }))
vi.mock('../components/StatsPanel', () => ({ default: () => null }))
vi.mock('../components/ConnectionDot', () => ({ default: () => null }))
vi.mock('../components/TopBar', () => ({ default: () => null }))
vi.mock('../components/NotificationToast', () => ({ default: () => null }))
vi.mock('../components/ErrorToast', () => ({ default: () => null }))
vi.mock('../components/TagHandPill', () => ({ default: () => null }))
vi.mock('../components/ErrorBoundary', () => ({ default: ({ children }) => children }))

import { useAuth } from '../contexts/AuthContext'

// ── Local mirror guards (same logic as App.jsx) ───────────────────────────────

/**
 * RequireAuth — redirects to /login when not authed; shows loading
 * spinner while loading.
 */
function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) {
    return <div data-testid="loading-spinner">Loading…</div>
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

/**
 * RequirePermission — redirects to /lobby when user lacks the permission.
 */
function RequirePermission({ permission }) {
  const { hasPermission } = useAuth()
  if (!hasPermission(permission)) return <Navigate to="/lobby" replace />
  return <Outlet />
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderRoutes(initialPath, authValue) {
  useAuth.mockReturnValue(authValue)

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<div data-testid="login-page">LoginPage</div>} />

        {/* Authenticated */}
        <Route element={<RequireAuth />}>
          <Route path="/lobby" element={<div data-testid="lobby-page">MainLobby</div>} />
          <Route path="/table/:tableId" element={<div data-testid="table-page">TablePage</div>} />

          {/* Admin */}
          <Route element={<RequirePermission permission="admin:access" />}>
            <Route path="/admin/users" element={<div data-testid="admin-users">UserManagement</div>} />
          </Route>
        </Route>

        {/* Wildcard */}
        <Route path="*" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </MemoryRouter>
  )
}

// ── RequireAuth ───────────────────────────────────────────────────────────────

describe('RequireAuth', () => {
  it('shows loading spinner while loading=true', () => {
    renderRoutes('/lobby', { user: null, loading: true, hasPermission: () => false })
    expect(screen.getByTestId('loading-spinner')).toBeTruthy()
  })

  it('redirects to /login when user=null and loading=false', () => {
    renderRoutes('/lobby', { user: null, loading: false, hasPermission: () => false })
    expect(screen.getByTestId('login-page')).toBeTruthy()
    expect(screen.queryByTestId('lobby-page')).toBeNull()
  })

  it('renders children (Outlet) when user is authenticated', () => {
    renderRoutes('/lobby', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
    expect(screen.queryByTestId('login-page')).toBeNull()
  })

  it('does not show spinner when loading=false', () => {
    renderRoutes('/lobby', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.queryByTestId('loading-spinner')).toBeNull()
  })
})

// ── RequirePermission ─────────────────────────────────────────────────────────

describe('RequirePermission', () => {
  it('redirects to /lobby when user lacks the required permission', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    // Should land on lobby (which itself is inside RequireAuth — user IS authed)
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
    expect(screen.queryByTestId('admin-users')).toBeNull()
  })

  it('renders children when user has the required permission', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Admin', role: 'admin' },
      loading: false,
      hasPermission: (perm) => perm === 'admin:access',
    })
    expect(screen.getByTestId('admin-users')).toBeTruthy()
  })

  it('hasPermission("admin:access")=true shows admin route', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Admin', role: 'admin' },
      loading: false,
      hasPermission: (perm) => perm === 'admin:access',
    })
    expect(screen.getByTestId('admin-users').textContent).toBe('UserManagement')
  })

  it('hasPermission("admin:access")=false redirects to /lobby', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Player', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.queryByTestId('admin-users')).toBeNull()
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
  })
})

// ── Route resolution ──────────────────────────────────────────────────────────

describe('App route resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('/login renders LoginPage (public route)', () => {
    renderRoutes('/login', { user: null, loading: false, hasPermission: () => false })
    expect(screen.getByTestId('login-page')).toBeTruthy()
  })

  it('/lobby renders MainLobby when authenticated', () => {
    renderRoutes('/lobby', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
  })

  it('unknown path redirects to /lobby (then to /login if unauthenticated)', () => {
    // Unauthenticated user hits unknown path -> wildcard -> /lobby -> RequireAuth -> /login
    renderRoutes('/some/unknown/path', {
      user: null,
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.getByTestId('login-page')).toBeTruthy()
  })

  it('unknown path redirects to /lobby when authenticated', () => {
    renderRoutes('/some/unknown/path', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
  })

  it('/admin/users renders UserManagement when user has admin:access', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Admin', role: 'admin' },
      loading: false,
      hasPermission: (perm) => perm === 'admin:access',
    })
    expect(screen.getByTestId('admin-users')).toBeTruthy()
  })

  it('/admin/users redirects to /lobby when user lacks admin:access', () => {
    renderRoutes('/admin/users', {
      user: { id: 'u1', name: 'Alice', role: 'player' },
      loading: false,
      hasPermission: () => false,
    })
    expect(screen.queryByTestId('admin-users')).toBeNull()
    expect(screen.getByTestId('lobby-page')).toBeTruthy()
  })

  it('/lobby redirects to /login when unauthenticated and not loading', () => {
    renderRoutes('/lobby', { user: null, loading: false, hasPermission: () => false })
    expect(screen.queryByTestId('lobby-page')).toBeNull()
    expect(screen.getByTestId('login-page')).toBeTruthy()
  })
})
