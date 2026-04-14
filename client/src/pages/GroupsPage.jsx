/**
 * GroupsPage.jsx
 *
 * Coach-facing groups (cohorts) management page.
 * Two-panel layout: left sidebar with group list, right detail panel with members + stats.
 *
 * Flows:
 * - GET /api/admin/groups/my-school → list groups for this coach's school
 * - POST /api/admin/groups → create new group
 * - PATCH /api/admin/groups/:id → update group name/color
 * - DELETE /api/admin/groups/:id → remove group
 * - GET /api/admin/groups/:id/members → list group members
 * - POST /api/admin/groups/:id/members → add member to group
 * - DELETE /api/admin/groups/:id/members/:playerId → remove member
 * - GET /api/admin/players/:id/crm → fetch member stats for aggregation
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { colors } from '../lib/colors';
import GroupCard from '../components/groups/GroupCard.jsx';
import GroupDetail from '../components/groups/GroupDetail.jsx';
import GroupFormModal from '../components/groups/GroupFormModal.jsx';

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch('/api/admin/groups/my-school');
      setGroups(data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const selectedGroup = useMemo(() => {
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  const handleCreateGroup = useCallback(() => {
    setEditingGroup(null);
    setShowFormModal(true);
  }, []);

  const handleEditGroup = useCallback((group) => {
    setEditingGroup(group);
    setShowFormModal(true);
  }, []);

  const handleFormSave = useCallback(
    async (data) => {
      try {
        if (editingGroup) {
          // Edit existing
          await apiFetch(`/api/admin/groups/${editingGroup.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        } else {
          // Create new
          await apiFetch('/api/admin/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        }
        await loadGroups();
        setShowFormModal(false);
        setEditingGroup(null);
      } catch (err) {
        console.error('Form save error:', err);
        throw err;
      }
    },
    [editingGroup, loadGroups]
  );

  const handleDeleteGroup = useCallback(
    async (groupId) => {
      if (!confirm('Delete this group? Members will not be removed.')) return;
      try {
        await apiFetch(`/api/admin/groups/${groupId}`, { method: 'DELETE' });
        await loadGroups();
        if (selectedGroupId === groupId) setSelectedGroupId(null);
      } catch (err) {
        console.error('Delete error:', err);
        setError(err.message);
      }
    },
    [selectedGroupId, loadGroups]
  );

  const handleAddMember = useCallback(
    async (groupId, playerId) => {
      try {
        await apiFetch(`/api/admin/groups/${groupId}/members`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId }),
        });
        await loadGroups();
      } catch (err) {
        console.error('Add member error:', err);
        throw err;
      }
    },
    [loadGroups]
  );

  const handleRemoveMember = useCallback(
    async (groupId, playerId) => {
      try {
        await apiFetch(`/api/admin/groups/${groupId}/members/${playerId}`, {
          method: 'DELETE',
        });
        await loadGroups();
      } catch (err) {
        console.error('Remove member error:', err);
        throw err;
      }
    },
    [loadGroups]
  );

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          color: colors.textMuted,
        }}
      >
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        <span style={{ marginLeft: 8 }}>Loading groups…</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: colors.bgPrimary }}>
      {/* Left sidebar: groups list */}
      <div
        style={{
          width: 320,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${colors.borderDefault}`,
          background: colors.bgSurface,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 12px 4px' }}>
          <h1 className="text-xl font-bold" style={{ color: colors.textPrimary }}>Groups</h1>
        </div>

        <div style={{ padding: '12px 12px', borderBottom: `1px solid ${colors.borderDefault}` }}>
          <button
            onClick={handleCreateGroup}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: colors.gold,
              color: '#000',
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = colors.goldHover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = colors.gold)}
          >
            <Plus size={14} />
            New Group
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              background: colors.errorTint,
              borderBottom: `1px solid ${colors.errorBorder}`,
              color: colors.error,
              fontSize: 12,
              display: 'flex',
              gap: 6,
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
          {groups.length === 0 ? (
            <div
              style={{
                padding: 12,
                color: colors.textMuted,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No groups yet. Create your first group to get started.
            </div>
          ) : (
            groups.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                isSelected={selectedGroupId === group.id}
                onSelect={() => setSelectedGroupId(group.id)}
                onEdit={() => handleEditGroup(group)}
                onDelete={() => handleDeleteGroup(group.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel: detail + members + stats */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {selectedGroup ? (
          <GroupDetail
            group={selectedGroup}
            onEdit={() => handleEditGroup(selectedGroup)}
            onAddMember={(playerId) => handleAddMember(selectedGroup.id, playerId)}
            onRemoveMember={(playerId) => handleRemoveMember(selectedGroup.id, playerId)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.textMuted,
            }}
          >
            Select a group to view details
          </div>
        )}
      </div>

      {/* Create/edit modal */}
      {showFormModal && (
        <GroupFormModal
          group={editingGroup}
          onSave={handleFormSave}
          onCancel={() => {
            setShowFormModal(false);
            setEditingGroup(null);
          }}
        />
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
