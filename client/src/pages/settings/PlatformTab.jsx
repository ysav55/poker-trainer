import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { colors } from '../../lib/colors.js';
import { SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';
import { DEFAULT_COLUMNS, DEFAULT_SORT_BY } from '../../lib/leaderboardStats.js';
import LeaderboardColumnPicker from './LeaderboardColumnPicker.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_FEATURES = [
  { key: 'replay',       label: 'Guided Replay'     },
  { key: 'analysis',     label: 'AI Analysis'       },
  { key: 'chip_bank',    label: 'Chip Bank'          },
  { key: 'playlists',    label: 'Playlists'          },
  { key: 'tournaments',  label: 'Tournaments'        },
  { key: 'crm',          label: 'CRM'                },
  { key: 'leaderboard',  label: 'Leaderboard'        },
  { key: 'scenarios',    label: 'Scenario Builder'   },
  { key: 'groups',       label: 'Groups / Cohorts'   },
];

const inputCls   = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

// ─── Sub-tab: Schools ─────────────────────────────────────────────────────────

function SchoolsSubTab() {
  const [schools,       setSchools]       = useState([]);
  const [health,        setHealth]        = useState(null);
  const [loadingList,   setLoadingList]   = useState(true);
  const [editingSchool, setEditingSchool] = useState(null);
  const [schoolFeats,   setSchoolFeats]   = useState({});
  const [maxStudents,   setMaxStudents]   = useState('');
  const [maxCoaches,    setMaxCoaches]    = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saveMsg,       setSaveMsg]       = useState('');
  const [loadErr,       setLoadErr]       = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/admin/schools'),
      fetch('/health').then(r => r.json()).catch(() => null),
    ]).then(([schoolData, healthData]) => {
      setSchools(schoolData.schools ?? schoolData ?? []);
      setHealth(healthData);
    }).catch(() => setLoadErr('Failed to load platform data.'))
      .finally(() => setLoadingList(false));
  }, []);

  async function openEdit(school) {
    setEditingSchool(school);
    setMaxStudents(school.max_students != null ? String(school.max_students) : '');
    setMaxCoaches(school.max_coaches != null ? String(school.max_coaches) : '');
    setSaveMsg('');
    try {
      const data = await apiFetch(`/api/admin/schools/${school.id}/features`);
      setSchoolFeats(data.features ?? {});
    } catch {
      setSchoolFeats({});
    }
  }

  async function saveAgreement() {
    if (!editingSchool) return;
    setSaving(true); setSaveMsg('');
    try {
      await Promise.all([
        apiFetch(`/api/admin/schools/${editingSchool.id}/features`, {
          method: 'PUT',
          body: JSON.stringify(schoolFeats),
        }),
        apiFetch(`/api/admin/schools/${editingSchool.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            maxStudents: maxStudents !== '' ? Number(maxStudents) : null,
            maxCoaches:  maxCoaches  !== '' ? Number(maxCoaches)  : null,
          }),
        }),
      ]);
      setSaveMsg('Saved.');
      apiFetch('/api/admin/schools').then(d => setSchools(d.schools ?? d ?? [])).catch(() => {});
    } catch {
      setSaveMsg('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {loadErr && <p className="text-sm" style={{ color: colors.error }}>{loadErr}</p>}

      {/* System health */}
      <Card>
        <SectionHeader title="System Health" />
        {health ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: health.db === 'ok' ? colors.success : colors.error }}>●</span>
              <span style={{ color: colors.textPrimary }}>
                Database: <span style={{ color: health.db === 'ok' ? colors.success : colors.error }}>{health.db}</span>
              </span>
            </div>
            <div className="text-sm" style={{ color: colors.textPrimary }}>
              Active tables: <span style={{ color: colors.gold }}>{health.tables ?? 0}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: colors.textMuted }}>{loadingList ? 'Loading…' : 'Health unavailable.'}</p>
        )}
      </Card>

      {/* Schools */}
      <Card>
        <SectionHeader title="School Agreements" />
        {loadingList ? (
          <p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${colors.borderStrong}` }}>
              <div
                className="grid text-xs font-bold uppercase tracking-widest px-4 py-2"
                style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderBottom: `1px solid ${colors.borderStrong}`, color: colors.textMuted }}
              >
                <span>School</span>
                <span className="text-right">Students</span>
                <span className="text-right">Coaches</span>
                <span className="text-right">Status</span>
              </div>
              {schools.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: colors.textMuted }}>No schools found.</p>
              )}
              {schools.map(s => (
                <div
                  key={s.id}
                  className="grid items-center px-4 py-3"
                  style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderTop: `1px solid ${colors.borderDefault}` }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.name}</div>
                    <button className="text-xs mt-0.5" style={{ color: colors.gold }} onClick={() => openEdit(s)}>Edit</button>
                  </div>
                  <span className="text-sm text-right" style={{ color: colors.textPrimary }}>
                    {s.students ?? 0}{s.max_students ? `/${s.max_students}` : ''}
                  </span>
                  <span className="text-sm text-right" style={{ color: colors.textPrimary }}>
                    {s.coaches ?? 0}{s.max_coaches ? `/${s.max_coaches}` : ''}
                  </span>
                  <span className="text-xs font-semibold text-right" style={{ color: s.status === 'active' ? colors.success : colors.textMuted }}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>

            {editingSchool && (
              <div className="mt-2 rounded-lg p-4" style={{ border: `1px solid ${colors.borderStrong}`, background: colors.bgSurface }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>{editingSchool.name}</span>
                  <button className="text-xs" style={{ color: colors.textMuted }} onClick={() => setEditingSchool(null)}>✕ Close</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Max students">
                    <Input value={maxStudents} onChange={setMaxStudents} type="number" min="0" placeholder="No limit" />
                  </Field>
                  <Field label="Max coaches">
                    <Input value={maxCoaches} onChange={setMaxCoaches} type="number" min="0" placeholder="No limit" />
                  </Field>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.textMuted }}>Feature Toggles</span>
                <div className="mt-2 flex flex-col gap-2 mb-4">
                  {PLATFORM_FEATURES.map(f => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schoolFeats[f.key] !== false}
                        onChange={() => setSchoolFeats(prev => ({ ...prev, [f.key]: !(prev[f.key] !== false) }))}
                        style={{ accentColor: colors.gold }}
                      />
                      <span className="text-sm" style={{ color: colors.textPrimary }}>{f.label}</span>
                    </label>
                  ))}
                </div>
                {saveMsg && (
                  <p className="text-xs mb-2" style={{ color: saveMsg === 'Saved.' ? colors.success : colors.error }}>{saveMsg}</p>
                )}
                <button
                  onClick={saveAgreement}
                  disabled={saving}
                  className="px-5 py-2 rounded text-sm font-bold"
                  style={{ background: colors.gold, color: colors.bgSurface, opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ─── Sub-tab: Platform Defaults (absorbed from OrgTab) ────────────────────────

function GroupPolicySection() {
  const [policy, setPolicy]     = useState({ enabled: true, max_groups: '', max_players_per_group: '' });
  const [schools, setSchools]   = useState([]);
  const [loaded, setLoaded]     = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');
  const [schoolPolicies, setSchoolPolicies] = useState({});
  const [expandedSchool, setExpandedSchool] = useState(null);
  const [schoolSaving, setSchoolSaving]     = useState(null);

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
      setPolicy({ enabled: result.enabled, max_groups: result.max_groups ?? '', max_players_per_group: result.max_players_per_group ?? '' });
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

  if (!loaded) return <p className="text-xs" style={{ color: colors.textMuted }}>Loading…</p>;

  return (
    <>
      <SectionHeader title="Group Policy" />
      <p className="text-xs mb-3" style={{ color: colors.textMuted }}>Platform defaults. Individual schools can override these limits.</p>
      <Field label="Groups enabled by default">
        <Toggle value={policy.enabled} onChange={v => setPolicy(p => ({ ...p, enabled: v }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max groups per school" hint="Leave blank = unlimited">
          <Input type="number" value={String(policy.max_groups)} onChange={v => setPolicy(p => ({ ...p, max_groups: v }))} placeholder="Unlimited" />
        </Field>
        <Field label="Max players per group" hint="Leave blank = unlimited">
          <Input type="number" value={String(policy.max_players_per_group)} onChange={v => setPolicy(p => ({ ...p, max_players_per_group: v }))} placeholder="Unlimited" />
        </Field>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <SaveButton onClick={saveOrgPolicy} label={saving ? 'Saving…' : 'Save Defaults'} />
        {saveMsg && <span className="text-xs" style={{ color: saveMsg === 'Saved.' ? colors.success : colors.error }}>{saveMsg}</span>}
      </div>
      {schools.length > 0 && (
        <>
          <p className="text-xs font-bold tracking-widest uppercase mb-2" style={{ color: colors.textMuted }}>School Overrides</p>
          <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}` }}>
            {schools.map((s, i) => {
              const isOpen = expandedSchool === s.id;
              const sp     = schoolPolicies[s.id];
              return (
                <div key={s.id} style={{ borderBottom: i < schools.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}>
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={async () => { if (!isOpen) { await loadSchoolPolicy(s.id); setExpandedSchool(s.id); } else setExpandedSchool(null); }}
                  >
                    <span className="flex-1 text-sm font-semibold" style={{ color: colors.textPrimary }}>{s.name}</span>
                    {sp && (
                      <span className="text-xs" style={{ color: sp.enabled !== false ? colors.success : colors.textMuted }}>
                        {sp.enabled !== false ? 'ON' : 'OFF'}
                        {sp.max_groups !== '' ? ` · max ${sp.max_groups} groups` : ''}
                        {sp.max_players_per_group !== '' ? ` · ${sp.max_players_per_group}/group` : ''}
                      </span>
                    )}
                    <span style={{ color: colors.textMuted, fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && sp && (
                    <div className="px-4 pb-4 flex flex-col gap-3" style={{ background: colors.bgSurface }}>
                      <Field label="Groups enabled">
                        <Toggle value={sp.enabled !== false} onChange={v => setSchoolPolicyField(s.id, 'enabled', v)} />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Max groups" hint="Blank = use default">
                          <Input type="number" value={String(sp.max_groups)} onChange={v => setSchoolPolicyField(s.id, 'max_groups', v)} placeholder={policy.max_groups !== '' ? `Default (${policy.max_groups})` : 'Unlimited'} />
                        </Field>
                        <Field label="Max per group" hint="Blank = use default">
                          <Input type="number" value={String(sp.max_players_per_group)} onChange={v => setSchoolPolicyField(s.id, 'max_players_per_group', v)} placeholder={policy.max_players_per_group !== '' ? `Default (${policy.max_players_per_group})` : 'Unlimited'} />
                        </Field>
                      </div>
                      <SaveButton onClick={() => saveSchoolPolicy(s.id)} label={schoolSaving === s.id ? 'Saving…' : 'Save Override'} />
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

function PlatformDefaultsSubTab() {
  const [loading, setLoading]       = useState(true);
  const [structures, setStructures] = useState([]);
  const [editingStruct, setEditingStruct] = useState(null);
  const [newStruct, setNewStruct]   = useState({ label: '', sb: '', bb: '', ante: '0' });
  const [addingStruct, setAddingStruct]   = useState(false);
  const [structMsg, setStructMsg]   = useState('');
  const [limits, setLimits]         = useState({ max_tables_per_student: 4, max_players_per_table: 9, trial_days: 7, trial_hand_limit: 500 });
  const [limitsSaving, setLimitsSaving]   = useState(false);
  const [limitsMsg, setLimitsMsg]   = useState('');
  const [autospawn, setAutospawn]   = useState({ enabled: false, occupancy_threshold: 60, default_config: 'low' });
  const [spawnSaving, setSpawnSaving]     = useState(false);
  const [spawnMsg, setSpawnMsg]     = useState('');
  const [leaderboard, setLeaderboard] = useState({ columns: [...DEFAULT_COLUMNS], sort_by: DEFAULT_SORT_BY, update_frequency: 'after_session' });
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

  async function handleSaveLimits() {
    setLimitsSaving(true); setLimitsMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/limits', { method: 'PUT', body: JSON.stringify(limits) });
      setLimits(updated); setLimitsMsg('Saved.');
    } catch (err) { setLimitsMsg(err.message || 'Save failed.'); }
    finally { setLimitsSaving(false); }
  }

  async function handleSaveSpawn() {
    setSpawnSaving(true); setSpawnMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/autospawn', { method: 'PUT', body: JSON.stringify(autospawn) });
      setAutospawn(updated); setSpawnMsg('Saved.');
    } catch (err) { setSpawnMsg(err.message || 'Save failed.'); }
    finally { setSpawnSaving(false); }
  }

  async function handleSaveLeaderboard() {
    setLbSaving(true); setLbMsg('');
    try {
      const updated = await apiFetch('/api/admin/org-settings/leaderboard', { method: 'PUT', body: JSON.stringify(leaderboard) });
      setLeaderboard(updated); setLbMsg('Saved.');
    } catch (err) { setLbMsg(err.message || 'Save failed.'); }
    finally { setLbSaving(false); }
  }

  if (loading) return <Card><p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p></Card>;

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
        These apply platform-wide. Coaches can override leaderboard and blind structures for their school.
      </p>

      {/* Blind Structures */}
      <SectionHeader title="Default Blind Structures" />
      <div className="rounded-lg overflow-hidden mb-2" style={{ border: `1px solid ${colors.borderStrong}` }}>
        {structures.map((s, i) => {
          const isEditing = editingStruct?.id === s.id;
          const ed = editingStruct ?? s;
          return (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5"
              style={{ borderBottom: i < structures.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}>
              {isEditing ? (
                <>
                  <input value={ed.label} onChange={e => setEditingStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 90 }} placeholder="Label" />
                  <input value={ed.sb}    onChange={e => setEditingStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="SB" type="number" />
                  <input value={ed.bb}    onChange={e => setEditingStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="BB" type="number" />
                  <input value={ed.ante}  onChange={e => setEditingStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 60 }} placeholder="Ante" type="number" />
                  <button onClick={() => handleSaveStruct(editingStruct)} className="text-xs font-semibold" style={{ color: colors.gold }}>Save</button>
                  <button onClick={() => setEditingStruct(null)} className="text-xs" style={{ color: colors.textMuted }}>Cancel</button>
                </>
              ) : (
                <>
                  <span className="w-20 font-semibold text-sm" style={{ color: colors.textPrimary }}>{s.label}</span>
                  <span className="text-sm flex-1" style={{ color: colors.textMuted }}>{s.sb}/{s.bb}{s.ante > 0 ? ` · ante ${s.ante}` : ''}</span>
                  <button onClick={() => setEditingStruct({ ...s })} className="text-xs" style={{ color: colors.gold }}>Edit</button>
                  <button onClick={() => handleDeleteStruct(s.id)} className="text-xs" style={{ color: colors.error }}>✕</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!addingStruct ? (
        <button onClick={() => setAddingStruct(true)} className="text-sm font-semibold mb-3" style={{ color: colors.gold }}>+ Add Structure</button>
      ) : (
        <form onSubmit={handleAddStruct} className="flex flex-wrap gap-2 mb-3 items-end">
          <input value={newStruct.label} onChange={e => setNewStruct(x => ({ ...x, label: e.target.value }))} className={inputCls} style={{ ...inputStyle, width: 100 }} placeholder="Label" />
          <input value={newStruct.sb}    onChange={e => setNewStruct(x => ({ ...x, sb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="SB" type="number" />
          <input value={newStruct.bb}    onChange={e => setNewStruct(x => ({ ...x, bb: e.target.value }))}    className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="BB" type="number" />
          <input value={newStruct.ante}  onChange={e => setNewStruct(x => ({ ...x, ante: e.target.value }))}  className={inputCls} style={{ ...inputStyle, width: 70 }} placeholder="Ante" type="number" />
          <button type="submit" className="px-3 py-1.5 rounded text-sm font-semibold" style={{ background: colors.gold, color: colors.bgSurface }}>Add</button>
          <button type="button" onClick={() => setAddingStruct(false)} className="text-sm" style={{ color: colors.textMuted }}>Cancel</button>
        </form>
      )}
      {structMsg && <p className="text-xs mb-2" style={{ color: colors.error }}>{structMsg}</p>}

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Platform Limits */}
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
        <button onClick={handleSaveLimits} disabled={limitsSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: limitsSaving ? 0.6 : 1 }}>
          {limitsSaving ? 'Saving…' : 'Save Limits'}
        </button>
        {limitsMsg && <span className="text-xs" style={{ color: colors.success }}>{limitsMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Autospawn */}
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
        <button onClick={handleSaveSpawn} disabled={spawnSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: spawnSaving ? 0.6 : 1 }}>
          {spawnSaving ? 'Saving…' : 'Save Autospawn'}
        </button>
        {spawnMsg && <span className="text-xs" style={{ color: colors.success }}>{spawnMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Leaderboard */}
      <SectionHeader title="Leaderboard Defaults" />
      <LeaderboardColumnPicker
        columns={leaderboard.columns ?? DEFAULT_COLUMNS}
        sortBy={leaderboard.sort_by ?? DEFAULT_SORT_BY}
        onChange={(columns, sort_by) => setLeaderboard(l => ({ ...l, columns, sort_by }))}
      />
      <Field label="Update frequency">
        <Select value={leaderboard.update_frequency} onChange={v => setLeaderboard(l => ({ ...l, update_frequency: v }))}>
          {['after_session', 'hourly', 'daily'].map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
        </Select>
      </Field>
      <div className="flex items-center gap-3 mt-3 mb-4">
        <button onClick={handleSaveLeaderboard} disabled={lbSaving} className="px-5 py-2 rounded text-sm font-bold" style={{ background: colors.gold, color: colors.bgSurface, opacity: lbSaving ? 0.6 : 1 }}>
          {lbSaving ? 'Saving…' : 'Save Leaderboard'}
        </button>
        {lbMsg && <span className="text-xs" style={{ color: colors.success }}>{lbMsg}</span>}
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      <GroupPolicySection />
    </Card>
  );
}

// ─── Tab: Platform ────────────────────────────────────────────────────────────

export default function PlatformTab() {
  const [subTab, setSubTab] = useState('schools');

  const SUB_TABS = [
    { id: 'schools',  label: 'Schools'           },
    { id: 'defaults', label: 'Platform Defaults'  },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold" style={{ color: colors.error }}>Super Admin only.</p>

      {/* Sub-tab switcher */}
      <div className="flex gap-1" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
        {SUB_TABS.map(t => {
          const active = t.id === subTab;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className="px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-t"
              style={{
                color:        active ? colors.gold    : colors.textMuted,
                background:   active ? colors.goldSubtle : 'transparent',
                borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === 'schools'  && <SchoolsSubTab />}
      {subTab === 'defaults' && <PlatformDefaultsSubTab />}
    </div>
  );
}
