import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api.js';

const DEBOUNCE_MS = 300;

export default function useHandsLibrary({ q = '', range = [], limit = 20, offset = 0 } = {}) {
  const [data, setData] = useState({ hands: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  const fetchNow = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (range.length > 0) params.set('range', range.join(','));
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const result = await apiFetch(`/api/hands/library?${params.toString()}`);
      setData(result ?? { hands: [], total: 0 });
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [q, range, limit, offset]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchNow(); }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [fetchNow]);

  return { ...data, loading, error, refresh: fetchNow };
}
