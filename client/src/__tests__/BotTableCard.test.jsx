/**
 * BotTableCard.test.jsx
 *
 * Tests:
 *  - Renders table name
 *  - Renders human and bot counts
 *  - Renders difficulty pill
 *  - Renders phase pill
 *  - JOIN button calls onJoin with tableId
 *  - Renders without optional fields (minimal data)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import BotTableCard from '../components/BotTableCard.jsx';

function renderCard(table, onJoin = vi.fn()) {
  return render(<BotTableCard table={table} onJoin={onJoin} />);
}

// ── Full data ──────────────────────────────────────────────────────────────────

describe('BotTableCard with full data', () => {
  const TABLE = {
    id: 'bt-1',
    name: 'Alpha Table',
    phase: 'flop',
    difficulty: 'hard',
    human_count: 2,
    bot_count: 6,
  };

  it('renders card container', () => {
    renderCard(TABLE);
    expect(screen.getByTestId('bot-table-card')).toBeTruthy();
  });

  it('renders the table name', () => {
    renderCard(TABLE);
    expect(screen.getByText('Alpha Table')).toBeTruthy();
  });

  it('renders human count', () => {
    renderCard(TABLE);
    expect(screen.getByTestId('human-count').textContent).toMatch(/2 human/);
  });

  it('renders bot count', () => {
    renderCard(TABLE);
    expect(screen.getByTestId('bot-count').textContent).toMatch(/6 bot/);
  });

  it('renders difficulty pill', () => {
    renderCard(TABLE);
    expect(screen.getByText('HARD')).toBeTruthy();
  });

  it('renders phase pill', () => {
    renderCard(TABLE);
    expect(screen.getByText('FLOP')).toBeTruthy();
  });

  it('JOIN button calls onJoin with the table id', () => {
    const onJoin = vi.fn();
    renderCard(TABLE, onJoin);
    fireEvent.click(screen.getByTestId('join-button'));
    expect(onJoin).toHaveBeenCalledWith('bt-1');
  });
});

// ── Minimal data ───────────────────────────────────────────────────────────────

describe('BotTableCard with minimal data', () => {
  const MINIMAL = { id: 'bt-x' };

  it('renders without crashing', () => {
    renderCard(MINIMAL);
    expect(screen.getByTestId('bot-table-card')).toBeTruthy();
  });

  it('falls back to generated name when name is absent', () => {
    renderCard(MINIMAL);
    expect(screen.getByText(/Bot Table/i)).toBeTruthy();
  });

  it('shows 0 humans and 0 bots when counts absent', () => {
    renderCard(MINIMAL);
    expect(screen.getByTestId('human-count').textContent).toMatch(/0 human/);
    expect(screen.getByTestId('bot-count').textContent).toMatch(/0 bot/);
  });

  it('falls back to WAITING phase when phase absent', () => {
    renderCard(MINIMAL);
    expect(screen.getByText('WAITING')).toBeTruthy();
  });

  it('falls back to MEDIUM difficulty when difficulty absent', () => {
    renderCard(MINIMAL);
    expect(screen.getByText('MEDIUM')).toBeTruthy();
  });
});

// ── Alternative field names ────────────────────────────────────────────────────

describe('BotTableCard with camelCase fields', () => {
  const TABLE = {
    tableId: 'bt-cc',
    humanCount: 3,
    botCount: 4,
    difficulty: 'easy',
    phase: 'river',
  };

  it('reads tableId when id absent', () => {
    const onJoin = vi.fn();
    renderCard(TABLE, onJoin);
    fireEvent.click(screen.getByTestId('join-button'));
    expect(onJoin).toHaveBeenCalledWith('bt-cc');
  });

  it('reads humanCount camelCase', () => {
    renderCard(TABLE);
    expect(screen.getByTestId('human-count').textContent).toMatch(/3 human/);
  });

  it('reads botCount camelCase', () => {
    renderCard(TABLE);
    expect(screen.getByTestId('bot-count').textContent).toMatch(/4 bot/);
  });
});
