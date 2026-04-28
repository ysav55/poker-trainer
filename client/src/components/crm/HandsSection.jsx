/**
 * HandsSection.jsx
 *
 * Display last 10 hands with inline tags and "View All" link.
 */

import React from 'react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function HandsSection({ hands, playerId }) {
  const displayedHands = (hands || []).slice(0, 10)

  return (
    <CollapsibleSection
      title="RECENT HANDS"
      storageKey={`hands-${playerId}`}
      defaultOpen={true}
      headerExtra={
        hands?.length > 10 ? (
          <a
            href={`/history?player=${playerId}`}
            className="text-xs hover:opacity-80"
            style={{ color: colors.gold, textDecoration: 'none' }}
          >
            View All →
          </a>
        ) : null
      }
    >
      <div className="space-y-2">
        {displayedHands.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No hands yet</p>
        ) : (
          displayedHands.map((hand) => (
            <div
              key={hand.id}
              className="p-2 rounded text-xs"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
              }}
            >
              <div className="flex justify-between items-start gap-2">
                <span style={{ color: colors.textPrimary }}>{hand.hand_string}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {hand.tags?.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded"
                      style={{
                        background: colors.goldSubtle,
                        color: colors.gold,
                        fontSize: '10px',
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  {hand.tags?.length > 2 && (
                    <span style={{ color: colors.textMuted }}>+{hand.tags.length - 2}</span>
                  )}
                </div>
              </div>
              {hand.net_chips !== undefined && (
                <div style={{ color: hand.net_chips > 0 ? colors.success : colors.error }}>
                  {hand.net_chips > 0 ? '+' : ''}{hand.net_chips}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  )
}
