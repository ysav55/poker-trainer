import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';

const LobbyContext = createContext(null);

export function LobbyProvider({ children }) {
  const [activeTables, setActiveTables] = useState([]);
  const [recentHands, setRecentHands] = useState([]);

  const refreshTables = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tables');
      setActiveTables(data?.tables ?? data ?? []);
    } catch {
      // Tables endpoint may not exist yet — fail silently
      setActiveTables([]);
    }
  }, []);

  useEffect(() => {
    refreshTables();
    const interval = setInterval(refreshTables, 10_000);
    return () => clearInterval(interval);
  }, [refreshTables]);

  return (
    <LobbyContext.Provider value={{ activeTables, recentHands, refreshTables }}>
      {children}
    </LobbyContext.Provider>
  );
}

export const useLobby = () => useContext(LobbyContext);
