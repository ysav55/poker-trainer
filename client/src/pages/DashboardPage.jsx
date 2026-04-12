import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { apiFetch } from '../lib/api.js';
import { colors } from '../lib/colors.js';
import StatPill from '../components/StatPill.jsx';
import FilterTabs from '../components/FilterTabs.jsx';
import TableCard from '../components/TableCard.jsx';
import NewTableCard from '../components/NewTableCard.jsx';

// ─── Quick Links Component ────────────────────────────────────────────────────

function QuickLinks({ role, isCoach, isAdmin, onCreateTable, onCreateTournament }) {
  const navigate = useNavigate();

  const coachLinks = [
    { label: 'Create Table', onClick: onCreateTable },
    { label: 'Students', onClick: () => navigate('/admin/students') },
    { label: 'Scenarios', onClick: () => navigate('/admin/scenarios') },
    { label: 'Alerts', onClick: () => navigate('/admin/alerts') },
  ];

  const studentLinks = [
    { label: 'Join Table', onClick: () => navigate('/lobby') },
    { label: 'Bot Practice', onClick: () => navigate('/bot-lobby') },
    { label: 'History', onClick: () => navigate('/hand-history') },
    { label: 'Analysis', onClick: () => navigate('/analysis') },
  ];

  const adminLinks = [
    { label: 'Create Table', onClick: onCreateTable },
    { label: 'Schools', onClick: () => navigate('/admin/schools') },
    { label: 'Users', onClick: () => navigate('/admin/users') },
    { label: 'Tournaments', onClick: () => navigate('/tournaments') },
  ];

  const links = isAdmin ? adminLinks : isCoach ? coachLinks : studentLinks;

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: colors.textSecondary }}>
        Quick Links
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {links.map((link, i) => (
          <button
            key={i}
            onClick={link.onClick}
            className="text-xs px-3 py-2 rounded-lg font-semibold transition-colors"
            style={{
              background: colors.bgSurfaceRaised,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textPrimary,
            }}
          >
            {link.label}
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Quick Stats Component ────────────────────────────────────────────────────

function QuickStats({ stats, activeTables, role, rank, alerts }) {
  const isCoach = role === 'coach' || role === 'admin' || role === 'superadmin';
  const alertCount = alerts?.filter((a) => (a.severity ?? 0) >= 0.4).length ?? 0;
  const chipBalance = stats?.chip_bank ?? stats?.chipBank ?? null;

  const coachStats = [
    { value: activeTables?.length ?? 0, label: 'Active\nTables' },
    { value: stats?.students_online ?? '—', label: 'Students\nOnline' },
    { value: stats?.hands_this_week ?? '—', label: 'Hands\nThis Wk' },
    { value: stats?.avg_grade ?? '—', label: 'Avg\nGrade' },
  ];

  const studentStats = [
    { value: chipBalance != null ? Number(chipBalance).toLocaleString() : '—', label: 'Chip\nBank' },
    { value: stats?.hands_played ?? '—', label: 'Hands\nPlayed' },
    { value: stats?.vpip ?? '—', label: 'VPIP' },
    { value: stats?.pfr ?? '—', label: 'PFR' },
    { value: rank != null ? `#${rank}` : '—', label: 'Leader\nboard' },
  ];

  const statRow = isCoach ? coachStats : studentStats;

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: colors.textSecondary }}>
        Quick Stats
      </h2>
      <div className="flex flex-wrap gap-3">
        {statRow.map((s, i) => (
          <StatPill key={i} value={s.value} label={s.label} />
        ))}
      </div>
    </section>
  );
}

// ─── Alert Feed Component ────────────────────────────────────────────────────

