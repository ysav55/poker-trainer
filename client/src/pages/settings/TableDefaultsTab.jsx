import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { SectionHeader, Field, Input, Select, Toggle, SaveButton, Card } from './shared.jsx';
import { colors } from '../../lib/colors.js';

// ─── Table Defaults helpers ───────────────────────────────────────────────────

// Maps API key → form field name
const TD_KEY_TO_FIELD = {
  'table.default_game_type':          'gameType',
  'table.default_max_players':        'maxPlayers',
  'table.default_privacy':            'privacy',
  'table.default_sb':                 'sb',
  'table.default_bb':                 'bb',
  'table.default_ante':               'ante',
  'table.buy_in_min_bb':              'minBuyInBB',
  'table.buy_in_max_bb':              'maxBuyInBB',
  'table.default_starting_stack':     'defaultStack',
  'table.rebuy_allowed':              'allowRebuy',
  'table.rebuy_max':                  'maxRebuys',
  'table.time_bank_per_decision':     'decisionSecs',
  'table.time_bank_per_session':      'timeBankSecs',
  'table.show_at_showdown':           'showAllAtShowdown',
  'table.allow_muck_river':           'allowMuck',
  'table.coach_disconnect':           'coachDisconnect',
  'table.student_disconnect_timeout': 'studentDisconnectMins',
};

const TD_FIELD_TO_KEY = Object.fromEntries(
  Object.entries(TD_KEY_TO_FIELD).map(([k, v]) => [v, k])
);

const TD_DEFAULTS_FORM = {
  gameType: 'cash', maxPlayers: 9, privacy: 'school',
  sb: 25, bb: 50, ante: 0,
  minBuyInBB: 20, maxBuyInBB: 100, defaultStack: 2500,
  allowRebuy: true, maxRebuys: 3,
  decisionSecs: 30, timeBankSecs: 120,
  showAllAtShowdown: true, allowMuck: true,
  coachDisconnect: 'pause', studentDisconnectMins: 5,
};

function defaultsApiToForm(apiDefaults) {
  const form = { ...TD_DEFAULTS_FORM };
  const scopeMap = {};
  for (const { key, value, source_scope } of apiDefaults) {
    const field = TD_KEY_TO_FIELD[key];
    if (field) { form[field] = value; scopeMap[field] = source_scope; }
  }
  return { form, scopeMap };
}

function CascadeLabel({ field, scopeMap, dirty, isAdmin }) {
  const isDirty       = dirty.has(field);
  const isOverridden  = isDirty || scopeMap[field] === 'school' || (isAdmin && scopeMap[field] === 'org');
  if (!scopeMap[field] && !isDirty) return null;
  return (
    <span className="text-xs ml-2" style={{ color: isOverridden ? colors.warning : colors.textMuted }}>
      {isOverridden ? '(overridden)' : isAdmin ? '(app default)' : '(platform default)'}
    </span>
  );
}

// ─── Tab: Table Defaults ──────────────────────────────────────────────────────

