import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import TournamentTableCard from '../components/admin/TournamentTableCard.jsx';

const TABLE = {
  id: 't1',
  name: 'Main Event',
  players: [
    { id: 'p1', name: 'Alice', stack: 15000 },
    { id: 'p2', name: 'Bob',   stack: 0 },
  ],
  currentLevel: { level: 3, sb: 100, bb: 200 },
};

function setup(overrides = {}) {
  const handlers = {
    onAdvanceLevel: vi.fn(),
    onEndTournament: vi.fn(),
    onMovePlayer: vi.fn(),
    onNavigate: vi.fn(),
    ...overrides,
  };
  render(<TournamentTableCard table={TABLE} {...handlers} />);
  return handlers;
}

describe('TournamentTableCard', () => {
  it('renders table name, player counts, and level', () => {
    setup();
    expect(screen.getByText('Main Event')).toBeTruthy();
    expect(screen.getByText('TOURNAMENT')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('100/200')).toBeTruthy();
  });

  it('renders players with busted line-through', () => {
    setup();
    const bob = screen.getByText('Bob');
    expect(bob.style.textDecoration).toContain('line-through');
  });

  it('Monitor button navigates', () => {
    const h = setup();
    fireEvent.click(screen.getByText('Monitor'));
    expect(h.onNavigate).toHaveBeenCalledWith('t1');
  });

  it('Move Player button triggers handler', () => {
    const h = setup();
    fireEvent.click(screen.getByText('Move Player'));
    expect(h.onMovePlayer).toHaveBeenCalledWith(TABLE);
  });

  it('End requires confirm click', () => {
    const h = setup();
    fireEvent.click(screen.getByText('End'));
    expect(h.onEndTournament).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Confirm End'));
    expect(h.onEndTournament).toHaveBeenCalledWith('t1');
  });
});
