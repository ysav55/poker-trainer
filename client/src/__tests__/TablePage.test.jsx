/**
 * TablePage.test.jsx
 *
 * Tests for `actingAsCoach` role expansion and replay prop wiring:
 *  1. admin user gets actingAsCoach = true on a coached_cash table → CoachSidebar renders
 *  2. superadmin user gets actingAsCoach = true on a coached_cash table → CoachSidebar renders
 *  3. coach user still gets actingAsCoach = true (regression guard)
 *  4. student user does NOT get actingAsCoach on coached_cash table
 *  5. admin on non-coached_cash table does NOT get actingAsCoach → CoachSidebar hidden
 *  6. Replay props (replayExit, replayBranch, etc.) are wired to CoachSidebar via TableContext
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => mockNavigate };
});

// Mock heavy components to keep tests fast
vi.mock('../components/PokerTable.jsx', () => ({
  default: () => <div data-testid="poker-table" />,
}));

const mockCoachSidebar = vi.fn(() => <div data-testid="coach-sidebar" />);
vi.mock('../components/CoachSidebar.jsx', () => ({
  default: (props) => mockCoachSidebar(props),
}));

vi.mock('../components/TournamentInfoPanel.jsx', () => ({ default: () => null }));
vi.mock('../components/TournamentTopBar.jsx', () => ({ default: () => null }));
vi.mock('../components/TournamentSidebar.jsx', () => ({ default: () => null }));
vi.mock('../components/ManagedByBadge.jsx', () => ({ default: () => null }));
vi.mock('../components/ScenarioBuilder.jsx', () => ({ default: () => null }));

// Mock replay functions (returned by useReplay via TableContext)
const mockReplayFns = {
  replayMeta: null,
  reset: vi.fn(),
  loadReplay: vi.fn(),
  replayStepForward: vi.fn(),
  replayStepBack: vi.fn(),
  replayJumpTo: vi.fn(),
  replayBranch: vi.fn(),
  replayUnbranch: vi.fn(),
  replayExit: vi.fn(),
};

// ── TableContext mock ─────────────────────────────────────────────────────────
// We mock the whole context so we can control gameState, role, and replay.

let _mockUser = { id: 'user-1', role: 'coach', name: 'Coach' };
let _mockTableMode = 'coached_cash';
let _mockIsCoach = true;

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: _mockUser }),
}));

vi.mock('../hooks/usePreferences.js', () => ({
  usePreferences: () => ({ bbView: false }),
}));

// Build a factory to generate the mock TableContext value
function makeTableContextValue(overrides = {}) {
  return {
    tableId: 'table-1',
    socket: {
      socketRef: { current: null },
      emit: vi.fn(),
      connected: true,
      isSpectator: false,
    },
    gameState: {
      // useGameState return value shape
      gameState: {
        phase: 'waiting',
        table_mode: _mockTableMode,
        players: [],
        board: [],
        pot: 0,
        paused: false,
        can_undo: false,
        can_rollback_street: false,
        replay_mode: { active: false },
      },
      isCoach: _mockIsCoach,
      isSpectator: false,
      actionTimer: null,
      equityData: null,
      equityEnabled: false,
      setEquityEnabled: vi.fn(),
      sharedRange: null,
      toggleEquityDisplay: vi.fn(),
      toggleRangeDisplay: vi.fn(),
      toggleHeatmapDisplay: vi.fn(),
      shareRange: vi.fn(),
      clearSharedRange: vi.fn(),
      tableMode: _mockTableMode,
      equitySettings: {},
    },
    playlist: { playlists: [] },
    notifications: { errors: [], notifications: [] },
    replay: mockReplayFns,
    ...overrides,
  };
}

vi.mock('../contexts/TableContext.jsx', () => ({
  TableProvider: ({ children }) => children,
  useTable: () => makeTableContextValue(),
}));

import TablePage from '../pages/TablePage.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderTablePage(role = 'coach', tableMode = 'coached_cash', hookIsCoach = true) {
  _mockUser = { id: 'user-1', role, name: 'User' };
  _mockTableMode = tableMode;
  _mockIsCoach = hookIsCoach;
  mockCoachSidebar.mockClear();
  return render(
    <MemoryRouter initialEntries={['/table/table-1']}>
      <Routes>
        <Route path="/table/:tableId" element={<TablePage />} />
      </Routes>
    </MemoryRouter>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TablePage actingAsCoach role expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('coach role on coached_cash → CoachSidebar renders', () => {
    renderTablePage('coach', 'coached_cash', true);
    expect(screen.getByTestId('coach-sidebar')).toBeTruthy();
  });

  it('admin role on coached_cash → CoachSidebar renders', () => {
    renderTablePage('admin', 'coached_cash', false);
    expect(screen.getByTestId('coach-sidebar')).toBeTruthy();
  });

  it('superadmin role on coached_cash → CoachSidebar renders', () => {
    renderTablePage('superadmin', 'coached_cash', false);
    expect(screen.getByTestId('coach-sidebar')).toBeTruthy();
  });

  it('coached_student role on coached_cash → CoachSidebar is hidden', () => {
    renderTablePage('coached_student', 'coached_cash', false);
    expect(screen.queryByTestId('coach-sidebar')).toBeNull();
  });

  it('admin role on uncoached_cash → CoachSidebar is hidden', () => {
    renderTablePage('admin', 'uncoached_cash', false);
    expect(screen.queryByTestId('coach-sidebar')).toBeNull();
  });

  it('admin role on tournament → CoachSidebar is hidden', () => {
    renderTablePage('admin', 'tournament', false);
    expect(screen.queryByTestId('coach-sidebar')).toBeNull();
  });
});

describe('TablePage replay prop wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes replayExit from TableContext replay to CoachSidebar', () => {
    renderTablePage('coach', 'coached_cash', true);
    const calls = mockCoachSidebar.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const props = calls[calls.length - 1][0];
    expect(typeof props.replayExit).toBe('function');
    expect(props.replayExit).toBe(mockReplayFns.replayExit);
  });

  it('passes replayBranch from TableContext replay to CoachSidebar', () => {
    renderTablePage('coach', 'coached_cash', true);
    const props = mockCoachSidebar.mock.calls[mockCoachSidebar.mock.calls.length - 1][0];
    expect(props.replayBranch).toBe(mockReplayFns.replayBranch);
  });

  it('passes replayUnbranch from TableContext replay to CoachSidebar', () => {
    renderTablePage('coach', 'coached_cash', true);
    const props = mockCoachSidebar.mock.calls[mockCoachSidebar.mock.calls.length - 1][0];
    expect(props.replayUnbranch).toBe(mockReplayFns.replayUnbranch);
  });

  it('passes replayStepForward and replayStepBack to CoachSidebar', () => {
    renderTablePage('coach', 'coached_cash', true);
    const props = mockCoachSidebar.mock.calls[mockCoachSidebar.mock.calls.length - 1][0];
    expect(props.replayStepForward).toBe(mockReplayFns.replayStepForward);
    expect(props.replayStepBack).toBe(mockReplayFns.replayStepBack);
  });

  it('admin user also receives replay props when actingAsCoach', () => {
    renderTablePage('admin', 'coached_cash', false);
    const props = mockCoachSidebar.mock.calls[mockCoachSidebar.mock.calls.length - 1][0];
    expect(props.replayBranch).toBe(mockReplayFns.replayBranch);
    expect(props.replayExit).toBe(mockReplayFns.replayExit);
  });
});
