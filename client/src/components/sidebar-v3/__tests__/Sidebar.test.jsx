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
    // BlindsSection's "Current Level" card title is unique to TabSetup
    expect(screen.getByText('Current Level')).toBeInTheDocument();
  });

  it('migrates legacy localStorage value "settings" to "setup" on mount', () => {
    localStorage.setItem('fs.sb3.tab', 'settings');
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    expect(localStorage.getItem('fs.sb3.tab')).toBe('setup');
  });

  it('treats no localStorage value as initialTab', () => {
    localStorage.removeItem('fs.sb3.tab');
    render(<SidebarV3 data={SIDEBAR_V3_DATA} initialTab="drills" />);
    // does NOT auto-write — only on user click
    expect(localStorage.getItem('fs.sb3.tab')).toBeNull();
  });
});

describe('SidebarV3 — Header', () => {
  it('does not render any subtitle text below the FeltSide logo', () => {
    const { container } = render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    const logo = container.querySelector('.sb-logo');
    expect(logo).toBeInTheDocument();
    expect(logo.querySelector('small')).toBeNull();
  });
});

describe('SidebarV3 — StatusPill', () => {
  it('renders DRILL state with correct label', () => {
    const drillData = { ...SIDEBAR_V3_DATA, status: 'drill' };
    render(<SidebarV3 data={drillData} />);
    expect(screen.getByText('DRILL')).toBeInTheDocument();
  });
});
