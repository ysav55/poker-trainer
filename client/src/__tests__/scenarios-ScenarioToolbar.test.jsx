import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import ScenarioToolbar from '../components/scenarios/ScenarioToolbar.jsx';

const SC = { id: 'sc-1', name: 'AA on 762r' };
const PL = { playlist_id: 'pl-1', name: 'Dry Flop Spots' };

describe('ScenarioToolbar', () => {
  it('renders nothing when no scenario', () => {
    const { container } = render(<ScenarioToolbar scenario={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when scenario is "new"', () => {
    const { container } = render(<ScenarioToolbar scenario="new" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows breadcrumb with playlist color dot + names', () => {
    render(<ScenarioToolbar scenario={SC} playlist={PL} playlistColor="#f97316" />);
    expect(screen.getByTestId('scenario-breadcrumb')).toBeTruthy();
    expect(screen.getByText('Dry Flop Spots')).toBeTruthy();
    expect(screen.getByText('AA on 762r')).toBeTruthy();
    const dot = screen.getByTestId('breadcrumb-dot');
    expect(dot.style.background).toContain('rgb(249, 115, 22)');
  });

  it('shows "Unassigned" when scenario has no playlist', () => {
    render(<ScenarioToolbar scenario={SC} playlist={null} />);
    expect(screen.getByText('Unassigned')).toBeTruthy();
  });

  it('fires onDuplicate with scenario id', () => {
    const onDup = vi.fn();
    render(<ScenarioToolbar scenario={SC} playlist={PL} onDuplicate={onDup} />);
    fireEvent.click(screen.getByTestId('toolbar-duplicate'));
    expect(onDup).toHaveBeenCalledWith('sc-1');
  });

  it('fires onDelete with scenario id', () => {
    const onDel = vi.fn();
    render(<ScenarioToolbar scenario={SC} playlist={PL} onDelete={onDel} />);
    fireEvent.click(screen.getByTestId('toolbar-delete'));
    expect(onDel).toHaveBeenCalledWith('sc-1');
  });
});
