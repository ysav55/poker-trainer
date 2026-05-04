import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabReview from '../TabReview.jsx';

vi.mock('../../../hooks/useNotes.js', () => ({
  default: () => ({ notes: [{ id: 'n1', body: 'review note', author_name: 'C', author_player_id: 'p1', created_at: 't', updated_at: 't' }], loading: false, error: null, refresh: vi.fn(), add: vi.fn(), edit: vi.fn(), remove: vi.fn() }),
}));

vi.mock('../../../hooks/useHistory.js', () => ({
  useHistory: () => ({ handDetail: null, fetchHandDetail: vi.fn(), clearDetail: vi.fn() }),
}));

const data = {
  gameState: { phase: 'waiting' },
  review: { loaded: true, handId: 'h1', cursor: 0, totalActions: 1, branched: false, board: [], players: [] },
  playlists: [],
};

describe('TabReview — notes panel', () => {
  it('renders the review notes panel when a hand is loaded', () => {
    render(<TabReview data={data} emit={{}} replay={{}} selectedHandId="h1" onBack={vi.fn()} />);
    expect(screen.getByText('review note')).toBeInTheDocument();
  });
});
