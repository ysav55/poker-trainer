/**
 * RegisterPage.test.jsx
 *
 * Tests for the self-registration form:
 *  - Renders student/coach tabs
 *  - Validates required fields (including email for coach)
 *  - Validates password confirmation match
 *  - Calls register() for students, registerCoach() for coaches
 *  - Shows success message on success
 *  - Shows friendly error when registration is disabled (410)
 *  - Switches to coach tab and shows approval notice
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mock AuthContext ───────────────────────────────────────────────────────────

const mockRegister = vi.fn();
const mockRegisterCoach = vi.fn();

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ register: mockRegister, registerCoach: mockRegisterCoach }),
}));

// ── Mock useNavigate ───────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

import RegisterPage from '../pages/RegisterPage.jsx';

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('RegisterPage rendering', () => {
  it('renders Student and Coach tabs', () => {
    renderPage();
    expect(screen.getByText('Student')).toBeTruthy();
    expect(screen.getByText('Coach')).toBeTruthy();
  });

  it('shows name and password fields by default', () => {
    renderPage();
    expect(screen.getByPlaceholderText('Your display name')).toBeTruthy();
    expect(screen.getByPlaceholderText('At least 8 characters')).toBeTruthy();
    expect(screen.getByPlaceholderText('Re-enter password')).toBeTruthy();
  });

  it('shows "Create Account" submit button for student tab', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy();
  });

  it('shows approval notice when Coach tab is selected', () => {
    renderPage();
    fireEvent.click(screen.getByText('Coach'));
    expect(screen.getByText(/admin approval/i)).toBeTruthy();
  });

  it('shows "Request Coach Access" button when Coach tab is active', () => {
    renderPage();
    fireEvent.click(screen.getByText('Coach'));
    expect(screen.getByRole('button', { name: /request coach access/i })).toBeTruthy();
  });

  it('shows email field when Coach tab is selected', () => {
    renderPage();
    fireEvent.click(screen.getByText('Coach'));
    expect(screen.getByPlaceholderText('your@email.com')).toBeTruthy();
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe('RegisterPage validation', () => {
  it('shows error when name is empty', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/name is required/i);
  });

  it('shows error when password is missing', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/password is required/i);
  });

  it('shows error when password is too short', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/at least 8/i);
  });

  it('shows error when passwords do not match', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'different99' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/do not match/i);
  });

  it('shows error when coach email is missing', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /request coach access/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/email.*required/i);
  });

  it('shows error when coach email is invalid', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'notanemail' } });
    fireEvent.click(screen.getByRole('button', { name: /request coach access/i }));
    expect(screen.getByTestId('register-error').textContent).toMatch(/valid email/i);
  });
});

// ── Successful submission ─────────────────────────────────────────────────────

describe('RegisterPage successful submission', () => {
  it('calls register() with correct args on valid student form', async () => {
    mockRegister.mockResolvedValueOnce({});
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    expect(mockRegister).toHaveBeenCalledWith({ name: 'Alice', password: 'password123' });
    expect(mockRegisterCoach).not.toHaveBeenCalled();
  });

  it('shows success message after student registration', async () => {
    mockRegister.mockResolvedValueOnce({});
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('register-success')).toBeTruthy();
    });
  });

  it('calls registerCoach() with name, password, email for coach tab', async () => {
    mockRegisterCoach.mockResolvedValueOnce({ status: 'pending' });
    renderPage();

    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'Bob@example.com' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request coach access/i }));
    });

    expect(mockRegisterCoach).toHaveBeenCalledWith('Bob', 'password123', 'bob@example.com');
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('shows pending success message after coach registration', async () => {
    mockRegisterCoach.mockResolvedValueOnce({ status: 'pending' });
    renderPage();

    fireEvent.click(screen.getByText('Coach'));
    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'bob@example.com' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request coach access/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('register-success').textContent).toMatch(/admin will review/i);
    });
  });
});

// ── Registration disabled (410) ───────────────────────────────────────────────

describe('RegisterPage — registration disabled', () => {
  it('shows friendly closed-registration message on 410 (student)', async () => {
    const err = new Error('Self-registration is disabled. Contact the coach to be added to the roster.');
    err.status = 410;
    mockRegister.mockRejectedValueOnce(err);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create account/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('register-error').textContent).toMatch(/contact your coach/i);
    });
  });

  it('shows coach-specific message on 410 for coach tab', async () => {
    const err = new Error('Self-registration is disabled.');
    err.status = 410;
    mockRegisterCoach.mockRejectedValueOnce(err);

    renderPage();
    fireEvent.click(screen.getByText('Coach'));

    fireEvent.change(screen.getByPlaceholderText('Your display name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('At least 8 characters'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Re-enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('your@email.com'), { target: { value: 'bob@example.com' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request coach access/i }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('register-error').textContent).toMatch(/admin approval/i);
    });
  });
});
