import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import NavItem from '../components/SideNav/NavItem.jsx';
import { Home } from 'lucide-react';

function renderItem(props = {}) {
  const defaults = {
    icon: Home,
    label: 'Dashboard',
    path: '/dashboard',
    expanded: true,
    active: false,
  };
  return render(
    <MemoryRouter>
      <NavItem {...defaults} {...props} />
    </MemoryRouter>
  );
}

describe('NavItem', () => {
  it('renders label when expanded', () => {
    renderItem({ expanded: true });
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('hides label when collapsed', () => {
    renderItem({ expanded: false });
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('renders a link to the correct path', () => {
    renderItem({ path: '/dashboard' });
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/dashboard');
  });

  it('shows badge dot when badge is true', () => {
    renderItem({ badge: true });
    expect(screen.getByTestId('nav-badge')).toBeTruthy();
  });

  it('does not show badge dot when badge is falsy', () => {
    renderItem({ badge: false });
    expect(screen.queryByTestId('nav-badge')).toBeNull();
  });

  it('applies active styling (gold left border)', () => {
    renderItem({ active: true });
    const link = screen.getByRole('link');
    // jsdom normalizes hex to rgb, so check for either form
    const border = link.style.borderLeft;
    const hasGold = border.includes('#d4af37') || border.includes('rgb(212, 175, 55)');
    expect(hasGold).toBe(true);
  });
});
