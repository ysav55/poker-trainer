import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('../lib/api.js', () => ({ apiFetch: vi.fn() }));

import ResetPasswordModal from '../components/admin/ResetPasswordModal.jsx';
import { apiFetch } from '../lib/api.js';

const USER = { id: 'u1', display_name: 'Alice' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ResetPasswordModal', () => {
  it('renders title and target user', () => {
    render(<ResetPasswordModal user={USER} onClose={() => {}} />);
    expect(screen.getByText('RESET PASSWORD')).toBeTruthy();
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('close button invokes onClose', () => {
    const onClose = vi.fn();
    render(<ResetPasswordModal user={USER} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('submit calls apiFetch with password', async () => {
    apiFetch.mockResolvedValue({});
    const onSuccess = vi.fn();
    render(<ResetPasswordModal user={USER} onClose={() => {}} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByText('RESET'));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/admin/users/u1/reset-password',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  it('shows error when API fails', async () => {
    apiFetch.mockRejectedValue(new Error('Boom'));
    render(<ResetPasswordModal user={USER} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('New password'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('RESET'));
    await waitFor(() => {
      expect(screen.getByText('Boom')).toBeTruthy();
    });
  });

  it('RESET button disabled when password empty', () => {
    render(<ResetPasswordModal user={USER} onClose={() => {}} />);
    expect(screen.getByText('RESET').disabled).toBe(true);
  });
});
