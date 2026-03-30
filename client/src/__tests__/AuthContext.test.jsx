/**
 * AuthContext.test.jsx
 *
 * Tests for AuthProvider / useAuth:
 *   - login() sets user state, fetches permissions, stores in localStorage
 *   - logout() clears user, permissions, and localStorage keys
 *   - hasPermission() returns true/false based on the current permissions Set
 *
 * RequireAuth lives in App.jsx (not exported), so we test it by mounting an
 * inline version that mirrors the same logic.
 *
 * All apiFetch calls are mocked so no network requests occur.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import React, { useState } from 'react'
import { MemoryRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '../contexts/AuthContext.jsx'

// ── Mock apiFetch ─────────────────────────────────────────────────────────────

vi.mock('../lib/api.js', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../lib/api.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * A simple consumer component that exposes AuthContext values via data-testid
 * so assertions can read them out of the rendered DOM.
 */
function AuthConsumer() {
  const { user, hasPermission, logout } = useAuth()
  return (
    <div>
      <span data-testid="user-name">{user ? user.name : 'no-user'}</span>
      <span data-testid="user-role">{user ? user.role : 'no-role'}</span>
      <span data-testid="perm-view">{String(hasPermission('view_hands'))}</span>
      <span data-testid="perm-admin">{String(hasPermission('admin:access'))}</span>
      <button data-testid="logout-btn" onClick={logout}>Logout</button>
    </div>
  )
}

/**
 * A thin login trigger that calls login() via useAuth and signals completion
 * via a data-testid.
 */
function LoginTrigger({ name, password, onDone }) {
  const { login } = useAuth()
  return (
    <button
      data-testid="login-btn"
      onClick={async () => {
        await login(name, password)
        onDone?.()
      }}
    >
      Login
    </button>
  )
}

/**
 * Mirror of the RequireAuth component in App.jsx (not exported from there).
 * Redirects to /login when user is null; renders <Outlet /> when authenticated.
 */
function RequireAuth() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

// ── login() ───────────────────────────────────────────────────────────────────

describe('login()', () => {
  it('sets user state after a successful login', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-001',
        name: 'Alice',
        role: 'coach',
        token: 'tok.aaa.bbb',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Alice" password="secret" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    expect(screen.getByTestId('user-name').textContent).toBe('no-user')

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(screen.getByTestId('user-name').textContent).toBe('Alice')
    expect(screen.getByTestId('user-role').textContent).toBe('coach')
  })

  it('stores JWT and stableId in localStorage', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-002',
        name: 'Bob',
        role: 'player',
        token: 'tok.xxx.yyy',
      })
      .mockResolvedValueOnce({ permissions: [] })

    let loginDone = false

    render(
      <AuthProvider>
        <LoginTrigger name="Bob" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(localStorage.getItem('poker_trainer_jwt')).toBe('tok.xxx.yyy')
    expect(localStorage.getItem('poker_trainer_player_id')).toBe('uuid-002')
  })

  it('fetches permissions after login and updates hasPermission', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-003',
        name: 'Carol',
        role: 'admin',
        token: 'tok.admin',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands', 'admin:access'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Carol" password="adminpass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(screen.getByTestId('perm-view').textContent).toBe('true')
    expect(screen.getByTestId('perm-admin').textContent).toBe('true')
  })

  it('calls GET /api/auth/permissions as the second apiFetch call', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-004',
        name: 'Dave',
        role: 'player',
        token: 'tok.dave',
      })
      .mockResolvedValueOnce({ permissions: [] })

    let loginDone = false

    render(
      <AuthProvider>
        <LoginTrigger name="Dave" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    // apiFetch should have been called twice: login + permissions
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/auth/permissions')
  })
})

// ── logout() ──────────────────────────────────────────────────────────────────

