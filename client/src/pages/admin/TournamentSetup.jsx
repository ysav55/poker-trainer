import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_LEVEL = { sb: 25, bb: 50, ante: 0, durationMin: 20 };
const FILTER_TABS   = ['Upcoming', 'Active', 'Completed'];

const STATUS_MAP = {
  Upcoming:  ['pending'],
  Active:    ['running', 'paused'],
  Completed: ['finished'],
};

const STATUS_COLORS = {
  pending:  { bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)',  text: '#93c5fd' },
  running:  { bg: 'rgba(63,185,80,0.1)',   border: 'rgba(63,185,80,0.3)',   text: '#3fb950' },
  paused:   { bg: 'rgba(227,179,65,0.1)',  border: 'rgba(227,179,65,0.3)',  text: '#e3b341' },
  finished: { bg: 'rgba(110,118,129,0.1)', border: 'rgba(110,118,129,0.3)', text: '#6e7681' },
};

function makeLevel(prev) {
  if (!prev) return { ...DEFAULT_LEVEL };
  return { sb: prev.sb * 2, bb: prev.bb * 2, ante: prev.ante ? prev.ante * 2 : 0, durationMin: prev.durationMin };
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function NumberInput({ value, onChange, width = 80, min = 0, placeholder = '' }) {
  return (
    <input
      type="number" value={value} min={min} placeholder={placeholder}
      onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className="rounded text-sm outline-none text-center"
      style={{ width, background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', padding: '5px 6px' }}
      onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
      onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
    />
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.finished;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 3, background: c.bg, border: `1px solid ${c.border}`, color: c.text,
    }}>
      {status}
    </span>
  );
}

// ── Tournament Card ───────────────────────────────────────────────────────────

function TournamentCard({ t, onOpen }) {
  const levels = Array.isArray(t.blind_structure) ? t.blind_structure.length : 0;
  return (
    <div
      onClick={onOpen}
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: '14px 16px', cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)'; e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.background = '#161b22'; }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0ece3' }}>{t.name}</div>
        <StatusBadge status={t.status} />
      </div>
      <div className="flex items-center gap-4" style={{ fontSize: 11, color: '#6e7681' }}>
        <span>Starting stack: <strong style={{ color: '#8b949e' }}>{(t.starting_stack ?? 0).toLocaleString()}</strong></span>
        <span>{levels} level{levels !== 1 ? 's' : ''}</span>
        {t.rebuy_allowed && <span style={{ color: '#e3b341' }}>Rebuys on</span>}
      </div>
      {t.created_at && (
        <div style={{ fontSize: 10, color: '#444', marginTop: 6 }}>
          Created {new Date(t.created_at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}

// ── Blind Level Row ───────────────────────────────────────────────────────────

function LevelRow({ index, level, isFirst, isLast, onChange, onMove, onRemove }) {
  const field = k => v => onChange(index, { ...level, [k]: v });
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2.5"
      style={{ background: index % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.6)', border: '1px solid #21262d' }}>
      <span className="text-xs font-bold tracking-wider flex-shrink-0"
        style={{ minWidth: 48, textAlign: 'center', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 4, padding: '3px 6px', color: '#d4af37' }}>
        LVL {index + 1}
      </span>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>SB</span>
        <NumberInput value={level.sb} onChange={field('sb')} width={72} min={1} />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>BB</span>
        <NumberInput value={level.bb} onChange={field('bb')} width={72} min={1} />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>Ante</span>
        <NumberInput value={level.ante} onChange={field('ante')} width={60} />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-xs" style={{ color: '#6e7681' }}>Mins</span>
        <NumberInput value={level.durationMin} onChange={field('durationMin')} width={60} min={1} />
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => onMove(index, 'up')} disabled={isFirst}
          style={{ width: 24, height: 24, background: 'none', border: '1px solid #30363d', borderRadius: 3, color: '#6e7681', cursor: isFirst ? 'not-allowed' : 'pointer', opacity: isFirst ? 0.3 : 1, fontSize: 10 }}>
          ▲
        </button>
        <button onClick={() => onMove(index, 'down')} disabled={isLast}
          style={{ width: 24, height: 24, background: 'none', border: '1px solid #30363d', borderRadius: 3, color: '#6e7681', cursor: isLast ? 'not-allowed' : 'pointer', opacity: isLast ? 0.3 : 1, fontSize: 10 }}>
          ▼
        </button>
        <button onClick={() => onRemove(index)} disabled={index === 0}
          style={{ width: 24, height: 24, background: 'none', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 3, color: '#f85149', cursor: index === 0 ? 'not-allowed' : 'pointer', opacity: index === 0 ? 0.3 : 1, fontSize: 14 }}>
          ×
        </button>
      </div>
    </div>
  );
}

// ── 5-Step Wizard Modal ────────────────────────────────────────────────────────

const STEPS = ['Basic Info', 'Blind Structure', 'Payout Structure', 'Rules', 'Review'];

export function WizardModal({ onClose, onCreated }) {
  const [step, setStep] = useState(0);

  // Step 0 — Basic Info
  const [name, setName]                   = useState('');
  const [startingStack, setStack]         = useState(10000);
  const [buyIn, setBuyIn]                 = useState(0);
  const [minPlayers, setMinPlayers]       = useState(6);
  const [scheduledStartAt, setScheduledStartAt] = useState('');

  // Step 2 — Blind Structure
  const [levels, setLevels] = useState([
    { sb: 25, bb: 50, ante: 0, durationMin: 20 },
    { sb: 50, bb: 100, ante: 0, durationMin: 20 },
    { sb: 100, bb: 200, ante: 25, durationMin: 20 },
  ]);
  const [blindPresets, setBlindPresets]     = useState({ system: [], school: [] });
  const [selectedPresetId, setSelectedPresetId] = useState('custom');
  const [showLevelEditor, setShowLevelEditor]   = useState(false);
  const [saveAsPreset, setSaveAsPreset]         = useState(false);
  const [newPresetName, setNewPresetName]       = useState('');

  // Step 3 — Payout Structure
  const [payouts, setPayouts] = useState([
    { place: 1, percent: 50 },
    { place: 2, percent: 30 },
    { place: 3, percent: 20 },
  ]);
  const [payoutPresets, setPayoutPresets]         = useState({ system: [], school: [] });
  const [payoutPresetId, setPayoutPresetId]       = useState('custom');
  const [payoutMethod, setPayoutMethod]           = useState('flat');   // 'flat' | 'icm'
  const [showIcmOverlay, setShowIcmOverlay]       = useState(false);
  const [dealThreshold, setDealThreshold]         = useState(0);

  // Step 4 — Rules
  const [rebuyAllowed, setRebuy]  = useState(false);
  const [addonAllowed, setAddon]  = useState(false);

  // Referee
  const [refPlayerId, setRefPlayerId] = useState('');
  const [privacy, setPrivacy]               = useState('public');
  const [lateRegEnabled, setLateRegEnabled] = useState(false);
  const [lateRegMinutes, setLateRegMinutes] = useState(20);

  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    apiFetch('/api/blind-presets')
      .then(data => {
        setBlindPresets({
          system: Array.isArray(data?.system) ? data.system : [],
          school: Array.isArray(data?.school) ? data.school : [],
        });
      })
      .catch(() => {}); // non-fatal — presets are optional

    apiFetch('/api/payout-presets')
      .then(data => {
        setPayoutPresets({
          system: Array.isArray(data?.system) ? data.system : [],
          school: Array.isArray(data?.school) ? data.school : [],
        });
      })
      .catch(() => {}); // non-fatal — presets are optional
  }, []);

  // Level helpers
  function handleLevelChange(idx, updated) {
    setLevels(prev => prev.map((l, i) => i === idx ? updated : l));
    setSelectedPresetId('custom'); // manual edit breaks preset binding
  }
  function handleLevelMove(idx, dir) {
    setLevels(prev => {
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }
  function handleLevelRemove(idx) {
    setLevels(prev => prev.filter((_, i) => i !== idx));
  }
  function handleAddLevel() {
    setLevels(prev => [...prev, makeLevel(prev[prev.length - 1])]);
  }

  // Payout helpers
  function handlePayoutChange(idx, field, val) {
    setPayouts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  }
  function addPayout() {
    setPayouts(prev => [...prev, { place: prev.length + 1, percent: 0 }]);
  }
  function removePayout(idx) {
    setPayouts(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      const blindSchedule = levels.map((l, i) => ({
        level: i + 1,
        sb: l.sb,
        bb: l.bb,
        ante: l.ante,
        duration_minutes: l.durationMin,
      }));
      const payoutStructure = payouts.map(p => ({ place: p.place, percentage: p.percent }));

      const data = await apiFetch('/api/tournament-groups', {
        method: 'POST',
        body: JSON.stringify({
          name,
          blindSchedule,
          startingStack,
          buyIn,
          privacy,
          scheduledAt:    scheduledStartAt || null,
          lateRegEnabled,
          lateRegMinutes,
          payoutStructure,
          payoutMethod,
          showIcmOverlay,
          dealThreshold,
          minPlayers,
          refPlayerId: refPlayerId.trim() || null,
        }),
      });

      if (saveAsPreset && newPresetName.trim() && levels.length > 0) {
        apiFetch('/api/blind-presets', {
          method: 'POST',
          body: JSON.stringify({ name: newPresetName.trim(), levels: blindSchedule }),
        }).catch(() => {});
      }

      onCreated(data);
      onClose();
    } catch (err) {
      setError(err.message ?? 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  const canNext = step === 0 ? !!name.trim() && startingStack > 0
    : step === 1 ? levels.length > 0
    : true;

  const sectionLabel = text => (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>
      {text}
    </div>
  );

  const fieldInput = (label, value, onChange, type = 'text') => (
    <div className="mb-4">
      {sectionLabel(label)}
      <input type={type} value={value} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full rounded px-3 py-2 text-sm outline-none"
        style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
        onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
        onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex flex-col rounded-xl"
        style={{
          width: '100%', maxWidth: 560, maxHeight: '88vh',
          background: '#0d1117', border: '1px solid #30363d', boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: '#d4af37', textTransform: 'uppercase' }}>
              New Tournament
            </span>
            <span style={{ fontSize: 10, color: '#6e7681', marginLeft: 12 }}>
              Step {step + 1} of {STEPS.length} — {STEPS[step]}
            </span>
          </div>
          <button onClick={onClose}
            style={{ width: 28, height: 28, borderRadius: 4, border: '1px solid #30363d', background: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#6e7681'; }}>
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 pt-4 pb-2 gap-1 flex-shrink-0">
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 99,
              background: i <= step ? '#d4af37' : '#21262d',
              transition: 'background 0.2s',
            }} />
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">

          {/* Step 0: Basic Info */}
          {step === 0 && (
            <div>
              {fieldInput('Tournament Name', name, setName)}
              {fieldInput('Starting Stack', startingStack, setStack, 'number')}
              {fieldInput('Buy-In Amount', buyIn, setBuyIn, 'number')}
              {fieldInput('Minimum Players to Start', minPlayers, setMinPlayers, 'number')}
              <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-xs tracking-widest uppercase" style={{ color: '#6e7681' }}>
                  Scheduled Start Time (optional)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledStartAt}
                  onChange={e => setScheduledStartAt(e.target.value)}
                  className="rounded text-sm outline-none px-3 py-2"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
                />
              </div>
              {/* Privacy */}
              <div className="mb-4">
                {sectionLabel('Visibility')}
                <div className="flex gap-3">
                  {['public', 'school', 'private'].map(v => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer" style={{ fontSize: 12, color: privacy === v ? '#d4af37' : '#8b949e' }}>
                      <input type="radio" name="privacy" value={v} checked={privacy === v} onChange={() => setPrivacy(v)}
                        style={{ accentColor: '#d4af37', cursor: 'pointer' }} />
                      {v.charAt(0).toUpperCase() + v.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              {/* Late Registration */}
              <div className="mb-4">
                {sectionLabel('Late Registration')}
                <label className="flex items-center gap-3 cursor-pointer mb-2" style={{ userSelect: 'none' }}>
                  <input type="checkbox" checked={lateRegEnabled} onChange={e => setLateRegEnabled(e.target.checked)}
                    style={{ accentColor: '#d4af37', width: 14, height: 14, cursor: 'pointer' }} />
                  <span style={{ fontSize: 12, color: '#c9d1d9' }}>Allow late registration</span>
                </label>
                {lateRegEnabled && (
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 11, color: '#6e7681' }}>Window duration (minutes):</span>
                    <NumberInput value={lateRegMinutes} onChange={setLateRegMinutes} width={72} min={1} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 1: Blind Structure */}
          {step === 1 && (
            <div>
              {/* Preset selector */}
              {sectionLabel('Blind Structure Preset')}
              <div className="mb-4">
                <select
                  value={selectedPresetId}
                  onChange={e => {
                    const id = e.target.value;
                    setSelectedPresetId(id);
                    if (id !== 'custom') {
                      const all = [...blindPresets.system, ...blindPresets.school];
                      const preset = all.find(p => String(p.id) === id);
                      if (preset?.levels) {
                        setLevels(preset.levels.map(l => ({
                          sb: l.sb,
                          bb: l.bb,
                          ante: l.ante ?? 0,
                          durationMin: l.duration_minutes ?? 20,
                        })));
                        setShowLevelEditor(false);
                      }
                    }
                  }}
                  className="w-full rounded px-3 py-2 text-sm outline-none"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236e7681\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
                >
                  {blindPresets.system.length > 0 && (
                    <optgroup label="System Presets">
                      {blindPresets.system.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                  {blindPresets.school.length > 0 && (
                    <optgroup label="School Presets">
                      {blindPresets.school.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Custom</option>
                </select>
              </div>

              {/* Read-only preview table when a preset is active */}
              {selectedPresetId !== 'custom' && !showLevelEditor && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    {sectionLabel('Preview')}
                    <button
                      onClick={() => setShowLevelEditor(true)}
                      style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: '#d4af37', background: 'none', border: '1px solid rgba(212,175,55,0.35)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', textTransform: 'uppercase' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.65)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'; }}
                    >
                      Edit levels
                    </button>
                  </div>
                  <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, color: '#c9d1d9' }}>
                      <thead>
                        <tr style={{ background: 'rgba(212,175,55,0.07)', borderBottom: '1px solid #30363d' }}>
                          {['Lvl', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6e7681' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {levels.map((lvl, i) => (
                          <tr key={i} style={{ borderBottom: i < levels.length - 1 ? '1px solid #21262d' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(22,27,34,0.5)' }}>
                            <td style={{ padding: '5px 10px', textAlign: 'center', color: '#d4af37', fontWeight: 700 }}>{i + 1}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'center' }}>{lvl.sb.toLocaleString()}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'center' }}>{lvl.bb.toLocaleString()}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'center' }}>{lvl.ante.toLocaleString()}</td>
                            <td style={{ padding: '5px 10px', textAlign: 'center' }}>{lvl.durationMin} min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Manual level editor — shown when custom OR after clicking "Edit levels" */}
              {(selectedPresetId === 'custom' || showLevelEditor) && (
                <div>
                  {sectionLabel('Blind Levels')}
                  <div className="flex flex-col gap-2 mb-3">
                    {levels.map((lvl, i) => (
                      <LevelRow key={i} index={i} level={lvl}
                        isFirst={i === 0} isLast={i === levels.length - 1}
                        onChange={handleLevelChange}
                        onMove={handleLevelMove}
                        onRemove={handleLevelRemove}
                      />
                    ))}
                  </div>
                  <button onClick={handleAddLevel}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                    style={{ background: 'none', border: '1px dashed rgba(212,175,55,0.35)', color: '#d4af37', cursor: 'pointer', width: '100%', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.65)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.35)'; }}>
                    + Add Level
                  </button>
                </div>
              )}

              {/* Save as preset — only when custom and at least one level exists */}
              {selectedPresetId === 'custom' && levels.length > 0 && (
                <div style={{ marginTop: 16, padding: '12px 14px', background: '#161b22', border: '1px solid #30363d', borderRadius: 6 }}>
                  <label className="flex items-center gap-3 cursor-pointer" style={{ userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={saveAsPreset}
                      onChange={e => setSaveAsPreset(e.target.checked)}
                      style={{ accentColor: '#d4af37', width: 14, height: 14, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 11, color: '#c9d1d9' }}>Save this structure as a preset for future use</span>
                  </label>
                  {saveAsPreset && (
                    <input
                      type="text"
                      value={newPresetName}
                      onChange={e => setNewPresetName(e.target.value)}
                      placeholder="e.g. Friday Night Turbo"
                      className="w-full rounded px-3 py-2 text-sm outline-none mt-3"
                      style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                      onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                      onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Payout Structure */}
          {step === 2 && (
            <div>
              {/* Payout preset selector */}
              {sectionLabel('Payout Preset')}
              <div className="mb-4">
                <select
                  value={payoutPresetId}
                  onChange={e => {
                    const id = e.target.value;
                    setPayoutPresetId(id);
                    if (id !== 'custom') {
                      const all = [...payoutPresets.system, ...payoutPresets.school];
                      const preset = all.find(p => String(p.id) === id);
                      if (preset?.tiers) {
                        setPayouts(preset.tiers.map(t => ({ place: t.position, percent: t.percentage })));
                      }
                    }
                  }}
                  className="w-full rounded px-3 py-2 text-sm outline-none"
                  style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%236e7681\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
                >
                  {payoutPresets.system.length > 0 && (
                    <optgroup label="System Presets">
                      {payoutPresets.system.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}{p.description ? ` — ${p.description}` : ''}</option>
                      ))}
                    </optgroup>
                  )}
                  {payoutPresets.school.length > 0 && (
                    <optgroup label="School Presets">
                      {payoutPresets.school.map(p => (
                        <option key={p.id} value={String(p.id)}>{p.name}{p.description ? ` — ${p.description}` : ''}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value="custom">Custom</option>
                </select>
              </div>

              {sectionLabel('Payout Places')}
              <div className="flex flex-col gap-2 mb-3">
                {payouts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3"
                    style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 6, padding: '8px 12px' }}>
                    <span style={{ fontSize: 11, color: '#d4af37', fontWeight: 700, minWidth: 30 }}>#{p.place}</span>
                    <NumberInput value={p.percent} onChange={v => handlePayoutChange(i, 'percent', v)} width={72} min={0} placeholder="%" />
                    <span style={{ fontSize: 11, color: '#6e7681' }}>%</span>
                    <button onClick={() => removePayout(i)}
                      style={{ marginLeft: 'auto', width: 24, height: 24, background: 'none', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 3, color: '#f85149', cursor: 'pointer', fontSize: 14 }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addPayout}
                style={{ background: 'none', border: '1px dashed rgba(212,175,55,0.35)', borderRadius: 6, color: '#d4af37', cursor: 'pointer', width: '100%', padding: '8px', fontSize: 12 }}>
                + Add Place
              </button>
              <div style={{ fontSize: 10, color: '#6e7681', marginTop: 8, marginBottom: 16 }}>
                Total: {payouts.reduce((s, p) => s + (Number(p.percent) || 0), 0)}%
              </div>

              {/* Payout method toggle */}
              {sectionLabel('Payout Method')}
              <div className="flex gap-3 mb-4">
                {[['flat', 'Flat'], ['icm', 'ICM']].map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer" style={{ userSelect: 'none' }}>
                    <input
                      type="radio"
                      name="payoutMethod"
                      value={val}
                      checked={payoutMethod === val}
                      onChange={() => setPayoutMethod(val)}
                      style={{ accentColor: '#d4af37', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: payoutMethod === val ? '#f0ece3' : '#8b949e' }}>{label}</span>
                  </label>
                ))}
              </div>

              {/* Show ICM overlay toggle */}
              <div style={{ marginBottom: 16 }}>
                <label className="flex items-center gap-3 cursor-pointer" style={{ userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={showIcmOverlay}
                    onChange={e => setShowIcmOverlay(e.target.checked)}
                    style={{ accentColor: '#d4af37', width: 14, height: 14, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: '#c9d1d9' }}>Show live ICM equity to players during play</span>
                </label>
              </div>

              {/* Deal threshold */}
              {sectionLabel('Deal Threshold')}
              <div className="mb-2">
                <NumberInput value={dealThreshold} onChange={v => setDealThreshold(Number(v))} width={80} min={0} placeholder="0" />
                <div style={{ fontSize: 10, color: '#6e7681', marginTop: 6 }}>
                  Allow deal when X players remain (0 = disabled)
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Rules */}
          {step === 3 && (
            <div>
              {sectionLabel('Optional Rules')}
              {[
                { label: 'Allow Rebuys', value: rebuyAllowed, onChange: setRebuy },
                { label: 'Allow Add-ons', value: addonAllowed, onChange: setAddon },
              ].map(({ label, value, onChange }) => (
                <label key={label} className="flex items-center gap-3 mb-4 cursor-pointer" style={{ userSelect: 'none' }}>
                  <div onClick={() => onChange(!value)}
                    style={{
                      width: 36, height: 20, borderRadius: 99, cursor: 'pointer',
                      background: value ? '#d4af37' : '#21262d',
                      border: value ? '1px solid #d4af37' : '1px solid #30363d',
                      position: 'relative', transition: 'all 0.15s', flexShrink: 0,
                    }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2, left: value ? 18 : 2,
                      transition: 'left 0.15s',
                    }} />
                  </div>
                  <span style={{ fontSize: 13, color: '#c9d1d9' }}>{label}</span>
                </label>
              ))}

              {sectionLabel('Referee')}
              <div className="mb-2">
                <label style={{ fontSize: 12, color: '#8b949e', display: 'block', marginBottom: 6 }}>
                  Referee Player ID <span style={{ color: '#6e7681' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={refPlayerId}
                  onChange={e => setRefPlayerId(e.target.value)}
                  placeholder="UUID of referee player"
                  style={{
                    width: '100%', background: '#0d1117', border: '1px solid #30363d',
                    borderRadius: 4, color: '#f0ece3', padding: '7px 10px', fontSize: 12,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#30363d'; }}
                />
                <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
                  The appointed referee can start, advance levels, and end this tournament.
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px' }}>
                {sectionLabel('Summary')}
                {[
                  ['Name', name || '—'],
                  ['Starting Stack', startingStack.toLocaleString()],
                  ['Buy-In', buyIn > 0 ? `$${buyIn}` : 'Free'],
                  ['Blind Levels', levels.length],
                  ['Rebuys', rebuyAllowed ? 'Yes' : 'No'],
                  ['Add-ons', addonAllowed ? 'Yes' : 'No'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-1" style={{ fontSize: 12, borderBottom: '1px solid #21262d' }}>
                    <span style={{ color: '#6e7681' }}>{label}</span>
                    <span style={{ color: '#f0ece3', fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
              {error && (
                <div style={{ padding: '8px 12px', borderRadius: 4, background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', fontSize: 11, color: '#f85149' }}>
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #30363d' }}>
          <button onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            style={{ padding: '7px 16px', borderRadius: 4, background: 'none', border: '1px solid #30363d', color: '#8b949e', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {step === 0 ? 'Cancel' : '← Back'}
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
              style={{
                padding: '7px 18px', borderRadius: 4,
                background: canNext ? '#d4af37' : 'rgba(212,175,55,0.2)', color: canNext ? '#000' : '#6e7681',
                border: 'none', fontSize: 12, fontWeight: 700, cursor: canNext ? 'pointer' : 'not-allowed',
                letterSpacing: '0.06em',
              }}>
              Next →
            </button>
          ) : (
            <button onClick={handleCreate} disabled={saving}
              style={{
                padding: '7px 18px', borderRadius: 4,
                background: saving ? 'rgba(212,175,55,0.3)' : '#d4af37', color: saving ? '#888' : '#000',
                border: 'none', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                letterSpacing: '0.06em',
              }}>
              {saving ? 'Creating…' : 'Create Tournament'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TournamentSetup() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab]   = useState('Upcoming');
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showWizard, setShowWizard] = useState(false);

  const fetchTournaments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/tournaments');
      setTournaments(Array.isArray(data?.tournaments) ? data.tournaments : []);
    } catch (err) {
      setError(err.message ?? 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTournaments(); }, [fetchTournaments]);

  const filtered = tournaments.filter(t => STATUS_MAP[activeTab]?.includes(t.status));

  function handleCreated({ groupId }) {
    fetchTournaments();
    if (groupId) navigate(`/tournaments/${groupId}`);
  }

  return (
    <div className="p-6" style={{ color: '#f0ece3' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-bold tracking-[0.12em]" style={{ color: '#d4af37' }}>TOURNAMENTS</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
            {filtered.length} tournament{filtered.length !== 1 ? 's' : ''} in {activeTab.toLowerCase()}
          </p>
        </div>
        <button onClick={() => setShowWizard(true)}
          className="px-4 py-2 rounded text-sm font-bold tracking-wider"
          style={{ background: '#d4af37', border: '1px solid transparent', color: '#0d1117', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#c9a227'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#d4af37'; }}>
          + New Tournament
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex mb-5" style={{ borderBottom: '1px solid #21262d' }}>
        {FILTER_TABS.map(tab => {
          const count = tournaments.filter(t => STATUS_MAP[tab]?.includes(t.status)).length;
          const active = activeTab === tab;
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '8px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', cursor: 'pointer', background: 'none', border: 'none',
                borderBottom: active ? '2px solid #d4af37' : '2px solid transparent',
                color: active ? '#d4af37' : '#6e7681', transition: 'all 0.1s', marginBottom: -1,
              }}>
              {tab}
              {count > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99,
                  background: active ? 'rgba(212,175,55,0.2)' : 'rgba(110,118,129,0.15)',
                  color: active ? '#d4af37' : '#6e7681',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded px-4 py-3 mb-4 text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: '#6e7681', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Loading tournaments…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: '#444', fontSize: 13, padding: '48px 0', textAlign: 'center' }}>
          No {activeTab.toLowerCase()} tournaments.{' '}
          {activeTab === 'Upcoming' && (
            <button onClick={() => setShowWizard(true)}
              style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
              Create one.
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {filtered.map(t => (
            <TournamentCard
              key={t.id}
              t={t}
              onOpen={() => navigate(`/tournament/${t.table_id ?? t.id}/lobby`)}
            />
          ))}
        </div>
      )}

      {showWizard && (
        <WizardModal onClose={() => setShowWizard(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}
