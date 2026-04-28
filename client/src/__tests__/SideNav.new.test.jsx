import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../contexts/AuthContext.jsx';
import SideNav from '../components/SideNav/SideNav.jsx';

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });
});

function renderNav(role = 'coach', chipBalance = 1000) {
  useAuth.mockReturnValue({
    user: { id: 'u1', name: 'Test Coach', role },
  });
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <SideNav chipBalance={chipBalance} />
    </MemoryRouter>
  );
}

describe('SideNav', () => {
  it('shows HOME items for all roles', () => {
    renderNav('coached_student');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    expect(screen.getByText('Tables')).toBeTruthy();
    expect(screen.getByText('Tournaments')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Leaderboard')).toBeTruthy();
  });

  it('shows COACHING section for coaches', () => {
    renderNav('coach');
    expect(screen.getByText('Students')).toBeTruthy();
    expect(screen.getByText('Groups')).toBeTruthy();
    expect(screen.getByText('Scenarios')).toBeTruthy();
  });

  it('hides COACHING section for students', () => {
    renderNav('coached_student');
    expect(screen.queryByText('Students')).toBeNull();
    expect(screen.queryByText('Groups')).toBeNull();
    expect(screen.queryByText('Scenarios')).toBeNull();
  });

  it('always shows Settings', () => {
    renderNav('solo_student');
    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('collapse toggle hides labels', () => {
    renderNav('coach');
    expect(screen.getByText('Dashboard')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Collapse sidebar'));
    expect(screen.queryByText('Dashboard')).toBeNull();
  });
});
