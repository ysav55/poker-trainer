/**
 * UserManagement.test.jsx
 *
 * Tests for User Management page:
 *  - Loads user list from /api/admin/users
 *  - Renders scope label ("All Users" when no school selected)
 *  - Displays user names from API response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

import UserManagement from '../pages/admin/UserManagement.jsx';
import { apiFetch } from '../lib/api.js';

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_USERS = [
  {
    id: 'user-1',
    display_name: 'Alice Admin',
    email: 'alice@example.com',
    role: 'admin',
    status: 'active',
    created_at: '2026-01-15T10:00:00Z',
    last_seen: '2026-04-07T08:00:00Z',
    coach_name: null,
  },
  {
    id: 'user-2',
    display_name: 'Bob Coach',
    email: 'bob@example.com',
    role: 'coach',
    status: 'active',
    created_at: '2026-02-10T12:00:00Z',
    last_seen: '2026-04-07T09:00:00Z',
    coach_name: null,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <UserManagement />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // apiFetch is called for both /api/admin/users and /api/admin/schools
  apiFetch.mockImplementation((url) => {
    if (url.includes('/api/admin/users')) return Promise.resolve(MOCK_USERS);
    if (url.includes('/api/admin/schools')) return Promise.resolve([]);
    return Promise.resolve([]);
  });
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UserManagement', () => {
  it('renders the "All Users" scope label', async () => {
    renderPage();
    await waitFor(() => {
      // getAllByText because IncomingZone may also render this text in sub-components
      expect(screen.getAllByText('All Users').length).toBeGreaterThan(0);
    });
  });

  it('loads and displays user list from API', async () => {
    renderPage();
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users'));
    });
    await waitFor(() => {
      // getAllByText because users appear in both the table and IncomingZone
      expect(screen.getAllByText('Alice Admin').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bob Coach').length).toBeGreaterThan(0);
    });
  });

  it('shows user count in scope label area', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('2 users')).toBeTruthy();
    });
  });

  it('renders search input', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search…')).toBeTruthy();
    });
  });

  it('handles empty user list gracefully', async () => {
    apiFetch.mockImplementation(() => Promise.resolve([]));
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No users found')).toBeTruthy();
    });
  });
});
