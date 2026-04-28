/**
 * UserForm.test.jsx
 *
 * Isolated tests for the UserForm modal component:
 *  - Default role is coached_student when creating a new user
 *  - Coach dropdown renders when role is coached_student
 *  - Coach dropdown is hidden when role is not coached_student
 *  - Coaches are loaded from GET /api/admin/users?role=coach
 *  - POST body includes coachId when a coach is selected
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import UserForm from '../pages/admin/UserForm.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderCreate() {
  return render(
    <UserForm user={null} onClose={vi.fn()} onSaved={vi.fn()} />
  );
}

// ── Default role ──────────────────────────────────────────────────────────────

describe('UserForm — create mode defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: coaches fetch returns empty list
    mockApiFetch.mockResolvedValue({ players: [] });
  });

  it('defaults role to coached_student when creating a new user', () => {
    renderCreate();
    const select = screen.getByTestId('role-select');
    expect(select.value).toBe('coached_student');
  });
});

// ── Coach dropdown ────────────────────────────────────────────────────────────

const MOCK_COACHES = [
  { id: 'coach-1', display_name: 'Alice Coach', role: 'coach' },
  { id: 'coach-2', display_name: 'Bob Coach',   role: 'coach' },
];

describe('UserForm — coach assignment dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('role=coach')) {
        return Promise.resolve({ players: MOCK_COACHES });
      }
      return Promise.resolve({ players: [] });
    });
  });

  it('shows coach dropdown when role is coached_student (default)', async () => {
    renderCreate();
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
  });

  it('does NOT show coach dropdown when role is changed to coach', async () => {
    renderCreate();
    // Wait for initial coach-select to appear (default role is coached_student)
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    // Change role to coach
    fireEvent.change(screen.getByTestId('role-select'), { target: { value: 'coach' } });
    expect(screen.queryByTestId('coach-select')).toBeNull();
  });

  it('fetches coaches from /api/admin/users?role=coach when role is coached_student', async () => {
    renderCreate();
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/users?role=coach')
      )
    );
  });

  it('populates dropdown with loaded coaches', async () => {
    renderCreate();
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    expect(screen.getByText('Alice Coach')).toBeTruthy();
    expect(screen.getByText('Bob Coach')).toBeTruthy();
  });
});

// ── POST body includes coachId ────────────────────────────────────────────────

const MOCK_COACHES_2 = [
  { id: 'coach-1', display_name: 'Alice Coach', role: 'coach' },
  { id: 'coach-2', display_name: 'Bob Coach',   role: 'coach' },
];

describe('UserForm — POST body includes coachId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockImplementation((url, opts) => {
      if (typeof url === 'string' && url.includes('role=coach')) {
        return Promise.resolve({ players: MOCK_COACHES_2 });
      }
      if (opts?.method === 'POST') {
        return Promise.resolve({ id: 'new-user-1' });
      }
      return Promise.resolve({});
    });
  });

  it('includes coachId in POST body when a coach is selected', async () => {
    renderCreate();

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('Display name'), {
      target: { value: 'New Student' },
    });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), {
      target: { value: 'password123' },
    });

    // Wait for coach dropdown to load, then select a coach
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());
    fireEvent.change(screen.getByTestId('coach-select'), { target: { value: 'coach-1' } });

    // Submit
    fireEvent.click(screen.getByText('CREATE'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.coachId).toBe('coach-1');
    });
  });

  it('omits coachId from POST body when no coach is selected', async () => {
    renderCreate();

    fireEvent.change(screen.getByPlaceholderText('Display name'), {
      target: { value: 'Solo Student' },
    });
    fireEvent.change(screen.getByPlaceholderText('Minimum 8 characters'), {
      target: { value: 'password123' },
    });

    // Wait for dropdown but leave it at default (unassigned)
    await waitFor(() => expect(screen.getByTestId('coach-select')).toBeTruthy());

    fireEvent.click(screen.getByText('CREATE'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.coachId).toBeUndefined();
    });
  });
});
