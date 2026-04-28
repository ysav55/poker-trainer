/**
 * PerformanceSection.jsx
 *
 * Performance trend with line chart and stat selector.
 * Placeholder chart for MVP.
 */

import React, { useState } from 'react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function PerformanceSection({ snapshots, playerId }) {
  const [selectedStat, setSelectedStat] = useState('vpip')

  const stats = ['vpip', 'pfr', 'wtsd', 'cbet']

  return (
    <CollapsibleSection
      title="PERFORMANCE"
      storageKey={`performance-${playerId}`}
      defaultOpen={true}
    >
      <div className="space-y-4">
        {/* Stat selector */}
        <div className="flex gap-2">
          {stats.map((stat) => (
            <button
              key={stat}
              onClick={() => setSelectedStat(stat)}
              className="px-3 py-1 rounded text-xs font-semibold"
              style={{
                background: selectedStat === stat ? colors.gold : colors.bgSurface,
                color: selectedStat === stat ? colors.bgPrimary : colors.textSecondary,
                border: `1px solid ${colors.borderDefault}`,
                cursor: 'pointer',
              }}
            >
              {stat.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Placeholder chart */}
        <div
          className="rounded-lg p-4 min-h-[200px] flex items-center justify-center"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
          }}
        >
          <p style={{ color: colors.textMuted }}>Chart placeholder: {selectedStat.toUpperCase()} trend</p>
        </div>

        {/* Summary stats */}
        {snapshots?.length > 0 && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div
              className="p-2 rounded"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
              }}
            >
              <div style={{ color: colors.textMuted }}>Highest</div>
              <div style={{ color: colors.gold }}>
                {Math.max(...snapshots.map((s) => s[selectedStat] || 0)).toFixed(1)}%
              </div>
            </div>
            <div
              className="p-2 rounded"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
              }}
            >
              <div style={{ color: colors.textMuted }}>Latest</div>
              <div style={{ color: colors.gold }}>
                {snapshots[0]?.[selectedStat]?.toFixed(1)}%
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}
