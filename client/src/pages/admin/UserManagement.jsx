import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../lib/api';
import UserForm from './UserForm';
import UserDetail from './UserDetail';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;
const ROLES     = ['', 'superadmin', 'admin', 'coach', 'moderator', 'referee', 'player', 'trial'];
const STATUSES  = ['active', 'suspended', 'archived'];

const STATUS_COLORS = {
  active:    { bg: 'rgba(63,185,80,0.12)',   border: 'rgba(63,185,80,0.35)',   text: '#3fb950' },
  suspended: { bg: 'rgba(227,179,65,0.12)',  border: 'rgba(227,179,65,0.35)', text: '#e3b341' },
  archived:  { bg: 'rgba(110,118,129,0.12)', border: 'rgba(110,118,129,0.35)', text: '#6e7681' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || STATUS_COLORS.archived;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wider whitespace-nowrap"
      style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
    >
      {status ? status.toUpperCase() : '—'}
    </span>
  );
}

function RolePill({ role }) {
  if (!role) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff' }}
    >
      {role}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// ─── Actions Dropdown ─────────────────────────────────────────────────────────

function ActionsMenu({ user, currentUserRole, onViewProfile, onEdit, onResetPassword, onSuspend, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isSuspended = user.status === 'suspended';
  const isSuperAdmin = currentUserRole === 'superadmin';

  const Item = ({ onClick, children, danger = false }) => (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); setOpen(false); }}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: 'none', border: 'none',
        color: danger ? '#f85149' : '#c9d1d9',
        transition: 'background 0.08s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(248,81,73,0.08)' : 'rgba(255,255,255,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 28, height: 28, borderRadius: 4, border: '1px solid #30363d',
          background: open ? 'rgba(212,175,55,0.08)' : 'none',
          color: open ? '#d4af37' : '#6e7681', cursor: 'pointer',
          fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          letterSpacing: 2, lineHeight: 0, transition: 'all 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = '#30363d';
            e.currentTarget.style.color = '#6e7681';
          }
        }}
        title="Actions"
        aria-label="User actions"
      >
        ⋯
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 32, zIndex: 100,
            background: '#161b22', border: '1px solid #30363d',
            borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 180, overflow: 'hidden',
          }}
        >
          <Item onClick={onViewProfile}>View Profile</Item>
          <Item onClick={onEdit}>Edit User</Item>
          <Item onClick={onResetPassword}>Reset Password</Item>
          <div style={{ height: 1, background: '#21262d', margin: '3px 0' }} />
          <Item onClick={() => onSuspend(!isSuspended)} danger={!isSuspended}>
            {isSuspended ? 'Unsuspend' : 'Suspend'}
          </Item>
          {isSuperAdmin && (
            <Item onClick={() => alert('Login as user — audit log required (not yet implemented)')}>
              Login as User ★
            </Item>
          )}
          <div style={{ height: 1, background: '#21262d', margin: '3px 0' }} />
          <Item onClick={onDelete} danger>Delete Account</Item>
        </div>
      )}
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────

function ResetPasswordModal({ user, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);
  const [done, setDone]               = useState(false);

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
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363d' }}>
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#d4af37' }}>RESET PASSWORD</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', width: 28, height: 28 }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6e7681'; }}>✕</button>
        </div>
        <div className="px-5 py-4">
          {done ? (
            <>
              <div className="rounded px-3 py-2.5 text-sm mb-4"
                style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}>
                Password updated for <strong>{user.display_name}</strong>.
              </div>
              <div className="flex justify-end">
                <button onClick={onClose} className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{ background: '#d4af37', border: '1px solid transparent', color: '#0d1117', cursor: 'pointer' }}>
                  DONE
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="text-sm" style={{ color: '#8b949e' }}>
                Set a new password for <strong style={{ color: '#f0ece3' }}>{user.display_name}</strong>.
              </div>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="New password" required
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
              />
              {error && (
                <div className="rounded px-3 py-2 text-sm"
                  style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={onClose} disabled={saving}
                  className="px-4 py-2 rounded text-sm font-medium"
                  style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving || !newPassword}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: saving ? 'rgba(212,175,55,0.3)' : '#d4af37', border: '1px solid transparent',
                    color: saving ? '#6e7681' : '#0d1117', cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: !newPassword ? 0.4 : 1,
                  }}>
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

