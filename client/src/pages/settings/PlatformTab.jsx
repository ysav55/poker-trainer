import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../lib/api.js';
import { GOLD, SectionHeader, Field, Input, Card } from './shared.jsx';

// ─── Tab: Platform ────────────────────────────────────────────────────────────

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

export default function PlatformTab() {
  const [schools,       setSchools]       = useState([]);
  const [health,        setHealth]        = useState(null);
  const [loadingList,   setLoadingList]   = useState(true);
  const [editingSchool, setEditingSchool] = useState(null); // full school object
  const [schoolFeats,   setSchoolFeats]   = useState({});   // feature map for editing school
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
    setSaving(true);
    setSaveMsg('');
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
      // Refresh school list
      apiFetch('/api/admin/schools').then(d => setSchools(d.schools ?? d ?? [])).catch(() => {});
    } catch {
      setSaveMsg('Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold" style={{ color: '#f85149' }}>Super Admin only.</p>

      {loadErr && <p className="text-sm" style={{ color: '#ef4444' }}>{loadErr}</p>}

      {/* System health */}
      <Card>
        <SectionHeader title="System Health" />
        {health ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span style={{ color: health.db === 'ok' ? '#3fb950' : '#f85149' }}>
                {health.db === 'ok' ? '●' : '●'}
              </span>
              <span style={{ color: '#e5e7eb' }}>
                Database: <span style={{ color: health.db === 'ok' ? '#3fb950' : '#f85149' }}>{health.db}</span>
              </span>
            </div>
            <div className="text-sm" style={{ color: '#e5e7eb' }}>
              Active tables: <span style={{ color: GOLD }}>{health.tables ?? 0}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6e7681' }}>{loadingList ? 'Loading…' : 'Health unavailable.'}</p>
        )}
      </Card>

      {/* Schools */}
      <Card>
        <SectionHeader title="School Agreements" />
        {loadingList ? (
          <p className="text-sm" style={{ color: '#6e7681' }}>Loading…</p>
        ) : (
          <>
            <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #30363d' }}>
              <div
                className="grid text-xs font-bold uppercase tracking-widest px-4 py-2"
                style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderBottom: '1px solid #30363d', color: '#6e7681' }}
              >
                <span>School</span>
                <span className="text-right">Students</span>
                <span className="text-right">Coaches</span>
                <span className="text-right">Status</span>
              </div>
              {schools.length === 0 && (
                <p className="px-4 py-3 text-sm" style={{ color: '#6e7681' }}>No schools found.</p>
              )}
              {schools.map(s => (
                <div
                  key={s.id}
                  className="grid items-center px-4 py-3"
                  style={{ gridTemplateColumns: '1fr 6rem 6rem 5rem', borderTop: '1px solid #21262d' }}
                >
                  <div>
                    <div className="text-sm font-semibold" style={{ color: '#f0ece3' }}>{s.name}</div>
                    <button
                      className="text-xs mt-0.5"
                      style={{ color: GOLD }}
                      onClick={() => openEdit(s)}
                    >
                      Edit
                    </button>
                  </div>
                  <span className="text-sm text-right" style={{ color: '#e5e7eb' }}>
                    {s.students ?? 0}{s.max_students ? `/${s.max_students}` : ''}
                  </span>
                  <span className="text-sm text-right" style={{ color: '#e5e7eb' }}>
                    {s.coaches ?? 0}{s.max_coaches ? `/${s.max_coaches}` : ''}
                  </span>
                  <span
                    className="text-xs font-semibold text-right"
                    style={{ color: s.status === 'active' ? '#3fb950' : '#6e7681' }}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Edit panel */}
            {editingSchool && (
              <div className="mt-2 rounded-lg p-4" style={{ border: '1px solid #30363d', background: '#0d1117' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold" style={{ color: '#f0ece3' }}>{editingSchool.name}</span>
                  <button className="text-xs" style={{ color: '#6e7681' }} onClick={() => setEditingSchool(null)}>✕ Close</button>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Field label="Max students">
                    <Input value={maxStudents} onChange={setMaxStudents} type="number" min="0" placeholder="No limit" />
                  </Field>
                  <Field label="Max coaches">
                    <Input value={maxCoaches} onChange={setMaxCoaches} type="number" min="0" placeholder="No limit" />
                  </Field>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6e7681' }}>Feature Toggles</span>
                <div className="mt-2 flex flex-col gap-2 mb-4">
                  {PLATFORM_FEATURES.map(f => (
                    <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schoolFeats[f.key] !== false}
                        onChange={() => setSchoolFeats(prev => ({ ...prev, [f.key]: !(prev[f.key] !== false) }))}
                        style={{ accentColor: GOLD }}
                      />
                      <span className="text-sm" style={{ color: '#e5e7eb' }}>{f.label}</span>
                    </label>
                  ))}
                </div>
                {saveMsg && (
                  <p className="text-xs mb-2" style={{ color: saveMsg === 'Saved.' ? '#3fb950' : '#ef4444' }}>{saveMsg}</p>
                )}
                <button
                  onClick={saveAgreement}
                  disabled={saving}
                  className="px-5 py-2 rounded text-sm font-bold"
                  style={{ background: GOLD, color: '#0d1117', opacity: saving ? 0.6 : 1 }}
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
