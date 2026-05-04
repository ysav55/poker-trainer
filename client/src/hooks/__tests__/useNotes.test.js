import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useNotes from '../useNotes.js';

const mockApi = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args) => mockApi(...args),
}));

beforeEach(() => {
  mockApi.mockReset();
  useNotes.__clearCache?.();
});

describe('useNotes', () => {
  it('fetches notes on mount when handId is set', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'hi' }] });
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toEqual([{ id: 'n1', body: 'hi' }]));
    expect(mockApi).toHaveBeenCalledWith('/api/hands/h1/notes');
  });

  it('does not fetch when handId is null', () => {
    renderHook(() => useNotes(null));
    expect(mockApi).not.toHaveBeenCalled();
  });

  it('add() POSTs and prepends the returned note', async () => {
    mockApi.mockResolvedValueOnce({ notes: [] });               // initial fetch
    mockApi.mockResolvedValueOnce({ note: { id: 'n2', body: 'new' } }); // add
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toEqual([]));
    await act(() => result.current.add('new'));
    expect(mockApi).toHaveBeenLastCalledWith('/api/hands/h1/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'new' }),
    });
    expect(result.current.notes[0].id).toBe('n2');
  });

  it('edit() PATCHes and replaces the note in place', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'old' }] });
    mockApi.mockResolvedValueOnce({ note: { id: 'n1', body: 'edited' } });
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    await act(() => result.current.edit('n1', 'edited'));
    expect(result.current.notes[0].body).toBe('edited');
  });

  it('remove() DELETEs and drops the note', async () => {
    mockApi.mockResolvedValueOnce({ notes: [{ id: 'n1', body: 'x' }] });
    mockApi.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useNotes('h1'));
    await waitFor(() => expect(result.current.notes).toHaveLength(1));
    await act(() => result.current.remove('n1'));
    expect(result.current.notes).toEqual([]);
  });
});
