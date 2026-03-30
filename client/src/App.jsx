import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useNavigate,
} from 'react-router-dom';

import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { LobbyProvider } from './contexts/LobbyContext.jsx';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import MainLobby from './pages/MainLobby.jsx';
import TablePage from './pages/TablePage.jsx';
import MultiTablePage from './pages/MultiTablePage.jsx';

// Admin pages
import UserManagement from './pages/admin/UserManagement.jsx';
import HandBuilder from './pages/admin/HandBuilder.jsx';
import TournamentSetup from './pages/admin/TournamentSetup.jsx';
import PlayerCRM from './pages/admin/PlayerCRM.jsx';

// Existing single-table view components (still used in TablePage integration)
import { useSocket } from './hooks/useSocket';
import PokerTable from './components/PokerTable';
import CoachSidebar from './components/CoachSidebar';
import CardPicker from './components/CardPicker';
import StatsPanel from './components/StatsPanel';
import ConnectionDot from './components/ConnectionDot';
import TopBar from './components/TopBar';
import NotificationToast from './components/NotificationToast';
import ErrorToast from './components/ErrorToast';
import TagHandPill from './components/TagHandPill';
import ErrorBoundary from './components/ErrorBoundary';

// ── Route guards ──────────────────────────────────────────────────────────────

/**
 * Redirects unauthenticated users to /login.
 * Renders children / nested routes when authenticated.
 */
function RequireAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a0f] flex items-center justify-center">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}

/**
 * Redirects to /lobby if the user lacks the required permission.
 * Pass the `permission` prop (e.g. "admin:access").
 */
function RequirePermission({ permission }) {
  const { hasPermission } = useAuth();

  if (!hasPermission(permission)) return <Navigate to="/lobby" replace />;

  return <Outlet />;
}

// ── Router tree ───────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

      {/* Authenticated */}
      <Route element={<RequireAuth />}>
        <Route path="/lobby"           element={<MainLobby />} />
        <Route path="/table/:tableId"  element={<TablePage />} />
        <Route path="/multi"           element={<MultiTablePage />} />

        {/* Admin — require admin:access */}
        <Route element={<RequirePermission permission="admin:access" />}>
          <Route path="/admin/users"        element={<UserManagement />} />
          <Route path="/admin/hands"        element={<HandBuilder />} />
          <Route path="/admin/crm"          element={<PlayerCRM />} />
          <Route path="/admin/tournaments"  element={<TournamentSetup />} />
        </Route>
      </Route>

      {/* Default: redirect to lobby (will bounce to /login if not authed) */}
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}

// ── Root App component ────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LobbyProvider>
          <AppRoutes />
        </LobbyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
