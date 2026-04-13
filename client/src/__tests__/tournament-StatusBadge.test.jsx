import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBadge from '../components/tournament/StatusBadge';
import { colors } from '../lib/colors.js';

describe('StatusBadge', () => {
  it('renders the status text uppercase via CSS', () => {
    render(<StatusBadge status="running" />);
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('uses success token color for running', () => {
    render(<StatusBadge status="running" />);
    const el = screen.getByText('running');
    expect(el).toHaveStyle({ color: colors.success });
  });

  it('uses error token color for cancelled', () => {
    render(<StatusBadge status="cancelled" />);
    const el = screen.getByText('cancelled');
    expect(el).toHaveStyle({ color: colors.error });
  });

  it('falls back to muted color for unknown status', () => {
    render(<StatusBadge status="zzzz" />);
    const el = screen.getByText('zzzz');
    expect(el).toHaveStyle({ color: colors.textMuted });
  });
});
