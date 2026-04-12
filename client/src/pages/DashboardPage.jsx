import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { apiFetch } from '../lib/api.js';
import { colors } from '../lib/colors.js';
import QuickLinks from '../components/dashboard/QuickLinks.jsx';
import QuickStats from '../components/dashboard/QuickStats.jsx';
import AlertFeed from '../components/dashboard/AlertFeed.jsx';
import ActiveTables from '../components/dashboard/ActiveTables.jsx';

// ─── Main DashboardPage ───────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const { activeTables, refreshTables } = useLobby();
  const navigate = useNavigate();

  const role = user?.role ?? 'player';
  const userId = user?.id;
  const isCoach = role === 'coach';
  const isAdmin = role === 'admin' || role === 'superadmin';
  const canCreate = hasPermission('table:create');

  const [stats, setStats] = useState(null);
  const [rank, setRank] = useState(null);
  const [alerts, setAlerts] = useState([]);

  // Load stats
  useEffect(() => {
    if (!userId) return;
    apiFetch(`/api/players/${userId}/stats`).then(setStats).catch(() => {});
  }, [userId]);

  // Load rank (students only)
  useEffect(() => {
    if (!userId || isCoach || isAdmin) return;
    apiFetch('/api/players')
      .then((d) => {
        const list = d?.players ?? d ?? [];
        const sorted = [...list].sort(
          (a, b) => Number(b.total_net_chips ?? 0) - Number(a.total_net_chips ?? 0),
        );
        const pos = sorted.findIndex((p) => p.stableId === userId || p.stable_id === userId || p.id === userId);
        setRank(pos >= 0 ? pos + 1 : null);
      })
      .catch(() => {});
  }, [userId, isCoach, isAdmin]);

  // Load alerts (coaches/admins only)
  useEffect(() => {
    if (!isCoach && !isAdmin) return;
    apiFetch('/api/coach/alerts')
      .then((d) => setAlerts(d?.alerts ?? d ?? []))
      .catch(() => {});
  }, [isCoach, isAdmin]);

  const handleTableAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/tournament/${tableId}/lobby`);
    } else {
      navigate(`/table/${tableId}`);
    }
  }, [activeTables, navigate]);

  const handleManageAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/table/${tableId}?manager=true`);
    } else {
      navigate(`/table/${tableId}?spectate=true`);
    }
  }, [activeTables, navigate]);

  const handleNewTable = useCallback(() => {
    navigate('/tables');
  }, [navigate]);

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Dashboard</h1>

      <QuickLinks
        role={role}
        isCoach={isCoach}
        isAdmin={isAdmin}
        onCreateTable={handleNewTable}
        onCreateTournament={() => navigate('/tournaments')}
      />

      <QuickStats
        stats={stats}
        activeTables={activeTables}
        role={role}
        rank={rank}
        alerts={alerts}
      />

      {(isCoach || isAdmin) && <AlertFeed alerts={alerts} />}

      <ActiveTables
        tables={activeTables}
        role={role}
        userId={userId}
        canCreate={canCreate}
        onTableAction={handleTableAction}
        onManageAction={handleManageAction}
        onNewTable={handleNewTable}
      />
    </div>
  );
}
