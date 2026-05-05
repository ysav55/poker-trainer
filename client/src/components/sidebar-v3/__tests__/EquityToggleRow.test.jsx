import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EquityToggleRow from '../EquityToggleRow.jsx';

const visibility = { coach: true, players: false };
const noopEmit = {
  setCoachEquityVisible: vi.fn(),
  setPlayersEquityVisible: vi.fn(),
};

describe('EquityToggleRow', () => {
  it('renders Show Coach + Show Players + Share Range buttons', () => {
    render(<EquityToggleRow visibility={visibility} emit={noopEmit} onShareRange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Show Coach/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show Players/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share Range/ })).toBeInTheDocument();
  });

  it('Show Coach pill reflects current state (active when visibility.coach=true)', () => {
    render(<EquityToggleRow visibility={visibility} emit={noopEmit} onShareRange={vi.fn()} />);
    const coachBtn = screen.getByRole('button', { name: /Show Coach/ });
    expect(coachBtn.className).toMatch(/active/);
  });

  it('Show Players pill reflects current state (inactive when visibility.players=false)', () => {
    render(<EquityToggleRow visibility={visibility} emit={noopEmit} onShareRange={vi.fn()} />);
    const playersBtn = screen.getByRole('button', { name: /Show Players/ });
    expect(playersBtn.className).not.toMatch(/active/);
  });

  it('clicking Show Coach toggles via emit', () => {
    const emit = { ...noopEmit, setCoachEquityVisible: vi.fn() };
    render(<EquityToggleRow visibility={{ coach: true, players: false }} emit={emit} onShareRange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Show Coach/ }));
    expect(emit.setCoachEquityVisible).toHaveBeenCalledWith(false);
  });

  it('clicking Show Players toggles via emit', () => {
    const emit = { ...noopEmit, setPlayersEquityVisible: vi.fn() };
    render(<EquityToggleRow visibility={{ coach: true, players: false }} emit={emit} onShareRange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Show Players/ }));
    expect(emit.setPlayersEquityVisible).toHaveBeenCalledWith(true);
  });

  it('clicking Share Range fires the callback', () => {
    const onShareRange = vi.fn();
    render(<EquityToggleRow visibility={visibility} emit={noopEmit} onShareRange={onShareRange} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Range/ }));
    expect(onShareRange).toHaveBeenCalled();
  });

  it('handles missing visibility gracefully (defaults to coach=true, players=false)', () => {
    render(<EquityToggleRow visibility={undefined} emit={noopEmit} onShareRange={vi.fn()} />);
    const coachBtn = screen.getByRole('button', { name: /Show Coach/ });
    const playersBtn = screen.getByRole('button', { name: /Show Players/ });
    expect(coachBtn.className).toMatch(/active/);
    expect(playersBtn.className).not.toMatch(/active/);
  });

  it('disables buttons when emit methods are missing', () => {
    const emit = { setCoachEquityVisible: undefined, setPlayersEquityVisible: undefined };
    render(<EquityToggleRow visibility={visibility} emit={emit} onShareRange={vi.fn()} />);
    const coachBtn = screen.getByRole('button', { name: /Show Coach/ });
    const playersBtn = screen.getByRole('button', { name: /Show Players/ });
    expect(coachBtn).toBeDisabled();
    expect(playersBtn).toBeDisabled();
  });
});
