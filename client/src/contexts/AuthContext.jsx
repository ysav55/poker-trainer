import { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';

export const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch { return null; }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const token = sessionStorage.getItem('poker_trainer_jwt');
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload) return null;
    return { id: payload.stableId, name: payload.name, role: payload.role, trialStatus: payload.trialStatus ?? null, token };
  });

  const [permissions, setPermissions] = useState(new Set());
  // loading is true while permissions are being fetched for a restored session.
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem('poker_trainer_jwt'));

  // On mount, restore permissions from the server if a token already exists.
  useEffect(() => {
    const token = sessionStorage.getItem('poker_trainer_jwt');
    if (!token) return;
    apiFetch('/api/auth/permissions')
      .then(({ permissions: perms }) => setPermissions(new Set(perms)))
      .catch(() => {
        // Token is expired or invalid — clear the session
        sessionStorage.removeItem('poker_trainer_jwt');
        sessionStorage.removeItem('poker_trainer_player_id');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const register = async ({ name, password }) => {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    return data;
  };

  const registerCoach = async (name, password, email) => {
    const data = await apiFetch('/api/auth/register-coach', {
      method: 'POST',
      body: JSON.stringify({ name, password, email }),
    });
    return data; // 202 { status: 'pending', message: '...' }
  };

  const login = async (name, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ name, password }),
    });
    sessionStorage.setItem('poker_trainer_jwt', data.token);
    sessionStorage.setItem('poker_trainer_player_id', data.stableId);
    setUser({ id: data.stableId, name: data.name, role: data.role, trialStatus: data.trialStatus ?? null, token: data.token });
    const { permissions: perms } = await apiFetch('/api/auth/permissions');
    setPermissions(new Set(perms));
    return data;
  };

  const logout = () => {
    sessionStorage.removeItem('poker_trainer_jwt');
    sessionStorage.removeItem('poker_trainer_player_id');
    setUser(null);
    setPermissions(new Set());
  };

  const hasPermission = (key) => permissions.has(key);

  // Dual-window support: old JWTs have role='trial'; new JWTs have trialStatus='active'
  // on a coached_student/solo_student role. Both are valid during the migration window.
  const isTrial = user?.role === 'trial' || user?.trialStatus === 'active';

  return (
    <AuthContext.Provider value={{ user, login, logout, register, registerCoach, hasPermission, loading, isTrial }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
