/**
 * LoginPage.test.jsx
 *
 * Tests for the polished login page:
 *  - Renders name/password inputs and submit button
 *  - Shows validation errors for empty fields
 *  - Calls login() with trimmed name
 *  - Navigates to /lobby on success
 *  - Shows error message on failed login
 *  - Renders link to /register
 *  - Renders link to /forgot-password
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mock AuthContext ───────────────────────────────────────────────────────────

const mockLogin = vi.fn();

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

// ── Mock useNavigate ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

import LoginPage from '../pages/LoginPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('LoginPage rendering', () => {
  it('renders name input', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Enter your name')).toBeTruthy();
  });

  it('renders password input', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Password')).toBeTruthy();
  });

  it('renders Log In button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /log in/i })).toBeTruthy();
  });

  it('renders link to /register', () => {
    renderPage();
    const link = screen.getByTestId('register-link');
    expect(link.getAttribute('href')).toBe('/register');
  });

  it('renders link to /forgot-password', () => {
    renderPage();
    const link = screen.getByTestId('forgot-password-link');
    expect(link.getAttribute('href')).toBe('/forgot-password');
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('LoginPage validation', () => {
  it('shows error when name is empty', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(screen.getByTestId('login-error').textContent).toMatch(/name is required/i);
  });

  it('shows error when password is empty', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(screen.getByTestId('login-error').textContent).toMatch(/password is required/i);
  });
});

// ── Successful login ──────────────────────────────────────────────────────────

describe('LoginPage successful login', () => {
  it('calls login() with trimmed name and password', async () => {
    mockLogin.mockResolvedValueOnce({});
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: '  Alice  ' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });

    expect(mockLogin).toHaveBeenCalledWith('Alice', 'secret');
  });

  it('navigates to /lobby after successful login', async () => {
    mockLogin.mockResolvedValueOnce({});
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/lobby');
  });
});

// ── Failed login ──────────────────────────────────────────────────────────────

describe('LoginPage failed login', () => {
  it('displays error message when login() throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid name or password.'));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('login-error').textContent).toMatch(/invalid name or password/i);
    });
  });

  it('re-enables the button after a failed login', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'));
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Enter your name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'wrong' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /log in/i }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /log in/i }).disabled).toBe(false);
    });
  });
});
