/**
 * StakingSection.jsx
 *
 * Display staking contract status and monthly P&L summary.
 * Link to full staking page.
 */

import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

export default function StakingSection({ staking, playerId }) {
  if (!staking) {
    return (
      <CollapsibleSection
        title="STAKING"
        storageKey={`staking-${playerId}`}
        defaultOpen={true}
      >
        <p className="text-xs" style={{ color: colors.textMuted }}>No staking contract</p>
      </CollapsibleSection>
    )
  }

  const monthlyPL = staking.monthly_pl || 0
  const isProfit = monthlyPL > 0

  return (
    <CollapsibleSection
      title="STAKING"
      storageKey={`staking-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <a
          href="/admin/staking"
          className="text-xs hover:opacity-80"
          style={{ color: colors.gold, textDecoration: 'none' }}
        >
          Manage →
        </a>
      }
    >
      <div className="space-y-3">
        {/* Contract status */}
        <div
          className="p-3 rounded"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
          }}
        >
          <div className="text-xs font-semibold" style={{ color: colors.textMuted }}>
            Status
          </div>
          <div className="mt-1 text-sm font-bold" style={{ color: colors.gold }}>
            {staking.contract_status === 'active' ? '✓ Active' : staking.contract_status}
          </div>
        </div>

        {/* Monthly P&L */}
        <div
          className="p-3 rounded flex items-center gap-3"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
          }}
        >
          <div style={{ color: isProfit ? colors.success : colors.error }}>
            {isProfit ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div>
            <div className="text-xs" style={{ color: colors.textMuted }}>
              Monthly P&L
            </div>
            <div
              className="text-lg font-bold"
              style={{ color: isProfit ? colors.success : colors.error }}
            >
              {isProfit ? '+' : ''}{monthlyPL.toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
