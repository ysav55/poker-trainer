import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import SaveAsScenarioModal, { autoName, guessPlaylistId } from '../components/scenarios/SaveAsScenarioModal.jsx';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const HAND = {
  hand_id: 'h-abc123',
  board: ['Kh', '7s', '2d'],
  players: [
    { seat: 0, player_id: 'p-hero', hole_cards: ['Ac', 'Kd'] },
    { seat: 1, player_id: 'p-vil',  hole_cards: ['Qs', 'Js'] },
  ],
  tags: ['3BET_POT', 'C_BET'],
};

const SIX_MAX_HAND = {
  hand_id: 'h-6max',
  board: ['Kh', '7s', '2d'],
  players: [
    { seat: 0, player_id: 'p-hero', hole_cards: ['Ac', 'Kd'] },
    { seat: 1, player_id: 'p-2',    hole_cards: ['Qs', 'Js'] },
    { seat: 2, player_id: 'p-3',    hole_cards: ['5h', '5c'] },
    { seat: 3, player_id: 'p-4',    hole_cards: null },
    { seat: 4, player_id: 'p-5',    hole_cards: null },
    { seat: 5, player_id: 'p-6',    hole_cards: null },
  ],
  tags: [],
};

const PLAYLISTS = [
  { playlist_id: 'pl-1', name: 'Dry Flop Spots' },
  { playlist_id: 'pl-2', name: 'C-Bet Lines' },
  { playlist_id: 'pl-3', name: 'Wet Flop Spots' },
];

function mockApi(overrides = {}) {
  return vi.fn().mockImplementation(async (path, opts) => {
    if (path === '/api/playlists' && (!opts || opts.method === undefined)) {
      return overrides.playlists ?? { playlists: PLAYLISTS };
    }
    if (path === '/api/scenarios/from-hand' && opts?.method === 'POST') {
      return overrides.fromHand ?? { id: 'sc-new', name: 'seeded' };
    }
    if (path.startsWith('/api/scenarios/') && opts?.method === 'PATCH') {
      return overrides.patch ?? { id: 'sc-new', name: 'AKo vs QJs on K72r' };
    }
    if (path.includes('/items') && opts?.method === 'POST') {
      return overrides.addItem ?? { id: 'item-1', scenario_id: 'sc-new' };
    }
    throw new Error(`Unhandled path: ${path} ${opts?.method}`);
  });
}

// ── autoName tests ───────────────────────────────────────────────────────────

describe('autoName()', () => {
  const HEADS_UP = [
    { seat: 0, cards: ['Ac', 'Kd'] },
    { seat: 1, cards: ['Qs', 'Js'] },
  ];

  it('heads-up: "hero vs villain on flop+texture"', () => {
    expect(autoName({
      seats: HEADS_UP,
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-abc',
    })).toBe('AKo vs QJs on K72r');
  });

  it('heads-up with suited hero + monotone flop', () => {
    expect(autoName({
      seats: [
        { seat: 0, cards: ['As', 'Qs'] },
        { seat: 1, cards: ['Tc', '9c'] },
      ],
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7h', flop3: '2h' },
      handId: 'h-xyz',
    })).toBe('AQs vs T9s on K72m');
  });

  it('heads-up with pair hero (no s/o suffix)', () => {
    expect(autoName({
      seats: [
        { seat: 0, cards: ['Ah', 'As'] },
        { seat: 1, cards: ['Qs', 'Js'] },
      ],
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-abc',
    })).toBe('AA vs QJs on K72r');
  });

  it('heads-up with hero cards cleared → "Random vs villain"', () => {
    expect(autoName({
      seats: [
        { seat: 0, cards: [null, null] },
        { seat: 1, cards: ['Qs', 'Js'] },
      ],
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-abc',
    })).toBe('Random vs QJs on K72r');
  });

  it('heads-up with villain cleared → "hero vs ??"', () => {
    expect(autoName({
      seats: [
        { seat: 0, cards: ['Ac', 'Kd'] },
        { seat: 1, cards: [null, null] },
      ],
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-abc',
    })).toBe('AKo vs ?? on K72r');
  });

  it('6-max: "AKo (6-max) on K72r"', () => {
    const seats = [
      { seat: 0, cards: ['Ac', 'Kd'] },
      { seat: 1, cards: ['Qs', 'Js'] },
      { seat: 2, cards: ['5h', '5c'] },
      { seat: 3, cards: [null, null] },
      { seat: 4, cards: [null, null] },
      { seat: 5, cards: [null, null] },
    ];
    expect(autoName({
      seats,
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-6max',
    })).toBe('AKo (6-max) on K72r');
  });

  it('6-max with hero cleared → "Random (6-max)"', () => {
    const seats = [
      { seat: 0, cards: [null, null] },
      { seat: 1, cards: ['Qs', 'Js'] },
      { seat: 2, cards: ['5h', '5c'] },
      { seat: 3, cards: [null, null] },
      { seat: 4, cards: [null, null] },
      { seat: 5, cards: [null, null] },
    ];
    expect(autoName({
      seats,
      heroSeat: 0,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-6max',
    })).toBe('Random (6-max) on K72r');
  });

  it('falls back to hand id without complete flop', () => {
    expect(autoName({
      seats: HEADS_UP,
      heroSeat: 0,
      board: { flop1: null, flop2: null, flop3: null },
      handId: 'h-abcdef123',
    })).toBe('AKo vs QJs');
  });

  it('no seats → "Hand #…" fallback', () => {
    expect(autoName({
      seats: [],
      heroSeat: null,
      board: { flop1: 'Kh', flop2: '7s', flop3: '2d' },
      handId: 'h-abcdef123',
    })).toBe('Hand #h-abcd');
  });
});

