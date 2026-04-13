import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDrillSession } from '../hooks/useDrillSession';

const fetchMock = vi.fn();
global.fetch = fetchMock;
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));
import { apiFetch } from '../lib/api';

const listeners = new Map();
const socket = {
  emit: vi.fn(),
  on: (ev, fn) => listeners.set(ev, fn),
  off: (ev) => listeners.delete(ev),
};

beforeEach(() => {
  vi.resetAllMocks();
  listeners.clear();
  global.fetch = fetchMock;
});

describe('useDrillSession.launch', () => {
  it('POSTs to /drill with the right body and stores session', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ session: { id: 'ds1', status: 'active' }, fitCount: 3 }),
    });
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      await result.current.launch({ playlistId: 'p1', heroPlayerId: 'u2', heroMode: 'sticky', autoAdvance: false });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/tables/t1/drill'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.session).toEqual(expect.objectContaining({ id: 'ds1' }));
    expect(result.current.fitCount).toBe(3);
  });

  it('surfaces resumable on 409 response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ resumable: true, prior_position: 5, prior_total: 10, prior_session_id: 'ds_old' }),
    });
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      await result.current.launch({ playlistId: 'p1', heroPlayerId: 'u2' });
    });
    expect(result.current.resumable).toMatchObject({ priorPosition: 5, priorTotal: 10, priorSessionId: 'ds_old' });
  });
});

describe('useDrillSession socket emitters', () => {
  it('setHero emits scenario:set_hero', () => {
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    act(() => result.current.setHero('u9'));
    expect(socket.emit).toHaveBeenCalledWith('scenario:set_hero', { tableId: 't1', playerId: 'u9' });
  });
});

describe('useDrillSession listener log cap', () => {
  it('appends scenario:skipped events to the log, capped at 10', async () => {
    const { result } = renderHook(() => useDrillSession({ socket, tableId: 't1' }));
    await act(async () => {
      for (let i = 0; i < 12; i++) listeners.get('scenario:skipped')({ scenarioId: `s${i}`, reason: 'count_mismatch' });
    });
    await waitFor(() => expect(result.current.log).toHaveLength(10));
  });
});