// ─── Delete Confirm Modal (type-to-confirm) ───────────────────────────────────

function DeleteConfirmModal({ user, onClose, onConfirmed }) {
  const [typed, setTyped]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(248,81,73,0.3)' }}>
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#f85149' }}>DELETE ACCOUNT</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', width: 28, height: 28 }}>✕</button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm" style={{ color: '#8b949e' }}>
            This permanently deletes <strong style={{ color: '#f0ece3' }}>{user.display_name}</strong>'s account and all associated data. This cannot be undone.
          </p>
          <div>
            <label style={{ fontSize: 11, color: '#6e7681', display: 'block', marginBottom: 6 }}>
              Type <strong style={{ color: '#f0ece3' }}>{required}</strong> to confirm:
            </label>
            <input type="text" value={typed} onChange={e => setTyped(e.target.value)}
              placeholder={required}
              className="w-full rounded px-3 py-2 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
              onFocus={e => { e.currentTarget.style.borderColor = '#f85149'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>
          {error && (
            <div className="rounded px-3 py-2 text-sm"
              style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={saving || typed !== required}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: typed !== required ? 'rgba(248,81,73,0.15)' : '#f85149',
                border: '1px solid transparent', color: typed !== required ? '#6e7681' : '#fff',
                cursor: (saving || typed !== required) ? 'not-allowed' : 'pointer',
                opacity: typed !== required ? 0.5 : 1,
              }}>
              {saving ? 'DELETING…' : 'DELETE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4" style={{ color: '#6e7681', fontSize: 12 }}>
      <span>{total} user{total !== 1 ? 's' : ''} · page {page + 1} of {totalPages}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 0}
          style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: page === 0 ? 'not-allowed' : 'pointer',
            background: 'none', border: '1px solid #30363d', color: page === 0 ? '#444' : '#8b949e',
          }}>
          ← Prev
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1}
          style={{
            padding: '4px 10px', borderRadius: 4, fontSize: 12,
            cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
            background: 'none', border: '1px solid #30363d', color: page >= totalPages - 1 ? '#444' : '#8b949e',
          }}>
          Next →
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserManagement() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [page, setPage]                 = useState(0);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  // Modals
  const [showCreate, setShowCreate]     = useState(false);
  const [editUser, setEditUser]         = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
  const [resetUser, setResetUser]       = useState(null);
  const [deleteUser, setDeleteUser]     = useState(null);

  // Detect current user role from stored JWT
  const currentUserRole = (() => {
    try {
      const token = localStorage.getItem('poker_trainer_jwt');
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.role ?? null;
    } catch {
      return null;
    }
  })();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterRole)   params.set('role', filterRole);
      const qs = params.toString();
      const data = await apiFetch(`/api/admin/users${qs ? `?${qs}` : ''}`);
      setUsers(Array.isArray(data) ? data : (data.users ?? data.players ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRole]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  async function handleSuspendToggle(user, suspend) {
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: suspend ? 'suspended' : 'active' }),
      });
      loadUsers();
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  }

  function handleExportCSV() {
    const token = localStorage.getItem('poker_trainer_jwt');
    const origin = window.location.origin.replace(':5173', ':3001').replace(':5174', ':3001');
    fetch(`${origin}/api/admin/users/export-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'users.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(() => alert('Export failed'));
  }

  return (
    <div className="p-6" style={{ color: '#f0ece3' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-[0.12em]" style={{ color: '#d4af37' }}>USER MANAGEMENT</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV}
            className="px-3 py-2 rounded text-xs font-semibold tracking-wider"
            style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}>
            ↓ Export CSV
          </button>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded text-sm font-bold tracking-wider"
            style={{ background: '#d4af37', border: '1px solid transparent', color: '#0d1117', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#d4af37'; }}>
            + Add User
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
        style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <div className="flex-1" style={{ minWidth: 180 }}>
          <input type="text" value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name or email…"
            className="w-full rounded pl-3 pr-3 py-1.5 text-sm outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
          />
        </div>

        <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: filterRole ? '#f0ece3' : '#6e7681', cursor: 'pointer' }}
          onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}>
          <option value="">All roles</option>
          {ROLES.filter(Boolean).map(r => (
            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
          ))}
        </select>

        <div className="flex rounded overflow-hidden" style={{ border: '1px solid #30363d' }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className="px-3 py-1.5 text-xs font-semibold tracking-wider"
              style={{
                background: filterStatus === s ? (STATUS_COLORS[s]?.bg || '#21262d') : 'transparent',
                color: filterStatus === s ? (STATUS_COLORS[s]?.text || '#f0ece3') : '#6e7681',
                border: 'none', cursor: 'pointer',
                borderRight: s !== 'archived' ? '1px solid #30363d' : 'none',
              }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <button onClick={loadUsers} disabled={loading}
          style={{
            width: 32, height: 32, borderRadius: 4, background: 'none', border: '1px solid #30363d',
            color: '#6e7681', cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? 0.5 : 1, flexShrink: 0,
          }}
          title="Refresh"
          onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; }}>
          ↻
        </button>
      </div>

      {error && (
        <div className="rounded px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
        <div className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
          style={{
            background: '#161b22', borderBottom: '1px solid #30363d', color: '#6e7681',
            gridTemplateColumns: '1fr 140px 110px 100px 110px 110px 44px',
          }}>
          <span>NAME / EMAIL</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span>COACH</span>
          <span>JOINED</span>
          <span>LAST SEEN</span>
          <span />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#6e7681', background: '#0d1117' }}>
            Loading users…
          </div>
        )}

        {!loading && paginated.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: '#6e7681', background: '#0d1117' }}>
            No users match the current filters.
          </div>
        )}

        {!loading && paginated.map((u, idx) => (
          <div key={u.id}
            className="grid items-center px-4 py-3"
            style={{
              gridTemplateColumns: '1fr 140px 110px 100px 110px 110px 44px',
              borderBottom: idx < paginated.length - 1 ? '1px solid #21262d' : 'none',
              background: idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)'; }}>

            {/* Name + email */}
            <div className="flex flex-col gap-0.5 min-w-0 cursor-pointer" onClick={() => setDetailUserId(u.id)}>
              <span className="text-sm font-medium truncate" style={{ color: '#f0ece3' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#d4af37'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#f0ece3'; }}>
                {u.display_name || '—'}
              </span>
              {u.email && <span className="text-xs truncate" style={{ color: '#6e7681' }}>{u.email}</span>}
            </div>

            <div><RolePill role={u.role} /></div>
            <div><StatusBadge status={u.status} /></div>
            <div className="text-xs" style={{ color: '#6e7681' }}>
              {u.coach_name ?? (u.coach_id ? u.coach_id.slice(0, 8) + '…' : '—')}
            </div>
            <div className="text-xs font-mono" style={{ color: '#6e7681' }}>{formatDate(u.created_at)}</div>
            <div className="text-xs font-mono" style={{ color: '#6e7681' }}>{formatDate(u.last_seen)}</div>

            <div className="flex justify-end">
              <ActionsMenu
                user={u}
                currentUserRole={currentUserRole}
                onViewProfile={() => setDetailUserId(u.id)}
                onEdit={() => setEditUser(u)}
                onResetPassword={() => setResetUser(u)}
                onSuspend={(suspend) => handleSuspendToggle(u, suspend)}
                onDelete={() => setDeleteUser(u)}
              />
            </div>
          </div>
        ))}
      </div>

      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />

      {/* Modals */}
      {showCreate && <UserForm user={null} onClose={() => setShowCreate(false)} onSaved={loadUsers} />}
      {editUser && <UserForm user={editUser} onClose={() => setEditUser(null)} onSaved={loadUsers} />}
      {detailUserId && <UserDetail userId={detailUserId} onClose={() => setDetailUserId(null)} onUpdated={loadUsers} />}
      {resetUser && <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />}
      {deleteUser && <DeleteConfirmModal user={deleteUser} onClose={() => setDeleteUser(null)} onConfirmed={loadUsers} />}
    </div>
  );
}
