import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

// Import after mocks are set up
import SchoolTab from '../SchoolTab.jsx';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const SETTINGS_RESPONSE = {
  identity: { id: 'school-1', name: 'Test School', description: 'A test school' },
  platforms: ['PokerStars', 'GGPoker'],
  staking_defaults: { coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 },
  leaderboard: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' },
};

const GROUPS = [
  { id: 'g1', name: 'Group 1', color: '#58a6ff', member_count: 1 },
];

const ALL_STUDENTS = [
  { id: 's1', display_name: 'Student 1' },
  { id: 's2', display_name: 'Student 2' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockApiFetch.mockImplementation((path) => {
    if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
    if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: 5 }, groups: GROUPS });
    if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
    if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }] });
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

describe('SchoolTab API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('loads school settings on mount', async () => {
    await renderSchoolTab();

    // Should call GET /api/settings/school
    expect(mockApiFetch).toHaveBeenCalledWith('/api/settings/school');

    // Should display loaded values
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test School')).toBeInTheDocument();
    });
  });
});

describe('GroupsSection Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('shows error when rename fails', async () => {
    mockApiFetch.mockImplementation((path, opts) => {
      if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
      if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: 5 }, groups: GROUPS });
      if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }] });
      // PATCH rename fails
      if (path === '/api/admin/groups/g1' && opts?.method === 'PATCH') return Promise.reject(new Error('Group name must be unique'));
      return Promise.resolve({});
    });

    await renderSchoolTab();

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument();
    });

    // Double-click to enter rename mode
    const groupName = screen.getByText('Group 1');
    await act(async () => {
      fireEvent.doubleClick(groupName);
    });

    // Change name and blur to trigger save
    await waitFor(() => {
      const inputs = screen.getAllByDisplayValue('Group 1');
      const renameInput = inputs.find(input => input.type !== 'color');
      expect(renameInput).toBeDefined();
      if (renameInput) {
        fireEvent.change(renameInput, { target: { value: 'Duplicate Name' } });
        fireEvent.blur(renameInput);
      }
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Group name must be unique')).toBeInTheDocument();
    });
  });

  it('shows error when delete fails', async () => {
    mockApiFetch.mockImplementation((path, opts) => {
      if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
      if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: 5 }, groups: GROUPS });
      if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }] });
      // DELETE fails
      if (path === '/api/admin/groups/g1' && opts?.method === 'DELETE') return Promise.reject(new Error('Cannot delete group with active members'));
      return Promise.resolve({});
    });

    // Mock window.confirm to return true
    window.confirm = vi.fn(() => true);

    await renderSchoolTab();

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument();
    });

    // Click delete button
    const deleteBtn = screen.getByTitle('Delete group');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Cannot delete group with active members')).toBeInTheDocument();
    });
  });

  it('shows error when add member fails', async () => {
    mockApiFetch.mockImplementation((path, opts) => {
      if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
      if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: 5 }, groups: GROUPS });
      if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (path === '/api/admin/groups/g1/members' && opts?.method === 'POST') return Promise.reject(new Error('Student already in group'));
      if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }] });
      return Promise.resolve({});
    });

    await renderSchoolTab();

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument();
    });

    // Expand group
    const groupRow = screen.getByTestId('group-row-g1');
    await act(async () => {
      fireEvent.click(groupRow);
    });

    // Wait for member panel and select
    await waitFor(() => {
      expect(screen.getByTestId('add-member-select-g1')).toBeInTheDocument();
    });

    // Select a student
    const select = screen.getByTestId('add-member-select-g1');
    await act(async () => {
      fireEvent.change(select, { target: { value: 's2' } });
    });

    // Click add button
    const addBtn = screen.getByTestId('add-member-btn-g1');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Student already in group')).toBeInTheDocument();
    });
  });

  it('shows error when remove member fails', async () => {
    const groupsWithMembers = [
      { id: 'g1', name: 'Group 1', color: '#58a6ff', member_count: 2 },
    ];

    mockApiFetch.mockImplementation((path, opts) => {
      if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
      if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true }, groups: groupsWithMembers });
      if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }, { id: 's2', display_name: 'Student 2' }] });
      if (path === '/api/admin/groups/g1/members/s1' && opts?.method === 'DELETE') return Promise.reject(new Error('Cannot remove member'));
      return Promise.resolve({});
    });

    await renderSchoolTab();

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument();
    });

    // Expand group
    const groupRow = screen.getByTestId('group-row-g1');
    await act(async () => {
      fireEvent.click(groupRow);
    });

    // Wait for members to load
    await waitFor(() => {
      expect(screen.getByTestId('member-row-s1')).toBeInTheDocument();
    });

    // Click remove button
    const removeBtn = screen.getByTestId('remove-member-s1');
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Cannot remove member')).toBeInTheDocument();
    });
  });

  it('prevents race condition: rapid add clicks do not cause duplicates', async () => {
    let callCount = 0;
    mockApiFetch.mockImplementation((path, opts) => {
      if (path === '/api/settings/school') return Promise.resolve(SETTINGS_RESPONSE);
      if (path === '/api/admin/groups/my-school') return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true, max_groups: 5 }, groups: GROUPS });
      if (path === '/api/admin/users?role=coached_student') return Promise.resolve({ players: ALL_STUDENTS });
      if (path === '/api/admin/groups/g1/members' && opts?.method === 'POST') {
        callCount++;
        // Simulate slow API response
        return new Promise(resolve => {
          setTimeout(() => { resolve({}); }, 200);
        });
      }
      if (path === '/api/admin/groups/g1/members') return Promise.resolve({ members: [{ id: 's1', display_name: 'Student 1' }] });
      return Promise.resolve({});
    });

    await renderSchoolTab();

    // Wait for groups to load
    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument();
    });

    // Expand group
    const groupRow = screen.getByTestId('group-row-g1');
    await act(async () => {
      fireEvent.click(groupRow);
    });

    // Wait for member panel and select
    await waitFor(() => {
      expect(screen.getByTestId('add-member-select-g1')).toBeInTheDocument();
    });

    // Select a student
    const select = screen.getByTestId('add-member-select-g1');
    await act(async () => {
      fireEvent.change(select, { target: { value: 's2' } });
    });

    // Get add button and click it
    const addBtn = screen.getByTestId('add-member-btn-g1');
    await act(async () => {
      fireEvent.click(addBtn);
    });

    // Button should be disabled immediately (race condition guard)
    await waitFor(() => {
      expect(addBtn).toBeDisabled();
    });

    // Try clicking while disabled (should have no effect since button is disabled)
    fireEvent.click(addBtn);
    fireEvent.click(addBtn);

    // Wait for operation to complete
    await waitFor(() => {
      expect(addBtn).not.toBeDisabled();
    });

    // Should only have made one API call for adding despite rapid clicks
    expect(callCount).toBe(1);
  });
});

