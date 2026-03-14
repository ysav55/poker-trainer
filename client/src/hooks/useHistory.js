import { useState, useCallback } from 'react';

const API = 'http://localhost:3001';

export function useHistory() {
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [handDetail, setHandDetail] = useState(null);

  const fetchHands = useCallback(async (tableId = 'main-table') => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/hands?tableId=${tableId}&limit=10`);
      const data = await r.json();
      setHands(data.hands || []);
    } catch { /* server may not have DB yet */ }
    setLoading(false);
  }, []);

  const fetchHandDetail = useCallback(async (handId) => {
    try {
      const r = await fetch(`${API}/api/hands/${handId}`);
      setHandDetail(await r.json());
    } catch {}
  }, []);

  const clearDetail = useCallback(() => setHandDetail(null), []);

  return { hands, loading, handDetail, fetchHands, fetchHandDetail, clearDetail };
}
