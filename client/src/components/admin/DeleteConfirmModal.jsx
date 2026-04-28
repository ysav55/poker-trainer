import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';

export default function DeleteConfirmModal({ user, onClose, onConfirmed }) {
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const required = user.display_name;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleDelete() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err.message || 'Delete failed');
    } finally {
      setSaving(false);
    }
  }

  const canDelete = typed === required;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.errorBorder}` }}
        >
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: colors.error }}>
            DELETE ACCOUNT
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.textMuted, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            This permanently deletes <strong style={{ color: colors.textPrimary }}>{user.display_name}</strong>'s account and all associated data. This cannot be undone.
          </p>
          <div>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 6 }}>
              Type <strong style={{ color: colors.textPrimary }}>{required}</strong> to confirm:
            </label>
            <input
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder={required}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
              onFocus={e => { e.currentTarget.style.borderColor = colors.error; }}
              onBlur={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
            />
          </div>
          {error && (
            <div
              className="rounded px-3 py-2 text-sm"
              style={{ background: colors.errorTint, border: `1px solid ${colors.errorBorder}`, color: colors.error }}
            >
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: `1px solid ${colors.borderStrong}`, color: colors.textSecondary, cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={saving || !canDelete}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: !canDelete ? colors.errorTint : colors.error,
                border: '1px solid transparent',
                color: !canDelete ? colors.textMuted : colors.white,
                cursor: (saving || !canDelete) ? 'not-allowed' : 'pointer',
                opacity: !canDelete ? 0.5 : 1,
              }}
            >
              {saving ? 'DELETING…' : 'DELETE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
