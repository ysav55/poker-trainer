import React from 'react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../../lib/colors.js';

export default function AlertFeed({ alerts }) {
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
