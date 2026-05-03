import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('SidebarV3 — footer copy', () => {
  it('Live footer says "Deal Next Hand →" (C1)', () => {
    const data = { ...SIDEBAR_V3_DATA, gameState: { ...SIDEBAR_V3_DATA.gameState, phase: 'waiting' } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /Deal Next Hand →/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Next Hand →$/ })).toBeNull();
  });

  it('History footer says "Open in Review →" (C5)', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} initialTab="history" />);
    expect(screen.getByRole('button', { name: /Open in Review →/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Review Selected →/ })).toBeNull();
  });

  it('Review footer shows "← Back" and "Back to Live" (C6, C7)', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} initialTab="review" />);
    expect(screen.getByRole('button', { name: /← Back$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back to Live/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Exit Replay → Live/ })).toBeNull();
  });
});
