import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LaunchPanel from '../LaunchPanel.jsx';

const playlist = { id: 'pl1', name: 'Bluff catching', count: 5 };

describe('LaunchPanel', () => {
  it('renders playlist name + count', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.getByText(/Bluff catching/)).toBeInTheDocument();
    expect(screen.getByText(/5 hand/)).toBeInTheDocument();
  });

  it('renders hero mode segment with 3 options', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.getByRole('button', { name: 'Sticky' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Per hand' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate' })).toBeInTheDocument();
  });

  it('renders order segment with 2 options', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.getByRole('button', { name: 'Sequential' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Random' })).toBeInTheDocument();
  });

  it('renders auto-advance checkbox', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.getByLabelText(/Auto-advance/)).toBeInTheDocument();
  });

  it('Allow zero match checkbox only renders when fitCount === 0', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    const { rerender } = render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.queryByLabelText(/Allow zero-match/)).toBeNull();

    rerender(<LaunchPanel playlist={playlist} fitCount={0} {...handlers} />);
    expect(screen.getByLabelText(/Allow zero-match/)).toBeInTheDocument();
  });

  it('Launch is disabled when fitCount=0 and allowZeroMatch unchecked', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={0} {...handlers} />);
    expect(screen.getByRole('button', { name: /Launch →/ })).toBeDisabled();
  });

  it('Launch enabled when fitCount=0 + allowZeroMatch checked', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={0} {...handlers} />);
    fireEvent.click(screen.getByLabelText(/Allow zero-match/));
    expect(screen.getByRole('button', { name: /Launch →/ })).not.toBeDisabled();
  });

  it('Launch calls onLaunch with full config', () => {
    const onLaunch = vi.fn();
    render(<LaunchPanel playlist={playlist} fitCount={5} onLaunch={onLaunch} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Random' }));
    fireEvent.click(screen.getByRole('button', { name: 'Per hand' }));
    fireEvent.click(screen.getByRole('button', { name: /Launch →/ }));
    expect(onLaunch).toHaveBeenCalledWith({
      playlistId: 'pl1',
      heroMode: 'per_hand',
      order: 'random',
      autoAdvance: true,
      allowZeroMatch: false,
    });
  });

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<LaunchPanel playlist={playlist} fitCount={5} onLaunch={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Auto-advance defaults to true', () => {
    const handlers = { onLaunch: vi.fn(), onCancel: vi.fn() };
    render(<LaunchPanel playlist={playlist} fitCount={5} {...handlers} />);
    expect(screen.getByLabelText(/Auto-advance/).checked).toBe(true);
  });
});
