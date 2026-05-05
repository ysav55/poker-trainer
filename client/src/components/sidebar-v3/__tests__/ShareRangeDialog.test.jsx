import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ShareRangeDialog from '../ShareRangeDialog.jsx';

describe('ShareRangeDialog', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<ShareRangeDialog open={false} onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label input + Broadcast + Cancel when open', () => {
    render(<ShareRangeDialog open onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/label/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Broadcast/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeInTheDocument();
  });

  it('Broadcast is disabled when no groups selected', () => {
    render(<ShareRangeDialog open onSubmit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Broadcast/ })).toBeDisabled();
  });

  it('Cancel calls onClose without submit', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<ShareRangeDialog open onSubmit={onSubmit} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc key closes the dialog', () => {
    const onClose = vi.fn();
    render(<ShareRangeDialog open onSubmit={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('typing a label updates the input value', () => {
    render(<ShareRangeDialog open onSubmit={vi.fn()} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/label/i);
    fireEvent.change(input, { target: { value: 'BTN open' } });
    expect(input.value).toBe('BTN open');
  });
});
