/**
 * AlertsSection.jsx
 *
 * Display student's active alerts with severity indicators.
 */

import React from 'react'
import { AlertCircle } from 'lucide-react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

const SEVERITY_CONFIG = {
  high: { color: colors.error, label: 'High' },
  moderate: { color: colors.warning, label: 'Moderate' },
  low: { color: colors.info, label: 'Low' },
}

export default function AlertsSection({ alerts, playerId }) {
  return (
    <CollapsibleSection
      title="ALERTS"
      storageKey={`alerts-${playerId}`}
      defaultOpen={true}
    >
      <div className="space-y-2">
        {!alerts || alerts.length === 0 ? (
          <p className="text-xs" style={{ color: colors.success }}>No active alerts</p>
        ) : (
          alerts.slice(0, 5).map((alert) => {
            const severity = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.low
            return (
              <div
                key={alert.id}
                className="p-3 rounded flex gap-2 items-start"
                style={{
                  background: colors.bgSurface,
                  border: `1px solid ${severity.color}`,
                }}
              >
                <AlertCircle size={16} style={{ color: severity.color, flexShrink: 0, marginTop: 2 }} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold" style={{ color: severity.color }}>
                    {severity.label}
                  </div>
                  <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                    {alert.message}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </CollapsibleSection>
  )
}
