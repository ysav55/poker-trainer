/**
 * GroupDetail.jsx
 *
 * Right panel: group header, member list with add/remove, and aggregated stats table.
 *
 * On group select:
 * 1. Fetch members from GET /api/admin/groups/:id/members
 * 2. For each member, fetch stats from GET /api/admin/players/:id/crm
 * 3. Aggregate vpip, pfr, wtsd, wsd, hands_played across all members
 * 4. Display member list with remove button + stats table
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Edit2, Users, Plus, X, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import GroupStatsTable from './GroupStatsTable.jsx';

export default function GroupDetail({ group, onEdit, onAddMember, onRemoveMember }) {
  const [members, setMembers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [memberStats, setMemberStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [error, setError] = useState(null);
  const [showAddMember, setShowAddMember] = useState(false);

  // Load members
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiFetch(`/api/admin/groups/${group.id}/members`);
      setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to load members:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [group.id]);

  // Load available players (coached_student role)
  const loadAvailablePlayers = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/users?role=coached_student');
      setAllPlayers(data.players || []);
    } catch (err) {
      console.error('Failed to load available players:', err);
    }
  }, []);

  // Load member stats
  const loadMemberStats = useCallback(async () => {
    if (!members.length) {
      setMemberStats({});
      return;
    }

    try {
      setLoadingStats(true);
      const stats = {};
      await Promise.all(
        members.map(async (member) => {
          try {
            const summary = await apiFetch(`/api/admin/players/${member.id}/crm`);
            stats[member.id] = summary.latestSessionStats || null;
          } catch {
            stats[member.id] = null;
          }
        })
      );
      setMemberStats(stats);
    } catch (err) {
      console.error('Failed to load member stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [members]);

  useEffect(() => {
    loadMembers();
    loadAvailablePlayers();
  }, [loadMembers, loadAvailablePlayers]);

  useEffect(() => {
    loadMemberStats();
  }, [loadMemberStats]);

  const handleAddMember = useCallback(
    async (playerId) => {
      try {
        await onAddMember(playerId);
        setShowAddMember(false);
        await loadMembers();
      } catch (err) {
        setError(err.message);
      }
    },
    [onAddMember, loadMembers]
  );

  const handleRemoveMember = useCallback(
    async (playerId) => {
      if (!confirm('Remove this player from the group?')) return;
      try {
        await onRemoveMember(playerId);
        await loadMembers();
      } catch (err) {
        setError(err.message);
      }
    },
    [onRemoveMember, loadMembers]
  );

  // Determine which players can be added (not already members)
  const memberIds = new Set(members.map((m) => m.id));
  const availableToAdd = allPlayers.filter((p) => !memberIds.has(p.id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: colors.bgPrimary }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${colors.borderDefault}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: group.color || colors.gold,
            }}
          />
          <div>
            <div style={{ color: colors.textPrimary, fontSize: 18, fontWeight: 600 }}>
              {group.name}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 12 }}>
              <Users size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
              {members.length} members
            </div>
          </div>
        </div>
        <button
          onClick={onEdit}
          style={{
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = colors.textPrimary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = colors.textMuted)}
        >
          <Edit2 size={14} />
          Edit
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {error && (
          <div style={{ padding: 12, background: colors.errorTint, color: colors.error, fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.textMuted,
            }}
          >
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginRight: 8 }} />
            Loading members…
          </div>
        ) : (
          <>
            {/* Members list */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ color: colors.textPrimary, fontSize: 14, fontWeight: 600, margin: 0 }}>Members</h3>
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  style={{
                    padding: '4px 8px',
                    background: colors.bgSurfaceRaised,
                    border: `1px solid ${colors.borderDefault}`,
                    color: colors.gold,
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = colors.bgSurfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = colors.bgSurfaceRaised)}
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>

              {showAddMember && availableToAdd.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddMember(e.target.value);
                        e.target.value = '';
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      background: colors.bgSurfaceRaised,
                      border: `1px solid ${colors.borderDefault}`,
                      color: colors.textPrimary,
                      borderRadius: 4,
                      fontSize: 12,
                    }}
                    defaultValue=""
                  >
                    <option value="">— select player —</option>
                    {availableToAdd.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {members.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 12 }}>No members yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {members.map((member) => (
                    <div
                      key={member.id}
                      style={{
                        padding: '8px 10px',
                        background: colors.bgSurfaceRaised,
                        border: `1px solid ${colors.borderDefault}`,
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ color: colors.textPrimary, fontSize: 12, fontWeight: 500 }}>
                          {member.display_name}
                        </div>
                        <div style={{ color: colors.textMuted, fontSize: 10 }}>
                          {member.status === 'active' ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: colors.error,
                          cursor: 'pointer',
                          padding: '4px 8px',
                        }}
                        title="Remove from group"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats table */}
            {members.length > 0 && (
              <div style={{ padding: '16px 20px', borderTop: `1px solid ${colors.borderDefault}` }}>
                {loadingStats ? (
                  <div style={{ color: colors.textMuted, fontSize: 12, display: 'flex', gap: 8 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading stats…
                  </div>
                ) : (
                  <GroupStatsTable members={members} memberStats={memberStats} />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