// ── Component tests ──────────────────────────────────────────────────────────

describe('SaveAsScenarioModal', () => {
  let apiFetch;
  let onClose;
  let onSaved;

  beforeEach(() => {
    apiFetch = mockApi();
    onClose  = vi.fn();
    onSaved  = vi.fn();
  });

  it('renders per-seat slots, hero radios, board, and playlist picker', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });

    expect(screen.getByTestId('save-as-scenario-modal')).toBeTruthy();

    // Per-seat rows with two card slots each
    expect(screen.getByTestId('seat-row-0')).toBeTruthy();
    expect(screen.getByTestId('seat-row-1')).toBeTruthy();
    expect(screen.getByTestId('seat-0-card-0')).toBeTruthy();
    expect(screen.getByTestId('seat-0-card-1')).toBeTruthy();
    expect(screen.getByTestId('seat-1-card-0')).toBeTruthy();
    expect(screen.getByTestId('seat-1-card-1')).toBeTruthy();

    // Hero radios — seat 0 selected by default (first filled)
    expect(screen.getByTestId('hero-radio-seat-0').checked).toBe(true);
    expect(screen.getByTestId('hero-radio-seat-1').checked).toBe(false);

    // Board slots
    expect(screen.getByTestId('board-slot-flop1')).toBeTruthy();
    expect(screen.getByTestId('board-slot-flop2')).toBeTruthy();
    expect(screen.getByTestId('board-slot-flop3')).toBeTruthy();
    expect(screen.getByTestId('board-slot-turn')).toBeTruthy();
    expect(screen.getByTestId('board-slot-river')).toBeTruthy();

    // Auto-generated name uses hero + villain hands
    const nameInput = screen.getByTestId('modal-name-input');
    expect(nameInput.value).toBe('AKo vs QJs on K72r');

    // Playlists load
    await waitFor(() => {
      expect(screen.getByTestId('playlist-picker-pl-1')).toBeTruthy();
    });
  });

  it('6-handed hand auto-names with "(6-max)" suffix', async () => {
    apiFetch = mockApi({ playlists: { playlists: [{ playlist_id: 'pl-1', name: 'General' }] } });
    await act(async () => {
      render(<SaveAsScenarioModal hand={SIX_MAX_HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    expect(screen.getByTestId('modal-name-input').value).toBe('AKo (6-max) on K72r');
    // All 6 seat rows rendered
    for (let i = 0; i < 6; i++) {
      expect(screen.getByTestId(`seat-row-${i}`)).toBeTruthy();
    }
  });

  it('heroPlayerId prop selects the matching seat as default hero', async () => {
    await act(async () => {
      render(
        <SaveAsScenarioModal
          hand={HAND}
          heroPlayerId="p-vil"
          onClose={onClose}
          onSaved={onSaved}
          apiFetch={apiFetch}
        />
      );
    });
    expect(screen.getByTestId('hero-radio-seat-1').checked).toBe(true);
    expect(screen.getByTestId('hero-radio-seat-0').checked).toBe(false);
    // Name flips: seat 1 (QJs) becomes hero
    expect(screen.getByTestId('modal-name-input').value).toBe('QJs vs AKo on K72r');
  });

  it('clicking a seat card opens the CardPicker', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    fireEvent.click(screen.getByTestId('seat-0-card-0'));
    await waitFor(() => expect(screen.getByText(/Pick card for Hero/i)).toBeTruthy());
  });

  it('clearing a seat card leaves slot empty and reflects in save payload', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));

    // Clear hero's second card
    fireEvent.click(screen.getByTestId('seat-0-card-1-clear'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-save-btn'));
    });

    const patchCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/scenarios/sc-new' && o?.method === 'PATCH'
    );
    const patchBody = JSON.parse(patchCall[1].body);
    // Hero seat 0 should have only one card left; cleared card filtered out
    const heroConfig = patchBody.seat_configs.find((s) => s.seat === 0);
    expect(heroConfig.cards).toEqual(['Ac']);
  });

  it('changing hero radio updates auto-name and PATCH hero_seat', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));

    // User switches hero to seat 1
    fireEvent.click(screen.getByTestId('hero-radio-seat-1'));
    expect(screen.getByTestId('hero-radio-seat-1').checked).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-save-btn'));
    });

    const patchCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/scenarios/sc-new' && o?.method === 'PATCH'
    );
    const patchBody = JSON.parse(patchCall[1].body);
    expect(patchBody.hero_seat).toBe(1);
  });

  it('passes hero_player_id on from-hand POST', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-save-btn'));
    });
    const fromHandCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/scenarios/from-hand' && o?.method === 'POST'
    );
    expect(JSON.parse(fromHandCall[1].body)).toMatchObject({
      hand_id: 'h-abc123',
      include_board: true,
      hero_player_id: 'p-hero',
    });
  });

  it('auto-selects first playlist when no tag match', async () => {
    apiFetch = mockApi({ playlists: { playlists: [{ playlist_id: 'pl-1', name: 'Some Playlist' }] } });
    await act(async () => {
      render(<SaveAsScenarioModal hand={{ ...HAND, tags: [] }} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));
    expect(screen.getByTestId('playlist-picker-pl-1').textContent).toMatch(/SELECTED/);
  });

  it('pre-selects playlist whose name tokens match a hand tag', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-2'));
    expect(screen.getByTestId('playlist-picker-pl-2').textContent).toMatch(/SELECTED/);
    expect(screen.getAllByText('SELECTED').length).toBe(1);
  });

  it('falls back to first playlist when no tag matches any playlist name', async () => {
    await act(async () => {
      render(
        <SaveAsScenarioModal
          hand={{ ...HAND, tags: ['WALK'] }}
          onClose={onClose}
          onSaved={onSaved}
          apiFetch={apiFetch}
        />
      );
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));
    expect(screen.getByTestId('playlist-picker-pl-1').textContent).toMatch(/SELECTED/);
  });

  it('does not reset user playlist choice on hand re-render (live review)', async () => {
    const { rerender } = render(
      <SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />
    );
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));

    fireEvent.click(screen.getByTestId('playlist-picker-pl-3'));
    expect(screen.getByTestId('playlist-picker-pl-3').textContent).toMatch(/SELECTED/);

    await act(async () => {
      rerender(
        <SaveAsScenarioModal
          hand={{ ...HAND, tags: ['3BET_POT', 'C_BET', 'DONK_BET'] }}
          onClose={onClose}
          onSaved={onSaved}
          apiFetch={apiFetch}
        />
      );
    });

    expect(screen.getByTestId('playlist-picker-pl-3').textContent).toMatch(/SELECTED/);
    expect(screen.getAllByText('SELECTED').length).toBe(1);
  });

  it('name field is editable', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    const input = screen.getByTestId('modal-name-input');
    fireEvent.change(input, { target: { value: 'My custom name' } });
    expect(input.value).toBe('My custom name');
  });

  it('clicking a board slot opens the CardPicker', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    fireEvent.click(screen.getByTestId('board-slot-turn'));
    await waitFor(() => expect(screen.getByText(/Pick card for turn/i)).toBeTruthy());
  });

  it('Save flow: POST from-hand → PATCH (name, board, seat_configs, hero_seat) → POST items', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));

    fireEvent.click(screen.getByTestId('playlist-picker-pl-2'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-save-btn'));
    });

    const fromHandCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/scenarios/from-hand' && o?.method === 'POST'
    );
    expect(fromHandCall).toBeTruthy();
    expect(JSON.parse(fromHandCall[1].body)).toMatchObject({ hand_id: 'h-abc123', include_board: true });

    const patchCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/scenarios/sc-new' && o?.method === 'PATCH'
    );
    expect(patchCall).toBeTruthy();
    const patchBody = JSON.parse(patchCall[1].body);
    expect(patchBody.name).toBe('AKo vs QJs on K72r');
    expect(patchBody.board_flop).toBe('Kh7s2d');
    expect(patchBody.primary_playlist_id).toBe('pl-2');
    expect(patchBody.hero_seat).toBe(0);
    expect(patchBody.seat_configs).toEqual([
      { seat: 0, cards: ['Ac', 'Kd'] },
      { seat: 1, cards: ['Qs', 'Js'] },
    ]);

    const linkCall = apiFetch.mock.calls.find(
      ([p, o]) => p === '/api/playlists/pl-2/items' && o?.method === 'POST'
    );
    expect(linkCall).toBeTruthy();
    expect(JSON.parse(linkCall[1].body)).toMatchObject({ scenario_id: 'sc-new' });

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Save shows error and keeps modal open on API failure', async () => {
    apiFetch = vi.fn().mockImplementation(async (path, opts) => {
      if (path === '/api/playlists') return { playlists: PLAYLISTS };
      if (path === '/api/scenarios/from-hand') throw new Error('boom');
      throw new Error('unexpected');
    });
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    await waitFor(() => screen.getByTestId('playlist-picker-pl-1'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('modal-save-btn'));
    });

    expect(screen.getByTestId('modal-save-error').textContent).toMatch(/boom/);
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Cancel closes without calling any save endpoint', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    fireEvent.click(screen.getByTestId('modal-cancel-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    const nonGetCalls = apiFetch.mock.calls.filter(([, o]) => o?.method && o.method !== undefined);
    expect(nonGetCalls).toHaveLength(0);
  });

  it('Close button closes the modal', async () => {
    await act(async () => {
      render(<SaveAsScenarioModal hand={HAND} onClose={onClose} onSaved={onSaved} apiFetch={apiFetch} />);
    });
    fireEvent.click(screen.getByTestId('modal-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('guessPlaylistId()', () => {
  const PLAYLISTS_FIXTURE = [
    { playlist_id: 'pl-1', name: 'Dry Flop Spots' },
    { playlist_id: 'pl-2', name: 'C-Bet Lines' },
    { playlist_id: 'pl-3', name: '3-Bet Pots' },
    { playlist_id: 'pl-4', name: 'Wet Flop Spots' },
  ];

  it('matches underscore tag against hyphenated playlist name', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['C_BET'])).toBe('pl-2');
  });

  it('matches DRY_FLOP against "Dry Flop Spots"', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['DRY_FLOP'])).toBe('pl-1');
  });

  it('matches 3BET_POT against "3-Bet Pots"', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['3BET_POT'])).toBe('pl-3');
  });

  it('returns null when no tag matches any playlist', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['WALK'])).toBeNull();
  });

  it('ignores tags whose only tokens are single characters', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['a', '1'])).toBeNull();
  });

  it('returns null for empty inputs', () => {
    expect(guessPlaylistId([], ['C_BET'])).toBeNull();
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, [])).toBeNull();
  });

  it('returns the first matching tag (not every candidate)', () => {
    expect(guessPlaylistId(PLAYLISTS_FIXTURE, ['DRY_FLOP', 'C_BET'])).toBe('pl-1');
  });
});
