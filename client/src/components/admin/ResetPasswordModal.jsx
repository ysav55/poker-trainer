import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';

export default function ResetPasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.borderStrong}` }}
        >
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: colors.gold }}>
            RESET PASSWORD
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.textMuted, width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = colors.textPrimary; }}
            onMouseLeave={e => { e.currentTarget.style.color = colors.textMuted; }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {done ? (
            <>
              <div
                className="rounded px-3 py-2.5 text-sm mb-4"
                style={{ background: colors.successTint, border: `1px solid ${colors.successBorder}`, color: colors.success }}
              >
                Password updated for <strong>{user.display_name}</strong>.
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{ background: colors.gold, border: '1px solid transparent', color: colors.bgSurface, cursor: 'pointer' }}
                >
                  DONE
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="text-sm" style={{ color: colors.textSecondary }}>
                Set a new password for <strong style={{ color: colors.textPrimary }}>{user.display_name}</strong>.
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
                onFocus={e => { e.currentTarget.style.borderColor = colors.gold; }}
                onBlur={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
              />
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
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: 'none', border: `1px solid ${colors.borderStrong}`, color: colors.textSecondary, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newPassword}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: saving ? colors.goldTint : colors.gold,
                    border: '1px solid transparent',
                    color: saving ? colors.textMuted : colors.bgSurface,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: !newPassword ? 0.4 : 1,
                  }}
                >
                  {saving ? 'SAVING…' : 'RESET'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
