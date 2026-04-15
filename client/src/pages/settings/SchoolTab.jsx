import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { SectionHeader, Field, Input, Select, Card } from './shared.jsx';
import { colors, groupColors as GROUP_COLORS } from '../../lib/colors.js';
import { Building2, Palette, Sliders, DollarSign, TrendingUp, Globe, Users, Clock, Plus, Trash2 } from 'lucide-react';

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

  // Member panel state
  const [expandedId, setExpandedId]   = useState(null);
  const [groupMembers, setGroupMembers] = useState({});   // { [groupId]: Member[] }
  const [allStudents, setAllStudents] = useState([]);     // all coached_students in school
  const [addingMember, setAddingMember] = useState({});  // { [groupId]: playerId being added }

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
    } catch { /* silently keep old name */ }
    setEditingId(null);
  }

  async function handleRecolor(id, color) {
    try {
      await apiFetch(`/api/admin/groups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ color }),
      });
      setGroups(prev => prev.map(x => x.id === id ? { ...x, color } : x));
    } catch { /* silently ignore */ }
  }

  async function handleDelete(id) {
    const g = groups.find(x => x.id === id);
    if (g?.member_count > 0 && !window.confirm(`Delete "${g.name}"? ${g.member_count} student(s) will be removed from it.`)) return;
    try {
      await apiFetch(`/api/admin/groups/${id}`, { method: 'DELETE' });
      setGroups(prev => prev.filter(x => x.id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch { /* silently ignore */ }
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
    } catch { /* silently ignore */ }
  }

  async function handleAddMember(groupId) {
    const playerId = addingMember[groupId];
    if (!playerId) return;
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
    } catch { /* silently ignore */ }
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
                            style={{ color: colors.error, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: '0 2px' }}
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
                              disabled={!addingMember[g.id]}
                              className="text-xs px-2 py-1 rounded font-semibold flex-shrink-0"
                              style={{
                                background: colors.gold,
                                color: colors.bgSurface,
                                opacity: !addingMember[g.id] ? 0.4 : 1,
                                cursor: !addingMember[g.id] ? 'not-allowed' : 'pointer',
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

  useEffect(() => {
    apiFetch('/api/settings/school')
      .then(school => {
        setIdentity(school.identity ?? { name: '', description: '' });
        setSchoolId(school.identity?.id ?? null);
        setPlatforms(school.platforms ?? []);
        setStaking(school.staking_defaults ?? staking);
        setLeaderboard(school.leaderboard ?? leaderboard);
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

      {/* ── Groups (already wired) ── */}
      <GroupsSection schoolId={groupsData?.schoolId ?? schoolId} policy={groupsData?.policy} />
    </Card>
  );
}
