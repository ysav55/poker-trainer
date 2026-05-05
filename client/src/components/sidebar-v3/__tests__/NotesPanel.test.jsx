import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import NotesPanel from '../NotesPanel.jsx';

const sampleNotes = [
  { id: 'n1', body: 'First note', author_name: 'Yonatan', author_player_id: 'p1', created_at: '2026-04-30T10:00:00Z', updated_at: '2026-04-30T10:00:00Z' },
  { id: 'n2', body: 'Second',     author_name: 'Yonatan', author_player_id: 'p1', created_at: '2026-04-30T10:05:00Z', updated_at: '2026-04-30T10:05:00Z' },
];

const apiBase = {
  notes: sampleNotes,
  loading: false,
  error: null,
  refresh: vi.fn(),
  add: vi.fn(),
  edit: vi.fn(),
  remove: vi.fn(),
};

describe('NotesPanel — inline-live mode', () => {
  it('renders notes with author + body', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    expect(screen.getByText('First note')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getAllByText('Yonatan')).toHaveLength(2);
  });

  it('Add note: typing then Save calls api.add', () => {
    const api = { ...apiBase, add: vi.fn().mockResolvedValue({ id: 'n3', body: 'new' }) };
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    const ta = screen.getByPlaceholderText(/type a note/i);
    fireEvent.change(ta, { target: { value: 'new note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.add).toHaveBeenCalledWith('new note');
  });

  it('Save is disabled when textarea empty', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('Char count is displayed', () => {
    render(<NotesPanel mode="inline-live" handId="h1" api={apiBase} />);
    fireEvent.click(screen.getByRole('button', { name: /\+ Add note/i }));
    const ta = screen.getByPlaceholderText(/type a note/i);
    fireEvent.change(ta, { target: { value: 'hello' } });
    expect(screen.getByText(/5\s*\/\s*500/)).toBeInTheDocument();
  });

  it('Edit button toggles textarea, Save calls api.edit', () => {
    const api = { ...apiBase, edit: vi.fn().mockResolvedValue({ id: 'n1', body: 'edited' }) };
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    const editBtns = screen.getAllByRole('button', { name: 'edit' });
    fireEvent.click(editBtns[0]); // first edit button (for n1)
    const ta = screen.getByDisplayValue('First note');
    fireEvent.change(ta, { target: { value: 'edited' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.edit).toHaveBeenCalledWith('n1', 'edited');
  });

  it('Delete button calls api.remove (with confirm)', () => {
    const api = { ...apiBase, remove: vi.fn().mockResolvedValue() };
    const realConfirm = window.confirm;
    window.confirm = () => true;
    render(<NotesPanel mode="inline-live" handId="h1" api={api} />);
    const deleteButtons = screen.getAllByRole('button', { name: 'delete' });
    fireEvent.click(deleteButtons[1]); // second delete button (for n2)
    expect(api.remove).toHaveBeenCalledWith('n2');
    window.confirm = realConfirm;
  });
});

describe('NotesPanel — review mode', () => {
  it('renders the same edit affordances as inline-live', () => {
    render(<NotesPanel mode="review" handId="h1" api={apiBase} />);
    expect(screen.getByRole('button', { name: /\+ Add note/i })).toBeInTheDocument();
  });
});

describe('NotesPanel — preview mode', () => {
  it('renders read-only — no Add button, no edit/delete buttons', () => {
    render(<NotesPanel mode="preview" handId="h1" api={apiBase} />);
    expect(screen.queryByRole('button', { name: /\+ Add note/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: '×' })).toBeNull();
  });

  it('truncates to first 3 notes and shows "see more" hint', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`, body: `body ${i}`, author_name: 'X', author_player_id: 'p1',
      created_at: '2026-04-30T10:00:00Z', updated_at: '2026-04-30T10:00:00Z',
    }));
    render(<NotesPanel mode="preview" handId="h1" api={{ ...apiBase, notes: many }} />);
    expect(screen.getByText('body 0')).toBeInTheDocument();
    expect(screen.getByText('body 2')).toBeInTheDocument();
    expect(screen.queryByText('body 4')).toBeNull();
    expect(screen.getByText(/see more in Review/i)).toBeInTheDocument();
  });
});
