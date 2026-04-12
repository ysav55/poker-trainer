import React from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import GlobalTopBar from './GlobalTopBar.jsx';
import SideNav from './SideNav.jsx';

/**
 * AppLayout — wraps all authenticated lobby-style pages.
 *
 * Renders: GlobalTopBar (sticky top) + SideNav (left) + scrollable main content.
 * Does NOT apply to /table/:tableId, /multi, or tournament pages (they use their own layout).
 *
 * Props:
 *   chipBalance  {number|null}   — passed down to GlobalTopBar
 *   pageTitle    {string?}       — optional page title in TopBar
 *   onBack       {fn?}           — optional back button handler
 *   badges       {object?}       — sidebar badge counts { tables, alerts, crm }
 */
export default function AppLayout({ chipBalance, pageTitle, onBack, badges }) {
  const { user } = useAuth();
  const role = user?.role ?? 'player';

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: '#060a0f' }}
    >
      <GlobalTopBar
        chipBalance={chipBalance}
        pageTitle={pageTitle}
        onBack={onBack}
      />

      <div className="flex flex-1 min-h-0">
        <SideNav role={role} badges={badges ?? {}} />

        <main
          className="flex-1 overflow-y-auto"
          style={{ minWidth: 0 }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
