import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PendingBlindsBanner from '../PendingBlindsBanner.jsx';

describe('PendingBlindsBanner', () => {
  it('renders queued blind values + relative time', () => {
    const pending = { sb: 25, bb: 50, queuedAt: Date.now() - 5000 };
    render(<PendingBlindsBanner pending={pending} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={vi.fn()} />);
    expect(screen.getByText(/10\/20\s*→\s*25\/50/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Discard Pending/ })).toBeInTheDocument();
  });

  it('renders nothing when pending is null', () => {
    const { container } = render(<PendingBlindsBanner pending={null} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('clicking Discard Pending calls onDiscard', () => {
    const pending = { sb: 25, bb: 50, queuedAt: Date.now() };
    const onDiscard = vi.fn();
    render(<PendingBlindsBanner pending={pending} liveBlinds={{ sb: 10, bb: 20 }} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole('button', { name: /Discard Pending/ }));
    expect(onDiscard).toHaveBeenCalled();
  });
});
