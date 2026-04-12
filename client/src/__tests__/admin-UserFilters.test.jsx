import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import UserFilters from '../components/admin/UserFilters.jsx';

function setup(overrides = {}) {
  const props = {
    search: '',
    onSearchChange: vi.fn(),
    filterRole: '',
    onFilterRoleChange: vi.fn(),
    filterStatus: 'active',
    onFilterStatusChange: vi.fn(),
    loading: false,
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<UserFilters {...props} />);
  return props;
}

describe('UserFilters', () => {
  it('renders search input and status toggles', () => {
    setup();
    expect(screen.getByPlaceholderText(/Search by name or email/)).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
    expect(screen.getByText('SUSPENDED')).toBeTruthy();
    expect(screen.getByText('ARCHIVED')).toBeTruthy();
  });

  it('calls onSearchChange when typing', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: 'bob' } });
    expect(props.onSearchChange).toHaveBeenCalledWith('bob');
  });

  it('toggles status off when clicking active status', () => {
    const props = setup({ filterStatus: 'active' });
    fireEvent.click(screen.getByText('ACTIVE'));
    expect(props.onFilterStatusChange).toHaveBeenCalledWith('');
  });

  it('sets status when clicking inactive tab', () => {
    const props = setup({ filterStatus: 'active' });
    fireEvent.click(screen.getByText('SUSPENDED'));
    expect(props.onFilterStatusChange).toHaveBeenCalledWith('suspended');
  });

  it('invokes onRefresh button', () => {
    const props = setup();
    fireEvent.click(screen.getByLabelText('Refresh'));
    expect(props.onRefresh).toHaveBeenCalled();
  });

  it('disables refresh when loading', () => {
    setup({ loading: true });
    expect(screen.getByLabelText('Refresh').disabled).toBe(true);
  });
});
