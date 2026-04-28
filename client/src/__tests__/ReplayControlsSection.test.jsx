/**
 * ReplayControlsSection.test.jsx
 *
 * Tests for the replay playback controls UI:
 *  - Does not render when replay is not active
 *  - Renders replay controls when replay mode is active
 *  - Shows REPLAY / BRANCHED badge
 *  - Step back / step forward buttons call correct emitters
 *  - Step forward disabled at end; step back disabled at start
 *  - Slider value reflects cursor
 *  - Play/pause toggle
 *  - Branch / Unbranch buttons
 *  - Exit button calls onExit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mock apiFetch (annotations) ───────────────────────────────────────────────

vi.mock('../lib/api.js', () => ({
  apiFetch: vi.fn().mockResolvedValue({ annotations: [] }),
}));

import ReplayControlsSection from '../components/sidebar/ReplayControlsSection.jsx';

const noop = () => {};

function makeGameState({ cursor = -1, actions = [], branched = false, active = true } = {}) {
  return {
    phase: active ? 'replay' : 'waiting',
    replay_mode: {
      active,
      branched,
      cursor,
      actions,
      source_hand_id: 'hand-abc',
    },
  };
}

function renderSection(props = {}) {
  const defaults = {
    gameState: makeGameState({ cursor: 0, actions: [{ action: 'raise', amount: 100, player_name: 'Alice' }] }),
    replayMeta: { handId: 'hand-abc', actionCount: 3 },
    isCoach: true,
    onStepForward: noop,
    onStepBack: noop,
    onJumpTo: noop,
    onBranch: noop,
    onUnbranch: noop,
    onExit: noop,
  };
  return render(<ReplayControlsSection {...defaults} {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Visibility ────────────────────────────────────────────────────────────────

describe('ReplayControlsSection visibility', () => {
  it('does not render anything when replay_mode.active is false', () => {
    const { container } = render(
      <ReplayControlsSection
        gameState={makeGameState({ active: false })}
        replayMeta={null}
        isCoach
        onStepForward={noop}
        onStepBack={noop}
        onJumpTo={noop}
        onBranch={noop}
        onUnbranch={noop}
        onExit={noop}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when phase is "replay"', () => {
    renderSection();
    expect(screen.getByTestId('replay-step-forward')).toBeTruthy();
  });
});

// ── Status badge ──────────────────────────────────────────────────────────────

describe('ReplayControlsSection status badge', () => {
  it('shows REPLAY badge when not branched', () => {
    renderSection();
    // Multiple elements may have "REPLAY" text (section header + badge); check the badge span
    const badges = screen.getAllByText('REPLAY');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows BRANCHED badge when branched', () => {
    renderSection({ gameState: makeGameState({ branched: true, cursor: 1, actions: [{ action: 'call' }] }) });
    expect(screen.getByText('BRANCHED')).toBeTruthy();
  });
});

// ── Buttons ───────────────────────────────────────────────────────────────────

describe('ReplayControlsSection step buttons', () => {
  it('calls onStepForward when step forward is clicked', async () => {
    const onStepForward = vi.fn();
    renderSection({ onStepForward });
    await act(async () => {
      fireEvent.click(screen.getByTestId('replay-step-forward'));
    });
    expect(onStepForward).toHaveBeenCalledTimes(1);
  });

  it('calls onStepBack when step back is clicked', async () => {
    const onStepBack = vi.fn();
    const gs = makeGameState({ cursor: 1, actions: [{ action: 'call' }, { action: 'raise' }] });
    renderSection({ onStepBack, gameState: gs, replayMeta: { handId: 'h1', actionCount: 2 } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('replay-step-back'));
    });
    expect(onStepBack).toHaveBeenCalledTimes(1);
  });

  it('step back button is disabled when cursor <= -1 (start)', () => {
    renderSection({
      gameState: makeGameState({ cursor: -1, actions: [] }),
      replayMeta: { handId: 'h', actionCount: 0 },
    });
    expect(screen.getByTestId('replay-step-back').disabled).toBe(true);
  });

  it('step forward button is disabled when at the last action', () => {
    const gs = makeGameState({ cursor: 2, actions: [{ action: 'call' }, { action: 'raise' }, { action: 'fold' }] });
    renderSection({ gameState: gs, replayMeta: { handId: 'h', actionCount: 3 } });
    expect(screen.getByTestId('replay-step-forward').disabled).toBe(true);
  });
});

// ── Scrubber ──────────────────────────────────────────────────────────────────

describe('ReplayControlsSection scrubber', () => {
  it('renders a range input with correct max', () => {
    renderSection({ replayMeta: { handId: 'h', actionCount: 5 } });
    const slider = screen.getByTestId('replay-scrubber');
    expect(slider.getAttribute('max')).toBe('5');
  });

  it('calls onJumpTo when slider changes', async () => {
    const onJumpTo = vi.fn();
    renderSection({ onJumpTo, replayMeta: { handId: 'h', actionCount: 4 } });
    await act(async () => {
      fireEvent.change(screen.getByTestId('replay-scrubber'), { target: { value: '3' } });
    });
    expect(onJumpTo).toHaveBeenCalledWith(2); // slider value - 1 = cursor
  });
});

// ── Exit button ───────────────────────────────────────────────────────────────

describe('ReplayControlsSection exit', () => {
  it('calls onExit when Exit button is clicked', async () => {
    const onExit = vi.fn();
    renderSection({ onExit });
    await act(async () => {
      fireEvent.click(screen.getByTestId('replay-exit'));
    });
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

// ── Branch / Unbranch ─────────────────────────────────────────────────────────

describe('ReplayControlsSection branch controls', () => {
  it('shows Branch & Play button when not branched', () => {
    renderSection();
    expect(screen.getByTestId('replay-branch')).toBeTruthy();
    expect(screen.queryByTestId('replay-unbranch')).toBeNull();
  });

  it('shows Back to Replay button when branched', () => {
    renderSection({ gameState: makeGameState({ branched: true, cursor: 0, actions: [{ action: 'call' }] }) });
    expect(screen.getByTestId('replay-unbranch')).toBeTruthy();
    expect(screen.queryByTestId('replay-branch')).toBeNull();
  });

  it('calls onBranch when Branch & Play is clicked', async () => {
    const onBranch = vi.fn();
    renderSection({ onBranch });
    await act(async () => {
      fireEvent.click(screen.getByTestId('replay-branch'));
    });
    expect(onBranch).toHaveBeenCalledTimes(1);
  });

  it('calls onUnbranch when Back to Replay is clicked', async () => {
    const onUnbranch = vi.fn();
    renderSection({
      onUnbranch,
      gameState: makeGameState({ branched: true, cursor: 0, actions: [{ action: 'call' }] }),
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('replay-unbranch'));
    });
    expect(onUnbranch).toHaveBeenCalledTimes(1);
  });
});

// ── Current action display ────────────────────────────────────────────────────

describe('ReplayControlsSection action display', () => {
  it('shows current action details when cursor >= 0', () => {
    const gs = makeGameState({
      cursor: 0,
      actions: [{ action: 'raise', amount: 200, player_name: 'Bob' }],
    });
    renderSection({ gameState: gs, replayMeta: { handId: 'h', actionCount: 1 } });
    const display = screen.getByTestId('current-action-display');
    expect(display.textContent).toMatch(/Bob/);
    expect(display.textContent).toMatch(/raise/i);
  });
});

// ── Play/pause ────────────────────────────────────────────────────────────────

describe('ReplayControlsSection play/pause', () => {
  it('toggles to paused state when play is clicked', async () => {
    renderSection();
    const btn = screen.getByTestId('replay-play-pause');
    await act(async () => { fireEvent.click(btn); });
    // After clicking play, button should show pause icon
    expect(btn.textContent).toMatch(/⏸/);
  });

  it('toggles back to play state when paused and clicked again', async () => {
    renderSection();
    const btn = screen.getByTestId('replay-play-pause');
    await act(async () => { fireEvent.click(btn); });
    await act(async () => { fireEvent.click(btn); });
    expect(btn.textContent).toMatch(/▶/);
  });
});
