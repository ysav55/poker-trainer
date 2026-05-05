import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useHandsLibrary from '../useHandsLibrary.js';
import * as api from '../../lib/api.js';

vi.mock('../../lib/api.js');

describe('useHandsLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('fetches on mount with default params', async () => {
    const mockResult = { hands: [{ hand_id: 'h1', winner_name: 'Alice' }], total: 1 };
    api.apiFetch.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useHandsLibrary());

    // Wait for data to be loaded
    await waitFor(() => expect(result.current.hands).toHaveLength(1), { timeout: 1000 });

    expect(result.current.hands).toEqual(mockResult.hands);
    expect(result.current.total).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it('debounces query changes', async () => {
    api.apiFetch.mockResolvedValue({ hands: [], total: 0 });

    const { rerender } = renderHook((props) => useHandsLibrary(props), {
      initialProps: { q: 'alice' }
    });

    // Initial render should trigger fetch
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(1), { timeout: 1000 });

    // Change props multiple times in quick succession
    rerender({ q: 'aliceb' });
    rerender({ q: 'alicebo' });

    // Still only 1 call due to debounce
    expect(api.apiFetch).toHaveBeenCalledTimes(1);

    // Wait for new debounce window to settle
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledTimes(2), { timeout: 1000 });
  });

  it('forwards q, range, limit, offset to URL params', async () => {
    api.apiFetch.mockResolvedValue({ hands: [], total: 0 });

    renderHook(() => useHandsLibrary({ q: 'winner', range: ['AA', 'KK'], limit: 10, offset: 5 }));

    await waitFor(() => expect(api.apiFetch).toHaveBeenCalled(), { timeout: 1000 });

    const call = api.apiFetch.mock.calls[0][0];
    expect(call).toContain('q=winner');
    expect(call).toContain('range=AA%2CKK');
    expect(call).toContain('limit=10');
    expect(call).toContain('offset=5');
  });

  it('returns hands and total from API response', async () => {
    const mockResult = {
      hands: [
        { hand_id: 'h1', winner_name: 'Alice', pot_end: '50' },
        { hand_id: 'h2', winner_name: 'Bob', pot_end: '100' }
      ],
      total: 2
    };
    api.apiFetch.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useHandsLibrary());

    await waitFor(() => expect(result.current.hands).toHaveLength(2), { timeout: 1000 });

    expect(result.current.hands).toEqual(mockResult.hands);
    expect(result.current.total).toBe(2);
  });

  it('sets error when apiFetch fails', async () => {
    const testError = new Error('Network error');
    api.apiFetch.mockRejectedValue(testError);

    const { result } = renderHook(() => useHandsLibrary());

    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 1000 });

    expect(result.current.error).toEqual(testError);
    expect(result.current.hands).toEqual([]);
  });
});
