/**
 * CoachNotesSection.jsx
 *
 * Displays shared coach notes for students on the dashboard.
 * Read-only, shows only shared notes, no coach identity.
 */

import React, { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { colors } from '../../lib/colors'
import CollapsibleSection from '../CollapsibleSection'

const NOTE_TYPE_CONFIG = {
  general: { color: colors.info, label: 'General' },
  session_review: { color: colors.gold, label: 'Session Review' },
  goal: { color: colors.success, label: 'Goal' },
  weakness: { color: colors.error, label: 'Weakness' },
}

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export default function CoachNotesSection() {
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadNotes = async () => {
      try {
        setLoading(true)
        const data = await apiFetch('/api/me/notes?limit=5')
        setNotes(data?.notes ?? [])
      } catch (err) {
        console.error('Failed to load shared notes:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadNotes()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: colors.textMuted, fontSize: 12 }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
        Loading notes…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ color: colors.error, fontSize: 12 }}>
        Error loading notes
      </div>
    )
  }

  return (
    <CollapsibleSection
      title="NOTES FROM COACH"
      storageKey="coach-notes"
      defaultOpen={true}
    >
      <div className="space-y-3">
        {notes.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No shared notes yet</p>
        ) : (
          notes.map((note) => {
            const typeConfig = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general
            return (
              <div
                key={note.id}
                className="p-3 rounded border"
                style={{
                  background: colors.bgSurface,
                  borderColor: colors.borderDefault,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2 py-0.5 rounded text-xs font-semibold"
                    style={{
                      background: typeConfig.color,
                      color: colors.bgPrimary,
                    }}
                  >
                    {typeConfig.label}
                  </span>
                  <span className="text-xs" style={{ color: colors.textMuted }}>
                    {formatDate(note.created_at)}
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                  {note.content}
                </p>
              </div>
            )
          })
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </CollapsibleSection>
  )
}
