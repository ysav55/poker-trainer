import { createContext, useContext, useState } from 'react';
import { apiFetch } from '../lib/api.js';

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem('poker_trainer_jwt');
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload) return null;
    return { id: payload.stableId, name: payload.name, role: payload.role, token };
  });

  const [permissions, setPermissions] = useState(new Set());
  // Auth is initialised synchronously from localStorage — loading stays false.
  // The field exists so App.jsx's RequireAuth guard has a stable API to check.
  const [loading] = useState(false);

  const login = async (name, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    localStorage.setItem('poker_trainer_jwt', data.token);
    localStorage.setItem('poker_trainer_player_id', data.stableId);
    setUser({ id: data.stableId, name: data.name, role: data.role, token: data.token });
    const { permissions: perms } = await apiFetch('/api/auth/permissions');
    setPermissions(new Set(perms));
    return data;
  };

  const logout = () => {
    localStorage.removeItem('poker_trainer_jwt');
    localStorage.removeItem('poker_trainer_player_id');
    setUser(null);
    setPermissions(new Set());
  };

  const hasPermission = (key) => permissions.has(key);

  return (
    <AuthContext.Provider value={{ user, login, logout, hasPermission, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
