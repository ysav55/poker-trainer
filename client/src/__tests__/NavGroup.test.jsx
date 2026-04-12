import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import NavGroup from '../components/SideNav/NavGroup.jsx';

describe('NavGroup', () => {
  it('renders label when expanded', () => {
    render(<NavGroup label="COACHING" expanded={true}><div>child</div></NavGroup>);
    expect(screen.getByText('COACHING')).toBeTruthy();
    expect(screen.getByText('child')).toBeTruthy();
  });

  it('hides label when collapsed, still renders children', () => {
    render(<NavGroup label="COACHING" expanded={false}><div>child</div></NavGroup>);
    expect(screen.queryByText('COACHING')).toBeNull();
    expect(screen.getByText('child')).toBeTruthy();
  });
});
