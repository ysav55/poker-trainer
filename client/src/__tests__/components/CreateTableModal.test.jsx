/**
 * CreateTableModal.test.jsx
 *
 * Tests for CreateTableModal refactor:
 *  - Unified preset dropdown with optgroups (My Presets, School Blinds, Platform Blinds)
 *  - Fetches from /api/table-presets (personal) and /api/settings/school/blind-structures
 *  - Preset selection: personal presets fill full config; blind structures fill bb + max_players
 *  - max_players select with options 2, 6, 8, 9 (default 9)
 *  - SB input removed; SB computed as bb / 2 in POST body
 *  - POST includes max_players field
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

import CreateTableModal from '../../components/tables/CreateTableModal.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderModal(onClose = vi.fn(), onCreated = vi.fn()) {
  return render(
    <CreateTableModal onClose={onClose} onCreated={onCreated} />
  );
}

// ── Data fixtures ─────────────────────────────────────────────────────────────

const MOCK_PERSONAL_PRESETS = [
  { id: 'p1', name: 'My 1/2', config: { sb: 1, bb: 2, startingStack: 500 } },
  { id: 'p2', name: 'My 2/5', config: { sb: 2, bb: 5, startingStack: 1000 } },
];

const MOCK_BLIND_STRUCTURES = [
  { id: 'bs1', label: '0.05/0.10', bb: 0.10, sb: 0.05, source: 'school', max_players: 6 },
  { id: 'bs2', label: '0.25/0.50', bb: 0.50, sb: 0.25, source: 'school', max_players: 6 },
  { id: 'bs3', label: '1/2', bb: 2, sb: 1, source: 'org', max_players: 9 },
  { id: 'bs4', label: '2/5', bb: 5, sb: 2, source: 'org', max_players: 9 },
];

// ── API fetch mock setup ──────────────────────────────────────────────────────

function setupApiMocks() {
  mockApiFetch.mockImplementation((url, opts) => {
    if (url === '/api/table-presets') {
      return Promise.resolve({ presets: MOCK_PERSONAL_PRESETS });
    }
    if (url === '/api/settings/school/blind-structures') {
      return Promise.resolve({ structures: MOCK_BLIND_STRUCTURES });
    }
    if (opts?.method === 'POST' && url === '/api/tables') {
      const body = JSON.parse(opts.body);
      return Promise.resolve({ id: 'table-1', ...body });
    }
    return Promise.resolve({});
  });
}

// ── Unified preset dropdown rendering ─────────────────────────────────────────

describe('CreateTableModal — unified preset dropdown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders a unified preset select with all presets loaded', async () => {
    renderModal();
    await waitFor(() => {
      const select = screen.getByDisplayValue(/Select a preset/);
      expect(select).toBeTruthy();
    });
  });

  it('fetches personal presets from /api/table-presets on mount', async () => {
    renderModal();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/table-presets');
    });
  });

  it('fetches blind structures from /api/settings/school/blind-structures on mount', async () => {
    renderModal();
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/settings/school/blind-structures');
    });
  });

  it('groups presets by source: My Presets, School Blinds, Platform Blinds', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('My 1/2')).toBeTruthy();
      expect(screen.getByText('0.05/0.10')).toBeTruthy();
      expect(screen.getByText('1/2')).toBeTruthy();
    });
  });

  it('displays optgroup labels for each section', async () => {
    renderModal();
    await waitFor(() => {
      const optgroups = screen.getAllByRole('group');
      expect(optgroups.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ── Personal preset selection logic ───────────────────────────────────────────

describe('CreateTableModal — personal preset selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('fills bb, startingStack when personal preset is selected', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('My 1/2')).toBeTruthy();
    });

    // Select personal preset
    const selects = screen.getAllByRole('combobox');
    const presetSelect = selects[0];
    fireEvent.change(presetSelect, { target: { value: 'p1' } });

    // Check that bb is filled to 2
    await waitFor(() => {
      const bbInputs = screen.getAllByRole('spinbutton');
      // The BB input is the first spinbutton
      const bbInput = bbInputs[0];
      expect(bbInput.value).toBe('2');
    });
  });

  it('max_players remains at default when personal preset is selected', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('My 1/2')).toBeTruthy();
    });

    // Select personal preset
    const selects = screen.getAllByRole('combobox');
    const presetSelect = selects[0];  // First select is the preset dropdown
    fireEvent.change(presetSelect, { target: { value: 'p1' } });

    // Check max_players defaults to 9
    await waitFor(() => {
      const maxPlayersSelects = screen.getAllByRole('combobox');
      const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '9');
      expect(maxPlayersSelect).toBeTruthy();
    });
  });
});

// ── Blind structure selection logic ───────────────────────────────────────────

describe('CreateTableModal — blind structure selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('fills bb and max_players when blind structure is selected', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('0.05/0.10')).toBeTruthy();
    });

    // Select blind structure
    const selects = screen.getAllByRole('combobox');
    const presetSelect = selects[0];
    fireEvent.change(presetSelect, { target: { value: 'bs1' } });

    // Check that BB is filled to 0.1
    await waitFor(() => {
      const bbInputs = screen.getAllByRole('spinbutton');
      const bbInput = bbInputs[0];  // The BB input is the first spinbutton
      expect(parseFloat(bbInput.value)).toBeCloseTo(0.1, 2);
    });

    // Check max_players is 6
    await waitFor(() => {
      const maxPlayersSelects = screen.getAllByRole('combobox');
      const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '6');
      expect(maxPlayersSelect).toBeTruthy();
    });
  });
});

// ── max_players select ────────────────────────────────────────────────────────

describe('CreateTableModal — max_players select', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('renders max_players select with options 2, 6, 8, 9', async () => {
    renderModal();
    const maxPlayersSelects = screen.getAllByRole('combobox');
    const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '9');
    expect(maxPlayersSelect).toBeTruthy();

    fireEvent.click(maxPlayersSelect);
    expect(screen.getByText('Heads-Up (2)')).toBeTruthy();
    expect(screen.getByText('6-Max')).toBeTruthy();
    expect(screen.getByText('8-Handed')).toBeTruthy();
    expect(screen.getByText('Full Ring (9)')).toBeTruthy();
  });

  it('defaults to 9 max_players', async () => {
    renderModal();
    const maxPlayersSelects = screen.getAllByRole('combobox');
    const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '9');
    expect(maxPlayersSelect).toBeTruthy();
  });

  it('allows changing max_players independently', async () => {
    renderModal();
    const maxPlayersSelects = screen.getAllByRole('combobox');
    const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '9');
    fireEvent.change(maxPlayersSelect, { target: { value: '6' } });
    await waitFor(() => {
      expect(maxPlayersSelect.value).toBe('6');
    });
  });
});

// ── SB input removed ──────────────────────────────────────────────────────────

describe('CreateTableModal — SB input removed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('does not render a Small Blind input field', async () => {
    renderModal();
    const sbInputs = screen.queryAllByLabelText(/Small Blind/i);
    expect(sbInputs.length).toBe(0);
  });
});

// ── POST body structure ───────────────────────────────────────────────────────

describe('CreateTableModal — POST body', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupApiMocks();
  });

  it('computes sb as bb / 2 in POST body', async () => {
    renderModal();

    // Fill table name
    fireEvent.change(screen.getByPlaceholderText('e.g. Main Table'), {
      target: { value: 'Test Table' },
    });

    // Set BB to 50
    const bbInputs = screen.getAllByRole('spinbutton');
    const bbInput = bbInputs[0];  // The BB input is the first spinbutton
    fireEvent.change(bbInput, { target: { value: '50' } });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/api/tables'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.config.sb).toBe(25);
      expect(body.config.bb).toBe(50);
    });
  });

  it('includes max_players in POST body', async () => {
    renderModal();

    // Fill table name
    fireEvent.change(screen.getByPlaceholderText('e.g. Main Table'), {
      target: { value: 'Test Table' },
    });

    // Set max_players to 6
    const maxPlayersSelects = screen.getAllByRole('combobox');
    const maxPlayersSelect = maxPlayersSelects.find((s) => s.value === '9');
    fireEvent.change(maxPlayersSelect, { target: { value: '6' } });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/api/tables'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.max_players).toBe(6);
    });
  });

  it('includes all required fields in POST body', async () => {
    renderModal();

    // Fill required fields
    fireEvent.change(screen.getByPlaceholderText('e.g. Main Table'), {
      target: { value: 'Test Table' },
    });

    // Submit
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      const postCall = mockApiFetch.mock.calls.find(
        (c) => c[1]?.method === 'POST' && c[0] === '/api/tables'
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse(postCall[1].body);
      expect(body.name).toBe('Test Table');
      expect(body.mode).toBeTruthy();
      expect(body.privacy).toBeTruthy();
      expect(body.config.bb).toBeTruthy();
      expect(body.config.sb).toBeTruthy();
      expect(body.max_players).toBeTruthy();
    });
  });
});
