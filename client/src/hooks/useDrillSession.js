import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

const LOG_CAP = 10;
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useDrillSession({ socket, tableId }) {
  const [session, setSession]     = useState(null);
  const [fitCount, setFitCount]   = useState(null);
  const [resumable, setResumable] = useState(null);
  const [paused, setPaused]       = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [order, setOrder]         = useState('sequential');
  const [log, setLog]             = useState([]);
  const [error, setError]         = useState(null);

  useEffect(() => {
    if (!socket) return;
    const onArmed    = (p) => setLog((l) => [{ kind: 'armed',    ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onSkipped  = (p) => setLog((l) => [{ kind: 'skipped',  ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onProgress = (p) => setLog((l) => [{ kind: 'progress', ...p, at: Date.now() }, ...l].slice(0, LOG_CAP));
    const onError    = (p) => setError(p);
    socket.on('scenario:armed',    onArmed);
    socket.on('scenario:skipped',  onSkipped);
    socket.on('scenario:progress', onProgress);
    socket.on('scenario:error',    onError);
    return () => {
      socket.off('scenario:armed',    onArmed);
      socket.off('scenario:skipped',  onSkipped);
      socket.off('scenario:progress', onProgress);
      socket.off('scenario:error',    onError);
    };
  }, [socket]);

  const launch = useCallback(async ({
    playlistId, heroPlayerId = null, heroMode = 'sticky', autoAdvance = false, forceRestart = false,
    optedInPlayers = [], optedOutPlayers = [],
  }) => {
    const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('poker_trainer_jwt') : null;
    const res = await fetch(`${API_BASE}/api/tables/${tableId}/drill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        playlist_id:       playlistId,
        opted_in_players:  optedInPlayers,
        opted_out_players: optedOutPlayers,
        hero_mode:         heroMode,
        hero_player_id:    heroPlayerId,
        auto_advance:      autoAdvance,
        force_restart:     forceRestart,
      }),
    });
    if (res.status === 409) {
      const body = await res.json();
      if (body?.resumable) {
        setResumable({
          priorPosition:  body.prior_position,
          priorTotal:     body.prior_total,
          priorSessionId: body.prior_session_id,
        });
        return body;
      }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await res.json();
    setSession(out.session);
    setFitCount(out.fitCount ?? null);
    setResumable(null);
    setPaused(false);
    if (out.session) {
      setAutoAdvance(out.session.auto_advance ?? false);
      setOrder(out.session.order ?? 'sequential');
    }
    return out;
  }, [tableId]);

  const pause   = useCallback(async () => {
    await apiFetch(`/api/tables/${tableId}/drill/pause`, { method: 'PATCH' });
    setPaused(true);
  }, [tableId]);

  const resume  = useCallback(() => {
    setPaused(false);
    socket.emit('scenario:request_resume', { tableId, mode: 'resume' });
  }, [socket, tableId]);

  const restart = useCallback(() => {
    setPaused(false);
    socket.emit('scenario:request_resume', { tableId, mode: 'restart' });
  }, [socket, tableId]);

  const advance = useCallback(() => apiFetch(`/api/tables/${tableId}/drill/advance`, { method: 'PATCH' }), [tableId]);
  const cancel  = useCallback(async () => {
    await apiFetch(`/api/tables/${tableId}/drill`, { method: 'DELETE' });
    setSession(null);
    setPaused(false);
    setAutoAdvance(false);
    setOrder('sequential');
  }, [tableId]);
  const setHero = useCallback((playerId) => socket.emit('scenario:set_hero', { tableId, playerId }),       [socket, tableId]);
  const setMode = useCallback((patch)    => socket.emit('scenario:set_mode', { tableId, ...patch }),       [socket, tableId]);

  return {
    session, fitCount, resumable, paused, autoAdvance, order, log, error,
    launch, pause, resume, restart, advance, cancel, setHero, setMode,
  };
}
