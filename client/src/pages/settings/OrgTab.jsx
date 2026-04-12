import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { GOLD, SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';

// ─── Tab: Org Settings ────────────────────────────────────────────────────────

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' };

function GroupPolicySection() {
  const [policy, setPolicy]       = useState({ enabled: true, max_groups: '', max_players_per_group: '' });
  const [schools, setSchools]     = useState([]);
  const [loaded, setLoaded]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');
  const [schoolPolicies, setSchoolPolicies]   = useState({});   // schoolId → policy
  const [expandedSchool, setExpandedSchool]   = useState(null);
  const [schoolSaving, setSchoolSaving]       = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/org-settings/groups'),
      apiFetch('/api/admin/schools'),
    ]).then(([pol, { schools: list }]) => {
      setPolicy({
        enabled:               pol.enabled,
        max_groups:            pol.max_groups            ?? '',
        max_players_per_group: pol.max_players_per_group ?? '',
      });
      setSchools(list ?? []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function loadSchoolPolicy(schoolId) {
    if (schoolPolicies[schoolId]) return;
    const p = await apiFetch(`/api/admin/schools/${schoolId}/group-policy`).catch(() => ({}));
    setSchoolPolicies(prev => ({ ...prev, [schoolId]: {
      enabled:               p.enabled,
      max_groups:            p.max_groups            ?? '',
      max_players_per_group: p.max_players_per_group ?? '',
    }}));
  }

  async function saveOrgPolicy() {
    setSaving(true); setSaveMsg('');
    try {
      const result = await apiFetch('/api/admin/org-settings/groups', {
        method: 'PUT',
        body: JSON.stringify({
          enabled:               policy.enabled,
          max_groups:            policy.max_groups !== '' ? Number(policy.max_groups) : null,
          max_players_per_group: policy.max_players_per_group !== '' ? Number(policy.max_players_per_group) : null,
        }),
      });
      setPolicy({
        enabled: result.enabled,
        max_groups: result.max_groups ?? '',
        max_players_per_group: result.max_players_per_group ?? '',
      });
      setSaveMsg('Saved.');
    } catch { setSaveMsg('Failed to save.'); }
    finally { setSaving(false); }
  }

  async function saveSchoolPolicy(schoolId) {
    setSchoolSaving(schoolId);
    const sp = schoolPolicies[schoolId];
    try {
      const result = await apiFetch(`/api/admin/schools/${schoolId}/group-policy`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled:               sp.enabled,
          max_groups:            sp.max_groups !== '' ? Number(sp.max_groups) : null,
          max_players_per_group: sp.max_players_per_group !== '' ? Number(sp.max_players_per_group) : null,
        }),
      });
      setSchoolPolicies(prev => ({ ...prev, [schoolId]: {
        enabled: result.enabled,
        max_groups: result.max_groups ?? '',
        max_players_per_group: result.max_players_per_group ?? '',
      }}));
    } catch { /* silently ignore */ }
    finally { setSchoolSaving(null); }
  }

  function setSchoolPolicyField(schoolId, key, value) {
    setSchoolPolicies(prev => ({ ...prev, [schoolId]: { ...prev[schoolId], [key]: value } }));
  }

  if (!loaded) return <p className="text-xs" style={{ color: '#6e7681' }}>Loading…</p>;

  return (
    <>
      <SectionHeader title="Group Policy" />
      <p className="text-xs mb-3" style={{ color: '#6e7681' }}>
        Platform defaults. Individual schools can override these limits.
      </p>

      <Field label="Groups enabled by default">
        <Toggle value={policy.enabled} onChange={v => setPolicy(p => ({ ...p, enabled: v }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max groups per school" hint="Leave blank = unlimited">
          <Input
            type="number"
            value={String(policy.max_groups)}
            onChange={v => setPolicy(p => ({ ...p, max_groups: v }))}
            placeholder="Unlimited"
          />
        </Field>
        <Field label="Max players per group" hint="Leave blank = unlimited">
          <Input
            type="number"
            value={String(policy.max_players_per_group)}
            onChange={v => setPolicy(p => ({ ...p, max_players_per_group: v }))}
            placeholder="Unlimited"
          />
        </Field>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <SaveButton onClick={saveOrgPolicy} label={saving ? 'Saving…' : 'Save Defaults'} />
        {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved.' ? '#3fb950' : '#f85149' }}>{saveMsg}</span>}
      </div>

      {/* Per-school overrides */}
      {schools.length > 0 && (
        <>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: '#6e7681' }}>School Overrides</p>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            {schools.map((s, i) => {
              const isOpen = expandedSchool === s.id;
              const sp     = schoolPolicies[s.id];
              return (
                <div key={s.id} style={{ borderBottom: i < schools.length - 1 ? '1px solid #21262d' : 'none' }}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={async () => {
                      if (!isOpen) { await loadSchoolPolicy(s.id); setExpandedSchool(s.id); }
                      else setExpandedSchool(null);
                    }}
                  >
                    <span className="flex-1 text-sm font-semibold" style={{ color: '#f0ece3' }}>{s.name}</span>
                    {sp && (
                      <span className="text-xs" style={{ color: sp.enabled !== false ? '#3fb950' : '#6e7681' }}>
                        {sp.enabled !== false ? 'ON' : 'OFF'}
                        {sp.max_groups !== '' ? ` · max ${sp.max_groups} groups` : ''}
                        {sp.max_players_per_group !== '' ? ` · ${sp.max_players_per_group}/group` : ''}
                      </span>
                    )}
                    <span style={{ color: '#6e7681', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>

                  {isOpen && sp && (
                    <div className="px-4 pb-4 flex flex-col gap-3" style={{ background: '#0d1117' }}>
                      <Field label="Groups enabled">
                        <Toggle value={sp.enabled !== false} onChange={v => setSchoolPolicyField(s.id, 'enabled', v)} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Max groups" hint="Blank = use default">
                          <Input
                            type="number"
                            value={String(sp.max_groups)}
                            onChange={v => setSchoolPolicyField(s.id, 'max_groups', v)}
                            placeholder={policy.max_groups !== '' ? `Default (${policy.max_groups})` : 'Unlimited'}
                          />
                        </Field>
                        <Field label="Max per group" hint="Blank = use default">
                          <Input
                            type="number"
                            value={String(sp.max_players_per_group)}
                            onChange={v => setSchoolPolicyField(s.id, 'max_players_per_group', v)}
                            placeholder={policy.max_players_per_group !== '' ? `Default (${policy.max_players_per_group})` : 'Unlimited'}
                          />
                        </Field>
                      </div>
                      <SaveButton
                        onClick={() => saveSchoolPolicy(s.id)}
                        label={schoolSaving === s.id ? 'Saving…' : 'Save Override'}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

export default function OrgTab() {
  const [loading, setLoading]       = useState(true);

  // Blind structures
  const [structures, setStructures] = useState([]);
  const [editingStruct, setEditingStruct] = useState(null); // { id, label, sb, bb, ante }
  const [newStruct, setNewStruct]   = useState({ label: '', sb: '', bb: '', ante: '0' });
  const [addingStruct, setAddingStruct]   = useState(false);
  const [structMsg, setStructMsg]   = useState('');

  // Platform limits
  const [limits, setLimits]         = useState({ max_tables_per_student: 4, max_players_per_table: 9, trial_days: 7, trial_hand_limit: 500 });
  const [limitsSaving, setLimitsSaving]   = useState(false);
  const [limitsMsg, setLimitsMsg]   = useState('');

  // Autospawn
  const [autospawn, setAutospawn]   = useState({ enabled: false, occupancy_threshold: 60, default_config: 'low' });
  const [spawnSaving, setSpawnSaving]     = useState(false);
  const [spawnMsg, setSpawnMsg]     = useState('');

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState({ primary_metric: 'net_chips', secondary_metric: 'win_rate', update_frequency: 'after_session' });
  const [lbSaving, setLbSaving]     = useState(false);
  const [lbMsg, setLbMsg]           = useState('');

  useEffect(() => {
    apiFetch('/api/admin/org-settings')
      .then(data => {
        setStructures(data.blind_structures ?? []);
        setLimits(data.platform_limits ?? limits);
        setAutospawn(data.autospawn ?? autospawn);
        setLeaderboard(data.leaderboard ?? leaderboard);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Blind structures ─────────────────────────────────────────────────────────

  async function handleAddStruct(e) {
    e.preventDefault();
    if (!newStruct.label.trim() || !newStruct.sb || !newStruct.bb) return;
    setStructMsg('');
    try {
      const created = await apiFetch('/api/admin/org-settings/blind-structures', {
        method: 'POST',
        body: JSON.stringify({ label: newStruct.label.trim(), sb: Number(newStruct.sb), bb: Number(newStruct.bb), ante: Number(newStruct.ante) || 0 }),
      });
      setStructures(prev => [...prev, created]);
      setNewStruct({ label: '', sb: '', bb: '', ante: '0' });
      setAddingStruct(false);
    } catch (err) { setStructMsg(err.message || 'Failed to add.'); }
  }

  async function handleSaveStruct(s) {
    setStructMsg('');
    try {
      const updated = await apiFetch(`/api/admin/org-settings/blind-structures/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: s.label, sb: Number(s.sb), bb: Number(s.bb), ante: Number(s.ante) }),
      });
      setStructures(prev => prev.map(x => x.id === s.id ? updated : x));
      setEditingStruct(null);
    } catch (err) { setStructMsg(err.message || 'Failed to save.'); }
  }

  async function handleDeleteStruct(id) {
    setStructMsg('');
    try {
      await apiFetch(`/api/admin/org-settings/blind-structures/${id}`, { method: 'DELETE' });
      setStructures(prev => prev.filter(s => s.id !== id));
    } catch (err) { setStructMsg(err.message || 'Failed to delete.'); }
  }

  // ── Limits ───────────────────────────────────────────────────────────────────

  async function handleSaveLimits() {
    setLimitsSaving(true); setLimitsMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/limits', { method: 'PUT', body: JSON.stringify(limits) });
      setLimits(updated);
      setLimitsMsg('Saved.');
    } catch (err) { setLimitsMsg(err.message || 'Save failed.'); }
    finally { setLimitsSaving(false); }
  }

  // ── Autospawn ────────────────────────────────────────────────────────────────

  async function handleSaveSpawn() {
    setSpawnSaving(true); setSpawnMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/autospawn', { method: 'PUT', body: JSON.stringify(autospawn) });
      setAutospawn(updated);
      setSpawnMsg('Saved.');
    } catch (err) { setSpawnMsg(err.message || 'Save failed.'); }
    finally { setSpawnSaving(false); }
  }

  // ── Leaderboard ──────────────────────────────────────────────────────────────

  async function handleSaveLeaderboard() {
    setLbSaving(true); setLbMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/leaderboard', { method: 'PUT', body: JSON.stringify(leaderboard) });
      setLeaderboard(updated);
      setLbMsg('Saved.');
    } catch (err) { setLbMsg(err.message || 'Save failed.'); }
    finally { setLbSaving(false); }
  }

  if (loading) return <Card><p className="text-sm" style={{ color: '#6e7681' }}>Loading…</p></Card>;

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: '#6e7681' }}>
        These apply platform-wide unless overridden at the school or table level.
      </p>

      {/* ── Blind Structures ── */}
      <SectionHeader title="Default Blind Structures" />
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: '1px solid #30363d' }}>
        {structures.map((s, i) => {
          const isEditing = editingStruct?.id === s.id;
          const ed = editingStruct ?? s;
          return (
            <div
              key={s.id}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: i < structures.length - 1 ? '1px solid #21262d' : 'none' }}
            >
              {isEditing ? (
                <>
                  <input value={ed.label} onChange={e => setEditingStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 90 }} placeholder="Label" />
                  <input value={ed.sb}    onChange={e => setEditingStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="SB" type="number" />
                  <input value={ed.bb}    onChange={e => setEditingStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="BB" type="number" />
                  <input value={ed.ante}  onChange={e => setEditingStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="Ante" type="number" />
                  <button onClick={() => handleSaveStruct(editingStruct)} className="text-xs font-semibold" style={{ color: GOLD }}>Save</button>
                  <button onClick={() => setEditingStruct(null)} className="text-xs" style={{ color: '#6e7681' }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="w-20 font-semibold text-sm" style={{ color: '#f0ece3' }}>{s.label}</span>
                  <span className="text-sm flex-1" style={{ color: '#6e7681' }}>{s.sb}/{s.bb}{s.ante > 0 ? ` · ante ${s.ante}` : ''}</span>
                  <button onClick={() => setEditingStruct({ ...s })} className="text-xs" style={{ color: GOLD }}>Edit</button>
                  <button onClick={() => handleDeleteStruct(s.id)} className="text-xs" style={{ color: '#f85149' }}>✕</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!addingStruct ? (
        <button onClick={() => setAddingStruct(true)} className="text-sm font-semibold mb-3" style={{ color: GOLD }}>+ Add Structure</button>
      ) : (
        <form onSubmit={handleAddStruct} className="flex flex-wrap gap-2 mb-3 items-end">
          <input value={newStruct.label} onChange={e => setNewStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 100 }} placeholder="Label" />
          <input value={newStruct.sb}    onChange={e => setNewStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="SB" type="number" />
          <input value={newStruct.bb}    onChange={e => setNewStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="BB" type="number" />
          <input value={newStruct.ante}  onChange={e => setNewStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="Ante" type="number" />
          <button type="submit" className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: GOLD, color: '#0d1117' }}>Add</button>
          <button type="button" onClick={() => setAddingStruct(false)} className="text-sm" style={{ color: '#6e7681' }}>Cancel</button>
        </form>
      )}
      {structMsg && <p className="text-xs mb-2" style={{ color: '#f85149' }}>{structMsg}</p>}

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Platform Limits ── */}
      <SectionHeader title="Platform Limits" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max tables per student">
          <Input type="number" value={limits.max_tables_per_student} onChange={v => setLimits(l => ({ ...l, max_tables_per_student: Number(v) }))} />
        </Field>
        <Field label="Trial duration (days)">
          <Input type="number" value={limits.trial_days} onChange={v => setLimits(l => ({ ...l, trial_days: Number(v) }))} />
        </Field>
        <Field label="Trial hand limit">
          <Input type="number" value={limits.trial_hand_limit} onChange={v => setLimits(l => ({ ...l, trial_hand_limit: Number(v) }))} />
        </Field>
        <Field label="Max players per table">
          <Input type="number" value={limits.max_players_per_table} onChange={v => setLimits(l => ({ ...l, max_players_per_table: Number(v) }))} />
        </Field>
      </div>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveLimits} disabled={limitsSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: GOLD, color: '#0d1117', opacity: limitsSaving ? 0.6 : 1 }}>
          {limitsSaving ? 'Saving…' : 'Save Limits'}
        </button>
        {limitsMsg && <span className="text-xs" style={{ color: '#3fb950' }}>{limitsMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Autospawn ── */}
      <SectionHeader title="Open Table Auto-Spawn" />
      <Field label="Enabled">
        <Toggle value={autospawn.enabled} onChange={v => setAutospawn(a => ({ ...a, enabled: v }))} />
      </Field>
      {autospawn.enabled && (
        <>
          <Field label="Occupancy threshold (%)">
            <Input type="number" value={autospawn.occupancy_threshold} onChange={v => setAutospawn(a => ({ ...a, occupancy_threshold: Number(v) }))} />
          </Field>
          <Field label="Default config">
            <Select value={autospawn.default_config} onChange={v => setAutospawn(a => ({ ...a, default_config: v }))}>
              {['micro', 'low', 'medium', 'high'].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </Select>
          </Field>
        </>
      )}
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveSpawn} disabled={spawnSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: GOLD, color: '#0d1117', opacity: spawnSaving ? 0.6 : 1 }}>
          {spawnSaving ? 'Saving…' : 'Save Autospawn'}
        </button>
        {spawnMsg && <span className="text-xs" style={{ color: '#3fb950' }}>{spawnMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Leaderboard ── */}
      <SectionHeader title="Leaderboard Defaults" />
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
          {lbSaving ? 'Saving…' : 'Save Leaderboard'}
        </button>
        {lbMsg && <span className="text-xs" style={{ color: '#3fb950' }}>{lbMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: '1px solid #21262d' }} />

      {/* ── Group Policy (already wired) ── */}
      <GroupPolicySection />
    </Card>
  );
}
