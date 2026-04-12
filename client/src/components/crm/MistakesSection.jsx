/**
 * MistakesSection.jsx
 *
 * Bar chart showing mistakes per 100 hands.
 * Placeholder chart for MVP.
 */

import React from 'react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function MistakesSection({ mistakes, playerId }) {
  const mistakeTypes = [
    { label: 'Fold to probe', value: mistakes?.fold_to_probe || 0 },
    { label: 'Min raise', value: mistakes?.min_raise || 0 },
    { label: 'Overlimp', value: mistakes?.overlimp || 0 },
    { label: 'Cold call 3bet', value: mistakes?.cold_call_3bet || 0 },
  ]

  return (
    <CollapsibleSection
      title="MISTAKES"
      storageKey={`mistakes-${playerId}`}
      defaultOpen={true}
    >
      <div className="space-y-3">
        {mistakeTypes.map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: colors.textSecondary }}>{item.label}</span>
              <span style={{ color: colors.gold }}>{item.value.toFixed(1)}</span>
            </div>
            <div
              className="rounded-full h-2"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
                width: '100%',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: item.value > 5 ? colors.error : colors.warning,
                  width: `${Math.min((item.value / 10) * 100, 100)}%`,
                  transition: 'width 0.3s',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </CollapsibleSection>
  )
}
