/**
 * PrepBriefSection.jsx
 *
 * Display session prep brief with refresh button and timestamp.
 */

import React, { useState } from 'react'
import { RefreshCw, Clock } from 'lucide-react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

function formatTimestamp(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function PrepBriefSection({ prepBrief, playerId }) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      // TODO: call API to refresh prep brief
      await new Promise((r) => setTimeout(r, 1000))
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <CollapsibleSection
      title="PREP BRIEF"
      storageKey={`prepbrief-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 rounded hover:opacity-80"
          style={{
            background: 'none',
            border: 'none',
            color: refreshing ? colors.textMuted : colors.gold,
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
          title="Refresh brief"
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s infinite' : 'none' }} />
        </button>
      }
    >
      <div className="space-y-3">
        {!prepBrief ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No prep brief available</p>
        ) : (
          <>
            {/* Content */}
            <div
              className="p-3 rounded text-xs leading-relaxed"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textSecondary,
              }}
            >
              {prepBrief.content || 'Loading brief...'}
            </div>

            {/* Timestamp */}
            {prepBrief.generated_at && (
              <div className="flex items-center gap-2 text-xs" style={{ color: colors.textMuted }}>
                <Clock size={12} />
                <span>Generated {formatTimestamp(prepBrief.generated_at)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}
