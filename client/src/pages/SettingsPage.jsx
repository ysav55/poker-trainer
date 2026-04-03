import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#d4af37';

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return (
    <div className="mb-3 mt-5 first:mt-0">
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>
        {title}
      </span>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-sm font-semibold" style={{ color: '#e5e7eb' }}>{label}</label>
      {children}
      {hint && <span className="text-xs" style={{ color: '#6e7681' }}>{hint}</span>}
    </div>
  );
}

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' };

function Input({ value, onChange, type = 'text', placeholder, ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
      style={inputStyle}
      {...props}
    />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputCls}
      style={inputStyle}
    >
      {children}
    </select>
  );
}

function Toggle({ value, onChange, yes = 'Yes', no = 'No' }) {
  return (
    <div className="flex gap-2">
      {[true, false].map(v => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className="px-4 py-1.5 rounded text-sm font-semibold transition-colors"
          style={
            value === v
              ? { background: GOLD, color: '#0d1117' }
              : { background: '#21262d', color: '#6e7681', border: '1px solid #30363d' }
          }
        >
          {v ? yes : no}
        </button>
      ))}
    </div>
  );
}

function SaveButton({ onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      className="mt-5 px-5 py-2 rounded text-sm font-bold"
      style={{ background: GOLD, color: '#0d1117' }}
    >
      {label}
    </button>
  );
}

function Card({ children }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      {children}
    </div>
  );
}

// ─── Tab: Table Defaults ──────────────────────────────────────────────────────