describe('logout()', () => {
  it('clears user state', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-010',
        name: 'Eve',
        role: 'player',
        token: 'tok.eve',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Eve" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(screen.getByTestId('user-name').textContent).toBe('Eve')

    act(() => {
      screen.getByTestId('logout-btn').click()
    })

    expect(screen.getByTestId('user-name').textContent).toBe('no-user')
  })

  it('clears permissions so hasPermission returns false', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-011',
        name: 'Frank',
        role: 'admin',
        token: 'tok.frank',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands', 'admin:access'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Frank" password="adminpass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(screen.getByTestId('perm-view').textContent).toBe('true')

    act(() => {
      screen.getByTestId('logout-btn').click()
    })

    expect(screen.getByTestId('perm-view').textContent).toBe('false')
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })

  it('removes JWT and stableId from localStorage', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-012',
        name: 'Grace',
        role: 'player',
        token: 'tok.grace',
      })
      .mockResolvedValueOnce({ permissions: [] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Grace" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(localStorage.getItem('poker_trainer_jwt')).toBe('tok.grace')

    act(() => {
      screen.getByTestId('logout-btn').click()
    })

    expect(localStorage.getItem('poker_trainer_jwt')).toBeNull()
    expect(localStorage.getItem('poker_trainer_player_id')).toBeNull()
  })
})

// ── hasPermission() ───────────────────────────────────────────────────────────

describe('hasPermission()', () => {
  it('returns false for all keys before login', () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    expect(screen.getByTestId('perm-view').textContent).toBe('false')
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })

  it('returns false for a permission not in the set', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-020',
        name: 'Heidi',
        role: 'player',
        token: 'tok.heidi',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Heidi" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    expect(screen.getByTestId('perm-view').textContent).toBe('true')
    // admin:access was NOT in the returned permissions
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })
})

// ── RequireAuth (inline mirror of App.jsx's component) ────────────────────────

describe('RequireAuth', () => {
  it('renders protected children when user is authenticated', async () => {
    // Pre-populate localStorage so AuthProvider initialises with a user
    // We craft a valid-looking JWT payload (base64 encoded JSON in part 2)
    const payload = btoa(JSON.stringify({ stableId: 'uuid-100', name: 'Ivan', role: 'player' }))
    const fakeToken = `header.${payload}.sig`
    localStorage.setItem('poker_trainer_jwt', fakeToken)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/protected" element={<span data-testid="protected-content">Secret</span>} />
            </Route>
            <Route path="/login" element={<span data-testid="login-page">Login</span>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    )

    expect(screen.getByTestId('protected-content').textContent).toBe('Secret')
    expect(screen.queryByTestId('login-page')).toBeNull()
  })

  it('redirects to /login when user is null', () => {
    // No token in localStorage — user starts as null
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/protected']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/protected" element={<span data-testid="protected-content">Secret</span>} />
            </Route>
            <Route path="/login" element={<span data-testid="login-page">Login</span>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    )

    expect(screen.queryByTestId('protected-content')).toBeNull()
    expect(screen.getByTestId('login-page').textContent).toBe('Login')
  })
})

// ── login() — additional edge cases ──────────────────────────────────────────

