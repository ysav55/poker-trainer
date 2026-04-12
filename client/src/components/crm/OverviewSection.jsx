/**
 * OverviewSection.jsx
 *
 * Displays 4 key stat cards: Hands Played, VPIP, PFR, WTSD
 * Wrapped in CollapsibleSection with localStorage persistence.
 */

import React, { useState, useEffect } from 'react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

function StatCard({ label, value, unit = '' }) {
  return (
    <div
      className="rounded-lg p-4 flex-1 min-w-[120px]"
      style={{
        background: colors.bgSurface,
        border: `1px solid ${colors.borderDefault}`,
      }}
    >
      <div className="text-xs font-semibold tracking-widest mb-1" style={{ color: colors.textMuted }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ color: colors.gold }}>
        {value ?? '—'}
        {unit && <span className="text-xs ml-1 font-normal">{unit}</span>}
      </div>
    </div>
  )
}

export default function OverviewSection({ summary, playerId }) {
  const [loading, setLoading] = useState(false)

  if (loading) {
    return <div className="px-4 py-3">Loading...</div>
  }

  return (
    <CollapsibleSection
      title="OVERVIEW"
      storageKey={`overview-${playerId}`}
      defaultOpen={true}
    >
      <div className="flex gap-3 flex-wrap">
        <StatCard label="Hands Played" value={summary?.hands_played} />
        <StatCard label="VPIP" value={summary?.vpip?.toFixed(1)} unit="%" />
        <StatCard label="PFR" value={summary?.pfr?.toFixed(1)} unit="%" />
        <StatCard label="WTSD" value={summary?.wtsd?.toFixed(1)} unit="%" />
      </div>
    </CollapsibleSection>
  )
}
