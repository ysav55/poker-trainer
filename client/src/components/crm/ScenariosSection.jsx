/**
 * ScenariosSection.jsx
 *
 * Display assigned playlists/scenarios with progress indicators.
 */

import React from 'react'
import { BookOpen } from 'lucide-react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function ScenariosSection({ scenarios, playerId }) {
  return (
    <CollapsibleSection
      title="SCENARIOS"
      storageKey={`scenarios-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <a
          href="/admin/hands"
          className="text-xs hover:opacity-80"
          style={{ color: colors.gold, textDecoration: 'none' }}
        >
          Assign →
        </a>
      }
    >
      <div className="space-y-2">
        {!scenarios || scenarios.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>
            No scenarios assigned
          </p>
        ) : (
          scenarios.slice(0, 5).map((scenario) => {
            const progress = scenario.hands_completed
              ? Math.round((scenario.hands_completed / scenario.hands_assigned) * 100)
              : 0

            return (
              <div
                key={scenario.id}
                className="p-2 rounded"
                style={{
                  background: colors.bgSurface,
                  border: `1px solid ${colors.borderDefault}`,
                }}
              >
                <div className="flex items-start gap-2 mb-1">
                  <BookOpen size={12} style={{ color: colors.gold, marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: colors.textPrimary }}>
                      {scenario.title}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {scenario.hands_completed || 0} / {scenario.hands_assigned} hands
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{
                    background: colors.bgPrimary,
                    border: `1px solid ${colors.borderDefault}`,
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background: colors.gold,
                      width: `${progress}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </CollapsibleSection>
  )
}
