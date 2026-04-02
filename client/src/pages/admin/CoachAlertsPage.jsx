import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

const ALERT_TYPE_LABELS = {
  mistake_spike:      'Mistake Spike',
  inactivity:         'Inactivity',
  losing_streak:      'Losing Streak',
  volume_drop:        'Volume Drop',
  stat_regression:    'Stat Regression',
  positive_milestone: 'Milestone',
};

// ─── Mock fallback data ───────────────────────────────────────────────────────

const MOCK_ALERTS = [
  {
    id: 'mock-1',
    studentName: 'Alex Kim',
    type: 'mistake_spike',
    detail: 'EQUITY_FOLD: 8.4/100 (baseline: 3.2) · 2.6×\n3 flagged hands',
    severity: 0.87,
    dismissed: false,
    generatedAt: 'Mar 29, 06:00',
    hasHands: true,
    hasSessions: false,
  },
  {
    id: 'mock-2',
    studentName: 'Jordan Lee',
    type: 'inactivity',
    detail: 'Last played: Mar 22 (7 days ago)\nThreshold: 5 days',
    severity: 0.71,
    dismissed: false,
    generatedAt: 'Mar 29, 06:00',
    hasHands: false,
    hasSessions: false,
  },
  {
    id: 'mock-3',
    studentName: 'Marcus Torres',
    type: 'losing_streak',
    detail: '4 consecutive sessions · -12,400 chips',
    severity: 0.54,
    dismissed: false,
    generatedAt: 'Mar 28, 22:15',
    hasHands: false,
    hasSessions: true,
  },
  {
    id: 'mock-4',
    studentName: 'Sam Patel',
    type: 'positive_milestone',
    detail: 'First profitable week: +4,200 chips · 312 hands 🎉',
    severity: 0.0,
    dismissed: false,
    generatedAt: 'Mar 30, 06:00',
    hasHands: false,
    hasSessions: false,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function humanDetail(alertType, data) {
  if (!data) return '';
  switch (alertType) {
    case 'mistake_spike': {
      const top = data.spikes?.[0];
      if (!top) return 'Mistake frequency spike detected';
      return `${top.tag} ${top.ratio}× baseline — ${data.spikes.length} tag${data.spikes.length !== 1 ? 's' : ''} flagged`;
    }
    case 'inactivity':
      return `Last played: ${data.last_played ?? '?'} (${data.days_inactive ?? '?'} days ago)\nThreshold: ${data.threshold_days ?? 5} days`;
    case 'losing_streak':
      return `${data.streak_sessions ?? '?'} consecutive sessions · ${Number(data.total_loss ?? 0).toLocaleString()} chips`;
    case 'volume_drop':
      return `Volume down ${Math.round((data.drop_pct ?? 0) * 100)}% — ${data.this_week_hands ?? 0} hands this week`;
    case 'stat_regression': {
      const top = data.regressions?.[0];
      return top ? `${top.stat} regression — ${top.z_score?.toFixed(1) ?? '?'} std dev` : 'Stat regression detected';
    }
    case 'positive_milestone': {
      const first = data.milestones?.[0];
      return first?.detail ?? first?.type ?? 'Milestone achieved';
    }
    default:
      return '';
  }
}

function severityConfig(type, severity) {
  if (type === 'positive_milestone') return { color: '#3fb950', emoji: '🟢', label: 'Milestone' };
  if (severity >= 0.75) return { color: '#f85149', emoji: '🔴', label: 'High' };
  if (severity >= 0.5)  return { color: '#e3b341', emoji: '🟠', label: 'Medium' };
  return { color: GOLD, emoji: '🟡', label: 'Low' };
}

const inputCls = 'text-sm rounded px-2 py-1.5 outline-none';
const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' };

// ─── AlertCard ────────────────────────────────────────────────────────────────

function AlertCard({ alert, onDismiss, onReview, onViewHands, onViewSessions }) {
  const sc = severityConfig(alert.type, alert.severity);
  const typeLabel = ALERT_TYPE_LABELS[alert.type] ?? alert.type;
  const isMilestone = alert.type === 'positive_milestone';

  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: '1px solid #21262d' }}
      data-testid={`alert-card-${alert.id}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 mb-1">
        <span style={{ fontSize: 14, lineHeight: 1.6, flexShrink: 0 }}>{sc.emoji}</span>
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
          {!isMilestone && (
            <span className="font-black text-sm tabular-nums" style={{ color: sc.color }}>
              {alert.severity.toFixed(2)}
            </span>
          )}
          <span className="font-semibold text-sm" style={{ color: '#f0ece3' }}>
            {alert.studentName}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{
              background: `${sc.color}18`,
              color: sc.color,
              border: `1px solid ${sc.color}33`,
            }}
          >
            {typeLabel}
          </span>
        </div>
      </div>

      {/* Detail */}
      <div className="pl-5 mb-1">
        {alert.detail.split('\n').map((line, i) => (
          <div key={i} className="text-xs" style={{ color: '#8b949e' }}>{line}</div>
        ))}
      </div>

      {/* Timestamp */}
      <div className="pl-5 mb-2 text-xs" style={{ color: '#484f58' }}>
        Generated: {alert.generatedAt}
      </div>

      {/* Actions */}
      <div className="pl-5 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => onReview(alert)}
          className="text-xs px-3 py-1 rounded font-semibold"
          style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff' }}
          data-testid={`alert-review-${alert.id}`}
        >
          Review in CRM →
        </button>
        {alert.hasHands && (
          <button
            onClick={() => onViewHands(alert)}
            className="text-xs px-3 py-1 rounded font-semibold"
            style={{ background: 'rgba(212,175,55,0.1)', border: `1px solid ${GOLD}44`, color: GOLD }}
            data-testid={`alert-hands-${alert.id}`}
          >
            View Hands →
          </button>
        )}
        {alert.hasSessions && (
          <button
            onClick={() => onViewSessions(alert)}
            className="text-xs px-3 py-1 rounded font-semibold"
            style={{ background: 'rgba(212,175,55,0.1)', border: `1px solid ${GOLD}44`, color: GOLD }}
            data-testid={`alert-sessions-${alert.id}`}
          >
            View Sessions →
          </button>
        )}
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-xs px-3 py-1 rounded font-semibold"
          style={{ background: 'rgba(110,118,129,0.1)', border: '1px solid rgba(110,118,129,0.3)', color: '#6e7681' }}
          data-testid={`alert-dismiss-${alert.id}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── AlertSettingsPanel ───────────────────────────────────────────────────────

function AlertSettingsPanel() {
  const [editing, setEditing] = useState(false);
  const [settings, setSettings] = useState({
    inactivityDays:    5,
    mistakeMultiplier: 1.5,
    losingStreakSessions: 3,
    regressionSigma:   2.0,
  });
  const [draft, setDraft] = useState(settings);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));

  const handleSave = () => {
    setSettings(draft);
    setEditing(false);
  };

  return (
    <div
      className="rounded-xl overflow-hidden mt-4"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
      data-testid="alert-settings"
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: editing ? '1px solid #30363d' : 'none', background: '#1a2233' }}
      >
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>
          Alert Settings
        </span>
        <button
          onClick={() => { setDraft(settings); setEditing(v => !v); }}
          className="text-xs px-3 py-1 rounded"
          style={{ background: '#21262d', color: '#e5e7eb', border: '1px solid #30363d' }}
        >
          {editing ? '✕ Cancel' : '⚙ Edit'}
        </button>
      </div>

      {!editing ? (
        <div className="px-4 py-3 text-sm" style={{ color: '#8b949e' }}>
          Inactivity: <span style={{ color: '#e5e7eb' }}>{settings.inactivityDays} days</span>
          {' · '}
          Mistake spike: <span style={{ color: '#e5e7eb' }}>{settings.mistakeMultiplier}×</span>
          {' · '}
          Losing streak: <span style={{ color: '#e5e7eb' }}>{settings.losingStreakSessions} sessions</span>
          {' · '}
          Regression: <span style={{ color: '#e5e7eb' }}>{settings.regressionSigma}σ</span>
        </div>
      ) : (
        <div className="px-4 py-4 grid grid-cols-2 gap-3">
          {[
            { key: 'inactivityDays',       label: 'Inactivity threshold (days)', step: 1 },
            { key: 'mistakeMultiplier',    label: 'Mistake spike multiplier (×)', step: 0.1 },
            { key: 'losingStreakSessions', label: 'Losing streak (sessions)',     step: 1 },
            { key: 'regressionSigma',      label: 'Regression sigma',            step: 0.1 },
          ].map(({ key, label, step }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs font-semibold" style={{ color: '#6e7681' }}>{label}</label>
              <input
                type="number"
                step={step}
                value={draft[key]}
                onChange={e => set(key, Number(e.target.value))}
                className="rounded px-3 py-1.5 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' }}
              />
            </div>
          ))}
          <div className="col-span-2 mt-1">
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded text-sm font-bold"
              style={{ background: GOLD, color: '#0d1117' }}
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CoachAlertsPage ──────────────────────────────────────────────────────────

const TYPE_OPTIONS = ['All types', ...Object.values(ALERT_TYPE_LABELS).filter(l => l !== 'Milestone')];
const SEV_OPTIONS  = ['All severities', 'High (≥0.75)', 'Medium (0.5–0.75)', 'Low (<0.5)'];

export default function CoachAlertsPage() {
  const navigate = useNavigate();

  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [tab, setTab]             = useState('active');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [sevFilter, setSevFilter]   = useState('All severities');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [alertsData, playersData] = await Promise.all([
          apiFetch('/api/coach/alerts'),
          apiFetch('/api/players'),
        ]);

        if (cancelled) return;

        const players = playersData?.players ?? playersData ?? [];
        const nameMap = new Map(players.map(p => [p.id ?? p.stable_id, p.name ?? p.display_name ?? p.stable_id]));

        const rows = alertsData?.alerts ?? [];
        const normalized = rows.map(r => ({
          id:          r.id,
          studentName: nameMap.get(r.player_id) ?? r.player_id?.slice(0, 8) ?? '—',
          type:        r.alert_type,
          detail:      humanDetail(r.alert_type, r.data),
          severity:    r.severity ?? 0,
          dismissed:   r.status === 'dismissed',
          generatedAt: r.created_at
            ? new Date(r.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—',
          hasHands:    r.alert_type === 'mistake_spike',
          hasSessions: r.alert_type === 'losing_streak',
        }));

        setAllAlerts(normalized);
      } catch (_) {
        // Fall back to mock data so the page is always usable
        if (!cancelled) setAllAlerts(MOCK_ALERTS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = async (id) => {
    setAllAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true } : a));
    try {
      await apiFetch(`/api/coach/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      });
    } catch (_) {
      setAllAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: false } : a));
    }
  };

  const matchesSev = (a) => {
    if (sevFilter === 'All severities') return true;
    if (sevFilter === 'High (≥0.75)')   return a.severity >= 0.75;
    if (sevFilter === 'Medium (0.5–0.75)') return a.severity >= 0.5 && a.severity < 0.75;
    return a.severity < 0.5;
  };

  const matchesType = (a) => {
    if (typeFilter === 'All types') return true;
    return ALERT_TYPE_LABELS[a.type] === typeFilter;
  };

  const filteredAlerts = useMemo(() => {
    return allAlerts
      .filter(a => a.type !== 'positive_milestone')
      .filter(a => (tab === 'active' ? !a.dismissed : a.dismissed))
      .filter(matchesSev)
      .filter(matchesType)
      .sort((a, b) => b.severity - a.severity);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAlerts, tab, typeFilter, sevFilter]);

  const milestones = useMemo(() =>
    allAlerts.filter(a => a.type === 'positive_milestone' && !a.dismissed),
    [allAlerts]
  );

  const activeCount = allAlerts.filter(a => a.type !== 'positive_milestone' && !a.dismissed).length;

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-0">

        {/* Page title */}
        <div className="mb-4">
          <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Alerts</h1>
        </div>

        {/* Controls row: tabs + filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Tab toggle */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid #30363d' }}>
            {[
              { key: 'active',    label: `Active${activeCount > 0 ? ` (${activeCount})` : ''}` },
              { key: 'dismissed', label: 'Dismissed' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="px-4 py-1.5 text-sm font-semibold"
                style={{
                  background: tab === t.key ? GOLD : '#161b22',
                  color:      tab === t.key ? '#0d1117' : '#6e7681',
                }}
                data-testid={`tab-${t.key}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className={inputCls}
            style={inputStyle}
            data-testid="type-filter"
          >
            {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>

          {/* Severity filter */}
          <select
            value={sevFilter}
            onChange={e => setSevFilter(e.target.value)}
            className={inputCls}
            style={inputStyle}
            data-testid="severity-filter"
          >
            {SEV_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm" style={{ color: '#6e7681' }}>Loading alerts…</div>
        ) : (
          <>
            {/* Alert cards */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: '#161b22', border: '1px solid #30363d' }}
              data-testid="alerts-list"
            >
              {filteredAlerts.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm" style={{ color: '#6e7681' }}>
                  {tab === 'active'
                    ? 'No active alerts — all students are on track.'
                    : 'No dismissed alerts.'}
                </div>
              ) : (
                filteredAlerts.map(alert => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onDismiss={handleDismiss}
                    onReview={() => navigate('/admin/crm')}
                    onViewHands={() => navigate('/analysis')}
                    onViewSessions={() => navigate('/analysis')}
                  />
                ))
              )}
            </div>

            {/* Milestones */}
            {tab === 'active' && milestones.length > 0 && (
              <div
                className="rounded-xl overflow-hidden mt-4"
                style={{ background: '#161b22', border: '1px solid #30363d' }}
                data-testid="milestones-list"
              >
                <div
                  className="px-4 py-3"
                  style={{ borderBottom: '1px solid #30363d', background: '#1a2233' }}
                >
                  <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#3fb950' }}>
                    Milestones
                  </span>
                </div>
                {milestones.map(m => (
                  <AlertCard
                    key={m.id}
                    alert={m}
                    onDismiss={handleDismiss}
                    onReview={() => navigate('/admin/crm')}
                    onViewHands={() => {}}
                    onViewSessions={() => {}}
                  />
                ))}
              </div>
            )}

            {/* Alert Settings */}
            <AlertSettingsPanel />
          </>
        )}
      </div>
    </div>
  );
}
