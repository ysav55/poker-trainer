import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LiveConfigureHand from '../LiveConfigureHand.jsx';

function liveData(overrides = {}) {
  return {
    gameState: {
      phase: 'waiting',
      hand_id: null,
      players: [],
      pending_hand_config: null,
      ...overrides.gameState,
    },
    seatConfig: { maxSeats: 9, seats: Array.from({ length: 9 }, (_, i) => ({ seat: i, player: null })) },
    blindLevels: { current: { sb: 10, bb: 20 } },
    ...overrides,
  };
}

describe('LiveConfigureHand — mode segment', () => {
  it('exposes only RNG and Manual modes (Hybrid removed)', () => {
    render(<LiveConfigureHand data={liveData()} emit={{ updateHandConfig: vi.fn() }} />);
    expect(screen.getByRole('button', { name: 'RNG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hybrid' })).toBeNull();
  });

  it('defaults to RNG mode on mount', () => {
    render(<LiveConfigureHand data={liveData()} emit={{ updateHandConfig: vi.fn() }} />);
    const rngBtn = screen.getByRole('button', { name: 'RNG' });
    expect(rngBtn.className).toBe('active');
  });
});
