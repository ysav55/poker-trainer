import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { GOLD, SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';

// ─── Tab: School ──────────────────────────────────────────────────────────────

// Color swatches for the group color picker
const GROUP_COLORS = [
  '#58a6ff', '#d4af37', '#3fb950', '#f85149', '#a371f7',
  '#fd8c73', '#ffa657', '#79c0ff', '#7ee787', '#ff7b72',
];

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' };

function GroupsSection({ schoolId, policy }) {
  const [groups, setGroups]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [editingId, setEditingId] = useState(null);  // group id being renamed
  const [editName, setEditName]   = useState('');
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newColor, setNewColor]   = useState('#58a6ff');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!schoolId) { setLoading(false); return; }
    apiFetch('/api/admin/groups/my-school')
      .then(d => { setGroups(d?.groups ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [schoolId]);

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
      setNewName(''); setNewColor('#58a6ff'); setCreating(false);
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
    } catch { /* silently ignore */ }
  }

  return (
    <>
      <SectionHeader title="Groups / Cohorts" />

      {policy && (
        <p className="text-xs mb-3" style={{ color: '#6e7681' }}>
          {policy.max_groups != null ? `Up to ${policy.max_groups} groups` : 'Unlimited groups'}
          {policy.max_players_per_group != null ? ` · ${policy.max_players_per_group} players each` : ''}
          {!policy.enabled ? ' · Groups disabled by admin' : ''}
        </p>
      )}

      {loading ? (
        <p className="text-xs mb-3" style={{ color: '#6e7681' }}>Loading…</p>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #30363d', maxHeight: 260, overflowY: 'auto' }}>
              {groups.map((g, i) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  style={{ borderBottom: i < groups.length - 1 ? '1px solid #21262d' : 'none' }}
                >
                  {/* Color dot / picker */}
                  <div className="relative flex-shrink-0">
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
                      className="flex-1 rounded px-2 py-0.5 text-sm outline-none"
                      style={{ background: '#0d1117', border: '1px solid #d4af37', color: '#f0ece3' }}
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm font-semibold cursor-pointer truncate"
                      style={{ color: '#f0ece3' }}
                      onDoubleClick={() => { setEditingId(g.id); setEditName(g.name); }}
                      title="Double-click to rename"
                    >
                      {g.name}
                    </span>
                  )}

                  <span className="text-xs flex-shrink-0" style={{ color: '#6e7681' }}>
                    {g.member_count ?? 0} student{(g.member_count ?? 0) !== 1 ? 's' : ''}
                  </span>

                  <button
                    onClick={() => { setEditingId(g.id); setEditName(g.name); }}
                    className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                    style={{ color: '#8b949e', background: 'transparent', border: '1px solid #30363d', cursor: 'pointer' }}
                    title="Rename"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDelete(g.id)}
                    className="text-xs flex-shrink-0"
                    style={{ color: '#f85149', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    title="Delete group"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {groups.length === 0 && !creating && (
            <p className="text-xs mb-3" style={{ color: '#6e7681' }}>No groups yet.</p>
          )}

          {/* Create form */}
          {creating ? (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 mb-3 p-3 rounded-lg" style={{ background: '#0d1117', border: '1px solid #30363d' }}>
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
                        width: 18, height: 18, borderRadius: '50%', background: c, border: `2px solid ${newColor === c ? '#fff' : 'transparent'}`,
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                      }}
                    />
                  ))}
                </div>
              </div>
              {error && <p className="text-xs" style={{ color: '#f85149' }}>{error}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving || !newName.trim()}
                  className="px-4 py-1.5 rounded text-sm font-bold"
                  style={{ background: GOLD, color: '#0d1117', cursor: saving || !newName.trim() ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(''); setError(''); }}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ color: '#6e7681', background: 'transparent', border: '1px solid #30363d', cursor: 'pointer' }}
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
                style={{ color: GOLD }}
              >
                + Create Group
              </button>
            )
          )}

          {atLimit && (
            <p className="text-xs mt-1" style={{ color: '#6e7681' }}>
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
    Promise.all([
      apiFetch('/api/settings/school'),
      apiFetch('/api/admin/groups/my-school'),
    ])
      .then(([school, groups]) => {
        setIdentity(school.identity ?? { name: '', description: '' });
        setSchoolId(school.identity?.id ?? null);
        setPlatforms(school.platforms ?? []);
        setStaking(school.staking_defaults ?? staking);
        setLeaderboard(school.leaderboard ?? leaderboard);
        setGroupsData(groups);
      })
      .catch(() => {})
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

  if (loading) return <Card><p className="text-sm" style={{ color: '#6e7681' }}>Loading…</p></Card>;

  return (
    <Card>
      {/* ── Identity ── */}
      <SectionHeader title="Identity" />
      <Field label="School name">
        <Input value={identity.name} onChange={v => setIdentity(x => ({ ...x, name: v }))} placeholder="School name" />
      </Field>
      <Field label="Description">
        <textarea
          value={identity.description}
          onChange={e => setIdentity(x => ({ ...x, description: e.target.value }))}
          rows={3}
          className="rounded px-3 py-2 text-sm outline-none resize-none w-full"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' }}
          placeholder="Describe your school…"
        />
      </Field>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveIdentity} disabled={identitySaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: GOLD, color: '#0d1117', opacity: identitySaving ? 0.6 : 1 }}>
          {identitySaving ? 'Saving…' : 'Save'}
        </button>
        {identityMsg && <span className="text-xs" style={{ color: identityMsg === 'Saved.' ? '#3fb950' : '#f85149' }}>{identityMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Platforms ── */}
      <SectionHeader title="Platforms" />
      <p className="text-xs mb-2" style={{ color: '#6e7681' }}>These appear in the platform dropdown when logging staking sessions.</p>
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: '1px solid #30363d' }}>
        {platforms.map((p, i) => (
          <div key={p} className="flex items-center px-4 py-2.5" style={{ borderBottom: i < platforms.length - 1 ? '1px solid #21262d' : 'none' }}>
            <span className="flex-1 text-sm" style={{ color: '#e5e7eb' }}>{p}</span>
            <button onClick={() => removePlatform(p)} className="text-xs" style={{ color: '#f85149' }} disabled={platformsSaving}>✕</button>
          </div>
        ))}
        {platforms.length === 0 && <p className="text-xs px-4 py-3" style={{ color: '#6e7681' }}>No platforms added yet.</p>}
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
        <button onClick={addPlatform} disabled={!newPlatform.trim() || platformsSaving} className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: GOLD, color: '#0d1117', opacity: !newPlatform.trim() ? 0.4 : 1 }}>
          + Add
        </button>
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Staking Defaults ── */}
      <SectionHeader title="Staking Defaults" />
      <p className="text-xs mb-3" style={{ color: '#6e7681' }}>Pre-fill values when creating new staking contracts. Can be overridden per contract.</p>
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
        <button onClick={handleSaveStaking} disabled={stakingSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: GOLD, color: '#0d1117', opacity: stakingSaving ? 0.6 : 1 }}>
          {stakingSaving ? 'Saving…' : 'Save'}
        </button>
        {stakingMsg && <span className="text-xs" style={{ color: stakingMsg === 'Saved.' ? '#3fb950' : '#f85149' }}>{stakingMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Leaderboard ── */}
      <SectionHeader title="Leaderboard" />
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
        <button onClick={handleSaveLeaderboard} disabled={lbSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: GOLD, color: '#0d1117', opacity: lbSaving ? 0.6 : 1 }}>
          {lbSaving ? 'Saving…' : 'Save'}
        </button>
        {lbMsg && <span className="text-xs" style={{ color: lbMsg === 'Saved.' ? '#3fb950' : '#f85149' }}>{lbMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Groups (already wired) ── */}
      <GroupsSection schoolId={groupsData?.schoolId ?? schoolId} policy={groupsData?.policy} />
    </Card>
  );
}
