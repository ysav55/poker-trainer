/**
 * PlayerHeader.jsx
 *
 * Breadcrumb navigation with back button for student dashboard.
 * Breadcrumb: ← Students > Group Name > Player Name
 */

import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { colors } from '../../lib/colors'

export default function PlayerHeader({ playerName, groupName }) {
  const navigate = useNavigate()

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => navigate('/students')}
          className="p-1 rounded hover:opacity-80"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          aria-label="Back"
        >
          <ChevronLeft size={20} style={{ color: colors.gold }} />
        </button>
        <nav className="flex items-center gap-2 text-xs" style={{ color: colors.textSecondary }}>
          <button
            onClick={() => navigate('/students')}
            className="hover:opacity-80"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textSecondary }}
          >
            Students
          </button>
          <span>/</span>
          <span>{groupName || '—'}</span>
          <span>/</span>
          <span style={{ color: colors.textPrimary }}>{playerName}</span>
        </nav>
      </div>
      <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>
        {playerName}
      </h1>
      {groupName && <p className="text-xs mt-1" style={{ color: colors.textMuted }}>{groupName}</p>}
    </div>
  )
}
