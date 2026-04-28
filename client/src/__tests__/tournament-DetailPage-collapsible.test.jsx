import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TournamentDetailPage from '../pages/TournamentDetailPage';

vi.mock('../lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    group: {
      id: 'g1', name: 'Test Tourney', status: 'pending',
      buy_in: 100, scheduled_at: null, privacy: 'public',
      shared_config: { starting_stack: 5000, blind_schedule: [{ level: 1, sb: 25, bb: 50, ante: 0, duration_minutes: 12 }] },
      payout_structure: [{ place: 1, percentage: 100 }],
    },
    registrations: [],
    tableIds: [],
  }),
}));

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { stableId: 'u1', role: 'coach' }, hasPermission: () => true }),
}));

beforeEach(() => vi.clearAllMocks());

function mount() {
  return render(
    <MemoryRouter initialEntries={['/tournaments/g1']}>
      <Routes>
        <Route path="/tournaments/:groupId" element={<TournamentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('TournamentDetailPage CollapsibleSection adoption', () => {
  it('renders all 3 collapsible section headers', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('Test Tourney')).toBeInTheDocument());
    expect(screen.getByText(/Blind Structure/)).toBeInTheDocument();
    expect(screen.getByText(/Registrants/)).toBeInTheDocument();
    expect(screen.getByText(/Payouts/)).toBeInTheDocument();
  });

  it('section toggle buttons expose aria-expanded', async () => {
    mount();
    await waitFor(() => expect(screen.getByText('Test Tourney')).toBeInTheDocument());
    const buttons = screen.getAllByRole('button', { expanded: true });
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });
});
