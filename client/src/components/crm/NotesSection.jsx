/**
 * NotesSection.jsx
 *
 * Timeline of coach notes with type badges and share toggle.
 */

import React from 'react'
import { Eye, EyeOff } from 'lucide-react'
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

export default function NotesSection({ notes, playerId }) {
  return (
    <CollapsibleSection
      title="NOTES"
      storageKey={`notes-${playerId}`}
      defaultOpen={true}
    >
      <div className="space-y-3">
        {!notes || notes.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No notes yet</p>
        ) : (
          notes.slice(0, 5).map((note) => {
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
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="flex gap-2 items-center">
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
                  {note.shared_with_student && (
                    <Eye size={14} style={{ color: colors.gold }} title="Shared with student" />
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                  {note.content}
                </p>
                {note.coach_name && (
                  <p className="text-xs mt-2" style={{ color: colors.textMuted }}>
                    — {note.coach_name}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </CollapsibleSection>
  )
}
