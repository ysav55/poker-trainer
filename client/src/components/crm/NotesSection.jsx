/**
 * NotesSection.jsx
 *
 * Timeline of coach notes with type badges, share toggles, and inline add form.
 */

import React, { useState } from 'react'
import { Eye, EyeOff, Plus, Loader2 } from 'lucide-react'
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

export default function NotesSection({ notes, playerId, onNotesUpdated }) {
  const [showForm, setShowForm] = useState(false)
  const [formContent, setFormContent] = useState('')
  const [formType, setFormType] = useState('general')
  const [formShared, setFormShared] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toggleLoading, setToggleLoading] = useState({})

  const handleAddNote = async () => {
    if (!formContent.trim()) {
      setError('Content is required')
      return
    }
    try {
      setSaving(true)
      setError(null)
      await apiFetch(`/api/admin/players/${playerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: formContent.trim(), noteType: formType, sharedWithStudent: formShared }),
      })
      setFormContent('')
      setFormType('general')
      setFormShared(false)
      setShowForm(false)
      if (onNotesUpdated) onNotesUpdated()
    } catch (err) {
      setError(err.message || 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleShare = async (noteId, currentValue) => {
    try {
      setToggleLoading({ ...toggleLoading, [noteId]: true })
      await apiFetch(`/api/admin/players/${playerId}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sharedWithStudent: !currentValue }),
      })
      if (onNotesUpdated) onNotesUpdated()
    } catch (err) {
      setError(err.message || 'Failed to update note')
    } finally {
      setToggleLoading({ ...toggleLoading, [noteId]: false })
    }
  }

  return (
    <CollapsibleSection
      title="NOTES"
      storageKey={`notes-${playerId}`}
      defaultOpen={true}
      headerExtra={
        !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs hover:opacity-80"
            style={{ color: colors.gold, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <Plus size={14} style={{ display: 'inline', marginRight: 2 }} />
            Add
          </button>
        )
      }
    >
      {error && (
        <div style={{ padding: 8, background: colors.errorTint, borderRadius: 4, marginBottom: 12, color: colors.error, fontSize: 12 }}>
          {error}
        </div>
      )}

      {showForm && (
        <div style={{ marginBottom: 12, padding: 12, background: colors.bgSurfaceRaised, borderRadius: 4, border: `1px solid ${colors.borderDefault}` }}>
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="Write a note..."
            style={{
              width: '100%',
              minHeight: 60,
              padding: 8,
              background: colors.bgPrimary,
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textPrimary,
              borderRadius: 4,
              fontSize: 12,
              fontFamily: 'inherit',
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              style={{
                flex: 1,
                padding: '6px 8px',
                background: colors.bgPrimary,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textPrimary,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <option value="general">General</option>
              <option value="session_review">Session Review</option>
              <option value="goal">Goal</option>
              <option value="weakness">Weakness</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              id="share-checkbox"
              checked={formShared}
              onChange={(e) => setFormShared(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="share-checkbox" style={{ fontSize: 12, color: colors.textSecondary, cursor: 'pointer' }}>
              Share with student
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAddNote}
              disabled={saving}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: colors.gold,
                color: colors.bgPrimary,
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              disabled={saving}
              style={{
                padding: '6px 12px',
                background: colors.bgSurfaceRaised,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textPrimary,
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 12,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {!notes || notes.length === 0 ? (
          <p className="text-xs" style={{ color: colors.textMuted }}>No notes yet</p>
        ) : (
          notes.slice(0, 5).map((note) => {
            const typeConfig = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general
            const isToggling = toggleLoading[note.id]
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
                  <button
                    onClick={() => handleToggleShare(note.id, note.shared_with_student)}
                    disabled={isToggling}
                    title={note.shared_with_student ? 'Hide from student' : 'Share with student'}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: isToggling ? 'default' : 'pointer',
                      padding: 0,
                      opacity: isToggling ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {isToggling ? (
                      <Loader2 size={14} style={{ color: colors.gold, animation: 'spin 1s linear infinite' }} />
                    ) : note.shared_with_student ? (
                      <Eye size={14} style={{ color: colors.gold }} />
                    ) : (
                      <EyeOff size={14} style={{ color: colors.textMuted }} />
                    )}
                  </button>
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

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </CollapsibleSection>
  )
}
