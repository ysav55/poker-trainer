import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import UserTableRow, { StatusBadge, RolePill, Pagination } from '../components/admin/UserTableRow.jsx';

const USER = {
  id: 'u1',
  display_name: 'Alice',
  email: 'alice@x.com',
  role: 'coach',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  last_seen: '2026-04-01T00:00:00Z',
  coach_name: null,
};

describe('StatusBadge', () => {
  it('renders uppercased status', () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });
  it('renders dash when status falsy', () => {
    render(<StatusBadge status={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('RolePill', () => {
  it('renders role', () => {
    render(<RolePill role="admin" />);
    expect(screen.getByText('admin')).toBeTruthy();
  });
  it('renders null when no role', () => {
    const { container } = render(<RolePill role={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Pagination', () => {
  it('renders nothing when single page', () => {
    const { container } = render(
      <Pagination page={0} total={5} pageSize={10} onPage={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
  it('renders Prev/Next when multi-page', () => {
    render(<Pagination page={0} total={50} pageSize={10} onPage={() => {}} />);
    expect(screen.getByText(/Prev/)).toBeTruthy();
    expect(screen.getByText(/Next/)).toBeTruthy();
  });
  it('invokes onPage with next page', () => {
    const onPage = vi.fn();
    render(<Pagination page={0} total={50} pageSize={10} onPage={onPage} />);
    screen.getByText(/Next/).click();
    expect(onPage).toHaveBeenCalledWith(1);
  });
});

describe('UserTableRow', () => {
  it('renders user name and email', () => {
    render(
      <UserTableRow
        user={USER}
        index={0}
        currentUserRole="admin"
        gridTemplateColumns="1fr"
        isLast={false}
        onView={() => {}}
        onEdit={() => {}}
        onResetPassword={() => {}}
        onSuspend={() => {}}
        onDelete={() => {}}
      />
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('alice@x.com')).toBeTruthy();
    expect(screen.getByText('coach')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('calls onView when name clicked', () => {
    const onView = vi.fn();
    render(
      <UserTableRow
        user={USER}
        index={0}
        currentUserRole="admin"
        gridTemplateColumns="1fr"
        isLast={false}
        onView={onView}
        onEdit={() => {}}
        onResetPassword={() => {}}
        onSuspend={() => {}}
        onDelete={() => {}}
      />
    );
    screen.getByText('Alice').click();
    expect(onView).toHaveBeenCalledWith('u1');
  });
});
