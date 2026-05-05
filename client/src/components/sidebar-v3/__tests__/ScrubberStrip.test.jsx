import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import ScrubberStrip from '../ScrubberStrip.jsx';

describe('ScrubberStrip', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const baseProps = {
    cursor: 0,
    totalActions: 10,
    onJumpTo: vi.fn(),
    onStepBack: vi.fn(),
    onStepForward: vi.fn(),
  };

  it('renders prev/play/next buttons + 4 speed buttons + scrubber range', () => {
    render(<ScrubberStrip {...baseProps} />);
    expect(screen.getByTestId('scrubber-prev')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-play')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-next')).toBeInTheDocument();
    expect(screen.getByTestId('speed-0.5×')).toBeInTheDocument();
    expect(screen.getByTestId('speed-1×')).toBeInTheDocument();
    expect(screen.getByTestId('speed-2×')).toBeInTheDocument();
    expect(screen.getByTestId('speed-4×')).toBeInTheDocument();
    expect(screen.getByTestId('scrubber-range')).toBeInTheDocument();
  });

  it('clicking prev calls onStepBack', () => {
    const onStepBack = vi.fn();
    render(<ScrubberStrip {...baseProps} onStepBack={onStepBack} />);
    fireEvent.click(screen.getByTestId('scrubber-prev'));
    expect(onStepBack).toHaveBeenCalled();
  });

  it('clicking next calls onStepForward', () => {
    const onStepForward = vi.fn();
    render(<ScrubberStrip {...baseProps} onStepForward={onStepForward} />);
    fireEvent.click(screen.getByTestId('scrubber-next'));
    expect(onStepForward).toHaveBeenCalled();
  });

  it('scrubber drag jumps to new position', () => {
    const onJumpTo = vi.fn();
    render(<ScrubberStrip {...baseProps} onJumpTo={onJumpTo} totalActions={10} />);
    const range = screen.getByTestId('scrubber-range');
    fireEvent.change(range, { target: { value: '5' } });
    expect(onJumpTo).toHaveBeenCalledWith(4); // 5 - 1 = 4 (0-indexed)
  });

  it('clicking play starts autoplay and steps forward at 1× = 1000ms intervals', () => {
    const onStepForward = vi.fn();
    render(<ScrubberStrip {...baseProps} onStepForward={onStepForward} cursor={0} totalActions={10} />);
    const playBtn = screen.getByTestId('scrubber-play');
    fireEvent.click(playBtn);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onStepForward).toHaveBeenCalled();
  });

  it('clicking 2× speed makes interval 500ms', () => {
    const onStepForward = vi.fn();
    render(<ScrubberStrip {...baseProps} onStepForward={onStepForward} cursor={0} totalActions={10} />);
    fireEvent.click(screen.getByTestId('speed-2×'));
    fireEvent.click(screen.getByTestId('scrubber-play'));
    act(() => { vi.advanceTimersByTime(500); });
    expect(onStepForward).toHaveBeenCalled();
  });

  it('autoplay stops when cursor reaches totalActions - 1', () => {
    const { rerender } = render(<ScrubberStrip {...baseProps} onStepForward={vi.fn()} cursor={9} totalActions={10} />);
    // At end: play button should be disabled
    const playBtn = screen.getByTestId('scrubber-play');
    expect(playBtn).toBeDisabled();
  });

  it('prev button disabled when cursor <= -1', () => {
    render(<ScrubberStrip {...baseProps} cursor={-1} totalActions={10} />);
    const prevBtn = screen.getByTestId('scrubber-prev');
    expect(prevBtn).toBeDisabled();
  });

  it('next button disabled when cursor >= totalActions - 1', () => {
    render(<ScrubberStrip {...baseProps} cursor={9} totalActions={10} />);
    const nextBtn = screen.getByTestId('scrubber-next');
    expect(nextBtn).toBeDisabled();
  });

  it('play button shows play symbol when not playing', () => {
    render(<ScrubberStrip {...baseProps} cursor={0} totalActions={10} />);
    const playBtn = screen.getByTestId('scrubber-play');
    expect(playBtn.textContent).toBe('▶');
  });

  it('play button shows pause symbol when playing', () => {
    render(<ScrubberStrip {...baseProps} cursor={0} totalActions={10} />);
    const playBtn = screen.getByTestId('scrubber-play');
    fireEvent.click(playBtn);
    expect(playBtn.textContent).toBe('❚❚');
  });
});
