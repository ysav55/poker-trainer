import React, { useState, useEffect, useCallback } from 'react';
import { Download, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { colors } from '../../lib/colors.js';
import UserForm from './UserForm';
import UserDetail from './UserDetail';
import UserTableRow, { Pagination } from '../../components/admin/UserTableRow.jsx';
import UserFilters from '../../components/admin/UserFilters.jsx';
import ResetPasswordModal from '../../components/admin/ResetPasswordModal.jsx';
import DeleteConfirmModal from '../../components/admin/DeleteConfirmModal.jsx';

const PAGE_SIZE = 15;
const GRID_COLS = '1fr 140px 110px 100px 110px 110px 44px';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);

  const [pendingResets, setPendingResets] = useState([]);

  const { user } = useAuth();
  const currentUserRole = user?.role ?? null;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPage(0);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterRole) params.set('role', filterRole);
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

  useEffect(() => {
    apiFetch('/api/admin/users/pending-resets')
      .then(d => setPendingResets(d.requests ?? []))
      .catch(() => {});
  }, []);

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
    <div className="p-6" style={{ color: colors.textPrimary }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>User Management</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
            {filtered.length} user{filtered.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 rounded text-xs font-semibold tracking-wider flex items-center gap-1.5"
            style={{ background: 'none', border: `1px solid ${colors.borderStrong}`, color: colors.textSecondary, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = colors.gold; e.currentTarget.style.color = colors.gold; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.color = colors.textSecondary; }}
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded text-sm font-bold tracking-wider flex items-center gap-1.5"
            style={{ background: colors.gold, border: '1px solid transparent', color: colors.bgSurface, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = colors.goldHover; }}
            onMouseLeave={e => { e.currentTarget.style.background = colors.gold; }}
          >
            <Plus size={14} /> Add User
          </button>
        </div>
      </div>

      {pendingResets.length > 0 && (
        <div
          className="rounded-lg px-4 py-3 mb-4"
          style={{ background: colors.warningTint, border: `1px solid ${colors.warningBorder}` }}
          data-testid="pending-resets-banner"
        >
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: colors.warning }}>
            Password Reset Requests ({pendingResets.length})
          </p>
          <div className="flex flex-col gap-1.5">
            {pendingResets.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3">
                <span className="text-sm" style={{ color: colors.textPrimary }}>{r.displayName}</span>
                <button
                  onClick={() => setResetUser({ id: r.playerId, display_name: r.displayName })}
                  className="text-xs px-3 py-1 rounded font-semibold"
                  style={{ background: colors.warningTint, border: `1px solid ${colors.warningBorder}`, color: colors.warning, cursor: 'pointer' }}
                  data-testid={`reset-btn-${r.playerId}`}
                >
                  Reset Password
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <UserFilters
        search={search}
        onSearchChange={v => { setSearch(v); setPage(0); }}
        filterRole={filterRole}
        onFilterRoleChange={setFilterRole}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        loading={loading}
        onRefresh={loadUsers}
      />

      {error && (
        <div
          className="rounded px-4 py-3 mb-4 text-sm"
          style={{ background: colors.errorTint, border: `1px solid ${colors.errorBorder}`, color: colors.error }}
        >
          {error}
        </div>
      )}

      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}` }}>
        <div
          className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
          style={{
            background: colors.bgSurfaceRaised,
            borderBottom: `1px solid ${colors.borderStrong}`,
            color: colors.textMuted,
            gridTemplateColumns: GRID_COLS,
          }}
        >
          <span>NAME / EMAIL</span>
          <span>ROLE</span>
          <span>STATUS</span>
          <span>COACH</span>
          <span>JOINED</span>
          <span>LAST SEEN</span>
          <span />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: colors.textMuted, background: colors.bgSurface }}>
            Loading users…
          </div>
        )}

        {!loading && paginated.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm" style={{ color: colors.textMuted, background: colors.bgSurface }}>
            No users match the current filters.
          </div>
        )}

        {!loading && paginated.map((u, idx) => (
          <UserTableRow
            key={u.id}
            user={u}
            index={idx}
            currentUserRole={currentUserRole}
            gridTemplateColumns={GRID_COLS}
            isLast={idx === paginated.length - 1}
            onView={setDetailUserId}
            onEdit={setEditUser}
            onResetPassword={setResetUser}
            onSuspend={handleSuspendToggle}
            onDelete={setDeleteUser}
          />
        ))}
      </div>

      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />

      {showCreate && <UserForm user={null} onClose={() => setShowCreate(false)} onSaved={loadUsers} />}
      {editUser && <UserForm user={editUser} onClose={() => setEditUser(null)} onSaved={loadUsers} />}
      {detailUserId && <UserDetail userId={detailUserId} onClose={() => setDetailUserId(null)} onUpdated={loadUsers} />}
      {resetUser && (
        <ResetPasswordModal
          user={resetUser}
          onClose={() => setResetUser(null)}
          onSuccess={() => setPendingResets(prev => prev.filter(r => r.playerId !== resetUser.id))}
        />
      )}
      {deleteUser && <DeleteConfirmModal user={deleteUser} onClose={() => setDeleteUser(null)} onConfirmed={loadUsers} />}
    </div>
  );
}
