/**
 * BotSeatIndicator.test.jsx
 *
 * Tests:
 *  - Renders robot icon for bot seats
 *  - Renders person icon for human seats
 *  - Correct data-testid on each variant
 *  - Correct aria-label
 *  - Custom size prop applied
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import BotSeatIndicator from '../components/BotSeatIndicator.jsx';

describe('BotSeatIndicator — bot seat', () => {
  it('renders bot indicator with robot emoji', () => {
    render(<BotSeatIndicator isBot={true} />);
    const el = screen.getByTestId('bot-seat-indicator');
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('🤖');
  });

  it('has aria-label "Bot player"', () => {
    render(<BotSeatIndicator isBot={true} />);
    expect(screen.getByLabelText('Bot player')).toBeTruthy();
  });
});

describe('BotSeatIndicator — human seat', () => {
  it('renders human indicator with person emoji', () => {
    render(<BotSeatIndicator isBot={false} />);
    const el = screen.getByTestId('human-seat-indicator');
    expect(el).toBeTruthy();
    expect(el.textContent).toBe('👤');
  });

  it('has aria-label "Human player"', () => {
    render(<BotSeatIndicator isBot={false} />);
    expect(screen.getByLabelText('Human player')).toBeTruthy();
  });
});

describe('BotSeatIndicator — default isBot', () => {
  it('defaults to human (isBot undefined) without crashing', () => {
    render(<BotSeatIndicator />);
    expect(screen.getByTestId('human-seat-indicator')).toBeTruthy();
  });
});

describe('BotSeatIndicator — size prop', () => {
  it('applies custom font-size via size prop', () => {
    render(<BotSeatIndicator isBot={true} size={20} />);
    const el = screen.getByTestId('bot-seat-indicator');
    expect(el.style.fontSize).toBe('20px');
  });
});
