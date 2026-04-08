import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { WizardModal } from './admin/TournamentSetup.jsx';

const GOLD = '#d4af37';

const TABS = ['Upcoming', 'Active', 'Completed'];
const TAB_STATUSES = {
  Upcoming:  'pending',
  Active:    'running',
  Completed: 'finished',
};

const STATUS_COLORS = {
  pending:  '#93c5fd',
  running:  '#3fb950',
  paused:   '#e3b341',
  finished: '#6e7681',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? '#6e7681';
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 3,
      background: `${color}18`, border: `1px solid ${color}55`, color,
    }}>
      {status}
    </span>
  );
}

function TournamentCard({ group, onClick }) {
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f0ece3' }}>{group.name}</div>
        <StatusBadge status={group.status} />
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-1" style={{ fontSize: 11, color: '#6e7681' }}>
        {group.buy_in > 0 && (
          <span>Buy-in: <strong style={{ color: GOLD }}>{group.buy_in.toLocaleString()} chips</strong></span>
        )}
        {group.buy_in === 0 && <span style={{ color: '#3fb950' }}>Free</span>}
        {scheduledAt && (
          <span>Starts: <strong style={{ color: '#c9d1d9' }}>{scheduledAt.toLocaleString()}</strong></span>
        )}
        <span style={{ textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        style={{
          marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${GOLD}55`, color: GOLD,
          textTransform: 'uppercase',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = `${GOLD}55`; }}
      >
        View
      </button>
    </div>
  );
}

export default function TournamentListPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]         = useState('Upcoming');
  const [groups, setGroups]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const canCreate = hasPermission('tournament:manage') || user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin';

  const loadGroups = useCallback(async (tabName) => {
    setLoading(true);
    try {
      const status = TAB_STATUSES[tabName];
      const data = await apiFetch(`/api/tournament-groups?status=${status}`);
      setGroups(data.groups ?? []);
    } catch (_) {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(tab); }, [tab, loadGroups]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0ece3', letterSpacing: '-0.03em' }}>Tournaments</h1>
          <p style={{ fontSize: 12, color: '#6e7681', marginTop: 2 }}>Register, play, and track poker tournaments</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowWizard(true)}
            style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: GOLD, color: '#0d1117', border: 'none',
            }}
          >
            + Create Tournament
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: '1px solid #21262d', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 12, fontWeight: tab === t ? 700 : 500, padding: '8px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: tab === t ? GOLD : '#6e7681',
              borderBottom: tab === t ? `2px solid ${GOLD}` : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: '#6e7681', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ color: '#6e7681', fontSize: 13, textAlign: 'center', padding: 40 }}>
          No {tab.toLowerCase()} tournaments.
          {canCreate && tab === 'Upcoming' && (
            <span
              style={{ color: GOLD, cursor: 'pointer', marginLeft: 6 }}
              onClick={() => setShowWizard(true)}
            >
              Create one →
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(g => (
            <TournamentCard key={g.id} group={g} onClick={() => navigate(`/tournaments/${g.id}`)} />
          ))}
        </div>
      )}

      {showWizard && (
        <WizardModal
          onClose={() => setShowWizard(false)}
          onCreated={({ groupId }) => {
            setShowWizard(false);
            navigate(`/tournaments/${groupId}`);
          }}
        />
      )}
    </div>
  );
}
