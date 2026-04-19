import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';

function timeAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STALE_DAYS = 7;

function isStale(iso) {
  if (!iso) return false;
  return (Date.now() - new Date(iso).getTime()) > STALE_DAYS * 86400000;
}

export default function IncomingZone({ users, schools, onSelectUser, onUsersUpdated }) {
  const [bulkSchoolId, setBulkSchoolId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const incoming = users.filter(u => !u.school_id);

  const handleBulkAssign = async () => {
    if (!bulkSchoolId || incoming.length === 0) return;
    setAssigning(true);
    try {
      await apiFetch('/api/admin/users/bulk-assign-school', {
        method: 'POST',
        body: JSON.stringify({
          userIds: incoming.map(u => u.id),
          schoolId: bulkSchoolId,
        }),
      });
      setBulkSchoolId('');
      onUsersUpdated?.();
    } catch { /* silent */ }
    finally { setAssigning(false); }
  };

  if (incoming.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: `1px solid ${colors.borderDefault}`, color: '#3fb950', fontSize: 11 }}
      >
        <Check size={12} />
        <span>No pending users</span>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: `2px solid ${colors.gold}`, padding: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ color: colors.gold, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
          Incoming
        </span>
        <span style={{
          background: colors.gold, color: '#0d1117',
          fontSize: 10, fontWeight: 800,
          padding: '2px 7px', borderRadius: 10,
        }}>
          {incoming.length}
        </span>
      </div>

      <div className="flex flex-col gap-1.5" style={{ maxHeight: 240, overflowY: 'auto' }}>
        {incoming.map(u => (
          <div
            key={u.id}
            onClick={() => onSelectUser(u.id)}
            className="cursor-pointer rounded-md px-2 py-2 transition-colors"
            style={{
              background: 'rgba(212,175,55,0.06)',
              border: `1px solid ${isStale(u.created_at) ? 'rgba(248,81,73,0.35)' : 'rgba(212,175,55,0.2)'}`,
            }}
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold" style={{ color: colors.textPrimary }}>
                {u.display_name || u.id.slice(0, 8)}
              </span>
              <span style={{ color: colors.textMuted, fontSize: 9 }}>{timeAgo(u.created_at)}</span>
            </div>
            <div style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
              {u.role || 'solo_student'} · no school
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 mt-2">
        <select
          value={bulkSchoolId}
          onChange={e => setBulkSchoolId(e.target.value)}
          className="flex-1 text-xs rounded px-1 py-1"
          style={{
            background: colors.bgSurface,
            border: `1px solid ${colors.borderDefault}`,
            color: colors.textMuted,
            fontSize: 10,
          }}
        >
          <option value="">Assign all to…</option>
          {(schools || []).map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <button
          onClick={handleBulkAssign}
          disabled={!bulkSchoolId || assigning}
          className="text-xs px-2 py-1 rounded"
          style={{
            background: bulkSchoolId ? colors.gold : 'transparent',
            color: bulkSchoolId ? '#0d1117' : colors.textMuted,
            border: bulkSchoolId ? 'none' : `1px solid ${colors.borderDefault}`,
            cursor: bulkSchoolId ? 'pointer' : 'not-allowed',
            fontSize: 10,
            fontWeight: 600,
          }}
        >Go</button>
      </div>
    </div>
  );
}
