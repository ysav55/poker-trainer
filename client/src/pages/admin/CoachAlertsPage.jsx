import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

const ALERT_TYPE_LABELS = {
  mistake_spike:   'Mistake spike',
  inactivity:      'Inactive',
  volume_drop:     'Volume drop',
  losing_streak:   'Losing streak',
  stat_regression: 'Stat regression',
};

// ─── Mock data (replace with apiFetch('/api/coach/alerts') when backend ships) ─

const MOCK_ALERTS = [
  {
    id: 'a1',
    studentName: 'Alex K.',
    type: 'mistake_spike',
    detail: 'EQUITY_FOLD 2.6× baseline — 3 hands flagged',
    severity: 0.87,
    dismissed: false,
  },
  {
    id: 'a2',
    studentName: 'Jordan L.',
    type: 'inactivity',
    detail: 'Inactive 7 days — last played Mar 24',
    severity: 0.71,
    dismissed: false,
  },
  {
    id: 'a3',
    studentName: 'Marcus T.',
    type: 'losing_streak',
    detail: '4-session losing streak, −12,400 chips',
    severity: 0.54,
    dismissed: false,
  },
];

const MOCK_MILESTONES = [
  { id: 'm1', studentName: 'Sam P.',    detail: 'First profitable week (+4,200 chips)' },
  { id: 'm2', studentName: 'Taylor W.', detail: 'VPIP improved 31% → 24%' },
];

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
  const [alerts, setAlerts] = useState(MOCK_ALERTS);

  const visible = alerts
    .filter((a) => !a.dismissed)
    .sort((a, b) => b.severity - a.severity);

  const handleDismiss = (id) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dismissed: true } : a)));
  };

  const handleReview = () => {
    navigate('/admin/crm');
  };

  return (
    <div className="min-h-screen" style={{ background: '#0d1117', color: '#e5e7eb' }}>

      {/* Header */}
      <header
        className="sticky top-0 z-40 flex items-center gap-4 px-6"
        style={{ height: 48, background: '#0d1117', borderBottom: '1px solid #30363d' }}
      >
        <button
          onClick={() => navigate('/lobby')}
          className="text-xs"
          style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          data-testid="back-to-lobby"
        >
          ← Lobby
        </button>
        <span className="text-sm font-bold tracking-widest uppercase" style={{ color: GOLD }}>
          Coach Alerts
        </span>
      </header>

      <div className="max-w-xl mx-auto px-4 py-6">
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
          {MOCK_MILESTONES.map((m) => (
            <MilestoneRow key={m.id} milestone={m} />
          ))}

        </div>
      </div>
    </div>
  );
}
