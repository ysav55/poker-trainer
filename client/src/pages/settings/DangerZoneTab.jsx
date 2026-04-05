import React, { useState } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { GOLD, SectionHeader, Field, Input, Card } from './shared.jsx';

// ─── DangerZoneTab ───────────────────────────────────────────────────────────

export default function DangerZoneTab() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  // Password verification state
  const [password,   setPassword]   = useState('');
  const [unlocked,   setUnlocked]   = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [verifyErr,  setVerifyErr]  = useState(null);

  // Action state
  const [busy,       setBusy]       = useState(false);
  const [actionErr,  setActionErr]  = useState(null);
  const [done,       setDone]       = useState(null); // message after success

  async function handleUnlock() {
    if (!password) return;
    setVerifying(true);
    setVerifyErr(null);
    try {
      await apiFetch('/api/auth/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setUnlocked(true);
    } catch {
      setVerifyErr('Password is incorrect.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResetDefaults() {
    if (!unlocked) return;
    setBusy(true);
    setActionErr(null);
    try {
      await apiFetch('/api/settings/table-defaults', { method: 'DELETE' });
      setDone('Table defaults have been reset to platform defaults.');
    } catch {
      setActionErr('Failed to reset table defaults. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!unlocked) return;
    setBusy(true);
    setActionErr(null);
    try {
      await apiFetch('/api/auth/deactivate', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setDone('Your account has been deactivated. You will be logged out shortly.');
      // Give the user a moment to read the message, then clear local state
      setTimeout(() => {
        localStorage.removeItem('poker_trainer_jwt');
        window.location.href = '/login';
      }, 3000);
    } catch {
      setActionErr('Failed to deactivate account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <p className="text-sm font-semibold" style={{ color: '#238636' }}>{done}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Danger Zone" />
      <p className="text-sm mb-1" style={{ color: '#6e7681' }}>
        These actions are irreversible. Enter your password to unlock them.
      </p>

      {/* Password unlock */}
      {!unlocked && (
        <Card>
          <Field label="Your password">
            <Input
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Enter your password to unlock"
            />
          </Field>
          {verifyErr && (
            <p className="text-xs mb-2" style={{ color: '#ef4444' }}>{verifyErr}</p>
          )}
          <button
            onClick={handleUnlock}
            disabled={verifying || !password}
            className="px-5 py-2 rounded text-sm font-bold"
            style={{ background: '#6e7681', color: '#0d1117', opacity: (verifying || !password) ? 0.6 : 1 }}
          >
            {verifying ? 'Verifying…' : 'Unlock'}
          </button>
        </Card>
      )}

      {/* Actions — only shown when unlocked */}
      {unlocked && (
        <>
          {actionErr && (
            <p className="text-sm" style={{ color: '#ef4444' }}>{actionErr}</p>
          )}

          {/* Reset table defaults — coach/admin/superadmin only */}
          {['coach', 'admin', 'superadmin'].includes(role) && (
            <Card>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: '#e5e7eb' }}>Reset Table Defaults</p>
                  <p className="text-xs" style={{ color: '#6e7681' }}>
                    Removes all your saved table defaults. Table settings will revert to the platform defaults.
                  </p>
                </div>
                <button
                  onClick={handleResetDefaults}
                  disabled={busy}
                  className="px-4 py-1.5 rounded text-sm font-bold whitespace-nowrap"
                  style={{ background: '#b45309', color: '#fff', opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? 'Resetting…' : 'Reset'}
                </button>
              </div>
            </Card>
          )}

          {/* Deactivate account */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: '#ef4444' }}>Deactivate Account</p>
                <p className="text-xs" style={{ color: '#6e7681' }}>
                  Permanently deactivates your account. You will be logged out and will no longer be able to sign in.
                  This cannot be undone without contacting an admin.
                </p>
              </div>
              <button
                onClick={handleDeactivate}
                disabled={busy}
                className="px-4 py-1.5 rounded text-sm font-bold whitespace-nowrap"
                style={{ background: '#da3633', color: '#fff', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
