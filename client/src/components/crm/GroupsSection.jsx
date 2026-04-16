/**
 * GroupsSection.jsx
 *
 * Display assigned groups with color coding, add picker, and remove button.
 */

import React, { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { colors } from '../../lib/colors'
import { apiFetch } from '../../lib/api'
import CollapsibleSection from '../CollapsibleSection'

function resolveColor(color) {
  if (!color) return '#d4af37'
  if (color === 'red') return '#f85149'
  if (color === 'blue') return '#58a6ff'
  if (color === 'green') return '#3fb950'
  if (color === 'yellow') return '#d29922'
  // hex passthrough
  return color
}

export default function GroupsSection({ groups, playerId, onGroupsChange }) {
  const [showPicker, setShowPicker] = useState(false)
  const [availableGroups, setAvailableGroups] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchAvailable() {
      try {
        const res = await apiFetch('/api/admin/groups/my-school')
        const allGroups = res.groups ?? []
        const assignedIds = new Set((groups ?? []).map((g) => g.id))
        setAvailableGroups(allGroups.filter((g) => !assignedIds.has(g.id)))
      } catch (err) {
        console.error('GroupsSection: failed to fetch available groups', err)
      }
    }
    fetchAvailable()
  }, [groups])

  async function handleAdd(groupId) {
    if (!groupId) return
    setLoading(true)
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      })
      setShowPicker(false)
      onGroupsChange?.()
    } catch (err) {
      console.error('GroupsSection: failed to add member', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(groupId) {
    setLoading(true)
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members/${playerId}`, {
        method: 'DELETE',
      })
      onGroupsChange?.()
    } catch (err) {
      console.error('GroupsSection: failed to remove member', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <CollapsibleSection
      title="GROUPS"
      storageKey={`groups-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <button
          onClick={() => setShowPicker((v) => !v)}
          disabled={loading}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
            color: colors.gold,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          <Plus size={12} className="inline mr-1" />
          Add
        </button>
      }
    >
      <div className="space-y-2">
        {showPicker && (
          <div className="mb-2">
            {availableGroups.length === 0 ? (
              <p className="text-xs" style={{ color: colors.textMuted }}>
                No groups available to add
              </p>
            ) : (
              <select
                autoFocus
                defaultValue=""
                disabled={loading}
                onChange={(e) => handleAdd(e.target.value)}
                className="text-xs w-full rounded px-2 py-1"
                style={{
                  background: colors.bgSurface,
                  border: `1px solid ${colors.borderDefault}`,
                  color: colors.textSecondary,
                  cursor: 'pointer',
                }}
              >
                <option value="" disabled>
                  Select a group…
                </option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {!groups || groups.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>
            Not assigned to any groups
          </p>
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
                  style={{ background: resolveColor(group.color) }}
                />
                <span className="text-xs" style={{ color: colors.textSecondary }}>
                  {group.name}
                </span>
              </div>
              <button
                onClick={() => handleRemove(group.id)}
                disabled={loading}
                className="text-xs hover:opacity-80"
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.error,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
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
