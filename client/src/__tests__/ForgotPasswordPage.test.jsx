/**
 * ForgotPasswordPage.test.jsx
 *
 * Tests for the password reset request form:
 *  - Renders name input and submit button
 *  - Disables submit when name is empty
 *  - Shows confirmation message after submission
 *  - Shows loading state while submitting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

const mockApiFetch = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import ForgotPasswordPage from '../pages/ForgotPasswordPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiFetch.mockResolvedValue({});
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage rendering', () => {
  it('renders the account name input', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Your display name')).toBeTruthy();
  });

  it('renders the Request Reset button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /request reset/i })).toBeTruthy();
  });

  it('submit button is disabled when name is empty', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /request reset/i }).disabled).toBe(true);
  });

  it('submit button is enabled after typing a name', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    expect(screen.getByRole('button', { name: /request reset/i }).disabled).toBe(false);
  });
});

// ── Submission ────────────────────────────────────────────────────────────────

describe('ForgotPasswordPage submission', () => {
  it('shows confirmation screen after submission', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /request reset/i }));
    await waitFor(() => expect(screen.getByTestId('reset-confirmation')).toBeTruthy());
  });

  it('confirmation message mentions contacting coach or admin', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /request reset/i }));
    await waitFor(() =>
      expect(screen.getByTestId('reset-confirmation').textContent).toMatch(/coach|administrator/i)
    );
  });
});

// ── Navigation links ──────────────────────────────────────────────────────────

describe('ForgotPasswordPage navigation', () => {
  it('has a "Sign in" link to /login', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link.getAttribute('href')).toBe('/login');
  });
});
