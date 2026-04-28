/**
 * SchoolTab.GroupsSection.test.jsx
 *
 * Tests for the expandable member panel in GroupsSection (SchoolTab):
 *  1. Groups render without member panel initially
 *  2. Clicking a group row expands the member panel
 *  3. Clicking same group again collapses the panel
 *  4. Member panel shows fetched members (Alice visible)
 *  5. Remove button calls DELETE endpoint; member removed from list
 *  6. "Add" button disabled when no student selected
 *  7. Selecting a student and clicking Add calls POST endpoint; student appears in list
 *  8. Add student select does NOT show students already in the group
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockApiFetch = vi.fn();
vi.mock('../lib/api', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// SchoolTab default export includes the full page; we import it directly
import SchoolTab from '../pages/settings/SchoolTab.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const GROUPS = [
  { id: 'grp-1', name: 'Alpha', color: '#58a6ff', member_count: 1 },
  { id: 'grp-2', name: 'Beta',  color: '#3fb950', member_count: 0 },
];

const ALL_STUDENTS = [
  { id: 'stu-1', display_name: 'Alice' },
  { id: 'stu-2', display_name: 'Bob' },
  { id: 'stu-3', display_name: 'Carol' },
];

const GRP1_MEMBERS = [
  { id: 'stu-1', display_name: 'Alice', role: 'coached_student' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockApiFetch.mockImplementation((url) => {
    // School settings
    if (url === '/api/settings/school') {
      return Promise.resolve({
        identity: { id: 'school-1', name: 'Test School', description: '' },
        platforms: [],
        staking_defaults: { coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 },
        leaderboard: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' },
      });
    }
    if (url === '/api/admin/groups/my-school') {
      return Promise.resolve({
        schoolId: 'school-1',
        policy: { enabled: true, max_groups: null, max_players_per_group: null },
        groups: GROUPS,
      });
    }
    if (url === '/api/admin/users?role=coached_student') {
      return Promise.resolve({ players: ALL_STUDENTS });
    }
    if (url === '/api/admin/groups/grp-1/members') {
      return Promise.resolve({ members: GRP1_MEMBERS });
    }
    if (url === '/api/admin/groups/grp-2/members') {
      return Promise.resolve({ members: [] });
    }
    return Promise.resolve({});
  });
}

async function renderSchoolTab() {
  let result;
  await act(async () => {
    result = render(
      <MemoryRouter>
        <SchoolTab />
      </MemoryRouter>
    );
  });
  return result;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GroupsSection — expandable member panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('1. renders group rows without member panels initially', async () => {
    await renderSchoolTab();

    expect(screen.getByTestId('group-row-grp-1')).toBeInTheDocument();
    expect(screen.getByTestId('group-row-grp-2')).toBeInTheDocument();
    expect(screen.queryByTestId('group-members-panel-grp-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('group-members-panel-grp-2')).not.toBeInTheDocument();
  });

  it('2. clicking a group row expands the member panel', async () => {
    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('group-members-panel-grp-1')).toBeInTheDocument();
    });
  });

  it('3. clicking the same group row again collapses the panel', async () => {
    await renderSchoolTab();

    // Expand
    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });
    await waitFor(() => expect(screen.getByTestId('group-members-panel-grp-1')).toBeInTheDocument());

    // Collapse
    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('group-members-panel-grp-1')).not.toBeInTheDocument();
    });
  });

  it('4. expanded member panel shows fetched members', async () => {
    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('member-row-stu-1')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
    });
  });

  it('5. remove button calls DELETE and removes member from list', async () => {
    mockApiFetch.mockImplementation((url, opts) => {
      if (url === '/api/settings/school') return Promise.resolve({ identity: { id: 'school-1', name: 'Test School', description: '' }, platforms: [], staking_defaults: { coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 }, leaderboard: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' } });
      if (url === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: null, max_players_per_group: null }, groups: GROUPS });
      if (url === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (url === '/api/admin/groups/grp-1/members') return Promise.resolve({ members: GRP1_MEMBERS });
      if (url === '/api/admin/groups/grp-2/members') return Promise.resolve({ members: [] });
      if (url === '/api/admin/groups/grp-1/members/stu-1' && opts?.method === 'DELETE') return Promise.resolve({ success: true });
      return Promise.resolve({});
    });

    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => expect(screen.getByTestId('remove-member-stu-1')).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByTestId('remove-member-stu-1'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('member-row-stu-1')).not.toBeInTheDocument();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/groups/grp-1/members/stu-1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('6. Add button is disabled when no student is selected', async () => {
    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => expect(screen.getByTestId('add-member-btn-grp-1')).toBeInTheDocument());

    const addBtn = screen.getByTestId('add-member-btn-grp-1');
    expect(addBtn).toBeDisabled();
  });

  it('7. selecting a student and clicking Add calls POST; student appears in list', async () => {
    mockApiFetch.mockImplementation((url, opts) => {
      if (url === '/api/settings/school') return Promise.resolve({ identity: { id: 'school-1', name: 'Test School', description: '' }, platforms: [], staking_defaults: { coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 }, leaderboard: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' } });
      if (url === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: null, max_players_per_group: null }, groups: GROUPS });
      if (url === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (url === '/api/admin/groups/grp-1/members') return Promise.resolve({ members: GRP1_MEMBERS });
      if (url === '/api/admin/groups/grp-2/members') return Promise.resolve({ members: [] });
      if (url === '/api/admin/groups/grp-1/members' && opts?.method === 'POST') return Promise.resolve({ success: true });
      return Promise.resolve({});
    });

    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => expect(screen.getByTestId('add-member-select-grp-1')).toBeInTheDocument());

    // Select Bob (stu-2)
    await act(async () => {
      fireEvent.change(screen.getByTestId('add-member-select-grp-1'), { target: { value: 'stu-2' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-member-btn-grp-1'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('member-row-stu-2')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/admin/groups/grp-1/members',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerId: 'stu-2' }),
      })
    );
  });

  it('8. add student select does NOT show students already in the group', async () => {
    await renderSchoolTab();

    await act(async () => {
      fireEvent.click(screen.getByTestId('group-row-grp-1'));
    });

    await waitFor(() => expect(screen.getByTestId('add-member-select-grp-1')).toBeInTheDocument());

    const select = screen.getByTestId('add-member-select-grp-1');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);

    // Alice (stu-1) is already a member — must not appear
    expect(options).not.toContain('stu-1');
    // Bob and Carol should appear
    expect(options).toContain('stu-2');
    expect(options).toContain('stu-3');
  });
});
