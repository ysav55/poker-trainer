import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '../../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ['', 'superadmin', 'admin', 'coach', 'moderator', 'referee', 'player', 'trial'];
const SUB_TABS = ['OVERVIEW', 'NOTES', 'SCHEDULE', 'HISTORY'];
const NOTE_TYPES = ['general', 'session_review', 'goal', 'weakness'];

const NOTE_TYPE_COLORS = {
  general:        { bg: 'rgba(88,166,255,0.1)',   border: 'rgba(88,166,255,0.25)',   text: '#58a6ff' },
  session_review: { bg: 'rgba(212,175,55,0.1)',   border: 'rgba(212,175,55,0.25)',   text: '#d4af37' },
  goal:           { bg: 'rgba(63,185,80,0.1)',    border: 'rgba(63,185,80,0.25)',    text: '#3fb950' },
  weakness:       { bg: 'rgba(248,81,73,0.1)',    border: 'rgba(248,81,73,0.25)',    text: '#f85149' },
};

const STATUS_COLORS = {
  scheduled:  { bg: 'rgba(88,166,255,0.1)',   border: 'rgba(88,166,255,0.25)',   text: '#58a6ff' },
  completed:  { bg: 'rgba(63,185,80,0.1)',    border: 'rgba(63,185,80,0.25)',    text: '#3fb950' },
  cancelled:  { bg: 'rgba(110,118,129,0.1)', border: 'rgba(110,118,129,0.25)', text: '#6e7681' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatNetChips(val) {
  if (val == null) return '—';
  const n = Number(val);
  return (n >= 0 ? '+' : '') + n.toLocaleString();
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Small shared primitives ──────────────────────────────────────────────────

function RolePill({ role }) {
  if (!role) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff' }}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.cancelled;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wider whitespace-nowrap"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {status ? status.toUpperCase() : '—'}
    </span>
  );
}

function NoteTypeBadge({ type }) {
  const c = NOTE_TYPE_COLORS[type] || NOTE_TYPE_COLORS.general;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {type ? type.replace('_', ' ').toUpperCase() : 'GENERAL'}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg px-4 py-3 flex-1 min-w-0"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>{label}</span>
      <span className="text-xl font-bold" style={{ color: '#f0ece3' }}>{value ?? '—'}</span>
      {sub && <span className="text-xs" style={{ color: '#6e7681' }}>{sub}</span>}
    </div>
  );
}

function GhostBtn({ onClick, children, style = {} }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className="px-3 py-1.5 rounded text-xs font-semibold tracking-wider"
      style={{
        background: 'transparent',
        border: `1px solid ${hov ? '#d4af37' : '#30363d'}`,
        color: hov ? '#d4af37' : '#8b949e',
        cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function GoldBtn({ onClick, children, disabled = false, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded text-sm font-bold tracking-wider"
      style={{
        background: disabled ? 'rgba(212,175,55,0.3)' : '#d4af37',
        border: '1px solid transparent',
        color: disabled ? '#6e7681' : '#0d1117',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── PlayerStatsChart ─────────────────────────────────────────────────────────

function PlayerStatsChart({ trend }) {
  if (!trend || trend.length === 0) {
    return (
      <div
        className="rounded-lg flex items-center justify-center"
        style={{ height: 180, background: '#161b22', border: '1px solid #30363d', color: '#6e7681', fontSize: 13 }}
      >
        No trend data yet
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
      <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#6e7681' }}>WEEKLY VPIP / PFR TREND</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={trend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
          <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#6e7681' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#6e7681' }} tickLine={false} axisLine={false} unit="%" />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#8b949e' }}
            formatter={(val) => [`${val}%`]}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#8b949e' }} />
          <Line type="monotone" dataKey="vpip" name="VPIP" stroke="#d4af37" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pfr"  name="PFR"  stroke="#58a6ff" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PlayerMistakeBreakdown ───────────────────────────────────────────────────

function PlayerMistakeBreakdown({ mistakes }) {
  if (!mistakes || mistakes.length === 0) {
    return (
      <div
        className="rounded-lg flex items-center justify-center"
        style={{ height: 180, background: '#161b22', border: '1px solid #30363d', color: '#6e7681', fontSize: 13 }}
      >
        No mistake data yet
      </div>
    );
  }

  const data = [...mistakes].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div className="rounded-lg p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
      <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#6e7681' }}>TOP MISTAKE TAGS</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#21262d" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#6e7681' }} tickLine={false} axisLine={false} />
          <YAxis
            type="category" dataKey="tag"
            tick={{ fontSize: 10, fill: '#8b949e' }} tickLine={false} axisLine={false}
            width={100}
          />
          <Tooltip
            contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#8b949e' }}
          />
          <Bar dataKey="count" name="Count" fill="rgba(248,81,73,0.6)" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── PlayerTagManager ─────────────────────────────────────────────────────────

function PlayerTagManager({ playerId, tags: initialTags }) {
  const [tags, setTags]     = useState(initialTags || []);
  const [input, setInput]   = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef            = useRef(null);

  async function addTag() {
    const val = input.trim();
    if (!val || tags.includes(val)) { setInput(''); return; }
    setSaving(true);
    try {
      const result = await apiFetch(`/api/admin/players/${playerId}/tags`, {
        method: 'POST',
        body: JSON.stringify({ tag: val }),
      });
      setTags(result.tags || [...tags, val]);
      setInput('');
    } catch { /* silently ignore — tag persists locally */ }
    finally { setSaving(false); }
  }

  async function removeTag(tag) {
    try {
      const result = await apiFetch(`/api/admin/players/${playerId}/tags/${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      setTags(result.tags || tags.filter(t => t !== tag));
    } catch { /* silently ignore */ }
  }

  return (
    <div className="rounded-lg p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
      <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#6e7681' }}>PLAYER TAGS</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {tags.length === 0 && (
          <span className="text-xs" style={{ color: '#6e7681' }}>No tags yet</span>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#d4af37' }}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d4af37', padding: 0, lineHeight: 1 }}
              title="Remove tag"
            >×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
          onBlur={addTag}
          placeholder="+ Add tag…"
          disabled={saving}
          className="flex-1 rounded px-3 py-1.5 text-xs outline-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
        />
      </div>
    </div>
  );
}

// ─── OverviewTab ──────────────────────────────────────────────────────────────

function OverviewTab({ player, crm }) {
  const stats = crm?.stats || {};
  const trend = crm?.trend || [];
  const mistakes = crm?.mistakes || [];
  const tags = crm?.tags || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="flex gap-3">
        <StatCard label="HANDS PLAYED" value={stats.hands_played ?? '—'} />
        <StatCard
          label="NET CHIPS"
          value={
            <span style={{ color: stats.net_chips >= 0 ? '#3fb950' : '#f85149' }}>
              {formatNetChips(stats.net_chips)}
            </span>
          }
        />
        <StatCard label="VPIP%" value={stats.vpip != null ? `${stats.vpip}%` : '—'} />
        <StatCard label="PFR%" value={stats.pfr != null ? `${stats.pfr}%` : '—'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <PlayerStatsChart trend={trend} />
        <PlayerMistakeBreakdown mistakes={mistakes} />
      </div>

      {/* Tags */}
      <PlayerTagManager playerId={player.id} tags={tags} />
    </div>
  );
}

// ─── NotesTab ─────────────────────────────────────────────────────────────────

function NotesTab({ player }) {
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [content, setContent]   = useState('');
  const [noteType, setNoteType] = useState('general');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/admin/players/${player.id}/notes`);
      setNotes(Array.isArray(data) ? data : (data.notes ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [player.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  async function handleAddNote(e) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/admin/players/${player.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), note_type: noteType }),
      });
      setContent('');
      setNoteType('general');
      await loadNotes();
    } catch (err) {
      setError(err.message || 'Failed to add note');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add Note form */}
      <form
        onSubmit={handleAddNote}
        className="rounded-lg p-4 flex flex-col gap-3"
        style={{ background: '#161b22', border: '1px solid #30363d' }}
      >
        <p className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>ADD NOTE</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a note about this player…"
          rows={3}
          className="w-full rounded px-3 py-2 text-sm outline-none resize-none"
          style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
        />
        <div className="flex items-center gap-3">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="rounded px-3 py-1.5 text-sm outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', cursor: 'pointer' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#161b22' }}>
                {t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <GoldBtn type="submit" disabled={saving || !content.trim()}>
            {saving ? 'ADDING…' : 'ADD NOTE'}
          </GoldBtn>
        </div>
        {error && (
          <div
            className="rounded px-3 py-2 text-sm"
            style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
          >
            {error}
          </div>
        )}
      </form>

      {/* Notes list */}
      {loading && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>Loading notes…</div>
      )}
      {!loading && notes.length === 0 && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>No notes yet</div>
      )}
      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg p-4 flex flex-col gap-2"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <NoteTypeBadge type={note.note_type} />
              <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                {formatDateTime(note.created_at)}
              </span>
              {note.coach_name && (
                <span className="text-xs ml-auto" style={{ color: '#6e7681' }}>
                  by {note.coach_name}
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: '#f0ece3' }}>{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ScheduleTab ──────────────────────────────────────────────────────────────

function ScheduleTab({ player }) {
  const [sessions, setSessions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [error, setError]         = useState(null);

  // Form state
  const [formDate, setFormDate]     = useState('');
  const [formDur, setFormDur]       = useState(60);
  const [formNotes, setFormNotes]   = useState('');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError]   = useState(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/admin/players/${player.id}/schedule`);
      setSessions(Array.isArray(data) ? data : (data.sessions ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [player.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function handleBook(e) {
    e.preventDefault();
    setFormSaving(true);
    setFormError(null);
    try {
      await apiFetch(`/api/admin/players/${player.id}/schedule`, {
        method: 'POST',
        body: JSON.stringify({ scheduled_at: formDate, duration_minutes: Number(formDur), notes: formNotes }),
      });
      setFormDate('');
      setFormDur(60);
      setFormNotes('');
      setShowForm(false);
      await loadSessions();
    } catch (err) {
      setFormError(err.message || 'Failed to schedule session');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleStatusChange(sid, status) {
    try {
      await apiFetch(`/api/admin/players/${player.id}/schedule/${sid}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      setSessions((prev) => prev.map((s) => s.id === sid ? { ...s, status } : s));
    } catch { /* ignore — stale UI */ }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>UPCOMING SESSIONS</p>
        <GoldBtn onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'CANCEL' : 'SCHEDULE SESSION'}
        </GoldBtn>
      </div>

      {/* Inline booking form */}
      {showForm && (
        <form
          onSubmit={handleBook}
          className="rounded-lg p-4 flex flex-col gap-3"
          style={{ background: '#161b22', border: '1px solid #30363d' }}
        >
          <p className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>NEW SESSION</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: '#8b949e' }}>Date & Time</label>
              <input
                type="datetime-local"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="rounded px-3 py-1.5 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: '#8b949e' }}>Duration (minutes)</label>
              <input
                type="number"
                value={formDur}
                onChange={(e) => setFormDur(e.target.value)}
                min={1}
                required
                className="rounded px-3 py-1.5 text-sm outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              />
            </div>
          </div>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full rounded px-3 py-2 text-sm outline-none resize-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
          />
          {formError && (
            <div
              className="rounded px-3 py-2 text-sm"
              style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
            >
              {formError}
            </div>
          )}
          <div className="flex justify-end">
            <GoldBtn type="submit" disabled={formSaving || !formDate}>
              {formSaving ? 'BOOKING…' : 'BOOK'}
            </GoldBtn>
          </div>
        </form>
      )}

      {/* Error */}
      {error && (
        <div
          className="rounded px-3 py-2 text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
        >
          {error}
        </div>
      )}

      {/* Sessions table */}
      {loading && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>Loading schedule…</div>
      )}
      {!loading && sessions.length === 0 && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>No sessions scheduled</div>
      )}
      {!loading && sessions.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
          <div
            className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
            style={{
              background: '#161b22', borderBottom: '1px solid #30363d', color: '#6e7681',
              gridTemplateColumns: '1fr 100px 80px 1fr 140px',
            }}
          >
            <span>DATE / TIME</span>
            <span>DURATION</span>
            <span>STATUS</span>
            <span>NOTES</span>
            <span>UPDATE STATUS</span>
          </div>
          {sessions.map((s, idx) => (
            <div
              key={s.id}
              className="grid items-center px-4 py-3"
              style={{
                gridTemplateColumns: '1fr 100px 80px 1fr 140px',
                borderBottom: idx < sessions.length - 1 ? '1px solid #21262d' : 'none',
                background: idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)',
              }}
            >
              <span className="text-sm" style={{ color: '#f0ece3' }}>{formatDateTime(s.scheduled_at)}</span>
              <span className="text-sm" style={{ color: '#8b949e' }}>{s.duration_minutes ?? '—'} min</span>
              <div><StatusBadge status={s.status} /></div>
              <span className="text-xs truncate pr-3" style={{ color: '#6e7681' }}>{s.notes || '—'}</span>
              <select
                value={s.status || 'scheduled'}
                onChange={(e) => handleStatusChange(s.id, e.target.value)}
                className="rounded px-2 py-1 text-xs outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', cursor: 'pointer' }}
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryTab({ player }) {
  const [hands, setHands]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 20;

  const loadHands = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/players/${player.id}/hands`);
      setHands(Array.isArray(data) ? data : (data.hands ?? []));
    } catch (err) {
      setError(err.message || 'Failed to load hand history');
    } finally {
      setLoading(false);
    }
  }, [player.id]);

  useEffect(() => { setPage(0); loadHands(); }, [loadHands]);

  const totalPages = Math.ceil(hands.length / PAGE_SIZE);
  const visible = hands.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>HAND HISTORY</p>

      {error && (
        <div
          className="rounded px-3 py-2 text-sm"
          style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>Loading hand history…</div>
      )}
      {!loading && hands.length === 0 && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>No hands recorded</div>
      )}

      {!loading && hands.length > 0 && (
        <>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            <div
              className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
              style={{
                background: '#161b22', borderBottom: '1px solid #30363d', color: '#6e7681',
                gridTemplateColumns: '160px 1fr 100px',
              }}
            >
              <span>DATE</span>
              <span>TAGS</span>
              <span>NET CHIPS</span>
            </div>

            {visible.map((hand, idx) => {
              const tags = Array.isArray(hand.tags) ? hand.tags : [];
              const net = hand.net_chips ?? hand.result ?? null;
              return (
                <div
                  key={hand.id || idx}
                  className="grid items-center px-4 py-3"
                  style={{
                    gridTemplateColumns: '160px 1fr 100px',
                    borderBottom: idx < visible.length - 1 ? '1px solid #21262d' : 'none',
                    background: idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)',
                  }}
                >
                  <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                    {formatDate(hand.played_at || hand.created_at)}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {tags.slice(0, 6).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-xs"
                        style={{ background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.15)', color: '#58a6ff' }}
                      >
                        {t}
                      </span>
                    ))}
                    {tags.length > 6 && (
                      <span className="text-xs" style={{ color: '#6e7681' }}>+{tags.length - 6}</span>
                    )}
                  </div>
                  <span
                    className="text-sm font-mono text-right"
                    style={{ color: net == null ? '#6e7681' : net >= 0 ? '#3fb950' : '#f85149' }}
                  >
                    {formatNetChips(net)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: '#6e7681' }}>
                Page {page + 1} of {totalPages} · {hands.length} hands
              </span>
              <div className="flex gap-2">
                <GhostBtn onClick={() => setPage((p) => Math.max(0, p - 1))} style={{ opacity: page === 0 ? 0.4 : 1 }}>
                  ← Prev
                </GhostBtn>
                <GhostBtn onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} style={{ opacity: page === totalPages - 1 ? 0.4 : 1 }}>
                  Next →
                </GhostBtn>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PlayerDetail (right panel) ───────────────────────────────────────────────

function PlayerDetail({ player, crm, crmLoading }) {
  const [activeTab, setActiveTab] = useState('OVERVIEW');

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Player header */}
      <div
        className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #30363d', background: '#161b22' }}
      >
        <div
          className="flex items-center justify-center rounded-full text-lg font-bold flex-shrink-0"
          style={{
            width: 48, height: 48,
            background: 'rgba(212,175,55,0.15)',
            color: '#d4af37',
            border: '1px solid rgba(212,175,55,0.3)',
          }}
        >
          {getInitials(player.display_name)}
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <span className="font-bold text-base truncate" style={{ color: '#f0ece3' }}>
            {player.display_name}
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <RolePill role={player.role} />
            {player.last_seen && (
              <span className="text-xs" style={{ color: '#6e7681' }}>
                Last seen {formatDate(player.last_seen)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Sub-tab bar */}
      <div
        className="flex items-center flex-shrink-0"
        style={{ borderBottom: '1px solid #30363d', background: '#161b22' }}
      >
        {SUB_TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-5 py-3 text-xs font-bold tracking-[0.12em] transition-colors"
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? '2px solid #d4af37' : '2px solid transparent',
                color: active ? '#d4af37' : '#6e7681',
                cursor: 'pointer',
                marginBottom: '-1px',
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {crmLoading ? (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#6e7681' }}>
            Loading player data…
          </div>
        ) : (
          <>
            {activeTab === 'OVERVIEW'  && <OverviewTab  player={player} crm={crm} />}
            {activeTab === 'NOTES'     && <NotesTab     player={player} />}
            {activeTab === 'SCHEDULE'  && <ScheduleTab  player={player} />}
            {activeTab === 'HISTORY'   && <HistoryTab   player={player} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlayerCRM() {
  const [players, setPlayers]           = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState(null);

  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [filterArchived, setFilterArchived] = useState(false);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [crm, setCrm]                   = useState(null);
  const [crmLoading, setCrmLoading]     = useState(false);

  // Load player list on mount
  useEffect(() => {
    (async () => {
      setPlayersLoading(true);
      setPlayersError(null);
      try {
        const data = await apiFetch('/api/admin/players');
        setPlayers(Array.isArray(data) ? data : (data.players ?? []));
      } catch (err) {
        setPlayersError(err.message || 'Failed to load players');
      } finally {
        setPlayersLoading(false);
      }
    })();
  }, []);

  // Fetch CRM data whenever a player is selected
  useEffect(() => {
    if (!selectedPlayer) { setCrm(null); return; }
    let cancelled = false;
    (async () => {
      setCrmLoading(true);
      setCrm(null);
      try {
        const data = await apiFetch(`/api/admin/players/${selectedPlayer.id}/crm`);
        if (!cancelled) setCrm(data);
      } catch {
        if (!cancelled) setCrm({});
      } finally {
        if (!cancelled) setCrmLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPlayer]);

  // Filter player list
  const filtered = players.filter((p) => {
    if (!filterArchived && p.status === 'archived') return false;
    if (filterRole && p.role !== filterRole) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(p.display_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div
      className="flex"
      style={{ height: '100vh', background: '#060a0f', color: '#f0ece3', overflow: 'hidden' }}
    >
      {/* ── Left column ────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: 280,
          background: '#161b22',
          borderRight: '1px solid #30363d',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Left header */}
        <div className="px-4 pt-5 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
          <h1 className="text-sm font-bold tracking-[0.14em]" style={{ color: '#d4af37' }}>PLAYER CRM</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>{filtered.length} players</p>
        </div>

        {/* Search + filter */}
        <div className="px-3 py-3 flex flex-col gap-2 flex-shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
          {/* Search input */}
          <div className="relative">
            <svg
              width="12" height="12" viewBox="0 0 14 14" fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: '#6e7681' }}
            >
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full rounded pl-8 pr-3 py-1.5 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          {/* Filter row */}
          <div className="flex gap-2 items-center">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 text-xs outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: filterRole ? '#f0ece3' : '#6e7681', cursor: 'pointer' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            >
              <option value="" style={{ background: '#161b22', color: '#6e7681' }}>All roles</option>
              {ROLES.filter(Boolean).map((r) => (
                <option key={r} value={r} style={{ background: '#161b22', color: '#f0ece3' }}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
            <button
              onClick={() => setFilterArchived((v) => !v)}
              className="px-2 py-1.5 rounded text-xs font-medium transition-colors"
              style={{
                background: filterArchived ? 'rgba(110,118,129,0.15)' : 'transparent',
                border: `1px solid ${filterArchived ? '#6e7681' : '#30363d'}`,
                color: filterArchived ? '#6e7681' : '#6e7681',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title="Toggle archived players"
            >
              {filterArchived ? 'HIDE ARCHIVED' : 'SHOW ARCHIVED'}
            </button>
          </div>
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto">
          {playersLoading && (
            <div className="flex items-center justify-center py-8 text-xs" style={{ color: '#6e7681' }}>
              Loading players…
            </div>
          )}
          {playersError && (
            <div className="px-4 py-3 text-xs" style={{ color: '#f85149' }}>{playersError}</div>
          )}
          {!playersLoading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs" style={{ color: '#6e7681' }}>
              No players found
            </div>
          )}
          {!playersLoading && filtered.map((p) => {
            const selected = selectedPlayer?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(p)}
                className="w-full text-left px-3 py-3 flex items-center gap-3 transition-colors"
                style={{
                  background: selected ? 'rgba(212,175,55,0.06)' : 'transparent',
                  borderLeft: selected ? '2px solid #d4af37' : '2px solid transparent',
                  borderBottom: '1px solid #21262d',
                  cursor: 'pointer',
                  outline: 'none',
                }}
                onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Avatar */}
                <div
                  className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
                  style={{
                    width: 32, height: 32,
                    background: 'rgba(212,175,55,0.15)',
                    color: '#d4af37',
                    border: '1px solid rgba(212,175,55,0.2)',
                  }}
                >
                  {getInitials(p.display_name)}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: selected ? '#d4af37' : '#f0ece3' }}
                  >
                    {p.display_name || '—'}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <RolePill role={p.role} />
                    {(p.last_seen || p.created_at) && (
                      <span className="text-xs" style={{ color: '#6e7681' }}>
                        {formatDate(p.last_seen || p.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Quick actions */}
        {selectedPlayer && (
          <div
            className="flex gap-2 px-3 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid #30363d' }}
          >
            <GhostBtn style={{ flex: 1, textAlign: 'center' }}>
              + Add Note
            </GhostBtn>
            <GhostBtn style={{ flex: 1, textAlign: 'center' }}>
              Schedule Session
            </GhostBtn>
          </div>
        )}
      </div>

      {/* ── Right column ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden" style={{ background: '#0d1117' }}>
        {!selectedPlayer ? (
          <div
            className="flex items-center justify-center h-full text-sm"
            style={{ color: '#6e7681' }}
          >
            ← Select a player
          </div>
        ) : (
          <PlayerDetail
            player={selectedPlayer}
            crm={crm}
            crmLoading={crmLoading}
          />
        )}
      </div>
    </div>
  );
}
