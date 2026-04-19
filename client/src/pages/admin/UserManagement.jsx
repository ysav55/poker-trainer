import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Download, Plus } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import UserForm from './UserForm';
import IncomingZone from '../../components/admin/IncomingZone';
import SchoolsPanel from '../../components/admin/SchoolsPanel';
import UserDrawer from '../../components/admin/UserDrawer';
import UserTableRow, { Pagination } from '../../components/admin/UserTableRow';

const PAGE_SIZE = 15;
const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const [selectedSchoolId, setSelectedSchoolId] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [drawerUserId, setDrawerUserId] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  const loadSchools = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/schools');
      setSchools(Array.isArray(data) ? data : (data.schools ?? []));
    } catch { setSchools([]); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadSchools(); }, [loadSchools]);

  const reloadAll = useCallback(() => {
    loadUsers();
    loadSchools();
  }, [loadUsers, loadSchools]);

  const filtered = useMemo(() => {
    let list = users;
    if (selectedSchoolId) {
      list = list.filter(u => u.school_id === selectedSchoolId);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) =>
      (a.display_name || '').localeCompare(b.display_name || '')
    );
  }, [users, selectedSchoolId, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  useEffect(() => { setPage(0); }, [search, filterRole, filterStatus, selectedSchoolId]);

  const handleExport = async () => {
    try {
      const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
      const token = sessionStorage.getItem('poker_trainer_jwt');
      const res = await fetch(`${API_BASE}/api/admin/users/export-csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'users.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  };

  const selectedSchool = schools.find(s => s.id === selectedSchoolId);
  const scopeLabel = selectedSchool ? selectedSchool.name : 'All Users';
  const scopeCount = filtered.length;

  const selectStyle = {
    background: colors.bgSurface,
    border: `1px solid ${colors.borderDefault}`,
    color: colors.textMuted,
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    cursor: 'pointer',
  };

  return (
    <div className="flex h-full" style={{ background: colors.bgSurface }}>
      {/* LEFT PANEL */}
      <div
        className="flex flex-col shrink-0"
        style={{
          width: 220,
          borderRight: `1px solid ${colors.borderDefault}`,
          background: colors.bgSurface,
        }}
      >
        <IncomingZone
          users={users}
          schools={schools}
          onSelectUser={setDrawerUserId}
          onUsersUpdated={reloadAll}
        />
        <SchoolsPanel
          schools={schools}
          selectedSchoolId={selectedSchoolId}
          totalUsers={users.length}
          onSelectSchool={setSelectedSchoolId}
          onSchoolsChanged={loadSchools}
        />
      </div>

      {/* RIGHT PANEL */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: `1px solid ${colors.borderDefault}` }}
        >
          <div>
            <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
              {scopeLabel}
            </span>
            <span className="text-xs ml-2" style={{ color: colors.textMuted }}>
              {scopeCount} user{scopeCount !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="rounded px-2 py-1 text-xs"
              style={{
                background: colors.bgSurface,
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textPrimary,
                width: 140,
              }}
            />
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={selectStyle}>
              <option value="">All Roles</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="px-4 py-2 text-xs" style={{ color: '#f85149' }}>{error}</div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span style={{ color: colors.textMuted }}>Loading…</span>
            </div>
          ) : paged.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <span style={{ color: colors.textMuted }}>No users found</span>
            </div>
          ) : (
            <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: colors.textMuted, textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.5px' }}>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Name</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Role</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Status</th>
                  <th className="text-left px-3 py-2" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(u => (
                  <UserTableRow key={u.id} user={u} onClick={setDrawerUserId} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderTop: `1px solid ${colors.borderDefault}` }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: colors.textMuted }}>
              {paged.length} of {filtered.length} shown
            </span>
            <Pagination
              page={page}
              pageCount={pageCount}
              onPrev={() => setPage(p => Math.max(0, p - 1))}
              onNext={() => setPage(p => Math.min(pageCount - 1, p + 1))}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded font-semibold"
              style={{ background: '#238636', color: '#fff', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={14} /> Add User
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded"
              style={{
                background: 'transparent',
                border: `1px solid ${colors.borderDefault}`,
                color: colors.textMuted,
                cursor: 'pointer',
              }}
            >
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      </div>

      {/* MODALS / DRAWER */}
      {showCreate && (
        <UserForm
          onClose={() => setShowCreate(false)}
          onSaved={reloadAll}
        />
      )}
      {drawerUserId && (
        <UserDrawer
          userId={drawerUserId}
          schools={schools}
          onClose={() => setDrawerUserId(null)}
          onUserUpdated={reloadAll}
        />
      )}
    </div>
  );
}
