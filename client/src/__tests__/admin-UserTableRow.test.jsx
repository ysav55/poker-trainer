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
      <Pagination page={0} pageCount={1} onPrev={() => {}} onNext={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });
  it('renders Prev/Next when multi-page', () => {
    render(<Pagination page={0} pageCount={5} onPrev={() => {}} onNext={() => {}} />);
    expect(screen.getByText(/Prev/)).toBeTruthy();
    expect(screen.getByText(/Next/)).toBeTruthy();
  });
  it('invokes onNext when Next clicked', () => {
    const onNext = vi.fn();
    render(<Pagination page={0} pageCount={5} onPrev={() => {}} onNext={onNext} />);
    screen.getByText(/Next/).click();
    expect(onNext).toHaveBeenCalled();
  });
});

describe('UserTableRow', () => {
  it('renders user name and email', () => {
    render(
      <table><tbody>
        <UserTableRow user={USER} onClick={() => {}} />
      </tbody></table>
    );
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('alice@x.com')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('calls onClick when row clicked', () => {
    const onClick = vi.fn();
    render(
      <table><tbody>
        <UserTableRow user={USER} onClick={onClick} />
      </tbody></table>
    );
    screen.getByText('Alice').click();
    expect(onClick).toHaveBeenCalledWith('u1');
  });
});
