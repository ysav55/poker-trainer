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

// Layout
import AppLayout from './components/AppLayout.jsx';

// Pages
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import AnalysisPage from './pages/AnalysisPage.jsx';
import HandHistoryPage from './pages/HandHistoryPage.jsx';
import LobbyPage from './pages/LobbyPage.jsx';
import BotLobbyPage from './pages/BotLobbyPage.jsx';
import TablePage from './pages/TablePage.jsx';
import MultiTablePage from './pages/MultiTablePage.jsx';
import ReviewTablePage from './pages/ReviewTablePage.jsx';

// Admin pages
import UserManagement from './pages/admin/UserManagement.jsx';
import HandBuilder from './pages/admin/HandBuilder.jsx';
import TournamentSetup from './pages/admin/TournamentSetup.jsx';
import PlayerCRM from './pages/admin/PlayerCRM.jsx';
import RefereeDashboard from './pages/admin/RefereeDashboard.jsx';
import CoachAlertsPage from './pages/admin/CoachAlertsPage.jsx';
import StableOverviewPage from './pages/admin/StableOverviewPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

// Tournament pages
import TournamentLobby from './pages/TournamentLobby.jsx';
import TournamentStandings from './pages/TournamentStandings.jsx';

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
      <Route path="/login"           element={<LoginPage />} />
      <Route path="/register"        element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Authenticated */}
      <Route element={<RequireAuth />}>

        {/* Full-screen pages — no global layout */}
        <Route path="/table/:tableId"  element={<TablePage />} />
        <Route path="/multi"           element={<MultiTablePage />} />
        <Route path="/review"          element={<ReviewTablePage />} />
        <Route path="/tournament/:tableId/lobby"     element={<TournamentLobby />} />
        <Route path="/tournament/:tableId/standings" element={<TournamentStandings />} />

        {/* Lobby-style pages — wrapped in AppLayout (TopBar + SideNav) */}
        <Route element={<AppLayout />}>
          <Route path="/settings"    element={<SettingsPage />} />
          <Route path="/lobby"       element={<LobbyPage />} />
          <Route path="/bot-lobby"   element={<BotLobbyPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/analysis"    element={<AnalysisPage />} />
          <Route path="/history"     element={<HandHistoryPage />} />

          {/* Admin — require admin:access */}
          <Route element={<RequirePermission permission="admin:access" />}>
            <Route path="/admin/users"        element={<UserManagement />} />
            <Route path="/admin/hands"        element={<HandBuilder />} />
            <Route path="/admin/crm"          element={<PlayerCRM />} />
            <Route path="/admin/tournaments"  element={<TournamentSetup />} />
            <Route path="/admin/referee"      element={<RefereeDashboard />} />
            <Route path="/admin/alerts"       element={<CoachAlertsPage />} />
            <Route path="/admin/stable"       element={<StableOverviewPage />} />
          </Route>
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
