import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { SectionHeader, Field, Input, Toggle, Card } from './shared.jsx';
import { colors } from '../../lib/colors.js';

// ─── AlertsTab ────────────────────────────────────────────────────────────────

const ALERT_LABELS = {
  inactivity:         'Inactivity',
  volume_drop:        'Volume Drop',
  mistake_spike:      'Mistake Spike',
  losing_streak:      'Losing Streak',
  stat_regression:    'Stat Regression',
  positive_milestone: 'Positive Milestone',
};

const ALERT_DESCRIPTIONS = {
  inactivity:         'Alert when a student has not played for N consecutive days.',
  volume_drop:        'Alert when a student\'s weekly session volume drops significantly.',
  mistake_spike:      'Alert when tagged mistakes spike above the 30-day baseline.',
  losing_streak:      'Alert when a student loses N sessions in a row.',
  stat_regression:    'Alert when a key stat regresses beyond normal variance.',
  positive_milestone: 'Alert on positive achievements (no configurable threshold).',
};

function AlertThresholdFields({ row, onChange }) {
  if (!row.enabled || row.threshold === null) return null;

  switch (row.alert_type) {
    case 'inactivity':
      return (
        <Field label="Days without activity">
          <Input
            type="number" min="1" max="90"
            value={row.threshold?.days ?? 5}
            onChange={v => onChange({ days: Number(v) })}
          />
        </Field>
      );
    case 'volume_drop':
      return (
        <Field label="Drop threshold (%)" hint="Alert when weekly volume drops by this percentage vs baseline.">
          <Input
            type="number" min="10" max="100"
            value={Math.round((row.threshold?.drop_pct ?? 0.5) * 100)}
            onChange={v => onChange({ drop_pct: Number(v) / 100 })}
          />
        </Field>
      );
    case 'mistake_spike':
      return (
        <Field label="Spike ratio" hint="Alert when mistake rate is this multiple of the 30-day average.">
          <Input
            type="number" min="1" max="10" step="0.1"
            value={row.threshold?.spike_ratio ?? 1.5}
            onChange={v => onChange({ spike_ratio: Number(v) })}
          />
        </Field>
      );
    case 'losing_streak':
      return (
        <Field label="Consecutive losing sessions">
          <Input
            type="number" min="2" max="20"
            value={row.threshold?.streak_length ?? 3}
            onChange={v => onChange({ streak_length: Number(v) })}
          />
        </Field>
      );
    case 'stat_regression':
      return (
        <Field label="Z-score threshold" hint="Standard deviations below baseline to trigger the alert.">
          <Input
            type="number" min="1" max="5" step="0.1"
            value={row.threshold?.z_threshold ?? 2.0}
            onChange={v => onChange({ z_threshold: Number(v) })}
          />
        </Field>
      );
    default:
      return null;
  }
}

function AlertRow({ row, saving, saved, onChange, onSave }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
              {ALERT_LABELS[row.alert_type] ?? row.alert_type}
            </span>
            <Toggle
              value={row.enabled}
              onChange={v => onChange({ enabled: v })}
              yes="On"
              no="Off"
            />
          </div>
          <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
            {ALERT_DESCRIPTIONS[row.alert_type]}
          </p>
          <AlertThresholdFields
            row={row}
            onChange={changes => onChange({ threshold: { ...(row.threshold ?? {}), ...changes } })}
          />
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="mt-1 px-4 py-1.5 rounded text-sm font-bold whitespace-nowrap"
          style={saved
            ? { background: colors.success, color: colors.white }
            : { background: colors.gold, color: colors.bgSurface, opacity: saving ? 0.6 : 1 }}
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Card>
  );
}

export default function AlertsTab() {
  const [config, setConfig] = useState([]);
  const [saving, setSaving] = useState({});
  const [saved,  setSaved]  = useState({});
  const [error,  setError]  = useState(null);

  useEffect(() => {
    apiFetch('/api/coach/alerts/config')
      .then(d => setConfig(d.config ?? []))
      .catch(() => setError('Failed to load alert configuration.'));
  }, []);

  function updateRow(alertType, changes) {
    setConfig(prev => prev.map(r =>
      r.alert_type === alertType ? { ...r, ...changes } : r
    ));
  }

  async function saveRow(row) {
    setSaving(prev => ({ ...prev, [row.alert_type]: true }));
    try {
      await apiFetch(`/api/coach/alerts/config/${row.alert_type}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: row.enabled, threshold: row.threshold }),
      });
      setSaved(prev => ({ ...prev, [row.alert_type]: true }));
      setTimeout(() => setSaved(prev => ({ ...prev, [row.alert_type]: false })), 2000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(prev => ({ ...prev, [row.alert_type]: false }));
    }
  }

  if (error) return <p className="text-sm" style={{ color: colors.error }}>{error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <SectionHeader title="Alert Configuration" />
      <p className="text-sm mb-1" style={{ color: colors.textMuted }}>
        Control which alerts are generated for your students and configure their thresholds.
      </p>

      {config.length === 0 && (
        <p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p>
      )}

      {config.map(row => (
        <AlertRow
          key={row.alert_type}
          row={row}
          saving={saving[row.alert_type]}
          saved={saved[row.alert_type]}
          onChange={changes => updateRow(row.alert_type, changes)}
          onSave={() => saveRow(row)}
        />
      ))}
    </div>
  );
}
