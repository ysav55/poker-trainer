import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { ToastProvider } from '../contexts/ToastContext.jsx';
import ToastContainer from './ToastContainer.jsx';
import SideNav from './SideNav/index.js';
import { colors } from '../lib/colors.js';
import { apiFetch } from '../lib/api.js';

/**
 * AppLayout — wraps all authenticated lobby-style pages.
 *
 * Renders: SideNav (left) + scrollable main content. No topbar.
 * Does NOT apply to /table/:tableId, /multi, or tournament pages.
 */
export default function AppLayout() {
  const { user } = useAuth();
  const { activeTables } = useLobby();
  const [chipBalance, setChipBalance] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    apiFetch(`/api/players/${user.id}/stats`)
      .then((d) => setChipBalance(d?.chip_bank ?? d?.chipBank ?? null))
      .catch(() => {});
  }, [user?.id]);

  const onlineCount = activeTables.reduce(
    (n, t) => n + (t.players?.length ?? 0),
    0,
  );

  return (
    <ToastProvider>
      <div className="flex" style={{ height: '100vh', background: colors.bgPrimary }}>
        <SideNav
          chipBalance={chipBalance}
          badges={{}}
          schoolName={user?.schoolName ?? null}
          studentsOnline={onlineCount}
          activeTables={activeTables.length}
        />

        <main className="flex-1 overflow-y-auto" style={{ minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </ToastProvider>
  );
}
