import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('../lib/api.js', () => ({ apiFetch: vi.fn() }));

import DeleteConfirmModal from '../components/admin/DeleteConfirmModal.jsx';
import { apiFetch } from '../lib/api.js';

const USER = { id: 'u1', display_name: 'Alice' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteConfirmModal', () => {
  it('renders warning and user display name', () => {
    render(<DeleteConfirmModal user={USER} onClose={() => {}} onConfirmed={() => {}} />);
    expect(screen.getByText('DELETE ACCOUNT')).toBeTruthy();
    expect(screen.getAllByText(/Alice/).length).toBeGreaterThan(0);
  });

  it('DELETE button disabled until name typed', () => {
    render(<DeleteConfirmModal user={USER} onClose={() => {}} onConfirmed={() => {}} />);
    const del = screen.getByText('DELETE');
    expect(del.disabled).toBe(true);
    const input = screen.getByPlaceholderText('Alice');
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(screen.getByText('DELETE').disabled).toBe(false);
  });

  it('invokes DELETE endpoint and confirms', async () => {
    apiFetch.mockResolvedValue({});
    const onConfirmed = vi.fn();
    const onClose = vi.fn();
    render(<DeleteConfirmModal user={USER} onClose={onClose} onConfirmed={onConfirmed} />);
    fireEvent.change(screen.getByPlaceholderText('Alice'), { target: { value: 'Alice' } });
    fireEvent.click(screen.getByText('DELETE'));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/admin/users/u1', { method: 'DELETE' });
      expect(onConfirmed).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('cancel button invokes onClose', () => {
    const onClose = vi.fn();
    render(<DeleteConfirmModal user={USER} onClose={onClose} onConfirmed={() => {}} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
