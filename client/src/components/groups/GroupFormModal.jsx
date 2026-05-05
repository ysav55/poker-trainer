/**
 * GroupFormModal.jsx
 *
 * Modal for creating or editing a group.
 * Inputs: name (text), color (from groupColors array)
 * On save: calls onSave(data), which handles POST or PATCH.
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { colors, groupColors } from '../../lib/colors';

export default function GroupFormModal({ group, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#58a6ff');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setColor(group.color || '#58a6ff');
    } else {
      setName('');
      setColor('#58a6ff');
    }
    setError(null);
  }, [group]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await onSave({ name: name.trim(), color });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: colors.bgSurface,
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 8,
          width: 400,
          maxWidth: '90vw',
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 600, margin: 0 }}>
            {group ? 'Edit Group' : 'New Group'}
          </h2>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              color: colors.textMuted,
              cursor: 'pointer',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 8,
              background: colors.errorTint,
              border: `1px solid ${colors.errorBorder}`,
              borderRadius: 4,
              color: colors.error,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: colors.textMuted, fontSize: 12, marginBottom: 6 }}>
            Group Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Advanced Players"
            style={{
              width: '100%',
              padding: '8px 10px',
              background: colors.bgSurfaceRaised,
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textPrimary,
              borderRadius: 4,
              fontSize: 13,
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
            Color
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {groupColors.map((colorOption) => (
              <button
                key={colorOption}
                onClick={() => setColor(colorOption)}
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  borderRadius: '50%',
                  background: colorOption,
                  border: color === colorOption ? `3px solid ${colors.gold}` : `1px solid ${colors.borderDefault}`,
                  cursor: 'pointer',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            disabled={saving}
            style={{
              padding: '8px 16px',
              background: colors.bgSurfaceRaised,
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textPrimary,
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSurfaceHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = colors.bgSurfaceRaised)}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '8px 16px',
              background: colors.gold,
              border: 'none',
              color: '#000',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = colors.goldHover;
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = colors.gold;
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
