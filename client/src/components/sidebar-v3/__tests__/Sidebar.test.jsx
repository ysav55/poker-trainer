import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SidebarV3 from '../Sidebar.jsx';
import { SIDEBAR_V3_DATA } from '../data.js';

describe('SidebarV3 — TABS', () => {
  beforeEach(() => {
    try { localStorage.clear(); } catch {}
  });

  afterEach(() => cleanup());

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

describe('SidebarV3 — Drills footer removed', () => {
  it('Drills tab has no Clear button', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} initialTab="drills" />);
    expect(screen.queryByRole('button', { name: /^Clear$/ })).toBeNull();
  });
  it('Drills tab has no Launch Hand button', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} initialTab="drills" />);
    expect(screen.queryByRole('button', { name: /Launch Hand →/ })).toBeNull();
  });
});

describe('SidebarV3 — Tag Hand wiring', () => {
  beforeEach(() => cleanup());

  it('clicking Tag Hand opens the dialog when a current hand exists', () => {
    const data = {
      ...SIDEBAR_V3_DATA,
      gameState: { ...SIDEBAR_V3_DATA.gameState, hand_id: 'h-current', phase: 'flop' },
      availableHandTags: ['BLUFF', 'VALUE'],
    };
    const updateHandTags = vi.fn();
    render(<SidebarV3 data={data} emit={{ updateHandTags, togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /Tag Hand/i }));
    expect(screen.getByRole('dialog', { name: /Tag this hand/i })).toBeInTheDocument();
  });

  it('Tag Hand button is disabled when no current hand_id', () => {
    const data = { ...SIDEBAR_V3_DATA, gameState: { ...SIDEBAR_V3_DATA.gameState, hand_id: null } };
    render(<SidebarV3 data={data} emit={{ updateHandTags: vi.fn(), togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /Tag Hand/i })).toBeDisabled();
  });

  it('Save inside dialog emits updateHandTags(handId, tags)', () => {
    const data = {
      ...SIDEBAR_V3_DATA,
      gameState: { ...SIDEBAR_V3_DATA.gameState, hand_id: 'h-x' },
      availableHandTags: ['BLUFF'],
    };
    const updateHandTags = vi.fn();
    render(<SidebarV3 data={data} emit={{ updateHandTags, togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /Tag Hand/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BLUFF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateHandTags).toHaveBeenCalledWith('h-x', ['BLUFF']);
  });
});

describe('SidebarV3 — Notes button (Live footer)', () => {
  it('clicking Notes toggles the panel', () => {
    const data = { ...SIDEBAR_V3_DATA, gameState: { ...SIDEBAR_V3_DATA.gameState, hand_id: 'h-current', phase: 'flop', players: [{ id: 'p1', name: 'Alice', stableId: 'stable1' }], current_turn: 'p1', board: ['AS', 'KS', 'QS'] } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: /📝 Notes/ }));
    // Panel renders the Notes title from NotesPanel
    expect(screen.getByText(/^Notes$/)).toBeInTheDocument();
  });

  it('Notes button is disabled when no current hand_id', () => {
    const data = { ...SIDEBAR_V3_DATA, gameState: { ...SIDEBAR_V3_DATA.gameState, hand_id: null } };
    render(<SidebarV3 data={data} emit={{ togglePause: vi.fn(), startConfiguredHand: vi.fn() }} />);
    expect(screen.getByRole('button', { name: /📝 Notes/ })).toBeDisabled();
  });
});

describe('SidebarV3 — collapse', () => {
  beforeEach(() => { try { localStorage.clear(); } catch {} });

  it('renders an edge collapse button', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    expect(screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i })).toBeInTheDocument();
  });

  it('collapsing hides the body and footer', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(screen.queryByText(/Live/)).toBeNull();  // tab bar hidden
  });

  it('collapsed state persists to localStorage', () => {
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /collapse sidebar/i }));
    expect(localStorage.getItem('fs.sb3.collapsed')).toBe('1');
  });

  it('restores collapsed state from localStorage on mount', () => {
    localStorage.setItem('fs.sb3.collapsed', '1');
    render(<SidebarV3 data={SIDEBAR_V3_DATA} />);
    expect(screen.queryByRole('tab', { name: /Live/ })).toBeNull();
    expect(screen.getByRole('button', { name: /expand sidebar/i })).toBeInTheDocument();
  });
});
