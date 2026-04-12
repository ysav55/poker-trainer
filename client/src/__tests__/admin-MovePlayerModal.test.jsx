import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import MovePlayerModal from '../components/admin/MovePlayerModal.jsx';

const TABLES = [
  { id: 't1', name: 'Table One', players: [{ id: 'p1', name: 'Alice' }, { id: 'p2', name: 'Bob' }] },
  { id: 't2', name: 'Table Two', players: [{ id: 'p3', name: 'Carol' }] },
];

describe('MovePlayerModal', () => {
  it('renders title and selects', () => {
    render(<MovePlayerModal tables={TABLES} onClose={() => {}} onMove={() => {}} />);
    expect(screen.getByText('MOVE PLAYER')).toBeTruthy();
    expect(screen.getByText('Select source table')).toBeTruthy();
  });

  it('shows validation error when fields empty', () => {
    render(<MovePlayerModal tables={TABLES} onClose={() => {}} onMove={() => {}} />);
    fireEvent.click(screen.getByText('Move Player'));
    expect(screen.getByText('All fields are required.')).toBeTruthy();
  });

  it('calls onMove and onClose on valid submit', () => {
    const onMove = vi.fn();
    const onClose = vi.fn();
    render(<MovePlayerModal tables={TABLES} onClose={onClose} onMove={onMove} />);
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 't1' } });
    fireEvent.change(selects[1], { target: { value: 'p1' } });
    fireEvent.change(selects[2], { target: { value: 't2' } });
    fireEvent.click(screen.getByText('Move Player'));
    expect(onMove).toHaveBeenCalledWith({ fromTableId: 't1', toTableId: 't2', playerId: 'p1' });
    expect(onClose).toHaveBeenCalled();
  });

  it('cancel invokes onClose', () => {
    const onClose = vi.fn();
    render(<MovePlayerModal tables={TABLES} onClose={onClose} onMove={() => {}} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
