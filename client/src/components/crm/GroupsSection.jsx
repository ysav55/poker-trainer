/**
 * GroupsSection.jsx
 *
 * Display assigned groups with color coding, add picker, and remove button.
 */

import React, { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
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
  const [addLoading, setAddLoading] = useState(false)
  const [removingGroupId, setRemovingGroupId] = useState(null)
  const [error, setError] = useState(null)

  // Only fetch available groups when picker opens (false → true transition)
  useEffect(() => {
    if (!showPicker) return

    async function fetchAvailable() {
      try {
        const res = await apiFetch('/api/admin/groups/my-school')
        const allGroups = res.groups ?? []
        const assignedIds = new Set((groups ?? []).map((g) => g.id))
        setAvailableGroups(allGroups.filter((g) => !assignedIds.has(g.id)))
      } catch (err) {
        console.error('GroupsSection: failed to fetch available groups', err)
        setError('Failed to load available groups.')
      }
    }
    fetchAvailable()
  }, [showPicker, groups])

  async function handleAdd(groupId) {
    if (!groupId) return
    setAddLoading(true)
    setError(null)
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      })
      setShowPicker(false)
      onGroupsChange?.()
    } catch (err) {
      console.error('GroupsSection: failed to add member', err)
      setError('Failed to add player to group.')
    } finally {
      setAddLoading(false)
    }
  }

  async function handleRemove(groupId) {
    setRemovingGroupId(groupId)
    setError(null)
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members/${playerId}`, {
        method: 'DELETE',
      })
      onGroupsChange?.()
    } catch (err) {
      console.error('GroupsSection: failed to remove member', err)
      setError('Failed to remove player from group.')
    } finally {
      setRemovingGroupId(null)
    }
  }

  const isBusy = addLoading || removingGroupId !== null

  return (
    <CollapsibleSection
      title="GROUPS"
      storageKey={`groups-${playerId}`}
      defaultOpen={true}
      headerExtra={
        <button
          onClick={() => setShowPicker((v) => !v)}
          disabled={isBusy}
          className="text-xs px-2 py-1 rounded hover:opacity-80"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
            color: colors.gold,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            opacity: isBusy ? 0.5 : 1,
          }}
        >
          <Plus size={12} className="inline mr-1" />
          Add
        </button>
      }
    >
      <div className="space-y-2">
        {/* Error banner */}
        {error && (
          <p className="text-xs px-2 py-1 rounded" style={{ color: colors.error, background: `${colors.error}18` }}>
            {error}
          </p>
        )}

        {showPicker && (
          <div className="mb-2">
            {availableGroups.length === 0 ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs" style={{ color: colors.textMuted }}>
                  No groups available to add
                </p>
                <button
                  onClick={() => setShowPicker(false)}
                  className="hover:opacity-80"
                  style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer' }}
                  title="Close"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <select
                autoFocus
                defaultValue=""
                disabled={addLoading}
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
          groups.map((group) => {
            const isRemoving = removingGroupId === group.id
            return (
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
                  disabled={isRemoving}
                  className="text-xs hover:opacity-80"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: colors.error,
                    cursor: isRemoving ? 'not-allowed' : 'pointer',
                    opacity: isRemoving ? 0.5 : 1,
                  }}
                  title="Remove from group"
                >
                  {isRemoving ? '…' : '✕'}
                </button>
              </div>
            )
          })
        )}
      </div>
    </CollapsibleSection>
  )
}
