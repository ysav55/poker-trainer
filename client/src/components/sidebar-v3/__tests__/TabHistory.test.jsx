import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabHistory from '../TabHistory.jsx';

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue({ counts: { 'h1': 3, 'h2': 0 } }),
}));

const data = {
  history: [],
  session: { hands: 0 },
};

describe('TabHistory — Players sub-mode (removed)', () => {
  it('does not render Players segment toggle', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Players' })).toBeNull();
  });

  it('does not render the "Table" segment toggle either (single mode now)', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    // Now only the Table view renders, no segment selector
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });
});

describe('TabHistory — notes_pip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders 📝3 pip on cards with notes', async () => {
    const dataWithHistory = {
      history: [
        { hand_id: 'h1', n: 1, board: [], heroHand: [], pot: 100, phase: 'showdown', action: 'Alice won', live: false, net: 50 },
        { hand_id: 'h2', n: 2, board: [], heroHand: [], pot: 80,  phase: 'fold',     action: 'Bob won',   live: false, net: -40 },
      ],
      session: { hands: 2 },
    };

    render(<TabHistory data={dataWithHistory} onLoadReview={vi.fn()} />);
    // Wait for the batch fetch to complete and re-render
    await screen.findByText(/📝3/);
  });

  it('does not render pip on cards with zero notes', async () => {
    const dataWithHistory = {
      history: [
        { hand_id: 'h1', n: 1, board: [], heroHand: [], pot: 100, phase: 'showdown', action: 'Alice won', live: false, net: 50 },
        { hand_id: 'h2', n: 2, board: [], heroHand: [], pot: 80,  phase: 'fold',     action: 'Bob won',   live: false, net: -40 },
      ],
      session: { hands: 2 },
    };

    render(<TabHistory data={dataWithHistory} onLoadReview={vi.fn()} />);
    // Wait for the batch fetch to complete
    await screen.findByText(/📝3/);
    // Verify there's no "📝0"
    expect(screen.queryByText(/📝0/)).toBeNull();
  });
});
