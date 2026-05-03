import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabHistory from '../TabHistory.jsx';

const data = {
  history: [],
  session: { hands: 0 },
};

describe('TabHistory — Players sub-mode (removed)', () => {
  it('does not render Players segment toggle', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Players' })).toBeNull();
  });

  it('does not render the "Table" segment toggle either (single mode now)', () => {
    render(<TabHistory data={data} onLoadReview={vi.fn()} />);
    // Now only the Table view renders, no segment selector
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });
});
