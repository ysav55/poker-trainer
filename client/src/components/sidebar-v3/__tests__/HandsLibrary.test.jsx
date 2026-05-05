import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HandsLibrary from '../HandsLibrary.jsx';
import * as useHandsLibraryModule from '../../../hooks/useHandsLibrary.js';

vi.mock('../../../hooks/useHandsLibrary.js');

describe('HandsLibrary', () => {
  const mockEmit = {
    loadHandScenario: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useHandsLibraryModule.default.mockReturnValue({
      hands: [],
      total: 0,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it('renders search input and stack mode toggles', () => {
    render(<HandsLibrary emit={mockEmit} />);

    expect(screen.getByPlaceholderText(/Search by winner/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Keep Stacks/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Hist. Stacks/ })).toBeInTheDocument();
  });

  it('shows empty state when no hands', () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [],
      total: 0,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    expect(screen.getByText(/No hands match/)).toBeInTheDocument();
  });

  it('lists hands when loaded', () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [
        { hand_id: 'h1', winner_name: 'Alice', pot_end: '50', phase_ended: 'river' },
        { hand_id: 'h2', winner_name: 'Bob', pot_end: '100', phase_ended: 'flop' }
      ],
      total: 2,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    expect(screen.getByText(/Alice won 50/)).toBeInTheDocument();
    expect(screen.getByText(/Bob won 100/)).toBeInTheDocument();
  });

  it('Load button calls emit.loadHandScenario with hand_id and stack mode', async () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [
        { hand_id: 'hand-42', winner_name: 'Alice', pot_end: '50', phase_ended: 'river' }
      ],
      total: 1,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    const loadBtn = screen.getByRole('button', { name: /Load/ });
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(mockEmit.loadHandScenario).toHaveBeenCalledWith('hand-42', 'keep');
    });
  });

  it('stack mode toggle changes which mode is sent', async () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [
        { hand_id: 'hand-7', winner_name: 'Bob', pot_end: '100', phase_ended: 'turn' }
      ],
      total: 1,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    // Switch to "Hist. Stacks"
    fireEvent.click(screen.getByRole('button', { name: /Hist. Stacks/ }));

    // Load with historical mode
    const loadBtn = screen.getByRole('button', { name: /Load/ });
    fireEvent.click(loadBtn);

    await waitFor(() => {
      expect(mockEmit.loadHandScenario).toHaveBeenCalledWith('hand-7', 'historical');
    });
  });

  it('shows "Searching…" while loading', () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [],
      total: 0,
      loading: true,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    expect(screen.getByText(/Searching…/)).toBeInTheDocument();
  });

  it('displays total matches count', () => {
    useHandsLibraryModule.default.mockReturnValue({
      hands: [
        { hand_id: 'h1', winner_name: 'Alice', pot_end: '50', phase_ended: 'river' }
      ],
      total: 42,
      loading: false,
      error: null,
      refresh: vi.fn(),
    });

    render(<HandsLibrary emit={mockEmit} />);

    expect(screen.getByText('42 matches')).toBeInTheDocument();
  });
});
