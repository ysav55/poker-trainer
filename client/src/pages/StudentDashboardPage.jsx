/**
 * StudentDashboardPage.jsx
 *
 * Single-page student dashboard with 12 collapsible sections in 2-column grid.
 * Responsive: 2 cols on lg, 1 col on mobile.
 *
 * Sections:
 * 1. Overview — 4 stat cards
 * 2. Performance — trend chart
 * 3. Mistakes — bar chart
 * 4. Recent Hands — last 10 hands
 * 5. Alerts — active alerts
 * 6. Groups — assigned groups
 * 7. Notes — timeline
 * 8. Staking — contract status + P&L
 * 9. Prep Brief — session brief
 * 10. Reports — weekly report cards
 * 11. Scenarios — assigned playlists
 * 12. Quick Actions (future expansion)
 */

import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { colors } from '../lib/colors'

import PlayerHeader from '../components/crm/PlayerHeader'
import OverviewSection from '../components/crm/OverviewSection'
import PerformanceSection from '../components/crm/PerformanceSection'
import MistakesSection from '../components/crm/MistakesSection'
import HandsSection from '../components/crm/HandsSection'
import AlertsSection from '../components/crm/AlertsSection'
import GroupsSection from '../components/crm/GroupsSection'
import NotesSection from '../components/crm/NotesSection'
import StakingSection from '../components/crm/StakingSection'
import PrepBriefSection from '../components/crm/PrepBriefSection'
import ReportsSection from '../components/crm/ReportsSection'
import ScenariosSection from '../components/crm/ScenariosSection'

export default function StudentDashboardPage() {
  const { playerId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await apiFetch(`/api/admin/players/${playerId}/crm`)
      setData(result)
    } catch (err) {
      console.error('Failed to load student data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [playerId])

  if (loading) {
    return (
      <div data-testid="dashboard-loading" className="p-6">
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-32 rounded-lg animate-pulse"
              style={{ background: colors.bgSurfaceRaised }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: colors.error }}>Error: {error}</p>
        <button
          onClick={loadData}
          className="mt-4 px-4 py-2 rounded font-semibold"
          style={{
            background: colors.gold,
            color: colors.bgPrimary,
            cursor: 'pointer',
            border: 'none',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) {
    return <div className="p-6">Student not found</div>
  }

  const { player, summary, alerts, notes, hands, groups, scenarios, staking } = data

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header with breadcrumb */}
      <PlayerHeader playerName={player?.display_name} groupName={player?.group_name} />

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Row 1: Overview | (Right column empty for now) */}
        <div>
          <OverviewSection summary={summary} playerId={playerId} />
        </div>
        <div>{/* Quick actions placeholder */}</div>

        {/* Row 2: Performance | Alerts */}
        <div>
          <PerformanceSection snapshots={data.snapshots} playerId={playerId} />
        </div>
        <div>
          <AlertsSection alerts={alerts} playerId={playerId} />
        </div>

        {/* Row 3: Mistakes | Groups */}
        <div>
          <MistakesSection mistakes={data.mistakes} playerId={playerId} />
        </div>
        <div>
          <GroupsSection groups={groups} playerId={playerId} />
        </div>

        {/* Row 4: Recent Hands | Staking */}
        <div>
          <HandsSection hands={hands} playerId={playerId} />
        </div>
        <div>
          <StakingSection staking={staking} playerId={playerId} />
        </div>

        {/* Row 5: Notes | Reports */}
        <div>
          <NotesSection notes={notes} playerId={playerId} />
        </div>
        <div>
          <ReportsSection reports={data.reports} playerId={playerId} />
        </div>

        {/* Row 6: Prep Brief | Scenarios */}
        <div>
          <PrepBriefSection prepBrief={data.prepBrief} playerId={playerId} />
        </div>
        <div>
          <ScenariosSection scenarios={scenarios} playerId={playerId} />
        </div>
      </div>
    </div>
  )
}