function TableDefaultsTab() {
  const [form, setForm] = useState({
    gameType: 'Cash',
    maxPlayers: '9',
    privacy: 'School',
    sb: '25',
    bb: '50',
    ante: '0',
    minBuyIn: '500',
    maxBuyIn: '5000',
    defaultStack: '2500',
    allowRebuy: true,
    maxRebuys: '3',
    decisionSecs: '30',
    timeBankSecs: '120',
    showAllAtShowdown: true,
    allowMuck: true,
    coachDisconnect: 'Pause',
    studentDisconnectMins: '5',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const bb = Number(form.bb) || 1;

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: '#6e7681' }}>
        New tables you create will use these settings. Each table can override.
      </p>

      <SectionHeader title="General" />
      <Field label="Default game type">
        <Select value={form.gameType} onChange={v => set('gameType', v)}>
          {['Cash', 'Tournament', 'Sit & Go'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="Default max players">
        <Select value={form.maxPlayers} onChange={v => set('maxPlayers', v)}>
          {['2', '4', '6', '8', '9'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="Default privacy">
        <Select value={form.privacy} onChange={v => set('privacy', v)}>
          {['School', 'Coach', 'Public'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>

      <SectionHeader title="Blinds" />
      <div className="grid grid-cols-3 gap-3">
        <Field label="Small Blind"><Input value={form.sb} onChange={v => set('sb', v)} /></Field>
        <Field label="Big Blind"><Input value={form.bb} onChange={v => set('bb', v)} /></Field>
        <Field label="Ante"><Input value={form.ante} onChange={v => set('ante', v)} /></Field>
      </div>

      <SectionHeader title="Buy-In (play chips)" />
      <Field label="Min buy-in" hint={`In BB: ${Math.round(Number(form.minBuyIn) / bb)}`}>
        <Input value={form.minBuyIn} onChange={v => set('minBuyIn', v)} />
      </Field>
      <Field label="Max buy-in" hint={`In BB: ${Math.round(Number(form.maxBuyIn) / bb)}`}>
        <Input value={form.maxBuyIn} onChange={v => set('maxBuyIn', v)} />
      </Field>
      <Field label="Default starting stack">
        <Input value={form.defaultStack} onChange={v => set('defaultStack', v)} />
      </Field>

      <SectionHeader title="Rebuy" />
      <Field label="Allow rebuy"><Toggle value={form.allowRebuy} onChange={v => set('allowRebuy', v)} /></Field>
      {form.allowRebuy && (
        <Field label="Max rebuys"><Input value={form.maxRebuys} onChange={v => set('maxRebuys', v)} /></Field>
      )}

      <SectionHeader title="Time Bank" />
      <Field label="Seconds per decision">
        <Input value={form.decisionSecs} onChange={v => set('decisionSecs', v)} />
      </Field>
      <Field label="Time bank per session (seconds)">
        <Input value={form.timeBankSecs} onChange={v => set('timeBankSecs', v)} />
      </Field>

      <SectionHeader title="Showdown" />
      <Field label="Show all hands at showdown">
        <Toggle value={form.showAllAtShowdown} onChange={v => set('showAllAtShowdown', v)} />
      </Field>
      <Field label="Allow muck at river">
        <Toggle value={form.allowMuck} onChange={v => set('allowMuck', v)} />
      </Field>

      <SectionHeader title="Disconnection" />
      <Field label="Coach disconnect">
        <Select value={form.coachDisconnect} onChange={v => set('coachDisconnect', v)}>
          {['Pause', 'Continue', 'Mod takeover'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="Student disconnect timeout (minutes)">
        <Input value={form.studentDisconnectMins} onChange={v => set('studentDisconnectMins', v)} />
      </Field>

      <div className="flex gap-3 mt-5">
        <button
          className="px-5 py-2 rounded text-sm font-bold"
          style={{ background: GOLD, color: '#0d1117' }}
        >
          Save Defaults
        </button>
        <button
          className="px-5 py-2 rounded text-sm font-semibold"
          style={{ background: '#21262d', color: '#e5e7eb', border: '1px solid #30363d' }}
        >
          Reset to Org Defaults
        </button>
      </div>
    </Card>
  );
}

// ─── Tab: School ──────────────────────────────────────────────────────────────

const MOCK_GROUPS = [
  { name: 'MTT Beginners', students: 12 },
  { name: 'Cash Advanced',  students:  8 },
  { name: 'River Defense',  students:  6 },
];

const MOCK_ANNOUNCEMENTS = [
  { id: 1, text: 'Session this Saturday at 2pm', date: 'Mar 28' },
  { id: 2, text: 'New hand scenarios uploaded',   date: 'Mar 25' },
];

function SchoolTab() {
  const [schoolName, setSchoolName]     = useState('Rivera Poker Academy');
  const [description, setDescription]  = useState('Training school for poker fundamentals.');
  const [primaryMetric, setPrimary]     = useState('Net Chips');
  const [secondaryMetric, setSecondary] = useState('Win Rate');
  const [updateFreq, setUpdateFreq]     = useState('After each session');

  return (
    <Card>
      <SectionHeader title="School Info" />
      <Field label="School name">
        <Input value={schoolName} onChange={setSchoolName} />
      </Field>
      <Field label="Description">
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="rounded px-3 py-2 text-sm outline-none resize-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' }}
        />
      </Field>

      <SectionHeader title="Leaderboard" />
      <Field label="Primary metric">
        <Select value={primaryMetric} onChange={setPrimary}>
          {['Net Chips', 'Win Rate', 'Hands Played'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="Secondary metric">
        <Select value={secondaryMetric} onChange={setSecondary}>
          {['Win Rate', 'Net Chips', 'VPIP'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label="Update frequency">
        <Select value={updateFreq} onChange={setUpdateFreq}>
          {['After each session', 'Hourly', 'Daily'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>

      <SectionHeader title="Groups / Cohorts" />
      <div
        className="rounded-lg overflow-hidden mb-2"
        style={{ border: '1px solid #30363d' }}
      >
        {MOCK_GROUPS.map((g, i) => (
          <div
            key={g.name}
            className="flex items-center px-4 py-3"
            style={{ borderBottom: i < MOCK_GROUPS.length - 1 ? '1px solid #21262d' : 'none' }}
          >
            <span className="flex-1 text-sm font-semibold" style={{ color: '#f0ece3' }}>{g.name}</span>
            <span className="text-xs mr-4" style={{ color: '#6e7681' }}>{g.students} students</span>
            <button className="text-xs px-3 py-1 rounded" style={{ background: '#21262d', color: '#e5e7eb', border: '1px solid #30363d' }}>
              Edit
            </button>
          </div>
        ))}
      </div>
      <button className="text-sm font-semibold" style={{ color: GOLD }}>+ Create Group</button>

      <SectionHeader title="Announcements" />
      <div
        className="rounded-lg overflow-hidden mb-2"
        style={{ border: '1px solid #30363d' }}
      >
        {MOCK_ANNOUNCEMENTS.map((a, i) => (
          <div
            key={a.id}
            className="flex items-center px-4 py-3"
            style={{ borderBottom: i < MOCK_ANNOUNCEMENTS.length - 1 ? '1px solid #21262d' : 'none' }}
          >
            <span className="flex-1 text-sm" style={{ color: '#e5e7eb' }}>{a.text}</span>
            <span className="text-xs ml-4 flex-shrink-0" style={{ color: '#6e7681' }}>{a.date}</span>
          </div>
        ))}
      </div>
      <button className="text-sm font-semibold" style={{ color: GOLD }}>+ New Announcement</button>

      <SaveButton />
    </Card>
  );
}

// ─── Tab: Org Settings ────────────────────────────────────────────────────────

const MOCK_BLIND_STRUCTURES = [
  { label: 'Micro',  sb: 5,   bb: 10,  ante: 0   },
  { label: 'Low',    sb: 25,  bb: 50,  ante: 0   },
  { label: 'Medium', sb: 100, bb: 200, ante: 25  },
  { label: 'High',   sb: 500, bb: 1000, ante: 100 },
];

function OrgTab() {
  const [limits, setLimits] = useState({
    maxTables: '4',
    trialDays: '7',
    trialHandLimit: '500',
    maxPlayers: '9',
  });
  const [autoSpawn, setAutoSpawn]     = useState(true);
  const [occupancy, setOccupancy]     = useState('60');
  const [defaultTable, setDefaultTable] = useState('Low Blinds');
  const [leaderMetrics, setLeaderMetrics] = useState('Net Chips, Win Rate');
  const [updateFreq, setUpdateFreq]   = useState('After each session');

  const setLimit = (k, v) => setLimits(l => ({ ...l, [k]: v }));

  return (
    <Card>
      <p className="text-sm mb-4" style={{ color: '#6e7681' }}>
        These apply platform-wide unless overridden at the school or table level.
      </p>

      <SectionHeader title="Default Blind Structures" />
      <div
        className="rounded-lg overflow-hidden mb-3"
        style={{ border: '1px solid #30363d' }}
      >
        {MOCK_BLIND_STRUCTURES.map((b, i) => (
          <div
            key={b.label}
            className="flex items-center gap-4 px-4 py-3 text-sm"
            style={{ borderBottom: i < MOCK_BLIND_STRUCTURES.length - 1 ? '1px solid #21262d' : 'none' }}
          >
            <span className="w-16 font-semibold" style={{ color: '#f0ece3' }}>{b.label}</span>
            <span style={{ color: '#6e7681' }}>{b.sb}/{b.bb}</span>
            <span style={{ color: '#6e7681' }}>{b.ante > 0 ? `ante ${b.ante}` : 'no ante'}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        <button className="text-xs px-3 py-1.5 rounded" style={{ background: '#21262d', color: '#e5e7eb', border: '1px solid #30363d' }}>Edit</button>
        <button className="text-xs px-3 py-1.5 rounded font-semibold" style={{ color: GOLD }}>+ Add Structure</button>
      </div>

      <SectionHeader title="Platform Limits" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Max tables per student">
          <Input value={limits.maxTables} onChange={v => setLimit('maxTables', v)} />
        </Field>
        <Field label="Trial duration (days)">
          <Input value={limits.trialDays} onChange={v => setLimit('trialDays', v)} />
        </Field>
        <Field label="Trial hand limit">
          <Input value={limits.trialHandLimit} onChange={v => setLimit('trialHandLimit', v)} />
        </Field>
        <Field label="Max players per table">
          <Input value={limits.maxPlayers} onChange={v => setLimit('maxPlayers', v)} />
        </Field>
      </div>

      <SectionHeader title="Open Table Auto-Spawn" />
      <Field label="Enabled"><Toggle value={autoSpawn} onChange={setAutoSpawn} /></Field>
      {autoSpawn && (
        <>
          <Field label="Occupancy threshold (%)">
            <Input value={occupancy} onChange={setOccupancy} />
          </Field>
          <Field label="Default open table config">
            <Select value={defaultTable} onChange={setDefaultTable}>
              {['Micro Blinds', 'Low Blinds', 'Medium Blinds'].map(o => <option key={o}>{o}</option>)}
            </Select>
          </Field>
        </>
      )}

      <SectionHeader title="Leaderboard Defaults" />
      <Field label="Default metrics">
        <Input value={leaderMetrics} onChange={setLeaderMetrics} />
      </Field>
      <Field label="Update frequency">
        <Select value={updateFreq} onChange={setUpdateFreq}>
          {['After each session', 'Hourly', 'Daily'].map(o => <option key={o}>{o}</option>)}
        </Select>
      </Field>

      <SaveButton />
    </Card>
  );
}

// ─── Tab: Platform ────────────────────────────────────────────────────────────

const MOCK_SCHOOLS = [
  { name: 'Rivera Academy', students: 32, maxStudents: 50, aiPerMonth: 200, status: 'Active' },
];

const FEATURE_TOGGLES = [
  { key: 'scenarioBuilder', label: 'Scenario Builder',       default: true  },
  { key: 'aiAnalysis',      label: 'AI Analysis',            default: true  },
  { key: 'reviewTable',     label: 'Review Table',           default: true  },
  { key: 'tournaments',     label: 'Tournaments',            default: true  },
  { key: 'advAnnotations',  label: 'Advanced Annotations',   default: false },
];

function PlatformTab() {
  const [editingSchool, setEditingSchool] = useState(null);
  const [features, setFeatures] = useState(
    Object.fromEntries(FEATURE_TOGGLES.map(f => [f.key, f.default]))
  );
  const toggleFeature = k => setFeatures(f => ({ ...f, [k]: !f[k] }));

  return (
    <Card>
      <p className="text-xs font-semibold mb-4" style={{ color: '#f85149' }}>Super Admin only.</p>

      <SectionHeader title="School Agreements" />
      <div className="rounded-lg overflow-hidden mb-3" style={{ border: '1px solid #30363d' }}>
        {/* Header */}
        <div
          className="grid text-xs font-bold uppercase tracking-widest px-4 py-2"
          style={{ gridTemplateColumns: '1fr 7rem 5rem 5rem', borderBottom: '1px solid #30363d', color: '#6e7681' }}
        >
          <span>School</span>
          <span className="text-right">Students</span>
          <span className="text-right">AI/mo</span>
          <span className="text-right">Status</span>
        </div>
        {MOCK_SCHOOLS.map(s => (
          <div
            key={s.name}
            className="grid items-center px-4 py-3"
            style={{ gridTemplateColumns: '1fr 7rem 5rem 5rem' }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: '#f0ece3' }}>{s.name}</div>
              <button
                className="text-xs mt-0.5"
                style={{ color: GOLD }}
                onClick={() => setEditingSchool(s)}
              >
                Edit Agreement
              </button>
            </div>
            <span className="text-sm text-right" style={{ color: '#e5e7eb' }}>{s.students}/{s.maxStudents}</span>
            <span className="text-sm text-right" style={{ color: '#e5e7eb' }}>{s.aiPerMonth}</span>
            <span
              className="text-xs font-semibold text-right"
              style={{ color: s.status === 'Active' ? '#3fb950' : '#6e7681' }}
            >
              {s.status}
            </span>
          </div>
        ))}
      </div>
      <button className="text-sm font-semibold" style={{ color: GOLD }}>+ Add School Agreement</button>

      {/* Edit Agreement inline panel */}
      {editingSchool && (
        <div
          className="mt-4 rounded-lg p-4"
          style={{ border: '1px solid #30363d', background: '#0d1117' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold" style={{ color: '#f0ece3' }}>Edit: {editingSchool.name}</span>
            <button className="text-xs" style={{ color: '#6e7681' }} onClick={() => setEditingSchool(null)}>✕ Close</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max students"><Input value={String(editingSchool.maxStudents)} onChange={() => {}} /></Field>
            <Field label="AI analysis/month"><Input value={String(editingSchool.aiPerMonth)} onChange={() => {}} /></Field>
            <Field label="Max concurrent tables"><Input value="10" onChange={() => {}} /></Field>
          </div>
          <div className="mt-3">
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#6e7681' }}>Feature Toggles</span>
            <div className="mt-2 flex flex-col gap-2">
              {FEATURE_TOGGLES.map(f => (
                <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={features[f.key]}
                    onChange={() => toggleFeature(f.key)}
                    className="rounded"
                    style={{ accentColor: GOLD }}
                  />
                  <span className="text-sm" style={{ color: '#e5e7eb' }}>{f.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Field label="Logo URL"><Input value="" onChange={() => {}} placeholder="https://…" /></Field>
            <Field label="Primary color"><Input value="#D4AF37" onChange={() => {}} /></Field>
          </div>
          <SaveButton label="Save Agreement" />
        </div>
      )}

      <SectionHeader title="System" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: '#3fb950' }}>✅</span>
          <span style={{ color: '#e5e7eb' }}>Database health: Connected</span>
        </div>
        <div className="text-sm" style={{ color: '#e5e7eb' }}>Active sockets: <span style={{ color: GOLD }}>47</span></div>
        <div className="text-sm" style={{ color: '#e5e7eb' }}>Uptime: <span style={{ color: '#f0ece3' }}>12d 4h</span></div>
      </div>
      <div className="mt-4">
        <button className="text-sm font-semibold" style={{ color: GOLD }}>Audit Log →</button>
      </div>
    </Card>
  );
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuth();
  const [name, setName]   = useState(user?.name ?? '');
  const [email, setEmail] = useState('');
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');

  const initials = (name || 'U')
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const roles = user?.role ? [user.role] : [];

  return (
    <Card>
      {/* Avatar */}
      <div className="flex items-center gap-4 mb-5">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black flex-shrink-0"
          style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: `2px solid ${GOLD}` }}
          data-testid="profile-avatar"
        >
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#f0ece3' }}>{name || 'Your Name'}</p>
          <button
            className="text-xs mt-1"
            style={{ color: GOLD }}
          >
            Upload Photo
          </button>
        </div>
      </div>

      <Field label="Name">
        <Input value={name} onChange={setName} placeholder="Your name" data-testid="profile-name" />
      </Field>
      <Field label="Email">
        <Input value={email} onChange={setEmail} type="email" placeholder="coach@example.com" data-testid="profile-email" />
      </Field>

      <div className="mt-4 mb-2">
        <button
          className="text-sm font-semibold"
          style={{ color: GOLD }}
          onClick={() => setShowPwForm(v => !v)}
          data-testid="change-password-toggle"
        >
          {showPwForm ? '▲ Hide Password Form' : '▼ Change Password'}
        </button>
      </div>

      {showPwForm && (
        <div
          className="rounded-lg p-4 mb-3 flex flex-col gap-2"
          style={{ border: '1px solid #30363d', background: '#0d1117' }}
          data-testid="password-form"
        >
          <Input value={currentPw} onChange={setCurrentPw} type="password" placeholder="Current password" />
          <Input value={newPw}     onChange={setNewPw}     type="password" placeholder="New password" />
          <Input value={confirmPw} onChange={setConfirmPw} type="password" placeholder="Confirm new password" />
          <button
            className="mt-1 px-4 py-2 rounded text-sm font-bold self-start"
            style={{ background: GOLD, color: '#0d1117' }}
          >
            Update Password
          </button>
        </div>
      )}

      <SectionHeader title="Roles" />
      <div className="flex flex-wrap gap-2 mb-1">
        {roles.map(r => (
          <span
            key={r}
            className="px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: 'rgba(212,175,55,0.12)', color: GOLD, border: `1px solid rgba(212,175,55,0.3)` }}
          >
            {r}
          </span>
        ))}
      </div>
      <p className="text-xs mb-4" style={{ color: '#6e7681' }}>
        Read-only — assigned by admin.
      </p>

      <SaveButton label="Save Profile" />
    </Card>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const ALL_TABS = [
  {
    id: 'table-defaults',
    label: 'Table Defaults',
    roles: ['coach', 'admin', 'super_admin'],
    component: TableDefaultsTab,
  },
  {
    id: 'school',
    label: 'School',
    roles: ['coach', 'admin', 'super_admin'],
    component: SchoolTab,
  },
  {
    id: 'org',
    label: 'Org',
    roles: ['admin', 'super_admin'],
    component: OrgTab,
  },
  {
    id: 'platform',
    label: 'Platform',
    roles: ['super_admin'],
    component: PlatformTab,
  },
  {
    id: 'profile',
    label: 'Profile',
    roles: ['coach', 'admin', 'super_admin', 'student', 'trial', 'moderator'],
    component: ProfileTab,
  },
];

// ─── SettingsPage ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'student';

  const visibleTabs = ALL_TABS.filter(t => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.id ?? 'profile');

  const current = visibleTabs.find(t => t.id === activeTab) ?? visibleTabs[0];
  const TabContent = current?.component ?? (() => null);

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        {/* Page title */}
        <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Settings</h1>

        {/* Tab bar */}
        <div
          className="flex gap-1 overflow-x-auto pb-1"
          role="tablist"
          style={{ borderBottom: '2px solid #21262d' }}
        >
          {visibleTabs.map(tab => {
            const active = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors rounded-t"
                style={{
                  color:        active ? GOLD         : '#6e7681',
                  background:   active ? 'rgba(212,175,55,0.08)' : 'transparent',
                  borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                  marginBottom: -2,
                }}
                data-testid={`tab-${tab.id}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <TabContent />

      </div>
    </div>
  );
}
