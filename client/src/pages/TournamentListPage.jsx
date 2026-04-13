import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { WizardModal } from './admin/TournamentSetup.jsx';
import StatusBadge from '../components/tournament/StatusBadge.jsx';
import { colors } from '../lib/colors.js';

const TABS = ['Upcoming', 'Active', 'Completed'];
const TAB_STATUSES = {
  Upcoming:  'pending',
  Active:    'running',
  Completed: 'finished',
};

function TournamentCard({ group, onClick }) {
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, borderRadius: 8,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.goldBorder; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{group.name}</div>
        <StatusBadge status={group.status} />
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-1" style={{ fontSize: 11, color: colors.textMuted }}>
        {group.buy_in > 0 && (
          <span>Buy-in: <strong style={{ color: colors.gold }}>{group.buy_in.toLocaleString()} chips</strong></span>
        )}
        {group.buy_in === 0 && <span style={{ color: colors.success }}>Free</span>}
        {scheduledAt && (
          <span>Starts: <strong style={{ color: colors.textSecondary }}>{scheduledAt.toLocaleString()}</strong></span>
        )}
        <span style={{ textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onClick(); }}
        style={{
          marginTop: 8, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${colors.goldBorder}`, color: colors.gold,
          textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = colors.gold; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = colors.goldBorder; }}
      >
        View <ArrowRight size={12} />
      </button>
    </div>
  );
}

export default function TournamentListPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab]         = useState('Upcoming');
  const [groups, setGroups]   = useState([]);
  const [counts, setCounts]   = useState({ Upcoming: null, Active: null, Completed: null });
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const canCreate = hasPermission('tournament:manage') || user?.role === 'coach' || user?.role === 'admin' || user?.role === 'superadmin';

  const loadGroups = useCallback(async (tabName) => {
    setLoading(true);
    try {
      const status = TAB_STATUSES[tabName];
      const data = await apiFetch(`/api/tournament-groups?status=${status}`);
      const next = data.groups ?? [];
      setGroups(next);
      setCounts(c => ({ ...c, [tabName]: next.length }));
    } catch (_) {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Parallel fetch counts for all tabs on mount so badges populate immediately.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      TABS.map(t =>
        apiFetch(`/api/tournament-groups?status=${TAB_STATUSES[t]}`)
          .then(d => [t, (d.groups ?? []).length])
          .catch(() => [t, 0]),
      ),
    ).then(pairs => {
      if (cancelled) return;
      setCounts(prev => {
        const next = { ...prev };
        for (const [t, n] of pairs) next[t] = n;
        return next;
      });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { loadGroups(tab); }, [tab, loadGroups]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.textPrimary, letterSpacing: '-0.03em' }}>Tournaments</h1>
          <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Register, play, and track poker tournaments</p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowWizard(true)}
            style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: '8px 16px', borderRadius: 6, cursor: 'pointer',
              background: colors.gold, color: colors.bgSurface, border: 'none',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus size={14} /> Create Tournament
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: `1px solid ${colors.borderDefault}`, paddingBottom: 0 }}>
        {TABS.map(t => {
          const active = tab === t;
          const n = counts[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: 12, fontWeight: active ? 700 : 500, padding: '8px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: active ? colors.gold : colors.textMuted,
                borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                marginBottom: -1,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {t}
              {n != null && (
                <span
                  data-testid={`tab-count-${t.toLowerCase()}`}
                  style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 999,
                    background: active ? colors.goldTint : colors.mutedTint,
                    color: active ? colors.gold : colors.textMuted,
                  }}
                >
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', padding: 40 }}>
          No {tab.toLowerCase()} tournaments.
          {canCreate && tab === 'Upcoming' && (
            <span
              style={{ color: colors.gold, cursor: 'pointer', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => setShowWizard(true)}
            >
              Create one <ArrowRight size={12} />
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
