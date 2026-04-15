import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SchoolTab from '../SchoolTab';
import * as api from '../../../lib/api';

jest.mock('../../../lib/api');

describe('SchoolTab API Integration', () => {
  const mockSettingsResponse = {
    identity: { name: 'Test School', description: 'A test school' },
    platforms: ['PokerStars', 'GGPoker'],
    staking_defaults: { coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 },
    leaderboard: { primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    api.apiFetch.mockImplementation((path) => {
      if (path === '/api/settings/school') {
        return Promise.resolve(mockSettingsResponse);
      }
      if (path === '/api/admin/groups/my-school') {
        return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true }, groups: [] });
      }
      return Promise.resolve({});
    });
  });

  test('loads school settings on mount', async () => {
    render(<SchoolTab />);

    // Should call GET /api/settings/school
    expect(api.apiFetch).toHaveBeenCalledWith('/api/settings/school');

    // Should display loaded values
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test School')).toBeInTheDocument();
    });
  });

  test('saves identity settings and shows success message', async () => {
    api.apiFetch.mockImplementation((path) => {
      if (path === '/api/settings/school') {
        return Promise.resolve(mockSettingsResponse);
      }
      if (path === '/api/settings/school/identity') {
        return Promise.resolve({ name: 'Updated School', description: 'Updated description' });
      }
      if (path === '/api/admin/groups/my-school') {
        return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true }, groups: [] });
      }
      return Promise.resolve({});
    });

    render(<SchoolTab />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test School')).toBeInTheDocument();
    });

    // Update identity
    const nameInput = screen.getByDisplayValue('Test School');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated School');

    // Click save
    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    fireEvent.click(saveButtons[0]); // First save button for identity

    // Should call PUT /api/settings/school/identity
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        '/api/settings/school/identity',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ name: 'Updated School', description: 'Test School' }),
        })
      );
    });

    // Should show success message
    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeInTheDocument();
    });
  });

  test('shows error message on API failure', async () => {
    api.apiFetch.mockImplementation((path) => {
      if (path === '/api/settings/school') {
        return Promise.resolve(mockSettingsResponse);
      }
      if (path === '/api/admin/groups/my-school') {
        return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true }, groups: [] });
      }
      // Reject on identity save
      if (path === '/api/settings/school/identity') {
        return Promise.reject(new Error('name is required'));
      }
      return Promise.resolve({});
    });

    render(<SchoolTab />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test School')).toBeInTheDocument();
    });

    // Try to save with empty name
    const nameInput = screen.getByDisplayValue('Test School');
    await userEvent.clear(nameInput);

    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    fireEvent.click(saveButtons[0]);

    // Should show error
    await waitFor(() => {
      expect(screen.getByText('name is required')).toBeInTheDocument();
    });
  });

  test('saves staking defaults', async () => {
    api.apiFetch.mockImplementation((path) => {
      if (path === '/api/settings/school') {
        return Promise.resolve(mockSettingsResponse);
      }
      if (path === '/api/settings/school/staking-defaults') {
        return Promise.resolve({ coach_split_pct: 60, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 });
      }
      if (path === '/api/admin/groups/my-school') {
        return Promise.resolve({ schoolId: 'school-1', policy: { enabled: true }, groups: [] });
      }
      return Promise.resolve({});
    });

    render(<SchoolTab />);

    // Wait for load
    await waitFor(() => {
      expect(screen.getByDisplayValue('50')).toBeInTheDocument(); // coach_split_pct
    });

    // Update coach split
    const inputs = screen.getAllByDisplayValue('50');
    const coachSplitInput = inputs[0];
    await userEvent.clear(coachSplitInput);
    await userEvent.type(coachSplitInput, '60');

    // Click staking save button
    const saveButtons = screen.getAllByRole('button', { name: /save/i });
    fireEvent.click(saveButtons[2]); // Third save button for staking

    // Should call PUT /api/settings/school/staking-defaults
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(
        '/api/settings/school/staking-defaults',
        expect.any(Object)
      );
    });
  });

  test('handles no school assigned error', async () => {
    api.apiFetch.mockImplementation((path) => {
      if (path === '/api/settings/school') {
        return Promise.reject(new Error('no_school'));
      }
      return Promise.resolve({});
    });

    render(<SchoolTab />);

    // Should show no school message
    await waitFor(() => {
      expect(screen.getByText(/no school assigned/i)).toBeInTheDocument();
    });
  });
});
