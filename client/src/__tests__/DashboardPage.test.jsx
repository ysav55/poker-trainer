import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../contexts/LobbyContext.jsx', () => ({
  useLobby: () => ({ activeTables: [], refreshTables: vi.fn() }),
}));

vi.mock('../lib/api.js', () => ({
  apiFetch: () => Promise.resolve({}),
}));

import { useAuth } from '../contexts/AuthContext.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';

function renderPage(role = 'coach') {
  useAuth.mockReturnValue({
    user: { id: 'u1', name: 'Jo', role },
    hasPermission: () => true,
  });
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  it('renders page title', () => {
    renderPage('coach');
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('shows coach quick links for coaches', () => {
    renderPage('coach');
    expect(screen.getByText('Create Table')).toBeTruthy();
    expect(screen.getByText('Students')).toBeTruthy();
    expect(screen.getByText('Scenarios')).toBeTruthy();
  });

  it('shows student quick links for students', () => {
    renderPage('coached_student');
    expect(screen.getByText('Join Table')).toBeTruthy();
    expect(screen.getByText('Bot Practice')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
  });

  it('shows admin quick links (same as coach)', () => {
    renderPage('admin');
    expect(screen.getByText('Create Table')).toBeTruthy();
  });
});
