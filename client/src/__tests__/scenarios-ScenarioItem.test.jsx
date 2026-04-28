import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ScenarioItem from '../components/scenarios/ScenarioItem.jsx';

const SC = { id: 'sc-1', name: 'Big Pair Spot' };

describe('ScenarioItem', () => {
  it('renders scenario name', () => {
    render(<ScenarioItem scenario={SC} playlistColor="#f97316" selected={false} onClick={() => {}} />);
    expect(screen.getByText('Big Pair Spot')).toBeTruthy();
  });

  it('falls back to id snippet when name missing', () => {
    render(<ScenarioItem scenario={{ id: 'abcdef-123' }} playlistColor={null} selected={false} onClick={() => {}} />);
    expect(screen.getByText(/Scenario abcdef/)).toBeTruthy();
  });

  it('applies 20%-opacity playlist color on left border', () => {
    render(<ScenarioItem scenario={SC} playlistColor="#f97316" selected={false} onClick={() => {}} />);
    const btn = screen.getByTestId('scenario-item-sc-1');
    expect(btn.style.borderLeftColor).toBe('rgba(249, 115, 22, 0.2)');
  });

  it('fires onClick when pressed', () => {
    const fn = vi.fn();
    render(<ScenarioItem scenario={SC} playlistColor="#f97316" selected={false} onClick={fn} />);
    fireEvent.click(screen.getByText('Big Pair Spot'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
