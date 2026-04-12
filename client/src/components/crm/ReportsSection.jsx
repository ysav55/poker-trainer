/**
 * ReportsSection.jsx
 *
 * Display weekly report cards with grades and metrics.
 */

import React from 'react'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

function gradeColor(grade) {
  if (grade >= 80) return colors.success
  if (grade >= 60) return colors.warning
  return colors.error
}

export default function ReportsSection({ reports, playerId }) {
  return (
    <CollapsibleSection
      title="REPORTS"
      storageKey={`reports-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <a
          href={`/coach/reports/${playerId}`}
          className="text-xs hover:opacity-80"
          style={{ color: colors.gold, textDecoration: 'none' }}
        >
          View All →
        </a>
      }
    >
      <div className="space-y-2">
        {!reports || reports.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No reports yet</p>
        ) : (
          reports.slice(0, 4).map((report, idx) => (
            <div
              key={idx}
              className="p-3 rounded flex justify-between items-center"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
              }}
            >
              <div>
                <div className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
                  {report.week ? `Week of ${report.week}` : 'Latest Report'}
                </div>
                <div className="text-xs mt-1 space-x-2">
                  <span style={{ color: colors.textMuted }}>
                    {report.hands_played} hands
                  </span>
                  <span style={{ color: colors.textMuted }}>
                    {report.sessions} sessions
                  </span>
                </div>
              </div>
              <div
                className="text-2xl font-bold px-3 py-2 rounded"
                style={{
                  background: gradeColor(report.grade || 0),
                  color: colors.bgPrimary,
                }}
              >
                {report.grade || 'N/A'}
              </div>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  )
}
