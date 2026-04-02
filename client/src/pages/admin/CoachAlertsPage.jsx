import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

const ALERT_TYPE_LABELS = {
  mistake_spike:      'Mistake spike',
  inactivity:         'Inactive',
  volume_drop:        'Volume drop',
  losing_streak:      'Losing streak',
  stat_regression:    'Stat regression',
  positive_milestone: 'Milestone',
};

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
      return `Inactive ${data.days_inactive ?? '?'} days`;
    case 'losing_streak':
      return `${data.streak_sessions ?? '?'}-session losing streak, ${Number(data.total_loss ?? 0).toLocaleString()} chips`;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityColor(s) {
  if (s >= 0.75) return '#f85149';
  if (s >= 0.5)  return '#e3b341';
  return '#d4af37';
}

function severityEmoji(s) {
  if (s >= 0.75) return '🔴';
  if (s >= 0.5)  return '🟠';
  return '🟡';
}

// ─── AlertRow ─────────────────────────────────────────────────────────────────

function AlertRow({ alert, onDismiss, onReview }) {
  const col = severityColor(alert.severity);
  const typeLabel = ALERT_TYPE_LABELS[alert.type] ?? alert.type;

  return (
    <div
      className="px-4 py-3"
      style={{ borderBottom: '1px solid #21262d' }}
      data-testid={`alert-row-${alert.id}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <span style={{ fontSize: 14, lineHeight: 1.5, flexShrink: 0 }}>
          {severityEmoji(alert.severity)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm tabular-nums" style={{ color: col }}>
              {alert.severity.toFixed(2)}
            </span>
            <span className="font-semibold text-sm" style={{ color: '#f0ece3' }}>
              {alert.studentName}
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{
                background: `${col}18`,
                color: col,
                border: `1px solid ${col}33`,
              }}
            >
              {typeLabel}
            </span>
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#8b949e' }}>
            {alert.detail}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => onReview(alert)}
          className="text-xs px-3 py-1 rounded font-semibold"
          style={{
            background: 'rgba(88,166,255,0.1)',
            border: '1px solid rgba(88,166,255,0.3)',
            color: '#58a6ff',
            cursor: 'pointer',
          }}
          data-testid={`alert-review-${alert.id}`}
        >
          Review →
        </button>
        <button
          onClick={() => onDismiss(alert.id)}
          className="text-xs px-3 py-1 rounded font-semibold"
          style={{
            background: 'rgba(110,118,129,0.1)',
            border: '1px solid rgba(110,118,129,0.3)',
            color: '#6e7681',
            cursor: 'pointer',
          }}
          data-testid={`alert-dismiss-${alert.id}`}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ─── MilestoneRow ─────────────────────────────────────────────────────────────

function MilestoneRow({ milestone }) {
  return (
    <div
      className="flex items-start gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid #21262d' }}
      data-testid={`milestone-row-${milestone.id}`}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>🟢</span>
      <div>
        <span className="font-semibold text-sm" style={{ color: '#3fb950' }}>
          {milestone.studentName}
        </span>
        <span className="text-xs ml-2" style={{ color: '#8b949e' }}>
          {milestone.detail}
        </span>
      </div>
    </div>
  );
}

// ─── CoachAlertsPage ──────────────────────────────────────────────────────────

export default function CoachAlertsPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts]       = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

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

        // Build player_id → name map
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
        }));

        setAlerts(normalized.filter(a => a.type !== 'positive_milestone'));
        setMilestones(normalized.filter(a => a.type === 'positive_milestone'));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const visible = alerts
    .filter((a) => !a.dismissed)
    .sort((a, b) => b.severity - a.severity);

  const handleDismiss = async (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
    try {
      await apiFetch(`/api/coach/alerts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'dismissed' }),
      });
    } catch (_) {
      // Re-show alert if the PATCH failed
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: false } : a)));
    }
  };

  const handleReview = () => {
    navigate('/admin/crm');
  };

  return (
    <div style={{ color: '#e5e7eb' }}>

      <div className="max-w-xl mx-auto px-4 py-6">

        {error && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', color: '#f85149' }}>
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm" style={{ color: '#6e7681' }}>Loading alerts…</div>
        ) : (
          <div
            className="rounded-xl overflow-hidden"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
          >

            {/* Needs Attention header */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid #30363d', background: '#1a2233' }}
            >
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: '#f85149' }}
                data-testid="alerts-header"
              >
                ⚠ NEEDS ATTENTION ({visible.length})
              </span>
            </div>

            {/* Alert rows */}
            {visible.length === 0 ? (
              <div
                className="px-4 py-10 text-center text-sm"
                style={{ color: '#6e7681' }}
                data-testid="no-alerts"
              >
                No active alerts — all students are on track.
              </div>
            ) : (
              visible.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDismiss={handleDismiss}
                  onReview={handleReview}
                />
              ))
            )}

            {/* Milestones header */}
            <div
              className="px-4 py-3"
              style={{
                borderTop: visible.length > 0 ? '1px solid #30363d' : undefined,
                borderBottom: '1px solid #30363d',
                background: '#1a2233',
              }}
            >
              <span
                className="text-xs font-bold tracking-widest uppercase"
                style={{ color: '#3fb950' }}
                data-testid="milestones-header"
              >
                ✅ MILESTONES
              </span>
            </div>

            {/* Milestone rows */}
            {milestones.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm" style={{ color: '#6e7681' }}>
                No milestones this week.
              </div>
            ) : (
              milestones.map((m) => (
                <MilestoneRow key={m.id} milestone={m} />
              ))
            )}

          </div>
        )}
      </div>
    </div>
  );
}