export default function TableDefaultsTab() {
  const { user } = useAuth();
  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  const [form, setForm]         = useState(TD_DEFAULTS_FORM);
  const [scopeMap, setScopeMap] = useState({});   // field → source_scope
  const [dirty, setDirty]       = useState(new Set());
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [resetting, setResetting] = useState(false);
  const [msg, setMsg]           = useState('');

  // Presets
  const [presets, setPresets]         = useState([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [savingPreset, setSavingPreset]   = useState(false);

  useEffect(() => { loadDefaults(); }, []);

  async function loadDefaults() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/settings/table-defaults');
      const { form: f, scopeMap: sm } = defaultsApiToForm(data.defaults ?? []);
      setForm(f);
      setScopeMap(sm);
      setDirty(new Set());
    } catch { setMsg('Failed to load defaults.'); }
    finally { setLoading(false); }
  }

  async function loadPresets() {
    try {
      const data = await apiFetch('/api/settings/presets');
      setPresets(data.presets ?? []);
    } catch { /* non-critical */ }
  }

  useEffect(() => { loadPresets(); }, []);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
    setDirty(d => new Set([...d, field]));
  }

  async function handleSave() {
    if (dirty.size === 0) { setMsg('No changes.'); return; }
    setSaving(true); setMsg('');
    const settings = {};
    for (const field of dirty) {
      const key = TD_FIELD_TO_KEY[field];
      if (key) settings[key] = form[field];
    }
    try {
      await apiFetch('/api/settings/table-defaults', { method: 'PUT', body: JSON.stringify({ settings }) });
      await loadDefaults();
      setMsg('Saved.');
    } catch (err) { setMsg(err.message || 'Save failed.'); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    if (!window.confirm('Reset all defaults to platform values? This cannot be undone.')) return;
    setResetting(true); setMsg('');
    try {
      await apiFetch('/api/settings/table-defaults', { method: 'DELETE' });
      await loadDefaults();
      setMsg('Reset to platform defaults.');
    } catch (err) { setMsg(err.message || 'Reset failed.'); }
    finally { setResetting(false); }
  }

  async function handleSavePreset() {
    if (!newPresetName.trim()) return;
    setSavingPreset(true);
    try {
      await apiFetch('/api/settings/presets', {
        method: 'POST',
        body: JSON.stringify({ name: newPresetName.trim(), config: form }),
      });
      setNewPresetName('');
      await loadPresets();
    } catch { /* silently ignore */ }
    finally { setSavingPreset(false); }
  }

  async function handleDeletePreset(id) {
    try {
      await apiFetch(`/api/settings/presets/${id}`, { method: 'DELETE' });
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch { /* silently ignore */ }
  }

  const lp = { scopeMap, dirty, isAdmin };

  if (loading) return <Card><p className="text-sm" style={{ color: colors.textMuted }}>Loading…</p></Card>;

  const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
  const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: colors.textMuted }}>
        New tables in your school will use these settings. Each table can override at creation.
      </p>

      <SectionHeader title="General" />
      <Field label={<span>Default game type <CascadeLabel field="gameType" {...lp} /></span>}>
        <Select value={form.gameType} onChange={v => set('gameType', v)}>
          {['cash', 'tournament'].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </Select>
      </Field>
      <Field label={<span>Default max players <CascadeLabel field="maxPlayers" {...lp} /></span>}>
        <Select value={String(form.maxPlayers)} onChange={v => set('maxPlayers', Number(v))}>
          {[2, 4, 6, 8, 9].map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label={<span>Default privacy <CascadeLabel field="privacy" {...lp} /></span>}>
        <Select value={form.privacy} onChange={v => set('privacy', v)}>
          {['open', 'school', 'private'].map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
        </Select>
      </Field>

      <SectionHeader title="Blinds" />
      <div className="grid grid-cols-3 gap-3">
        <Field label={<span>Small blind <CascadeLabel field="sb" {...lp} /></span>}>
          <Input type="number" value={form.sb} onChange={v => set('sb', Number(v))} />
        </Field>
        <Field label={<span>Big blind <CascadeLabel field="bb" {...lp} /></span>}>
          <Input type="number" value={form.bb} onChange={v => set('bb', Number(v))} />
        </Field>
        <Field label={<span>Ante <CascadeLabel field="ante" {...lp} /></span>}>
          <Input type="number" value={form.ante} onChange={v => set('ante', Number(v))} />
        </Field>
      </div>

      <SectionHeader title="Buy-In (play chips)" />
      <div className="grid grid-cols-2 gap-3">
        <Field label={<span>Min buy-in (BB) <CascadeLabel field="minBuyInBB" {...lp} /></span>}>
          <Input type="number" value={form.minBuyInBB} onChange={v => set('minBuyInBB', Number(v))} />
        </Field>
        <Field label={<span>Max buy-in (BB) <CascadeLabel field="maxBuyInBB" {...lp} /></span>}>
          <Input type="number" value={form.maxBuyInBB} onChange={v => set('maxBuyInBB', Number(v))} />
        </Field>
      </div>
      <Field label={<span>Default starting stack <CascadeLabel field="defaultStack" {...lp} /></span>}>
        <Input type="number" value={form.defaultStack} onChange={v => set('defaultStack', Number(v))} />
      </Field>

      <SectionHeader title="Rebuy" />
      <Field label={<span>Allow rebuy <CascadeLabel field="allowRebuy" {...lp} /></span>}>
        <Toggle value={form.allowRebuy} onChange={v => set('allowRebuy', v)} />
      </Field>
      {form.allowRebuy && (
        <Field label={<span>Max rebuys <CascadeLabel field="maxRebuys" {...lp} /></span>}>
          <Input type="number" value={form.maxRebuys} onChange={v => set('maxRebuys', Number(v))} />
        </Field>
      )}

      <SectionHeader title="Time Bank" />
      <Field label={<span>Seconds per decision <CascadeLabel field="decisionSecs" {...lp} /></span>}>
        <Input type="number" value={form.decisionSecs} onChange={v => set('decisionSecs', Number(v))} />
      </Field>
      <Field label={<span>Time bank per session (sec) <CascadeLabel field="timeBankSecs" {...lp} /></span>}>
        <Input type="number" value={form.timeBankSecs} onChange={v => set('timeBankSecs', Number(v))} />
      </Field>

      <SectionHeader title="Showdown" />
      <Field label={<span>Show all hands at showdown <CascadeLabel field="showAllAtShowdown" {...lp} /></span>}>
        <Toggle value={form.showAllAtShowdown} onChange={v => set('showAllAtShowdown', v)} />
      </Field>
      <Field label={<span>Allow muck at river <CascadeLabel field="allowMuck" {...lp} /></span>}>
        <Toggle value={form.allowMuck} onChange={v => set('allowMuck', v)} />
      </Field>

      <SectionHeader title="Disconnection" />
      <Field label={<span>Coach disconnect <CascadeLabel field="coachDisconnect" {...lp} /></span>}>
        <Select value={form.coachDisconnect} onChange={v => set('coachDisconnect', v)}>
          {['pause', 'continue', 'moderator'].map(o => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </Select>
      </Field>
      <Field label={<span>Student disconnect timeout (min) <CascadeLabel field="studentDisconnectMins" {...lp} /></span>}>
        <Input type="number" value={form.studentDisconnectMins} onChange={v => set('studentDisconnectMins', Number(v))} />
      </Field>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      {/* Quick Pick Presets */}
      <SectionHeader title="Quick Pick Presets" />
      {presets.length > 0 && (
        <div className="rounded-lg overflow-hidden mb-3" style={{ border: `1px solid ${colors.borderStrong}` }}>
          {presets.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
              style={{ borderBottom: i < presets.length - 1 ? `1px solid ${colors.borderDefault}` : 'none' }}
            >
              <span className="flex-1 font-semibold" style={{ color: colors.textPrimary }}>{p.name}</span>
              <button
                onClick={() => handleDeletePreset(p.id)}
                className="text-xs"
                style={{ color: colors.error }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 mb-2">
        <input
          value={newPresetName}
          onChange={e => setNewPresetName(e.target.value)}
          placeholder="Preset name…"
          className={inputCls}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={handleSavePreset}
          disabled={savingPreset || !newPresetName.trim()}
          className="px-3 py-1.5 rounded text-sm font-semibold"
          style={{ background: colors.gold, color: colors.bgSurface, opacity: savingPreset ? 0.6 : 1 }}
        >
          Save current as preset
        </button>
      </div>

      <div className="my-4" style={{ borderTop: `1px solid ${colors.borderDefault}` }} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || dirty.size === 0}
          className="px-5 py-2 rounded text-sm font-bold"
          style={{ background: colors.gold, color: colors.bgSurface, opacity: saving || dirty.size === 0 ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Defaults'}
        </button>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="px-5 py-2 rounded text-sm font-semibold"
          style={{ background: colors.borderDefault, color: colors.textPrimary, border: `1px solid ${colors.borderStrong}`, opacity: resetting ? 0.6 : 1 }}
        >
          {resetting ? 'Resetting…' : 'Reset to platform defaults'}
        </button>
        {msg && (
          <span className="text-xs" style={{ color: msg.includes('fail') ? colors.error : colors.success }}>
            {msg}
          </span>
        )}
      </div>
    </Card>
  );
}