describe('login() — switching users', () => {
  it('clears old permissions when logging in as a different user', async () => {
    // First login: user A with admin:access
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-a01',
        name: 'UserA',
        role: 'admin',
        token: 'tok.aaa',
      })
      .mockResolvedValueOnce({ permissions: ['admin:access', 'view_hands'] })

    let login1Done = false
    let login2Done = false

    function DualLoginTrigger() {
      const { login } = useAuth()
      return (
        <>
          <button
            data-testid="login-a"
            onClick={async () => {
              await login('UserA', 'passA')
              login1Done = true
            }}
          >
            Login A
          </button>
          <button
            data-testid="login-b"
            onClick={async () => {
              await login('UserB', 'passB')
              login2Done = true
            }}
          >
            Login B
          </button>
        </>
      )
    }

    render(
      <AuthProvider>
        <AuthConsumer />
        <DualLoginTrigger />
      </AuthProvider>
    )

    // First login: UserA with admin:access
    await act(async () => {
      screen.getByTestId('login-a').click()
      await waitFor(() => login1Done)
    })

    expect(screen.getByTestId('user-name').textContent).toBe('UserA')
    expect(screen.getByTestId('perm-admin').textContent).toBe('true')

    // Second login: UserB — only view_hands, NOT admin:access
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-b01',
        name: 'UserB',
        role: 'player',
        token: 'tok.bbb',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands'] })

    await act(async () => {
      screen.getByTestId('login-b').click()
      await waitFor(() => login2Done)
    })

    expect(screen.getByTestId('user-name').textContent).toBe('UserB')
    // admin:access from first login must be gone
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
    // view_hands should still be present
    expect(screen.getByTestId('perm-view').textContent).toBe('true')
  })
})

describe('logout() — full state clear', () => {
  it('clears both user and permissions after logout', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-c01',
        name: 'Charlie',
        role: 'admin',
        token: 'tok.charlie',
      })
      .mockResolvedValueOnce({ permissions: ['view_hands', 'admin:access'] })

    let loginDone = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTrigger name="Charlie" password="pass" onDone={() => { loginDone = true }} />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-btn').click()
      await waitFor(() => loginDone)
    })

    // Confirm logged in with permissions
    expect(screen.getByTestId('user-name').textContent).toBe('Charlie')
    expect(screen.getByTestId('perm-view').textContent).toBe('true')
    expect(screen.getByTestId('perm-admin').textContent).toBe('true')

    // Logout
    act(() => {
      screen.getByTestId('logout-btn').click()
    })

    // Both user and permissions must be cleared
    expect(screen.getByTestId('user-name').textContent).toBe('no-user')
    expect(screen.getByTestId('user-role').textContent).toBe('no-role')
    expect(screen.getByTestId('perm-view').textContent).toBe('false')
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })
})

describe('hasPermission() — unauthenticated', () => {
  it('returns false when no token exists in localStorage', () => {
    // localStorage is cleared in beforeEach — no token present
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    )

    // No login performed; user is null
    expect(screen.getByTestId('user-name').textContent).toBe('no-user')
    expect(screen.getByTestId('perm-view').textContent).toBe('false')
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })
})

describe('login() — network error on permissions fetch', () => {
  /**
   * LoginTriggerCatching is identical to LoginTrigger but swallows errors
   * from login() so the rejection doesn't become an unhandled promise rejection
   * at the Vitest runner level.
   */
  function LoginTriggerCatching({ name, password, onSettled }) {
    const { login } = useAuth()
    return (
      <button
        data-testid="login-catching-btn"
        onClick={async () => {
          try {
            await login(name, password)
          } catch (_err) {
            // expected — permissions fetch threw
          } finally {
            onSettled?.()
          }
        }}
      >
        Login (catching)
      </button>
    )
  }

  it('permissions remain empty when /api/auth/permissions call fails', async () => {
    apiFetch
      .mockResolvedValueOnce({
        stableId: 'uuid-d01',
        name: 'Dana',
        role: 'player',
        token: 'tok.dana',
      })
      // Simulate network error on the permissions call
      .mockRejectedValueOnce(new Error('Network error'))

    let settled = false

    render(
      <AuthProvider>
        <AuthConsumer />
        <LoginTriggerCatching
          name="Dana"
          password="pass"
          onSettled={() => { settled = true }}
        />
      </AuthProvider>
    )

    await act(async () => {
      screen.getByTestId('login-catching-btn').click()
      await waitFor(() => settled)
    })

    // Permissions must remain empty — setPermissions(new Set(perms)) was never reached
    // because the permissions fetch threw before it could run.
    expect(screen.getByTestId('perm-view').textContent).toBe('false')
    expect(screen.getByTestId('perm-admin').textContent).toBe('false')
  })
})
