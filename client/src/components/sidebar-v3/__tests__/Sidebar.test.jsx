import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SidebarV3 from '../Sidebar.jsx';
import { SIDEBAR_V3_DATA } from '../data.js';

describe('SidebarV3 — TABS', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });

  it('renders the Setup tab with id "setup"', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    const setupTab = screen.getByText('Setup');
    fireEvent.click(setupTab);
    expect(localStorage.getItem('fs.sb3.tab')).toBe('setup');
  });

  it('clicking Setup tab renders the Setup tab body', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    fireEvent.click(screen.getByText('Setup'));
    // BlindsSection's "Current Level" card title is unique to TabSettings
    expect(screen.getByText('Current Level')).toBeInTheDocument();
  });
});
