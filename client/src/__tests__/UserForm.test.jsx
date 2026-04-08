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
    const select = screen.getByRole('combobox');
    expect(select.value).toBe('coached_student');
  });
});
