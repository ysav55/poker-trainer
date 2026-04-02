import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import UserForm from './UserForm';
import UserDetail from './UserDetail';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ['', 'superadmin', 'admin', 'coach', 'moderator', 'referee', 'player', 'trial'];
const STATUSES = ['active', 'suspended', 'archived'];

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col"
        style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#d4af37' }}>
            RESET PASSWORD
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', width: '28px', height: '28px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
            aria-label="Close"
          >✕</button>
        </div>

        <div className="px-5 py-4">
          {done ? (
            <div
              className="rounded px-3 py-2.5 text-sm mb-4"
              style={{ background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950' }}
            >
              Password updated successfully for <strong>{user.display_name}</strong>.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="text-sm" style={{ color: '#8b949e' }}>
                Set a new password for <strong style={{ color: '#f0ece3' }}>{user.display_name}</strong>.
              </div>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password"
                required
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              />
              {error && (
                <div
                  className="rounded px-3 py-2 text-sm"
                  style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
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
                  style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !newPassword}
                  className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                  style={{
                    background: saving ? 'rgba(212,175,55,0.3)' : '#d4af37',
                    border: '1px solid transparent',
                    color: saving ? '#6e7681' : '#0d1117',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: !newPassword ? 0.4 : 1,
                  }}
                >
                  {saving ? 'SAVING…' : 'RESET'}
                </button>
              </div>
            </form>
          )}
          {done && (
            <div className="flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded text-sm font-bold tracking-wider"
                style={{ background: '#d4af37', border: '1px solid transparent', color: '#0d1117', cursor: 'pointer' }}
              >
                DONE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Archive Confirm ──────────────────────────────────────────────────────────

function ArchiveConfirmModal({ user, onClose, onConfirmed }) {
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleArchive() {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'archived' }),
      });
      onConfirmed();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to archive user');
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
        style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 48px rgba(0,0,0,0.8)' }}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <span className="text-sm font-bold tracking-[0.15em]" style={{ color: '#e3b341' }}>
            ARCHIVE USER
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', width: '28px', height: '28px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
            aria-label="Close"
          >✕</button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm" style={{ color: '#8b949e' }}>
            Archive <strong style={{ color: '#f0ece3' }}>{user.display_name}</strong>?
            Their account will be deactivated and hidden from active views.
          </p>
          {error && (
            <div
              className="rounded px-3 py-2 text-sm"
              style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
            >
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded text-sm font-medium"
              style={{ background: 'none', border: '1px solid #30363d', color: '#8b949e', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleArchive}
              disabled={saving}
              className="px-4 py-2 rounded text-sm font-bold tracking-wider"
              style={{
                background: saving ? 'rgba(110,118,129,0.3)' : '#6e7681',
                border: '1px solid transparent',
                color: saving ? '#444' : '#0d1117',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'ARCHIVING…' : 'ARCHIVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Row action button ────────────────────────────────────────────────────────

function ActionBtn({ onClick, children, danger = false }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
      style={{
        background: 'none',
        border: `1px solid ${danger ? 'rgba(110,118,129,0.3)' : '#30363d'}`,
        color: danger ? '#6e7681' : '#8b949e',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = danger ? '#6e7681' : '#d4af37';
        e.currentTarget.style.color = danger ? '#f0ece3' : '#d4af37';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = danger ? 'rgba(110,118,129,0.3)' : '#30363d';
        e.currentTarget.style.color = danger ? '#6e7681' : '#8b949e';
      }}
    >
      {children}
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserManagement() {
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  // Modals
  const [showCreate, setShowCreate]       = useState(false);
  const [editUser, setEditUser]           = useState(null);
  const [detailUserId, setDetailUserId]   = useState(null);
  const [resetUser, setResetUser]         = useState(null);
  const [archiveUser, setArchiveUser]     = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterRole)   params.set('role', filterRole);
      const qs = params.toString();
      const data = await apiFetch(`/api/admin/users${qs ? `?${qs}` : ''}`);
      setUsers(Array.isArray(data) ? data : (data.users ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterRole]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Client-side search filter
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="p-6"
      style={{ color: '#f0ece3' }}
    >
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-[0.12em]" style={{ color: '#d4af37' }}>
            USER MANAGEMENT
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded text-sm font-bold tracking-wider transition-colors"
          style={{ background: '#d4af37', border: '1px solid transparent', color: '#0d1117', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#c9a227'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#d4af37'; }}
        >
          + CREATE USER
        </button>
      </div>

      {/* Filter bar */}
      <div
        className="rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
        style={{ background: '#161b22', border: '1px solid #30363d' }}
      >
        {/* Search */}
        <div className="relative flex-1" style={{ minWidth: '180px' }}>
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: '#6e7681' }}
          >
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded pl-8 pr-3 py-1.5 text-sm outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
          />
        </div>

        {/* Role filter */}
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded px-3 py-1.5 text-sm outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: filterRole ? '#f0ece3' : '#6e7681', cursor: 'pointer' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
        >
          <option value="" style={{ background: '#161b22', color: '#6e7681' }}>All roles</option>
          {ROLES.filter(Boolean).map((r) => (
            <option key={r} value={r} style={{ background: '#161b22', color: '#f0ece3' }}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </option>
          ))}
        </select>

        {/* Status toggles */}
        <div
          className="flex rounded overflow-hidden"
          style={{ border: '1px solid #30363d' }}
        >
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? '' : s)}
              className="px-3 py-1.5 text-xs font-semibold tracking-wider transition-colors"
              style={{
                background: filterStatus === s ? (STATUS_COLORS[s]?.bg || '#21262d') : 'transparent',
                color: filterStatus === s ? (STATUS_COLORS[s]?.text || '#f0ece3') : '#6e7681',
                border: 'none',
                cursor: 'pointer',
                borderRight: s !== 'archived' ? '1px solid #30363d' : 'none',
              }}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={loadUsers}
          disabled={loading}
          className="flex items-center justify-center rounded transition-colors"
          style={{
            width: '32px', height: '32px',
            background: 'none', border: '1px solid #30363d',
            color: '#6e7681', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.5 : 1,
            flexShrink: 0,
          }}
          title="Refresh"
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M10 6A4 4 0 1 1 6 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M6 2l2-2M6 2L4 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: '1px solid #30363d' }}
      >
        {/* Table header */}
        <div
          className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
          style={{
            background: '#161b22',
            borderBottom: '1px solid #30363d',
            color: '#6e7681',
            gridTemplateColumns: '1fr 180px 120px 100px 140px 160px',
          }}
        >
          <span>NAME / EMAIL</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span>LAST SEEN</span>
          <span>CREATED</span>
          <span>ACTIONS</span>
        </div>

        {/* Rows */}
        {loading && (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: '#6e7681', background: '#0d1117' }}
          >
            Loading users…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div
            className="flex items-center justify-center py-12 text-sm"
            style={{ color: '#6e7681', background: '#0d1117' }}
          >
            No users match the current filters.
          </div>
        )}

        {!loading && filtered.map((u, idx) => (
          <div
            key={u.id}
            className="grid items-center px-4 py-3 transition-colors"
            style={{
              gridTemplateColumns: '1fr 180px 120px 100px 140px 160px',
              borderBottom: idx < filtered.length - 1 ? '1px solid #21262d' : 'none',
              background: idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)'; }}
          >
            {/* Name + email */}
            <div
              className="flex flex-col gap-0.5 min-w-0 cursor-pointer"
              onClick={() => setDetailUserId(u.id)}
            >
              <span
                className="text-sm font-medium truncate"
                style={{ color: '#f0ece3' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#f0ece3'; }}
              >
                {u.display_name || '—'}
              </span>
              {u.email && (
                <span className="text-xs truncate" style={{ color: '#6e7681' }}>
                  {u.email}
                </span>
              )}
            </div>

            {/* Role */}
            <div><RolePill role={u.role} /></div>

            {/* Status */}
            <div><StatusBadge status={u.status} /></div>

            {/* Last seen */}
            <div className="text-xs font-mono" style={{ color: '#6e7681' }}>
              {formatDate(u.last_seen || u.created_at)}
            </div>

            {/* Created */}
            <div className="text-xs font-mono" style={{ color: '#6e7681' }}>
              {formatDate(u.created_at)}
            </div>

            {/* Row actions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <ActionBtn onClick={() => setEditUser(u)}>Edit</ActionBtn>
              <ActionBtn onClick={() => setResetUser(u)}>Reset PW</ActionBtn>
              {u.status !== 'archived' && (
                <ActionBtn onClick={() => setArchiveUser(u)} danger>Archive</ActionBtn>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {showCreate && (
        <UserForm
          user={null}
          onClose={() => setShowCreate(false)}
          onSaved={loadUsers}
        />
      )}

      {editUser && (
        <UserForm
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={loadUsers}
        />
      )}

      {detailUserId && (
        <UserDetail
          userId={detailUserId}
          onClose={() => setDetailUserId(null)}
          onUpdated={loadUsers}
        />
      )}

      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}

      {archiveUser && (
        <ArchiveConfirmModal
          user={archiveUser}
          onClose={() => setArchiveUser(null)}
          onConfirmed={loadUsers}
        />
      )}
    </div>
  );
}
