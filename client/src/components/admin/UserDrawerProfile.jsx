import React, { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import { useToast } from '../../contexts/ToastContext';

function Initials({ name }) {
  const letters = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="flex items-center justify-center rounded-full text-lg font-bold"
      style={{
        width: 56, height: 56,
        background: colors.goldTint,
        border: `2px solid ${colors.gold}`,
        color: colors.gold,
      }}
    >
      {letters}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function InfoRow({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5 mb-3">
      <span className="text-xs font-semibold tracking-wider" style={{ color: colors.textMuted }}>{label}</span>
      <div className="text-sm" style={{ color: colors.textPrimary }}>{children}</div>
    </div>
  );
}

export default function UserDrawerProfile({ user, onUserUpdated }) {
  const { addToast } = useToast();
  const [editName, setEditName] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [name, setName] = useState(user.display_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [saving, setSaving] = useState(false);

  const saveField = async (field, value) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: value }),
      });
      onUserUpdated?.();
    } catch (err) { addToast(err.message || 'Failed to save', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <Initials name={user.display_name} />
        <div>
          {editName ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="rounded px-2 py-1 text-sm"
                style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') { saveField('displayName', name); setEditName(false); }
                  if (e.key === 'Escape') { setName(user.display_name || ''); setEditName(false); }
                }}
              />
              <button
                onClick={() => { saveField('displayName', name); setEditName(false); }}
                disabled={saving}
                className="text-xs px-2 py-1 rounded"
                style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer' }}
              >Save</button>
            </div>
          ) : (
            <span
              className="text-base font-bold cursor-pointer"
              style={{ color: colors.textPrimary }}
              onClick={() => setEditName(true)}
              title="Click to edit"
            >
              {user.display_name || '—'}
            </span>
          )}
        </div>
      </div>

      <InfoRow label="EMAIL">
        {editEmail ? (
          <div className="flex items-center gap-2">
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="rounded px-2 py-1 text-sm"
              style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderDefault}`, color: colors.textPrimary }}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') { saveField('email', email); setEditEmail(false); }
                if (e.key === 'Escape') { setEmail(user.email || ''); setEditEmail(false); }
              }}
            />
            <button
              onClick={() => { saveField('email', email); setEditEmail(false); }}
              disabled={saving}
              className="text-xs px-2 py-1 rounded"
              style={{ background: colors.gold, color: '#0d1117', border: 'none', cursor: 'pointer' }}
            >Save</button>
          </div>
        ) : (
          <span className="cursor-pointer" onClick={() => setEditEmail(true)} title="Click to edit">
            {user.email || '—'}
          </span>
        )}
      </InfoRow>

      <InfoRow label="JOINED">{formatDate(user.created_at)}</InfoRow>
      {user.created_by_name && <InfoRow label="CREATED BY">{user.created_by_name}</InfoRow>}
    </div>
  );
}
