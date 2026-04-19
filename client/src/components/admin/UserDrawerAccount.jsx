import React, { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import { useToast } from '../../contexts/ToastContext';

export default function UserDrawerAccount({ user, onUserUpdated, onClose }) {
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [suspending, setSuspending] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTyped, setArchiveTyped] = useState('');
  const [archiving, setArchiving] = useState(false);

  const isSuspended = user.status === 'suspended';

  const handleResetPassword = async () => {
    if (!password.trim()) return;
    setResetError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setResetSuccess(true);
    } catch (err) {
      setResetError(err.message || 'Failed to reset password');
    }
  };

  const handleSuspendToggle = async () => {
    setSuspending(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: isSuspended ? 'active' : 'suspended' }),
      });
      onUserUpdated?.();
    } catch (err) { addToast(err.message || 'Failed to update status', 'error'); }
    finally { setSuspending(false); }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      onUserUpdated?.();
      onClose?.();
    } catch (err) { addToast(err.message || 'Failed to archive user', 'error'); }
    finally { setArchiving(false); }
  };

  const inputStyle = {
    background: colors.bgSurfaceRaised,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
  };

  const labelStyle = {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Reset Password */}
      <div>
        <span style={labelStyle}>Reset Password</span>
        {resetSuccess ? (
          <span className="text-xs" style={{ color: colors.success }}>Password updated successfully</span>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="New password"
              style={inputStyle}
              onKeyDown={e => { if (e.key === 'Enter') handleResetPassword(); }}
            />
            <button
              onClick={handleResetPassword}
              disabled={!password.trim()}
              className="text-xs px-3 py-1.5 rounded font-semibold"
              style={{
                background: colors.gold,
                color: '#0d1117',
                border: 'none',
                cursor: password.trim() ? 'pointer' : 'not-allowed',
                opacity: password.trim() ? 1 : 0.5,
              }}
            >Set</button>
          </div>
        )}
        {resetError && <span className="text-xs mt-1 block" style={{ color: colors.error }}>{resetError}</span>}
      </div>

      {/* Suspend / Unsuspend */}
      <div>
        <span style={labelStyle}>{isSuspended ? 'Unsuspend User' : 'Suspend User'}</span>
        <button
          onClick={handleSuspendToggle}
          disabled={suspending}
          className="text-xs px-4 py-2 rounded font-semibold"
          style={{
            background: isSuspended ? colors.successTint : colors.warningTint,
            border: `1px solid ${isSuspended ? colors.successBorder : colors.warningBorder}`,
            color: isSuspended ? colors.success : colors.warning,
            cursor: 'pointer',
          }}
        >
          {suspending ? '…' : isSuspended ? 'Reactivate' : 'Suspend'}
        </button>
      </div>

      {/* Archive */}
      <div>
        <span style={labelStyle}>Archive User</span>
        {!showArchive ? (
          <button
            onClick={() => setShowArchive(true)}
            className="text-xs px-4 py-2 rounded font-semibold"
            style={{
              background: colors.errorTint,
              border: `1px solid ${colors.errorBorder}`,
              color: colors.error,
              cursor: 'pointer',
            }}
          >Archive this user…</button>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-xs" style={{ color: colors.error }}>
              Type <strong>{user.display_name}</strong> to confirm
            </span>
            <input
              value={archiveTyped}
              onChange={e => setArchiveTyped(e.target.value)}
              placeholder={user.display_name}
              style={inputStyle}
            />
            <div className="flex gap-2">
              <button
                onClick={handleArchive}
                disabled={archiveTyped !== user.display_name || archiving}
                className="text-xs px-3 py-1.5 rounded font-semibold"
                style={{
                  background: archiveTyped === user.display_name ? colors.error : colors.errorTint,
                  color: '#fff',
                  border: 'none',
                  cursor: archiveTyped === user.display_name ? 'pointer' : 'not-allowed',
                }}
              >
                {archiving ? 'Archiving…' : 'Confirm Archive'}
              </button>
              <button
                onClick={() => { setShowArchive(false); setArchiveTyped(''); }}
                className="text-xs px-3 py-1.5 rounded"
                style={{ background: 'transparent', border: `1px solid ${colors.borderDefault}`, color: colors.textMuted, cursor: 'pointer' }}
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
