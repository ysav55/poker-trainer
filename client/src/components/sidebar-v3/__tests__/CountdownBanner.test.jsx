import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CountdownBanner from '../CountdownBanner.jsx';

describe('CountdownBanner', () => {
  it('renders nothing when active=false and paused=false', () => {
    const { container } = render(
      <CountdownBanner active={false} paused={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders countdown text when active=true', () => {
    render(
      <CountdownBanner active={true} paused={false} durationSeconds={5} />
    );
    expect(screen.getByText(/Auto-starting next hand in 5s/)).toBeInTheDocument();
  });

  it('renders Resume button when paused=true', () => {
    render(
      <CountdownBanner active={true} paused={true} />
    );
    expect(screen.getByRole('button', { name: 'Resume Drill' })).toBeInTheDocument();
  });

  it('shows Drill paused text when paused=true', () => {
    render(
      <CountdownBanner active={true} paused={true} />
    );
    expect(screen.getByText('Drill paused')).toBeInTheDocument();
  });

  it('Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <CountdownBanner active={true} paused={false} onCancel={onCancel} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('Resume calls onResume', () => {
    const onResume = vi.fn();
    render(
      <CountdownBanner active={true} paused={true} onResume={onResume} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resume Drill' }));
    expect(onResume).toHaveBeenCalled();
  });

  it('resets countdown when active changes from false to true', () => {
    const { rerender } = render(
      <CountdownBanner active={false} paused={false} durationSeconds={5} />
    );

    rerender(
      <CountdownBanner active={true} paused={false} durationSeconds={5} />
    );
    expect(screen.getByText(/Auto-starting next hand in 5s/)).toBeInTheDocument();
  });

  it('shows Cancel button when active and not paused', () => {
    render(
      <CountdownBanner active={true} paused={false} />
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('hides button when not active and not paused', () => {
    render(
      <CountdownBanner active={false} paused={false} />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has role=status for accessibility', () => {
    render(
      <CountdownBanner active={true} paused={false} />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
