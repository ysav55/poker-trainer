/**
 * StudentsRosterPage.jsx
 *
 * Full-page data table for students/players with:
 * - Columns: Name, Group, Grade, Alert, Last Active
 * - Text search filter
 * - Group dropdown filter
 * - Grade and alert sorting
 * - Row click → /students/:playerId
 * - Loading/empty/error states
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { colors } from '../lib/colors'

const ALERT_COLORS = {
  high: colors.error,
  moderate: colors.warning,
  healthy: colors.success,
  inactive: colors.textMuted,
}

function formatRelativeTime(iso) {
  if (!iso) return '—'
  try {
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  } catch {
    return '—'
  }
}

export default function StudentsRosterPage() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [sortBy, setSortBy] = useState('name')

  const loadPlayers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiFetch('/api/admin/players')
      setPlayers(data.players || [])
    } catch (err) {
      console.error('Failed to load players:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPlayers()
  }, [loadPlayers])

  const groups = useMemo(
    () => [...new Set(players.map((p) => p.group_name).filter(Boolean))].sort(),
    [players]
  )

  const filtered = useMemo(() => {
    let result = players

    if (searchText) {
      const lower = searchText.toLowerCase()
      result = result.filter((p) => p.display_name.toLowerCase().includes(lower))
    }

    if (selectedGroup !== 'all') {
      result = result.filter((p) => p.group_name === selectedGroup)
    }

    if (sortBy === 'grade') {
      result.sort((a, b) => (b.grade || 0) - (a.grade || 0))
    } else if (sortBy === 'alert') {
      const severity = { high: 3, moderate: 2, healthy: 1, inactive: 0 }
      result.sort((a, b) => (severity[b.alert_severity] || 0) - (severity[a.alert_severity] || 0))
    } else {
      result.sort((a, b) => a.display_name.localeCompare(b.display_name))
    }

    return result
  }, [players, searchText, selectedGroup, sortBy])

  if (loading) {
    return (
      <div data-testid="students-loading" className="p-6">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg animate-pulse"
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
          onClick={loadPlayers}
          className="mt-4 px-4 py-2 rounded font-semibold"
          style={{
            background: colors.gold,
            color: colors.bgPrimary,
            cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold mb-4" style={{ color: colors.textPrimary }}>
          Students
        </h1>

        {/* Filters */}
        <div className="flex gap-4 mb-4 flex-wrap">
          <input
            type="text"
            placeholder="Search by name..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="px-3 py-2 rounded text-sm flex-1 min-w-[200px]"
            style={{
              background: colors.bgSurface,
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textPrimary,
            }}
          />
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="px-3 py-2 rounded text-sm"
            style={{
              background: colors.bgSurface,
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textPrimary,
            }}
          >
            <option value="all">All Groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12" style={{ color: colors.textMuted }}>
          <p className="text-sm mb-2">No students found</p>
          <p className="text-xs">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: colors.borderDefault }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: colors.bgSurface }}>
                <th className="px-4 py-2 text-left font-semibold" style={{ color: colors.gold }}>
                  Name
                </th>
                <th className="px-4 py-2 text-left font-semibold" style={{ color: colors.gold }}>
                  Group
                </th>
                <th
                  className="px-4 py-2 text-left font-semibold cursor-pointer hover:text-opacity-80"
                  onClick={() => setSortBy('grade')}
                  style={{ color: colors.gold }}
                >
                  Grade
                </th>
                <th
                  className="px-4 py-2 text-left font-semibold cursor-pointer"
                  onClick={() => setSortBy('alert')}
                  style={{ color: colors.gold }}
                >
                  Alert
                </th>
                <th className="px-4 py-2 text-left font-semibold" style={{ color: colors.gold }}>
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((player) => (
                <tr
                  key={player.id}
                  onClick={() => navigate(`/students/${player.id}`)}
                  className="border-t cursor-pointer hover:bg-opacity-50"
                  style={{
                    borderColor: colors.borderDefault,
                    background: colors.bgSurfaceRaised,
                  }}
                >
                  <td className="px-4 py-3" style={{ color: colors.textPrimary }}>
                    {player.display_name}
                  </td>
                  <td className="px-4 py-3" style={{ color: colors.textSecondary }}>
                    {player.group_name || '—'}
                  </td>
                  <td className="px-4 py-3" style={{ color: colors.textSecondary }}>
                    {player.grade ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div
                      data-testid={`alert-${player.alert_severity}`}
                      className="w-3 h-3 rounded-full"
                      style={{
                        background: ALERT_COLORS[player.alert_severity] || colors.borderDefault,
                      }}
                    />
                  </td>
                  <td className="px-4 py-3" style={{ color: colors.textMuted }}>
                    {formatRelativeTime(player.last_active)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
