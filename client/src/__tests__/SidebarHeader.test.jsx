import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Jo', role: 'coach' },
  }),
}));

import SidebarHeader from '../components/SideNav/SidebarHeader.jsx';

describe('SidebarHeader', () => {
  it('shows user name when expanded', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} />);
    expect(screen.getByText('Jo')).toBeTruthy();
  });

  it('shows chip balance formatted', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} />);
    expect(screen.getByText('1,270')).toBeTruthy();
  });

  it('shows N/A when chipBalance is null', () => {
    render(<SidebarHeader expanded={true} chipBalance={null} />);
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('hides name when collapsed', () => {
    render(<SidebarHeader expanded={false} chipBalance={1270} />);
    expect(screen.queryByText('Jo')).toBeNull();
  });

  it('shows school stats for coaches', () => {
    render(<SidebarHeader expanded={true} chipBalance={1270} studentsOnline={3} activeTables={2} />);
    expect(screen.getByText(/3 online/)).toBeTruthy();
  });
});
