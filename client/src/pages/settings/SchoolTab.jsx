import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { SectionHeader, Field, Input, Select, Card } from './shared.jsx';
import { colors, groupColors as GROUP_COLORS } from '../../lib/colors.js';
import { Building2, Palette, Sliders, DollarSign, TrendingUp, Globe, Users, Clock, Plus, Trash2, Key } from 'lucide-react';

// ─── Tab: School ──────────────────────────────────────────────────────────────

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

function GroupsSection({ schoolId, policy }) {
  const [groups, setGroups]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState(null);  // group id being renamed
  const [editName, setEditName]   = useState('');
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newColor, setNewColor]   = useState(GROUP_COLORS[0]);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [groupsError, setGroupsError] = useState('');  // errors from member operations

  // Member panel state
  const [expandedId, setExpandedId]   = useState(null);
  const [groupMembers, setGroupMembers] = useState({});   // { [groupId]: Member[] }
  const [allStudents, setAllStudents] = useState([]);     // all coached_students in school
  const [addingMember, setAddingMember] = useState({});  // { [groupId]: playerId being added }
  const [memberOperationInFlight, setMemberOperationInFlight] = useState(false);  // race condition guard

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    apiFetch('/api/admin/groups/my-school')
      .then(d => { setGroups(d?.groups ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

  // Fetch all coached_students once on mount
  useEffect(() => {
    apiFetch('/api/admin/users?role=coached_student')
      .then(d => setAllStudents(d?.players ?? []))
      .catch(() => {});
  }, []);

  const atLimit = policy?.max_groups != null && groups.length >= policy.max_groups;

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true); setError('');
    try {
      const g = await apiFetch('/api/admin/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      setGroups(prev => [...prev, { ...g, member_count: 0 }]);
      setNewName(''); setNewColor(GROUP_COLORS[0]); setCreating(false);
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally { setSaving(false); }
  }

  async function handleRename(id) {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const g = await apiFetch(`/api/admin/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      setGroups(prev => prev.map(x => x.id === id ? { ...x, name: g.name } : x));
    } catch (err) {
      setGroupsError(err.message || 'Failed to rename group');
      setTimeout(() => setGroupsError(''), 3000);
    }
    setEditingId(null);
  }

  async function handleRecolor(id, color) {
    try {
      await apiFetch(`/api/admin/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ color }),
      });
      setGroups(prev => prev.map(x => x.id === id ? { ...x, color } : x));
    } catch (err) {
      setGroupsError(err.message || 'Failed to change group color');
      setTimeout(() => setGroupsError(''), 3000);
    }
  }

  async function handleDelete(id) {
    const g = groups.find(x => x.id === id);
    if (g?.member_count > 0 && !window.confirm(`Delete "${g.name}"? ${g.member_count} student(s) will be removed from it.`)) return;
    try {
      await apiFetch(`/api/admin/groups/${id}`, { method: 'DELETE' });
      setGroups(prev => prev.filter(x => x.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (err) {
      setGroupsError(err.message || 'Failed to delete group');
      setTimeout(() => setGroupsError(''), 3000);
    }
  }

  // ── Member panel handlers ────────────────────────────────────────────────────

  function handleToggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
    if (!groupMembers[id]) {
      apiFetch(`/api/admin/groups/${id}/members`)
        .then(d => setGroupMembers(prev => ({ ...prev, [id]: d?.members ?? [] })))
        .catch(() => {});
    }
  }

  async function handleRemoveMember(groupId, playerId) {
    setMemberOperationInFlight(true);
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members/${playerId}`, { method: 'DELETE' });
      setGroupMembers(prev => ({
        ...prev,
        [groupId]: (prev[groupId] ?? []).filter(m => m.id !== playerId),
      }));
      setGroups(prev => prev.map(g => g.id === groupId
        ? { ...g, member_count: Math.max(0, (g.member_count ?? 1) - 1) }
        : g
      ));
    } catch (err) {
      setGroupsError(err.message || 'Failed to remove member');
      setTimeout(() => setGroupsError(''), 3000);
    } finally {
      setMemberOperationInFlight(false);
    }
  }

  async function handleAddMember(groupId) {
    const playerId = addingMember[groupId];
    if (!playerId) return;
    setMemberOperationInFlight(true);
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      });
      const student = allStudents.find(s => s.id === playerId);
      if (student) {
        setGroupMembers(prev => ({
          ...prev,
          [groupId]: [...(prev[groupId] ?? []), student],
        }));
        setGroups(prev => prev.map(g => g.id === groupId
          ? { ...g, member_count: (g.member_count ?? 0) + 1 }
          : g
        ));
      }
      setAddingMember(prev => ({ ...prev, [groupId]: '' }));
    } catch (err) {
      setGroupsError(err.message || 'Failed to add member');
      setTimeout(() => setGroupsError(''), 3000);
    } finally {
      setMemberOperationInFlight(false);
    }
  }

  return (
    <>
      <SectionHeader title="Groups / Cohorts" icon={Users} />

      {policy && (
        <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
          {policy.max_groups != null ? `Up to ${policy.max_groups} groups` : 'Unlimited groups'}
          {policy.max_players_per_group != null ? ` · ${policy.max_players_per_group} players each` : ''}
          {!policy.enabled ? ' · Groups disabled by admin' : ''}
        </p>
      )}

      {groupsError && (
        <p className="text-xs mb-3 p-2 rounded" style={{ color: colors.error, background: colors.errorTint, border: `1px solid ${colors.errorBorder}` }}>
          {groupsError}
        </p>
      )}

      {loading ? (
        <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Loading…</p>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${colors.borderStrong}`, maxHeight: 400, overflowY: 'auto' }}>
              {groups.map((g, i) => (
                <div
                  key={g.id}
                  style={{ borderBottom: i < groups.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}
                >
                  {/* ── Group row ── */}
                  <div
                    data-testid={`group-row-${g.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                    onClick={() => handleToggleExpand(g.id)}
                    style={{ userSelect: 'none' }}
                  >
                    {/* Color dot / picker */}
                    <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <input
                        type="color"
                        value={g.color}
                        onChange={e => handleRecolor(g.id, e.target.value)}
                        title="Change color"
                        style={{
                          width: 18, height: 18, border: 'none', padding: 0, cursor: 'pointer',
                          borderRadius: '50%', background: 'none', appearance: 'none',
                        }}
                      />
                    </div>

                    {/* Name (editable inline) */}
                    {editingId === g.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => handleRename(g.id)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRename(g.id); if (e.key === 'Escape') setEditingId(null); }}
                        onClick={e => e.stopPropagation()}
                        className="flex-1 rounded px-2 py-0.5 text-sm outline-none"
                        style={{ background: colors.bgSurface, border: `1px solid ${colors.gold}`, color: colors.textPrimary }}
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm font-semibold truncate"
                        style={{ color: colors.textPrimary }}
                        onDoubleClick={e => { e.stopPropagation(); setEditingId(g.id); setEditName(g.name); }}
                        title="Double-click to rename; click to expand"
                      >
                        {g.name}
                      </span>
                    )}

                    <span className="text-xs flex-shrink-0" style={{ color: colors.textMuted }}>
                      {g.member_count ?? 0} student{(g.member_count ?? 0) !== 1 ? 's' : ''}
                    </span>

                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(g.id); setEditName(g.name); }}
                      className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                      style={{ color: colors.textSecondary, background: 'transparent', border: `1px solid ${colors.borderStrong}`, cursor: 'pointer' }}
                      title="Rename"
                    >
                      Rename
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(g.id); }}
                      className="text-xs flex-shrink-0"
                      style={{ color: colors.error, background: 'transparent', border: 'none', cursor: 'pointer' }}
                      title="Delete group"
                    >
                      ✕
                    </button>

                    {/* Expand chevron */}
                    <span className="text-xs flex-shrink-0" style={{ color: colors.textMuted }}>
                      {expandedId === g.id ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* ── Member panel ── */}
                  {expandedId === g.id && (
                    <div
                      data-testid={`group-members-panel-${g.id}`}
                      style={{
                        background: colors.bgSurface,
                        border: `1px solid ${colors.borderDefault}`,
                        borderRadius: 4,
                        padding: 8,
                        marginTop: 4,
                        marginBottom: 4,
                        marginLeft: 12,
                        marginRight: 12,
                      }}
                    >
                      {/* Member list */}
                      {(groupMembers[g.id] ?? []).length === 0 && (
                        <p className="text-xs mb-2" style={{ color: colors.textMuted }}>No members yet.</p>
                      )}
                      {(groupMembers[g.id] ?? []).map(m => (
                        <div
                          key={m.id}
                          data-testid={`member-row-${m.id}`}
                          className="flex items-center gap-2 mb-1"
                        >
                          <span className="flex-1 text-xs" style={{ color: colors.textPrimary }}>{m.display_name}</span>
                          <button
                            data-testid={`remove-member-${m.id}`}
                            onClick={() => handleRemoveMember(g.id, m.id)}
                            disabled={memberOperationInFlight}
                            style={{ color: colors.error, background: 'none', border: 'none', cursor: memberOperationInFlight ? 'not-allowed' : 'pointer', fontSize: 11, padding: '0 2px', opacity: memberOperationInFlight ? 0.5 : 1 }}
                            title={`Remove ${m.display_name}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}

                      {/* Add student row */}
                      {(() => {
                        const memberIds = new Set((groupMembers[g.id] ?? []).map(m => m.id));
                        const available = allStudents.filter(s => !memberIds.has(s.id));
                        return (
                          <div className="flex gap-2 items-center mt-2">
                            <select
                              data-testid={`add-member-select-${g.id}`}
                              value={addingMember[g.id] ?? ''}
                              onChange={e => setAddingMember(prev => ({ ...prev, [g.id]: e.target.value }))}
                              className="rounded px-2 py-1 text-xs outline-none flex-1"
                              style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
                            >
                              <option value="">Select student…</option>
                              {available.map(s => (
                                <option key={s.id} value={s.id}>{s.display_name}</option>
                              ))}
                            </select>
                            <button
                              data-testid={`add-member-btn-${g.id}`}
                              onClick={() => handleAddMember(g.id)}
                              disabled={!addingMember[g.id] || memberOperationInFlight}
                              className="text-xs px-2 py-1 rounded font-semibold flex-shrink-0"
                              style={{
                                background: colors.gold,
                                color: colors.bgSurface,
                                opacity: !addingMember[g.id] || memberOperationInFlight ? 0.4 : 1,
                                cursor: !addingMember[g.id] || memberOperationInFlight ? 'not-allowed' : 'pointer',
                                border: 'none',
                              }}
                            >
                              Add
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {groups.length === 0 && !creating && (
            <p className="text-xs mb-3" style={{ color: colors.textMuted }}>No groups yet.</p>
          )}

          {/* Create form */}
          {creating ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 mb-3 p-3 rounded-lg" style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}` }}>
              <div className="flex gap-2 items-center">
                <Input
                  value={newName}
                  onChange={setNewName}
                  placeholder="Group name"
                  autoFocus
                  style={{ flex: 1 }}
                />
                <div className="flex gap-1 flex-wrap">
                  {GROUP_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      style={{
                        width: 18, height: 18, borderRadius: '50%', background: c, border: `2px solid ${newColor === c ? colors.white : 'transparent'}`,
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-xs" style={{ color: colors.error }}>{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="px-4 py-1.5 rounded text-sm font-bold"
                  style={{ background: colors.gold, color: colors.bgSurface, cursor: saving || !newName.trim() ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setError(''); }}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ color: colors.textMuted, background: 'transparent', border: `1px solid ${colors.borderStrong}`, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            !atLimit && policy?.enabled !== false && (
              <button
                onClick={() => setCreating(true)}
                className="text-sm font-semibold"
                style={{ color: colors.gold }}
              >
                + Create Group
              </button>
            )
          )}

          {atLimit && (
            <p className="text-xs mt-1" style={{ color: colors.textMuted }}>
              Group limit reached ({policy.max_groups}). Contact your admin to increase it.
            </p>
          )}
        </>
      )}
    </>
  );
}

export default function SchoolTab() {
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null); // 'no_school' or other error message
  const [groupsData, setGroupsData] = useState(null); // { schoolId, policy, groups }
  const [schoolId, setSchoolId]     = useState(null);

  // Identity
  const [identity, setIdentity]         = useState({ name: '', description: '' });
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityMsg, setIdentityMsg]   = useState('');

  // Platforms
  const [platforms, setPlatforms]         = useState([]);
  const [newPlatform, setNewPlatform]     = useState('');
  const [platformsSaving, setPlatformsSaving] = useState(false);

  // Staking defaults
  const [staking, setStaking]           = useState({ coach_split_pct: 50, makeup_policy: 'carries', bankroll_cap: 25000, contract_duration_months: 6 });
  const [stakingSaving, setStakingSaving] = useState(false);
  const [stakingMsg, setStakingMsg]     = useState('');

  // Leaderboard
  const [leaderboard, setLeaderboard]   = useState({ primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' });
  const [lbSaving, setLbSaving]         = useState(false);
  const [lbMsg, setLbMsg]               = useState('');

  // Passwords
  const [passwords, setPasswords]         = useState([]);
  const [passwordsLoading, setPasswordsLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordFormData, setPasswordFormData] = useState({
    plainPassword: '',
    source: '',
    maxUses: 1,
    expiresAt: '',
    groupId: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/settings/school')
      .then(school => {
        setIdentity(school.identity ?? { name: '', description: '' });
        const sid = school.identity?.id ?? null;
        setSchoolId(sid);
        setPlatforms(school.platforms ?? []);
        setStaking(school.staking_defaults ?? staking);
        setLeaderboard(school.leaderboard ?? leaderboard);

        // Load passwords if schoolId is available
        if (sid) {
          apiFetch(`/api/admin/schools/${sid}/passwords`)
            .then(data => setPasswords(data?.passwords ?? []))
            .catch(() => {})
            .finally(() => setPasswordsLoading(false));
        } else {
          setPasswordsLoading(false);
        }

        return apiFetch('/api/admin/groups/my-school')
          .then(groups => setGroupsData(groups))
          .catch(() => {}); // groups optional
      })
      .catch(err => {
        // Check if it's the "no school assigned" error
        if (err.message?.includes('no_school')) {
          setError('no_school');
        } else {
          setError(err.message || 'Failed to load school settings');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Identity ─────────────────────────────────────────────────────────────────

  async function handleSaveIdentity() {
    setIdentitySaving(true); setIdentityMsg('');
    try {
      const updated = await apiFetch('/api/settings/school/identity', {
        method: 'PUT',
        body: JSON.stringify({ name: identity.name, description: identity.description }),
      });
      setIdentity({ name: updated.name, description: updated.description ?? '' });
      setIdentityMsg('Saved.');
    } catch (err) { setIdentityMsg(err.message || 'Save failed.'); }
    finally { setIdentitySaving(false); }
  }

  // ── Platforms ────────────────────────────────────────────────────────────────

  async function savePlatforms(list) {
    setPlatformsSaving(true);
    try {
      const result = await apiFetch('/api/settings/school/platforms', {
        method: 'PUT',
        body: JSON.stringify({ platforms: list }),
      });
      setPlatforms(result.platforms);
    } catch { /* silently ignore */ }
    finally { setPlatformsSaving(false); }
  }

  function addPlatform() {
    if (!newPlatform.trim()) return;
    const updated = [...platforms, newPlatform.trim()];
    setNewPlatform('');
    savePlatforms(updated);
  }

  function removePlatform(name) {
    savePlatforms(platforms.filter(p => p !== name));
  }

  // ── Staking defaults ─────────────────────────────────────────────────────────

  async function handleSaveStaking() {
    setStakingSaving(true); setStakingMsg('');
    try {
      const updated = await apiFetch('/api/settings/school/staking-defaults', {
        method: 'PUT',
        body: JSON.stringify(staking),
      });
      setStaking(updated);
      setStakingMsg('Saved.');
    } catch (err) { setStakingMsg(err.message || 'Save failed.'); }
    finally { setStakingSaving(false); }
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────────

  async function handleSaveLeaderboard() {
    setLbSaving(true); setLbMsg('');
    try {
      const updated = await apiFetch('/api/settings/school/leaderboard', {
        method: 'PUT',
        body: JSON.stringify(leaderboard),
      });
      setLeaderboard(updated);
      setLbMsg('Saved.');
    } catch (err) { setLbMsg(err.message || 'Save failed.'); }
    finally { setLbSaving(false); }
  }

  // ── Passwords ────────────────────────────────────────────────────────────────

  async function handleCreatePassword() {
    if (!passwordFormData.plainPassword.trim()) {
      setPasswordError('Password is required.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError('');
    try {
      const payload = {
        plainPassword: passwordFormData.plainPassword.trim(),
        source: passwordFormData.source.trim() || null,
        maxUses: passwordFormData.maxUses ? Number(passwordFormData.maxUses) : null,
        expiresAt: passwordFormData.expiresAt || null,
        groupId: passwordFormData.groupId || null,
      };
      const newPassword = await apiFetch(`/api/admin/schools/${schoolId}/passwords`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setPasswords(prev => [...prev, newPassword]);
      setPasswordFormData({ plainPassword: '', source: '', maxUses: 1, expiresAt: '', groupId: '' });
      setShowPasswordModal(false);
    } catch (err) {
      setPasswordError(err.message || 'Failed to create password.');
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleDisablePassword(passwordId) {
    try {
      await apiFetch(`/api/admin/schools/${schoolId}/passwords/${passwordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ disabled: true }),
      });
      setPasswords(prev => prev.map(p => p.id === passwordId ? { ...p, disabled: true } : p));
    } catch (err) {
      // Silently ignore disable errors for now
    }
  }

  function calculateDaysUntilExpiry(expiresAt) {
    if (!expiresAt) return null;
    const expiryDate = new Date(expiresAt);
    const today = new Date();
    const diffTime = expiryDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function isPasswordExpired(expiresAt) {
    const daysLeft = calculateDaysUntilExpiry(expiresAt);
    return daysLeft !== null && daysLeft < 0;
  }

  if (loading) return <Card><p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p></Card>;

  if (error === 'no_school') {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <p style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>No school assigned</p>
          <p style={{ color: colors.textMuted, fontSize: 13, marginBottom: 16 }}>
            This account is not assigned to a school. Contact your administrator to set up a school.
          </p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <p style={{ color: colors.error, fontWeight: 600 }}>Error loading school settings</p>
          <p style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>{error}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      {/* ── Identity ── */}
      <SectionHeader title="Identity" icon={Building2} />
      <Field label="School name">
        <Input value={identity.name} onChange={v => setIdentity(x => ({ ...x, name: v }))} placeholder="School name" />
      </Field>
      <Field label="Description">
        <textarea
          value={identity.description}
          onChange={e => setIdentity(x => ({ ...x, description: e.target.value }))}
          rows={3}
          className="rounded px-3 py-2 text-sm outline-none resize-none w-full"
          style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
          placeholder="Describe your school…"
        />
      </Field>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveIdentity} disabled={identitySaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: identitySaving ? 0.6 : 1 }}>
          {identitySaving ? 'Saving…' : 'Save'}
        </button>
        {identityMsg && <span className="text-xs" style={{ color: identityMsg === 'Saved.' ? colors.success : colors.error }}>{identityMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* ── Platforms ── */}
      <SectionHeader title="Platforms" icon={Globe} />
      <p className="text-xs mb-2" style={{ color: colors.textMuted }}>These appear in the platform dropdown when logging staking sessions.</p>
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${colors.borderStrong}` }}>
        {platforms.map((p, i) => (
          <div key={p} className="flex items-center px-4 py-2.5" style={{ borderBottom: i < platforms.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}>
            <span className="flex-1 text-sm" style={{ color: colors.textPrimary }}>{p}</span>
            <button onClick={() => removePlatform(p)} className="text-xs" style={{ color: colors.error }} disabled={platformsSaving}>✕</button>
          </div>
        ))}
        {platforms.length === 0 && <p className="text-xs px-4 py-3" style={{ color: colors.textMuted }}>No platforms added yet.</p>}
      </div>
      <div className="flex gap-2 mb-4">
        <input
          value={newPlatform}
          onChange={e => setNewPlatform(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPlatform()}
          placeholder="Platform name…"
          className={inputCls}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button onClick={addPlatform} disabled={!newPlatform.trim() || platformsSaving} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: colors.gold, color: colors.bgSurface, opacity: !newPlatform.trim() ? 0.4 : 1 }}>
          + Add
        </button>
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* ── Staking Defaults ── */}
      <SectionHeader title="Staking Defaults" icon={DollarSign} />
      <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Pre-fill values when creating new staking contracts. Can be overridden per contract.</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default coach split (%)">
          <Input type="number" value={staking.coach_split_pct} onChange={v => setStaking(s => ({ ...s, coach_split_pct: Number(v) }))} />
        </Field>
        <Field label="Player split (%)" hint="Auto-calculated">
          <input readOnly value={100 - staking.coach_split_pct} className={inputCls} style={{ ...inputStyle, opacity: 0.5 }} />
        </Field>
        <Field label="Makeup policy">
          <Select value={staking.makeup_policy} onChange={v => setStaking(s => ({ ...s, makeup_policy: v }))}>
            {['carries', 'resets_monthly', 'resets_on_settlement'].map(o => (
              <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bankroll cap ($)">
          <Input type="number" value={staking.bankroll_cap} onChange={v => setStaking(s => ({ ...s, bankroll_cap: Number(v) }))} />
        </Field>
        <Field label="Default duration (months)">
          <Input type="number" value={staking.contract_duration_months} onChange={v => setStaking(s => ({ ...s, contract_duration_months: Number(v) }))} />
        </Field>
      </div>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveStaking} disabled={stakingSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: stakingSaving ? 0.6 : 1 }}>
          {stakingSaving ? 'Saving…' : 'Save'}
        </button>
        {stakingMsg && <span className="text-xs" style={{ color: stakingMsg === 'Saved.' ? colors.success : colors.error }}>{stakingMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* ── Leaderboard ── */}
      <SectionHeader title="Leaderboard" icon={TrendingUp} />
      <Field label="Primary metric">
        <Select value={leaderboard.primary_metric} onChange={v => setLeaderboard(l => ({ ...l, primary_metric: v }))}>
          {['net_chips', 'bb_per_100', 'win_rate', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Secondary metric">
        <Select value={leaderboard.secondary_metric} onChange={v => setLeaderboard(l => ({ ...l, secondary_metric: v }))}>
          {['win_rate', 'net_chips', 'bb_per_100', 'hands_played'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <Field label="Update frequency">
        <Select value={leaderboard.update_frequency} onChange={v => setLeaderboard(l => ({ ...l, update_frequency: v }))}>
          {['after_session', 'hourly', 'daily'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={handleSaveLeaderboard} disabled={lbSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: lbSaving ? 0.6 : 1 }}>
          {lbSaving ? 'Saving…' : 'Save'}
        </button>
        {lbMsg && <span className="text-xs" style={{ color: lbMsg === 'Saved.' ? colors.success : colors.error }}>{lbMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* ── School Passwords ── */}
      <SectionHeader title="School Passwords" icon={Key} />
      <p className="text-xs mb-3" style={{ color: colors.textMuted }}>
        Create registration passwords for students. Each password can be limited by usage and expiration date.
      </p>

      {passwordsLoading ? (
        <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Loading…</p>
      ) : (
        <>
          {passwords.length > 0 ? (
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${colors.borderStrong}` }}>
              <div className="bg-opacity-50 px-3 py-2.5 flex items-center gap-4 text-xs" style={{ background: colors.bgSurface, borderBottom: `1px solid ${colors.borderDefault}`, color: colors.textMuted, fontWeight: 600 }}>
                <span style={{ flex: '1 1 15%' }}>Source</span>
                <span style={{ flex: '1 1 15%' }}>Uses</span>
                <span style={{ flex: '1 1 15%' }}>Expires In</span>
                <span style={{ flex: '1 1 12%' }}>Status</span>
                <span style={{ flex: '0 0 20%' }}>Actions</span>
              </div>
              {passwords.map((pw, i) => {
                const daysLeft = calculateDaysUntilExpiry(pw.expires_at);
                const isExpired = isPasswordExpired(pw.expires_at);
                const isDisabled = pw.disabled;
                return (
                  <div
                    key={pw.id}
                    className="flex items-center gap-4 px-3 py-2.5 text-sm"
                    style={{
                      borderBottom: i < passwords.length - 1 ? `1px solid ${colors.borderDefault}` : 'none',
                      opacity: isDisabled ? 0.6 : 1,
                    }}
                  >
                    <span style={{ flex: '1 1 15%', color: colors.textPrimary }}>{pw.source || '—'}</span>
                    <span style={{ flex: '1 1 15%', color: colors.textSecondary, fontSize: 12 }}>
                      {pw.uses_count ?? 0}/{pw.max_uses ?? '∞'}
                    </span>
                    <span style={{ flex: '1 1 15%', color: colors.textSecondary, fontSize: 12 }}>
                      {daysLeft === null ? '—' : daysLeft < 0 ? 'Expired' : `${daysLeft}d`}
                    </span>
                    <span
                      style={{
                        flex: '1 1 12%',
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: isExpired || isDisabled ? colors.errorTint : colors.successTint,
                        color: isExpired || isDisabled ? colors.error : colors.success,
                        textAlign: 'center',
                      }}
                    >
                      {isDisabled ? 'Disabled' : isExpired ? 'Expired' : 'Active'}
                    </span>
                    <div style={{ flex: '0 0 20%', display: 'flex', gap: 8 }}>
                      {!isExpired && !isDisabled && (
                        <button
                          onClick={() => handleDisablePassword(pw.id)}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            color: colors.textSecondary,
                            background: colors.bgSurface,
                            border: `1px solid ${colors.borderStrong}`,
                            cursor: 'pointer',
                          }}
                          title="Disable this password"
                        >
                          Disable
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs mb-3 p-2 rounded" style={{ color: colors.textMuted, background: colors.bgSurface }}>
              No passwords created yet.
            </p>
          )}

          <button
            onClick={() => setShowPasswordModal(true)}
            className="text-sm font-semibold"
            style={{ color: colors.gold, marginBottom: 16 }}
          >
            + Create Password
          </button>

          {/* Password Modal */}
          {showPasswordModal && (
            <>
              {/* Backdrop */}
              <div
                onClick={() => setShowPasswordModal(false)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  zIndex: 999,
                  cursor: 'pointer',
                }}
              />
              {/* Modal */}
              <div
                style={{
                  position: 'fixed',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: colors.bgSurfaceRaised,
                  border: `1px solid ${colors.borderStrong}`,
                  borderRadius: 8,
                  padding: 24,
                  maxWidth: 400,
                  width: '90%',
                  maxHeight: '90vh',
                  overflowY: 'auto',
                  zIndex: 1000,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                }}
                onClick={e => e.stopPropagation()}
              >
                <h3 style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 16, marginBottom: 16 }}>
                  Create School Password
                </h3>

                <div className="flex flex-col gap-3 mb-4">
                  <Field label="Password" hint="Required">
                    <Input
                      type="text"
                      value={passwordFormData.plainPassword}
                      onChange={v => setPasswordFormData(prev => ({ ...prev, plainPassword: v }))}
                      placeholder="Enter password"
                      autoFocus
                    />
                  </Field>

                  <Field label="Source" hint="e.g., spring_cohort (optional)">
                    <Input
                      type="text"
                      value={passwordFormData.source}
                      onChange={v => setPasswordFormData(prev => ({ ...prev, source: v }))}
                      placeholder="Source name"
                    />
                  </Field>

                  <Field label="Max Uses" hint="Leave blank for unlimited">
                    <Input
                      type="number"
                      value={passwordFormData.maxUses}
                      onChange={v => setPasswordFormData(prev => ({ ...prev, maxUses: v ? Number(v) : '' }))}
                      placeholder="Max uses"
                      min="1"
                    />
                  </Field>

                  <Field label="Expires At" hint="Leave blank for no expiration (optional)">
                    <input
                      type="datetime-local"
                      value={passwordFormData.expiresAt}
                      onChange={e => setPasswordFormData(prev => ({ ...prev, expiresAt: e.target.value }))}
                      className="rounded px-3 py-1.5 text-sm outline-none"
                      style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
                    />
                  </Field>

                  <Field label="Auto-add to Group" hint="Optional">
                    <select
                      value={passwordFormData.groupId}
                      onChange={e => setPasswordFormData(prev => ({ ...prev, groupId: e.target.value }))}
                      className="rounded px-3 py-1.5 text-sm outline-none"
                      style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
                    >
                      <option value="">No group</option>
                      {groupsData?.groups?.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {passwordError && (
                  <p
                    className="text-xs mb-3 p-2 rounded"
                    style={{ color: colors.error, background: colors.errorTint, border: `1px solid ${colors.errorBorder}` }}
                  >
                    {passwordError}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleCreatePassword}
                    disabled={passwordSaving}
                    className="px-4 py-2 rounded text-sm font-bold flex-1"
                    style={{
                      background: colors.gold,
                      color: colors.bgSurface,
                      opacity: passwordSaving ? 0.6 : 1,
                      cursor: passwordSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {passwordSaving ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    onClick={() => {
                      setShowPasswordModal(false);
                      setPasswordFormData({ plainPassword: '', source: '', maxUses: 1, expiresAt: '', groupId: '' });
                      setPasswordError('');
                    }}
                    className="px-4 py-2 rounded text-sm"
                    style={{
                      color: colors.textMuted,
                      background: 'transparent',
                      border: `1px solid ${colors.borderStrong}`,
                      cursor: 'pointer',
                      flex: 1,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* ── Groups (already wired) ── */}
      <GroupsSection schoolId={groupsData?.schoolId ?? schoolId} policy={groupsData?.policy} />
    </Card>
  );
}
