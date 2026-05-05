import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CoachRoleToggle from '../CoachRoleToggle.jsx';

describe('CoachRoleToggle', () => {
  it('renders Play and Monitor pills', () => {
    render(<CoachRoleToggle role="play" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Monitor/ })).toBeInTheDocument();
  });

  it('applies active class to Play when role=play', () => {
    const { container } = render(<CoachRoleToggle role="play" onChange={vi.fn()} />);
    const playBtn = screen.getByRole('button', { name: 'Play' });
    expect(playBtn.className).toContain('active');
  });

  it('applies active class to Monitor when role=monitor', () => {
    const { container } = render(<CoachRoleToggle role="monitor" onChange={vi.fn()} />);
    const monitorBtn = screen.getByRole('button', { name: /Monitor/ });
    expect(monitorBtn.className).toContain('active');
  });

  it('does not apply active class to Play when role=monitor', () => {
    const { container } = render(<CoachRoleToggle role="monitor" onChange={vi.fn()} />);
    const playBtn = screen.getByRole('button', { name: 'Play' });
    expect(playBtn.className).not.toContain('active');
  });

  it('does not apply active class to Monitor when role=play', () => {
    const { container } = render(<CoachRoleToggle role="play" onChange={vi.fn()} />);
    const monitorBtn = screen.getByRole('button', { name: /Monitor/ });
    expect(monitorBtn.className).not.toContain('active');
  });

  it('calls onChange with "play" when Play is clicked', () => {
    const onChange = vi.fn();
    render(<CoachRoleToggle role="monitor" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onChange).toHaveBeenCalledWith('play');
  });

  it('calls onChange with "monitor" when Monitor is clicked', () => {
    const onChange = vi.fn();
    render(<CoachRoleToggle role="play" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Monitor/ }));
    expect(onChange).toHaveBeenCalledWith('monitor');
  });

  it('handles undefined onChange gracefully', () => {
    render(<CoachRoleToggle role="play" onChange={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Monitor/ }));
    // Should not throw
    expect(true).toBe(true);
  });

  it('includes monitor emoji in button text', () => {
    render(<CoachRoleToggle role="play" onChange={vi.fn()} />);
    const monitorBtn = screen.getByRole('button', { name: /Monitor 👁/ });
    expect(monitorBtn).toBeInTheDocument();
  });
});
