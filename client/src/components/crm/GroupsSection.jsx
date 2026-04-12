/**
 * GroupsSection.jsx
 *
 * Display assigned groups with color coding and manage button.
 */

import React from 'react'
import { Plus } from 'lucide-react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function GroupsSection({ groups, playerId }) {
  return (
    <CollapsibleSection
      title="GROUPS"
      storageKey={`groups-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <button
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
            color: colors.gold,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} className="inline mr-1" />
          Add
        </button>
      }
    >
      <div className="space-y-2">
        {!groups || groups.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>Not assigned to any groups</p>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              className="p-2 rounded flex items-center justify-between"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    background:
                      group.color === 'red'
                        ? '#f85149'
                        : group.color === 'blue'
                          ? '#58a6ff'
                          : group.color === 'green'
                            ? '#3fb950'
                            : group.color === 'yellow'
                              ? '#d29922'
                              : '#d4af37',
                  }}
                />
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {group.name}
                </span>
              </div>
              <button
                className="text-xs hover:opacity-80"
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.error,
                  cursor: 'pointer',
                }}
                title="Remove from group"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  )
}
