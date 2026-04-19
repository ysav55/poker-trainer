import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];

export default function UserDrawerRoleSchool({ user, schools, onUserUpdated }) {
  const [role, setRole] = useState(user.role || '');
  const [schoolId, setSchoolId] = useState(user.school_id || '');
  const [coachId, setCoachId] = useState(user.coach_id || '');
  const [coaches, setCoaches] = useState([]);
  const [saving, setSaving] = useState(false);

  const isIncoming = !user.school_id;

  useEffect(() => {
    if (role !== 'coached_student') { setCoaches([]); return; }
    apiFetch('/api/admin/users?role=coach')
      .then(data => {
        const list = Array.isArray(data) ? data : (data.users ?? data.players ?? []);
        setCoaches(list);
      })
      .catch(() => setCoaches([]));
  }, [role]);

  const saveRole = async (newRole) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      setRole(newRole);
      onUserUpdated?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const saveSchool = async (newSchoolId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ schoolId: newSchoolId || null }),
      });
      setSchoolId(newSchoolId);
      onUserUpdated?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const saveCoach = async (newCoachId) => {
    setSaving(true);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ coachId: newCoachId || null }),
      });
      setCoachId(newCoachId);
      onUserUpdated?.();
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  const selectStyle = {
    background: colors.bgSurfaceRaised,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textPrimary,
    padding: '6px 10px',
    borderRadius: 4,
    fontSize: 13,
    width: '100%',
    cursor: 'pointer',
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
    <div className="flex flex-col gap-4">
      <div>
        <span style={labelStyle}>Role</span>
        <select value={role} onChange={e => saveRole(e.target.value)} disabled={saving} style={selectStyle}>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div>
        <span style={labelStyle}>School</span>
        <div style={isIncoming ? {
          padding: 2, borderRadius: 6,
          border: `2px solid ${colors.gold}`,
          background: colors.goldSubtle,
        } : {}}>
          <select value={schoolId} onChange={e => saveSchool(e.target.value)} disabled={saving} style={selectStyle}>
            <option value="">— Unassigned —</option>
            {(schools || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {isIncoming && (
          <span className="text-xs mt-1 block" style={{ color: colors.gold }}>
            This user needs a school assignment
          </span>
        )}
      </div>

      {role === 'coached_student' && (
        <div>
          <span style={labelStyle}>Coach</span>
          <select value={coachId} onChange={e => saveCoach(e.target.value)} disabled={saving} style={selectStyle}>
            <option value="">— No coach —</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
