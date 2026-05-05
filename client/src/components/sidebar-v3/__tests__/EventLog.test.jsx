import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EventLog from '../EventLog.jsx';

describe('EventLog', () => {
  it('renders "No drill events yet." when events empty', () => {
    render(<EventLog events={[]} />);
    expect(screen.getByText('No drill events yet.')).toBeInTheDocument();
  });

  it('renders up to max events (default 3)', () => {
    const events = [
      { type: 'hand_started', ts: Date.now() - 5000 },
      { type: 'hand_ended', ts: Date.now() - 3000 },
      { type: 'playlist_advanced', ts: Date.now() - 1000 },
      { type: 'hand_started', ts: Date.now() - 500 },
    ];
    render(<EventLog events={events} max={3} />);
    // Should show only last 3
    const rows = screen.getAllByText(/[▶✓→]/);
    expect(rows.length).toBe(3);
  });

  it('displays events in reverse order (newest first)', () => {
    const now = Date.now();
    const events = [
      { type: 'hand_started', message: 'Event 1', ts: now - 5000 },
      { type: 'hand_ended', message: 'Event 2', ts: now - 3000 },
      { type: 'playlist_advanced', message: 'Event 3', ts: now - 1000 },
    ];
    render(<EventLog events={events} />);
    const eventMessages = screen.getAllByText(/Event [123]/);
    // Newest (Event 3) should come first
    expect(eventMessages[0]).toHaveTextContent('Event 3');
    expect(eventMessages[1]).toHaveTextContent('Event 2');
    expect(eventMessages[2]).toHaveTextContent('Event 1');
  });

  it('shows correct glyph for event types', () => {
    const now = Date.now();
    const events = [
      { type: 'hand_started', ts: now },
      { type: 'hand_ended', ts: now },
      { type: 'playlist_advanced', ts: now },
    ];
    render(<EventLog events={events} />);
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('shows dot glyph for unknown event types', () => {
    const events = [
      { type: 'unknown_event', ts: Date.now() },
    ];
    render(<EventLog events={events} />);
    expect(screen.getByText('·')).toBeInTheDocument();
  });

  it('displays message if provided, otherwise type', () => {
    const now = Date.now();
    const events = [
      { type: 'hand_started', message: 'Custom message', ts: now },
      { type: 'hand_ended', ts: now },
    ];
    render(<EventLog events={events} />);
    expect(screen.getByText('Custom message')).toBeInTheDocument();
    expect(screen.getByText('hand_ended')).toBeInTheDocument();
  });

  it('displays relative time for events', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const events = [
      { type: 'hand_started', ts: now - 10000 }, // 10s ago
      { type: 'hand_ended', ts: now - 120000 }, // 2m ago
    ];
    render(<EventLog events={events} />);
    expect(screen.getByText('10s')).toBeInTheDocument();
    expect(screen.getByText('2m')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('respects custom max parameter', () => {
    const events = [
      { type: 'hand_started', ts: Date.now() - 5000 },
      { type: 'hand_ended', ts: Date.now() - 3000 },
      { type: 'playlist_advanced', ts: Date.now() - 1000 },
    ];
    render(<EventLog events={events} max={2} />);
    // Should show only last 2
    const rows = screen.getAllByText(/[▶✓→]/);
    expect(rows.length).toBe(2);
  });
});
