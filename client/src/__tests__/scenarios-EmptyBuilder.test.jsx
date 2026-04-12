import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import EmptyBuilder from '../components/scenarios/EmptyBuilder.jsx';

describe('EmptyBuilder', () => {
  it('renders instructional copy and a New Scenario CTA', () => {
    render(<EmptyBuilder onNewScenario={() => {}} />);
    expect(screen.getByTestId('empty-builder')).toBeTruthy();
    expect(screen.getByText('Select a scenario to edit')).toBeTruthy();
    expect(screen.getByText('+ New Scenario')).toBeTruthy();
  });

  it('fires onNewScenario when CTA pressed', () => {
    const fn = vi.fn();
    render(<EmptyBuilder onNewScenario={fn} />);
    fireEvent.click(screen.getByTestId('empty-new-btn'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
