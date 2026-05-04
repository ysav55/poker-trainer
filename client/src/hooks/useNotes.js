import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';

const STALE_MS = 60 * 1000;
const cache = new Map(); // handId -> { notes, fetchedAt }

export default function useNotes(handId) {
  const [notes, setNotes] = useState(() => cache.get(handId)?.notes ?? []);
  const [loading, setLoading] = useState(!!handId);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!handId) return;
    try {
      setLoading(true);
      const result = await apiFetch(`/api/hands/${handId}/notes`);
      const fresh = result?.notes ?? [];
      cache.set(handId, { notes: fresh, fetchedAt: Date.now() });
      setNotes(fresh);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [handId]);

  useEffect(() => {
    if (!handId) { setNotes([]); setLoading(false); return; }
    const cached = cache.get(handId);
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) {
      setNotes(cached.notes);
      setLoading(false);
      return;
    }
    refresh();
  }, [handId, refresh]);

  const add = useCallback(async (body) => {
    if (!handId || !body?.trim()) return null;
    const result = await apiFetch(`/api/hands/${handId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const newNote = result?.note;
    if (newNote) {
      setNotes((prev) => {
        const next = [newNote, ...prev];
        cache.set(handId, { notes: next, fetchedAt: Date.now() });
        return next;
      });
    }
    return newNote;
  }, [handId]);

  const edit = useCallback(async (noteId, body) => {
    if (!body?.trim()) return null;
    const result = await apiFetch(`/api/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const edited = result?.note;
    if (edited) {
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === noteId ? edited : n));
        cache.set(handId, { notes: next, fetchedAt: Date.now() });
        return next;
      });
    }
    return edited;
  }, [handId]);

  const remove = useCallback(async (noteId) => {
    await apiFetch(`/api/notes/${noteId}`, { method: 'DELETE' });
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== noteId);
      cache.set(handId, { notes: next, fetchedAt: Date.now() });
      return next;
    });
  }, [handId]);

  return { notes, loading, error, refresh, add, edit, remove };
}

useNotes.__clearCache = () => cache.clear();