function AlertFeed({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  const top = alerts.slice(0, 3);

  const navigate = useNavigate();

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2
          className="text-xs font-semibold tracking-widest uppercase flex items-center gap-1.5"
          style={{ color: colors.error }}
        >
          ⚠ Needs Attention
        </h2>
        {alerts.length > 3 && (
          <button
            onClick={() => navigate('/admin/alerts')}
            className="text-xs transition-colors"
            style={{ color: colors.textSecondary }}
          >
            See All →
          </button>
        )}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}`, background: colors.bgSurface }}>
        {top.map((alert, i) => {
          const severity = alert.severity ?? 0;
          const dot = severity >= 0.75 ? colors.error : severity >= 0.4 ? colors.gold : colors.success;
          return (
            <div
              key={alert.id ?? i}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: i < top.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}
            >
              <span style={{ color: dot, fontSize: 10 }}>●</span>
              <span className="text-sm" style={{ color: colors.textPrimary }}>
                {alert.player_name ?? alert.playerName ?? 'Unknown'}
              </span>
              <span className="text-xs" style={{ color: colors.textSecondary }}>
                — {alert.detail ?? alert.type ?? 'Needs review'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Active Tables Component ──────────────────────────────────────────────────

function ActiveTables({ tables, role, userId, canCreate, onTableAction, onManageAction, onNewTable }) {
  const [tab, setTab] = useState('all');

  const showController = role === 'coach' || role === 'admin' || role === 'superadmin';
  const COACH_TABLE_TABS = [
    { id: 'all',        label: 'All' },
    { id: 'cash',       label: 'Cash' },
    { id: 'tournament', label: 'Tournament' },
    { id: 'mine',       label: 'My Tables' },
  ];

  const STUDENT_TABLE_TABS = [
    { id: 'all',        label: 'All' },
    { id: 'cash',       label: 'Cash' },
    { id: 'tournament', label: 'Tournament' },
    { id: 'available',  label: 'Available' },
    { id: 'mine',       label: 'My Tables' },
  ];

  const tabDefs = (role === 'coach' || role === 'admin' || role === 'superadmin')
    ? COACH_TABLE_TABS
    : STUDENT_TABLE_TABS;

  const filterTables = (tableList, filterTab, playerId) => {
    if (filterTab === 'mine') return tableList.filter((t) => (t.createdBy === playerId || t.created_by === playerId));
    if (filterTab === 'cash') return tableList.filter((t) => (t.mode === 'coached_cash' || t.mode === 'uncoached_cash'));
    if (filterTab === 'tournament') return tableList.filter((t) => t.mode === 'tournament');
    if (filterTab === 'available') return tableList.filter((t) => (t.available_seats ?? t.availableSeats ?? 0) > 0);
    return tableList;
  };

  const visible = filterTables(tables, tab, userId);
  const tabsWithBadges = tabDefs.map((t) => ({
    ...t,
    badge: t.id !== 'all' ? (filterTables(tables, t.id, userId).length || null) : null,
  }));

  // Helper to map table to card data (simplified version)
  const mapTableToCard = (table, userRole, uId) => {
    return {
      ...table,
      userRole,
      userId: uId,
      secondaryActionLabel: (userRole === 'coach' || userRole === 'admin') && table.mode !== 'tournament' ? 'Spectate' : null,
    };
  };

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: colors.textSecondary }}>
        Active Tables
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}`, background: colors.bgSurface }}>
        <FilterTabs tabs={tabsWithBadges} active={tab} onChange={setTab} />
        <div className="p-4">
          {visible.length === 0 && !canCreate ? (
            <p className="text-sm text-center py-4" style={{ color: colors.textMuted }}>
              No tables in this view.
            </p>
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}
            >
              {visible.map((t) => {
                const cardData = mapTableToCard(t, role, userId);
                return (
                  <TableCard
                    key={t.id ?? t.tableId}
                    table={cardData}
                    onAction={onTableAction}
                    onSecondaryAction={cardData.secondaryActionLabel ? onManageAction : undefined}
                    showController={showController}
                  />
                );
              })}
              {canCreate && (
                <NewTableCard
                  onClick={onNewTable}
                  label="+ New Table"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

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
