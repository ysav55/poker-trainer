import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabDrills from '../TabDrills.jsx';

const activeDrillData = {
  playlists: [{ id: 'pl1', name: 'Bluff catching', count: 5, description: '' }],
  drillSession: {
    active: true,
    playlistId: 'pl1',
    scenarioName: 'AKo OOP',
    currentSpot: 'flop · 7s 7d 2c',
    handsDone: 2, handsTotal: 5,
    results: { correct: 1, mistake: 1, uncertain: 0 },
  },
};

describe('TabDrills — stats tiles (removed)', () => {
  it('does not render Correct/Mistake/Unsure tiles in active session', () => {
    render(<TabDrills data={activeDrillData} emit={{ deactivatePlaylist: vi.fn() }} />);
    expect(screen.queryByText('Correct')).toBeNull();
    expect(screen.queryByText('Mistake')).toBeNull();
    expect(screen.queryByText('Unsure')).toBeNull();
  });
});
