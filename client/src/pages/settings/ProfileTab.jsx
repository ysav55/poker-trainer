import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { GOLD, SectionHeader, Field, Input, SaveButton, Card } from './shared.jsx';

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

export default function ProfileTab({ onSwitchTab }) {
  const { user } = useAuth();

  // Loaded profile snapshot (to detect changes)
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);

  // Controlled form fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');

  // Feedback
  const [saving, setSaving]         = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Password section
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwSaving, setPwSaving]     = useState(false);
  const [pwMsg, setPwMsg]           = useState('');

  // Load profile on mount
  useEffect(() => {
    apiFetch('/api/auth/profile')
      .then(data => {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
        setEmail(data.email ?? '');
      })
      .catch(() => setProfileMsg('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const initials = (displayName || 'U')
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const roles = user?.role ? [user.role] : [];

  async function handleSaveProfile() {
    const patch = {};
    if (displayName.trim() !== (profile?.display_name ?? '')) patch.display_name = displayName.trim();
    const emailNorm = email.trim().toLowerCase();
    if (emailNorm !== (profile?.email ?? '')) patch.email = emailNorm;

    if (Object.keys(patch).length === 0) { setProfileMsg('No changes.'); return; }

    setSaving(true); setProfileMsg('');
    try {
      const updated = await apiFetch('/api/auth/profile', {
        method: 'PUT',
        body:   JSON.stringify(patch),
      });
      setProfile(prev => ({ ...prev, ...updated }));
      setProfileMsg('Saved.');
    } catch (err) {
      setProfileMsg(err.message || 'Save failed.');
    } finally { setSaving(false); }
  }

  async function handleUpdatePassword() {
    if (!currentPw)          { setPwMsg('Enter your current password.'); return; }
    if (newPw.length < 8)    { setPwMsg('New password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwMsg('Passwords do not match.'); return; }

    setPwSaving(true); setPwMsg('');
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body:   JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setShowPwForm(false);
      setPwMsg('Password updated.');
    } catch (err) {
      setPwMsg(err.message || 'Password update failed.');
    } finally { setPwSaving(false); }
  }

  const isCoach   = ['coach', 'admin', 'superadmin'].includes(user?.role);
  const isStudent = ['coached_student', 'solo_student', 'trial'].includes(user?.role);

  if (loading) return <Card><p className="text-sm" style={{ color: '#6e7681' }}>Loading…</p></Card>;

  return (
    <Card>
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: `2px solid ${GOLD}` }}
          data-testid="profile-avatar"
        >
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#f0ece3' }}>{displayName || 'Your Name'}</p>
          <button className="text-xs mt-1 opacity-40 cursor-not-allowed" style={{ color: GOLD }} disabled>
            Upload Photo
          </button>
        </div>
      </div>

      <SectionHeader title="Account" />
      <Field label="Display name">
        <Input value={displayName} onChange={setDisplayName} placeholder="Your name" data-testid="profile-name" />
      </Field>
      <Field label="Email">
        <Input value={email} onChange={setEmail} type="email" placeholder="you@example.com" data-testid="profile-email" />
      </Field>
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="px-5 py-2 rounded text-sm font-bold"
          style={{ background: GOLD, color: '#0d1117', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {profileMsg && (
          <span className="text-xs" style={{ color: profileMsg === 'Saved.' || profileMsg === 'No changes.' ? '#3fb950' : '#f85149' }}>
            {profileMsg}
          </span>
        )}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      <SectionHeader title="Change Password" />
      <div className="flex flex-col gap-2">
        <Input value={currentPw} onChange={setCurrentPw} type="password" placeholder="Current password" />
        <Input value={newPw}     onChange={setNewPw}     type="password" placeholder="New password (min 8 chars)" />
        <Input value={confirmPw} onChange={setConfirmPw} type="password" placeholder="Confirm new password" />
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={handleUpdatePassword}
          disabled={pwSaving}
          className="px-5 py-2 rounded text-sm font-bold"
          style={{ background: GOLD, color: '#0d1117', opacity: pwSaving ? 0.6 : 1 }}
          data-testid="update-password-btn"
        >
          {pwSaving ? 'Updating…' : 'Update Password'}
        </button>
        {pwMsg && (
          <span className="text-xs" style={{ color: pwMsg === 'Password updated.' ? '#3fb950' : '#f85149' }}>
            {pwMsg}
          </span>
        )}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      <SectionHeader title="Roles" />
      <div className="flex flex-wrap gap-2 mb-1">
        {roles.map(r => (
          <span
            key={r}
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(212,175,55,0.12)', color: GOLD, border: `1px solid rgba(212,175,55,0.3)` }}
          >
            {r}
          </span>
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: '#6e7681' }}>Read-only — assigned by admin.</p>

      {/* Student-only: school info */}
      {isStudent && profile?.school_id && (
        <>
          <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />
          <SectionHeader title="School" />
          <p className="text-sm" style={{ color: '#6e7681' }}>
            You are enrolled in a school. Contact your coach to make changes.
          </p>
        </>
      )}

      {/* Coach-only: school summary */}
      {isCoach && (
        <>
          <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />
          <SectionHeader title="School Info" />
          <p className="text-sm mb-2" style={{ color: '#6e7681' }}>
            Manage your school identity, groups, and staking defaults in the School tab.
          </p>
          {onSwitchTab && (
            <button
              className="text-sm font-semibold"
              style={{ color: GOLD }}
              onClick={() => onSwitchTab('school')}
            >
              Manage School →
            </button>
          )}
        </>
      )}
    </Card>
  );
}
