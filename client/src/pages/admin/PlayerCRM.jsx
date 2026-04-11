import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { apiFetch } from '../../lib/api';
import PrepBriefTab from './PrepBriefTab';
import ReportsTab from './ReportsTab';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLES = ['', 'superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];
const SUB_TABS = ['INFO', 'SESSIONS', 'STATS', 'NOTES', 'STAKING', 'SCENARIOS', 'REPORTS', 'PREP BRIEF'];
const NOTE_TYPES = ['general', 'session_review', 'goal', 'weakness'];

// Alert dot colors keyed by severity band
const ALERT_DOT = {
  high:     { color: '#f85149', title: 'High alert' },
  moderate: { color: '#d4af37', title: 'Moderate alert' },
  healthy:  { color: '#3fb950', title: 'Healthy' },
  inactive: { color: '#6e7681', title: 'Inactive / no data' },
};

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

// ─── GroupAssignSection ───────────────────────────────────────────────────────

function GroupAssignSection({ playerId, allGroups }) {
  const [playerGroups, setPlayerGroups] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [addingGroup, setAddingGroup]   = useState('');
  const [saving, setSaving]             = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/admin/players/${playerId}/groups`)
      .then((d) => { if (!cancelled) setPlayerGroups(d?.groups ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [playerId]);

  const assignedIds = new Set(playerGroups.map((g) => g.id));
  const available   = (allGroups ?? []).filter((g) => !assignedIds.has(g.id));

  async function addToGroup(groupId) {
    if (!groupId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ playerId }),
      });
      const group = allGroups.find((g) => g.id === groupId);
      if (group) setPlayerGroups((prev) => [...prev, group]);
      setAddingGroup('');
    } catch { /* silently ignore */ }
    finally { setSaving(false); }
  }

  async function removeFromGroup(groupId) {
    try {
      await apiFetch(`/api/admin/groups/${groupId}/members/${playerId}`, { method: 'DELETE' });
      setPlayerGroups((prev) => prev.filter((g) => g.id !== groupId));
    } catch { /* silently ignore */ }
  }

  return (
    <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: '#161b22', border: '1px solid #30363d' }}>
      <p className="text-xs font-bold tracking-widest" style={{ color: '#6e7681' }}>GROUPS</p>

      {loading ? (
        <span className="text-xs" style={{ color: '#6e7681' }}>Loading…</span>
      ) : (
        <div className="flex flex-wrap gap-2">
          {playerGroups.length === 0 && (
            <span className="text-xs" style={{ color: '#6e7681' }}>Not in any group</span>
          )}
          {playerGroups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                background: `${g.color ?? '#58a6ff'}18`,
                border: `1px solid ${g.color ?? '#58a6ff'}44`,
                color: g.color ?? '#58a6ff',
              }}
            >
              {g.name}
              <button
                onClick={() => removeFromGroup(g.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 1, opacity: 0.7 }}
                title="Remove from group"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex gap-2 items-center">
          <select
            value={addingGroup}
            onChange={(e) => setAddingGroup(e.target.value)}
            disabled={saving}
            className="flex-1 rounded px-2 py-1.5 text-xs outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: addingGroup ? '#f0ece3' : '#6e7681', cursor: 'pointer' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
          >
            <option value="" style={{ background: '#161b22', color: '#6e7681' }}>Add to group…</option>
            {available.map((g) => (
              <option key={g.id} value={g.id} style={{ background: '#161b22', color: '#f0ece3' }}>{g.name}</option>
            ))}
          </select>
          <GoldBtn onClick={() => addToGroup(addingGroup)} disabled={saving || !addingGroup}>
            {saving ? '…' : 'Add'}
          </GoldBtn>
        </div>
      )}
    </div>
  );
}

// ─── InfoTab ─────────────────────────────────────────────────────────────────

function InfoTab({ player, crm, onPlayerUpdate, allGroups }) {
  const [reloadAmount, setReloadAmount]   = useState('');
  const [reloading, setReloading]         = useState(false);
  const [reloadMsg, setReloadMsg]         = useState('');
  const [suspending, setSuspending]       = useState(false);
  const [resetOpen, setResetOpen]         = useState(false);
  const [newPwd, setNewPwd]               = useState('');
  const [resetMsg, setResetMsg]           = useState('');
  const [resetting, setResetting]         = useState(false);
  const [showAllTx, setShowAllTx]         = useState(false);

  const transactions = crm?.transactions ?? [];
  const chipBank     = crm?.chip_bank ?? crm?.chipBank ?? null;
  const displayedTx  = showAllTx ? transactions : transactions.slice(0, 5);

  const handleReload = async () => {
    const amount = Number(reloadAmount);
    if (!amount || amount <= 0) return;
    setReloading(true);
    setReloadMsg('');
    try {
      await apiFetch(`/api/admin/players/${player.id}/chips`, {
        method: 'POST',
        body: JSON.stringify({ amount, reason: 'coach_reload' }),
      });
      setReloadMsg(`Added ${amount.toLocaleString()} chips.`);
      setReloadAmount('');
    } catch (err) {
      setReloadMsg(err.message || 'Failed to reload chips');
    } finally {
      setReloading(false);
    }
  };

  const handleSuspend = async () => {
    const newStatus = player.status === 'suspended' ? 'active' : 'suspended';
    setSuspending(true);
    try {
      await apiFetch(`/api/admin/users/${player.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      onPlayerUpdate?.({ ...player, status: newStatus });
    } catch { /* ignore — stale UI */ }
    finally { setSuspending(false); }
  };

  const handleResetPassword = async () => {
    if (!newPwd.trim()) return;
    setResetting(true);
    setResetMsg('');
    try {
      await apiFetch(`/api/admin/users/${player.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPwd.trim() }),
      });
      setResetMsg('Password updated.');
      setNewPwd('');
    } catch (err) {
      setResetMsg(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Profile section */}
      <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>Profile</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <InfoRow label="Name"      value={player.display_name} />
          <InfoRow label="Email"     value={player.email ?? '—'} />
          <span className="text-xs" style={{ color: '#6e7681' }}>Status</span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: player.status === 'suspended' ? '#f85149' : '#f0ece3' }}>
              {player.status ?? 'active'}
            </span>
            <button
              onClick={handleSuspend}
              disabled={suspending}
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: player.status === 'suspended' ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                border: `1px solid ${player.status === 'suspended' ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'}`,
                color: player.status === 'suspended' ? '#3fb950' : '#f85149',
                cursor: suspending ? 'not-allowed' : 'pointer',
                opacity: suspending ? 0.6 : 1,
              }}
            >
              {suspending ? '…' : player.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
            </button>
            <button
              onClick={() => { setResetOpen((v) => !v); setResetMsg(''); setNewPwd(''); }}
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: 'rgba(88,166,255,0.08)',
                border: '1px solid rgba(88,166,255,0.2)',
                color: '#58a6ff',
                cursor: 'pointer',
              }}
            >
              Reset Password
            </button>
          </div>
          <InfoRow label="Joined"    value={formatDate(player.created_at)} />
          <InfoRow label="Role"      value={player.role} />
          <InfoRow label="Last Seen" value={formatDate(player.last_seen)} />
        </div>

        {/* Reset password inline panel */}
        {resetOpen && (
          <div className="flex flex-col gap-2 p-3 rounded mt-1" style={{ background: '#0d1117', border: '1px solid #30363d' }}>
            <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>NEW PASSWORD</span>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleResetPassword(); }}
                placeholder="Enter new password"
                className="flex-1 rounded px-3 py-1.5 text-xs outline-none"
                style={{ background: '#161b22', border: '1px solid #30363d', color: '#f0ece3' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = '#30363d'; }}
              />
              <GoldBtn onClick={handleResetPassword} disabled={resetting || !newPwd.trim()}>
                {resetting ? '…' : 'Set'}
              </GoldBtn>
            </div>
            {resetMsg && (
              <span className="text-xs" style={{ color: resetMsg.includes('updated') ? '#3fb950' : '#f85149' }}>
                {resetMsg}
              </span>
            )}
          </div>
        )}

        <PlayerTagManager playerId={player.id} tags={crm?.tags ?? []} />
      </div>

      {/* Groups */}
      <GroupAssignSection playerId={player.id} allGroups={allGroups} />

      {/* Chip bank */}
      <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>Chip Bank</h3>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold" style={{ color: '#d4af37' }}>
            🪙 {chipBank != null ? Number(chipBank).toLocaleString() : '—'}
          </span>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            placeholder="Amount"
            value={reloadAmount}
            onChange={(e) => setReloadAmount(e.target.value)}
            className="rounded px-3 py-1.5 text-sm w-28 outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
          />
          <GoldBtn onClick={handleReload} disabled={reloading}>
            {reloading ? 'Adding…' : 'Reload Chips'}
          </GoldBtn>
          {reloadMsg && <span className="text-xs" style={{ color: '#6e7681' }}>{reloadMsg}</span>}
        </div>
        {transactions.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs uppercase tracking-widest mb-1" style={{ color: '#6e7681' }}>Recent transactions</span>
            {displayedTx.map((tx, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs py-1"
                style={{ borderBottom: '1px solid #21262d', color: '#8b949e' }}>
                <span className="flex-1 min-w-0 truncate">{tx.description ?? tx.reason ?? '—'}</span>
                <span className="flex-shrink-0 font-mono" style={{ color: '#6e7681' }}>
                  {formatDate(tx.created_at ?? tx.date)}
                </span>
                <span className="flex-shrink-0 font-mono" style={{ color: tx.amount >= 0 ? '#3fb950' : '#f85149' }}>
                  {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString()}
                </span>
              </div>
            ))}
            {transactions.length > 5 && (
              <button
                onClick={() => setShowAllTx((v) => !v)}
                style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', padding: 0 }}
                className="text-xs mt-1 text-left"
              >
                {showAllTx ? 'Show less' : `See all ${transactions.length} transactions →`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <>
      <span className="text-xs" style={{ color: '#6e7681' }}>{label}</span>
      <span className="text-xs" style={{ color: '#f0ece3' }}>{value ?? '—'}</span>
    </>
  );
}

// ─── StatsTab ─────────────────────────────────────────────────────────────────

const STAT_TREND_OPTIONS = [
  { value: 'vpip_pct',      label: 'VPIP' },
  { value: 'pfr_pct',       label: 'PFR' },
  { value: 'three_bet_pct', label: '3bet%' },
  { value: 'wtsd_pct',      label: 'WTSD' },
  { value: 'wsd_pct',       label: 'WSD' },
];

const TRACKED_MISTAKES = ['OPEN_LIMP', 'COLD_CALL_3BET', 'FOLD_TO_PROBE', 'MIN_RAISE'];

function TrendArrow({ curr, prev }) {
  if (curr == null || prev == null) return <span style={{ color: '#6e7681' }}>—</span>;
  const delta = curr - prev;
  if (Math.abs(delta) < 0.5) return <span style={{ color: '#6e7681' }}>→</span>;
  return delta > 0
    ? <span style={{ color: '#3fb950', fontWeight: 700 }}>↑</span>
    : <span style={{ color: '#f85149', fontWeight: 700 }}>↓</span>;
}

function StatPill({ label, value, prev, suffix = '%' }) {
  const display = value != null ? `${Number(value).toFixed(1)}${suffix}` : '—';
  return (
    <div
      className="flex flex-col items-center gap-1 rounded-lg px-4 py-3 flex-1 min-w-0"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>{label}</span>
      <span className="text-lg font-bold" style={{ color: '#f0ece3' }}>{display}</span>
      <TrendArrow curr={value} prev={prev} />
    </div>
  );
}

function StatsTab({ player, crm }) {
  const [snapshots, setSnapshots]     = useState([]);
  const [selectedStat, setSelectedStat] = useState('vpip_pct');

  useEffect(() => {
    if (!player?.id) return;
    apiFetch(`/api/admin/players/${player.id}/snapshots?limit=12`)
      .then((d) => setSnapshots(d?.snapshots ?? []))
      .catch(() => {});
  }, [player?.id]);

  const latest = snapshots[0] ?? {};
  const prev   = snapshots[1] ?? {};

  // Build trend chart data from snapshots (oldest → newest)
  const trendData = [...snapshots].reverse().map((s) => ({
    label: s.period_start ? s.period_start.slice(5) : '?',  // MM-DD
    value: s[selectedStat] ?? null,
  })).filter((d) => d.value != null);

  // Mistakes per 100 hands from latest snapshot
  const rawMistakes = latest.most_common_mistakes ?? {};
  const handsPlayed = latest.hands_played ?? 0;
  const mistakeData = TRACKED_MISTAKES.map((tag) => {
    const count = rawMistakes[tag] ?? 0;
    return {
      tag,
      per100: handsPlayed > 0 ? Math.round((count / handsPlayed) * 100 * 10) / 10 : 0,
    };
  }).sort((a, b) => b.per100 - a.per100);

  // School average — stubbed until school-wide aggregate endpoint exists
  const schoolAvg = { vpip: 28, pfr: 21, three_bet: 7, wtsd: 32, wsd: 52 };
  const schoolRows = [
    { label: 'VPIP',  player: latest.vpip_pct,      school: schoolAvg.vpip },
    { label: 'PFR',   player: latest.pfr_pct,       school: schoolAvg.pfr },
    { label: '3bet%', player: latest.three_bet_pct, school: schoolAvg.three_bet },
    { label: 'WTSD',  player: latest.wtsd_pct,      school: schoolAvg.wtsd },
    { label: 'WSD',   player: latest.wsd_pct,       school: schoolAvg.wsd },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Performance row — 5 stat pills */}
      <div className="flex gap-3">
        <StatPill label="VPIP"  value={latest.vpip_pct}      prev={prev.vpip_pct} />
        <StatPill label="PFR"   value={latest.pfr_pct}       prev={prev.pfr_pct} />
        <StatPill label="3bet%" value={latest.three_bet_pct} prev={prev.three_bet_pct} />
        <StatPill label="WTSD"  value={latest.wtsd_pct}      prev={prev.wtsd_pct} />
        <StatPill label="WSD"   value={latest.wsd_pct}       prev={prev.wsd_pct} />
      </div>

      {/* Trend chart */}
      <div className="rounded-lg p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>TREND — PER SESSION</span>
          <select
            value={selectedStat}
            onChange={(e) => setSelectedStat(e.target.value)}
            className="rounded px-2 py-1 text-xs outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
          >
            {STAT_TREND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} style={{ background: '#161b22' }}>{o.label}</option>
            ))}
          </select>
        </div>
        {trendData.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 140, color: '#6e7681', fontSize: 13 }}>
            No snapshot data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6e7681' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6e7681' }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 6, fontSize: 12 }}
                labelStyle={{ color: '#8b949e' }}
                formatter={(val) => [`${val}%`]}
              />
              <Line type="monotone" dataKey="value" stroke="#d4af37" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mistakes per 100 hands */}
      <div className="rounded-lg p-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>MISTAKES PER 100 HANDS</span>
        <div className="flex flex-col gap-2 mt-3">
          {mistakeData.map((m) => (
            <div key={m.tag} className="flex items-center justify-between">
              <span className="text-xs font-mono" style={{ color: '#8b949e' }}>{m.tag.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <div className="rounded" style={{ width: 80, height: 6, background: '#21262d', overflow: 'hidden' }}>
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${Math.min(m.per100 * 10, 100)}%`,
                      background: m.per100 > 5 ? '#f85149' : m.per100 > 2 ? '#d4af37' : '#3fb950',
                    }}
                  />
                </div>
                <span className="text-xs font-mono w-8 text-right" style={{ color: '#f0ece3' }}>
                  {m.per100.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vs School Average */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
        <div className="px-4 py-2.5" style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
          <span className="text-xs font-semibold tracking-widest" style={{ color: '#6e7681' }}>VS SCHOOL AVERAGE</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#161b22', color: '#6e7681' }}>
              <th className="px-4 py-2 text-left font-semibold tracking-wider">STAT</th>
              <th className="px-4 py-2 text-right font-semibold tracking-wider">PLAYER</th>
              <th className="px-4 py-2 text-right font-semibold tracking-wider">SCHOOL AVG</th>
              <th className="px-4 py-2 text-right font-semibold tracking-wider">DIFF</th>
            </tr>
          </thead>
          <tbody>
            {schoolRows.map((row, i) => {
              const pVal = row.player != null ? Number(row.player).toFixed(1) : null;
              const diff = pVal != null ? (Number(pVal) - row.school).toFixed(1) : null;
              const diffColor = diff == null ? '#6e7681' : Number(diff) > 0 ? '#3fb950' : Number(diff) < 0 ? '#f85149' : '#6e7681';
              return (
                <tr
                  key={row.label}
                  style={{ borderTop: '1px solid #21262d', background: i % 2 === 0 ? '#0d1117' : 'transparent' }}
                >
                  <td className="px-4 py-2 font-semibold" style={{ color: '#8b949e' }}>{row.label}</td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: '#f0ece3' }}>
                    {pVal != null ? `${pVal}%` : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono" style={{ color: '#6e7681' }}>{row.school}%</td>
                  <td className="px-4 py-2 text-right font-mono font-bold" style={{ color: diffColor }}>
                    {diff != null ? `${Number(diff) > 0 ? '+' : ''}${diff}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── StakingTab ───────────────────────────────────────────────────────────────

function StakingTab({ player }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (!player?.id) return;
    setLoading(true);
    apiFetch(`/api/coach/students/${player.id}/staking`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [player?.id]);

  const handleSaveNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      await apiFetch(`/api/coach/students/${player.id}/staking/notes`, {
        method: 'POST',
        body: JSON.stringify({ text: noteText.trim() }),
      });
      setNoteText('');
      // reload
      const fresh = await apiFetch(`/api/coach/students/${player.id}/staking`);
      setData(fresh);
    } catch (_) {}
    finally { setSavingNote(false); }
  };

  const contract  = data?.contract  ?? null;
  const monthly   = data?.monthly   ?? [];
  const notes     = data?.notes     ?? [];
  const cumulativePnl = monthly.reduce((acc, m) => acc + (m.net ?? 0), 0);

  const pnlColor = (n) => n >= 0 ? '#3fb950' : '#f85149';
  const pnlSign  = (n) => (n >= 0 ? '+' : '') + Number(n).toLocaleString();

  if (loading) {
    return <div className="py-10 text-center text-sm" style={{ color: '#6e7681' }}>Loading staking data…</div>;
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Contract summary */}
      <div className="rounded-lg px-4 py-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>Staking Contract</h3>
          {contract?.status && (
            <span
              className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{
                background: contract.status === 'active' ? 'rgba(63,185,80,0.1)' : 'rgba(110,118,129,0.1)',
                border: `1px solid ${contract.status === 'active' ? 'rgba(63,185,80,0.3)' : 'rgba(110,118,129,0.3)'}`,
                color: contract.status === 'active' ? '#3fb950' : '#6e7681',
              }}
            >
              {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
            </span>
          )}
        </div>
        {contract ? (
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex gap-2">
              <span style={{ color: '#6e7681', minWidth: 72 }}>Started</span>
              <span style={{ color: '#e6edf3' }}>{formatDate(contract.startedAt ?? contract.started_at)}</span>
            </div>
            <div className="flex gap-2">
              <span style={{ color: '#6e7681', minWidth: 72 }}>Terms</span>
              <span style={{ color: '#e6edf3' }}>{contract.terms ?? '—'}</span>
            </div>
            {contract.review_date && (
              <div className="flex gap-2">
                <span style={{ color: '#6e7681', minWidth: 72 }}>Review</span>
                <span style={{ color: '#d4af37' }}>{formatDate(contract.review_date)}</span>
              </div>
            )}
            {contract.notes && (
              <div className="flex gap-2">
                <span style={{ color: '#6e7681', minWidth: 72 }}>Notes</span>
                <span style={{ color: '#8b949e', fontStyle: 'italic' }}>"{contract.notes}"</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#6e7681' }}>No staking contract on file.</p>
        )}
      </div>

      {/* Monthly summary */}
      {monthly.length > 0 && (
        <div>
          <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#6e7681' }}>Monthly Summary</h3>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#161b22', color: '#6e7681' }}>
                  <th className="px-3 py-2 text-left font-semibold tracking-widest uppercase">Month</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Buy-ins</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Cashouts</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Net</th>
                  <th className="px-3 py-2 text-center font-semibold tracking-widest uppercase">P&L</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => (
                  <tr key={m.month ?? i} style={{ borderTop: '1px solid #21262d', background: i % 2 === 0 ? '#0d1117' : 'transparent' }}>
                    <td className="px-3 py-2" style={{ color: '#8b949e' }}>{m.month ?? formatDate(m.date)}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: '#e6edf3' }}>{Number(m.buyins ?? m.buy_ins ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono" style={{ color: '#e6edf3' }}>{Number(m.cashouts ?? 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: pnlColor(m.net ?? 0) }}>
                      {pnlSign(m.net ?? 0)}
                    </td>
                    <td className="px-3 py-2 text-center" style={{ fontSize: 14 }}>
                      {(m.net ?? 0) >= 0 ? '✅' : '❌'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 px-1">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6e7681' }}>Cumulative P&L</span>
            <span className="text-sm font-bold font-mono" style={{ color: pnlColor(cumulativePnl) }}>
              {pnlSign(cumulativePnl)}
            </span>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#6e7681' }}>Free-form Notes</h3>
        {notes.length > 0 && (
          <div
            className="rounded-lg px-3 py-2.5 mb-3 flex flex-col gap-1.5"
            style={{ background: '#0d1117', border: '1px solid #21262d' }}
          >
            {notes.map((n, i) => (
              <p key={i} className="text-xs leading-relaxed" style={{ color: '#8b949e' }}>
                <span style={{ color: '#6e7681' }}>{formatDate(n.date ?? n.created_at)}: </span>
                {n.text ?? n.body}
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write a staking note…"
            rows={2}
            className="flex-1 text-xs rounded px-2 py-1.5 resize-none outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3' }}
            onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
            onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
          />
          <button
            onClick={handleSaveNote}
            disabled={savingNote || !noteText.trim()}
            className="text-xs px-3 py-1.5 rounded font-semibold self-end disabled:opacity-40"
            style={{ background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
          >
            {savingNote ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ScenariosTab ─────────────────────────────────────────────────────────────

function ScenariosTab({ player }) {
  const navigate = useNavigate();
  const [playlists, setPlaylists]   = useState([]);
  const [history, setHistory]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [assigning, setAssigning]   = useState(false);

  useEffect(() => {
    if (!player?.id) return;
    setLoading(true);
    Promise.all([
      apiFetch(`/api/coach/students/${player.id}/playlists`).catch(() => ({ playlists: [] })),
      apiFetch(`/api/coach/students/${player.id}/scenario-history`).catch(() => ({ history: [] })),
    ]).then(([plData, histData]) => {
      setPlaylists(plData?.playlists ?? []);
      setHistory(histData?.history ?? []);
    }).finally(() => setLoading(false));
  }, [player?.id]);

  const handleOpenScenario = (handId) => {
    if (!handId) return;
    if (navigate) {
      navigate(`/review?handId=${encodeURIComponent(handId)}`);
    }
  };

  if (loading) {
    return <div className="py-10 text-center text-sm" style={{ color: '#6e7681' }}>Loading scenarios…</div>;
  }

  return (
    <div className="flex flex-col gap-5">

      {/* Assigned Playlists */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>Assigned Playlists</h3>
          <button
            onClick={() => setAssigning(true)}
            className="text-xs px-3 py-1 rounded font-semibold"
            style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37', cursor: 'pointer' }}
          >
            + Assign Playlist
          </button>
        </div>
        {playlists.length === 0 ? (
          <div className="rounded-lg px-4 py-6 text-center text-sm" style={{ background: '#161b22', border: '1px solid #30363d', color: '#6e7681' }}>
            No playlists assigned yet.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#161b22', color: '#6e7681' }}>
                  <th className="px-3 py-2 text-left font-semibold tracking-widest uppercase">Playlist</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Played</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">Correct</th>
                  <th className="px-3 py-2 text-right font-semibold tracking-widest uppercase">%</th>
                </tr>
              </thead>
              <tbody>
                {playlists.map((pl, i) => {
                  const pct = pl.played > 0 && pl.correct != null
                    ? Math.round((pl.correct / pl.played) * 100)
                    : null;
                  return (
                    <tr key={pl.id ?? i} style={{ borderTop: '1px solid #21262d', background: i % 2 === 0 ? '#0d1117' : 'transparent' }}>
                      <td className="px-3 py-2" style={{ color: '#e6edf3' }}>
                        {pl.name}
                        {pl.total != null && <span style={{ color: '#4b5563' }}> ({pl.total})</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: '#8b949e' }}>
                        {pl.played ?? '—'}{pl.total != null ? `/${pl.total}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono" style={{ color: '#8b949e' }}>
                        {pl.correct ?? '—'}{pl.played != null ? `/${pl.played}` : ''}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: pct != null ? (pct >= 60 ? '#3fb950' : '#f85149') : '#4b5563' }}>
                        {pct != null ? `${pct}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scenario History */}
      <div>
        <h3 className="text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#6e7681' }}>Scenario History</h3>
        {history.length === 0 ? (
          <div className="rounded-lg px-4 py-6 text-center text-sm" style={{ background: '#161b22', border: '1px solid #30363d', color: '#6e7681' }}>
            No scenario history yet.
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            {history.map((h, i) => (
              <button
                key={h.id ?? i}
                onClick={() => handleOpenScenario(h.handId ?? h.hand_id)}
                className="w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors"
                style={{
                  background: i % 2 === 0 ? '#0d1117' : 'transparent',
                  borderTop: i > 0 ? '1px solid #21262d' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(212,175,55,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? '#0d1117' : 'transparent'; }}
              >
                <span style={{ fontSize: 14, flexShrink: 0 }}>
                  {(h.correct ?? h.result === 'correct') ? '✅' : '❌'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium" style={{ color: '#e6edf3' }}>
                    {h.scenarioName ?? h.scenario_name ?? `Hand #${h.handId ?? h.hand_id}`}
                  </div>
                  {h.tag && (
                    <div className="text-xs mt-0.5">
                      <span className="font-mono" style={{ color: '#8b949e' }}>→ {h.tag}</span>
                    </div>
                  )}
                </div>
                <span className="text-xs flex-shrink-0" style={{ color: '#4b5563' }}>
                  {formatDate(h.date ?? h.created_at)}
                </span>
              </button>
            ))}
          </div>
        )}
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
  const [notes, setNotes]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [content, setContent]     = useState('');
  const [noteType, setNoteType]   = useState('general');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState(null);
  const [filterType, setFilterType] = useState('');

  // Edit state
  const [editingId, setEditingId]     = useState(null);
  const [editContent, setEditContent] = useState('');
  const [editType, setEditType]       = useState('general');
  const [editSaving, setEditSaving]   = useState(false);

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
        body: JSON.stringify({ content: content.trim(), noteType }),
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

  function startEdit(note) {
    setEditingId(note.id);
    setEditContent(note.content);
    setEditType(note.note_type ?? 'general');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditContent('');
    setEditType('general');
  }

  async function handleSaveEdit(noteId) {
    if (!editContent.trim()) return;
    setEditSaving(true);
    try {
      await apiFetch(`/api/admin/players/${player.id}/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent.trim(), noteType: editType }),
      });
      setNotes((prev) =>
        prev.map((n) =>
          n.id === noteId ? { ...n, content: editContent.trim(), note_type: editType } : n
        )
      );
      cancelEdit();
    } catch (err) {
      setError(err.message || 'Failed to save note');
    } finally {
      setEditSaving(false);
    }
  }

  const filteredNotes = filterType
    ? notes.filter((n) => n.note_type === filterType)
    : notes;

  return (
    <div className="flex flex-col gap-4">
      {/* Filter + Add Note form */}
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
          onBlur={(e)  => { e.currentTarget.style.borderColor = '#30363d'; }}
        />
        <div className="flex items-center gap-3">
          <select
            value={noteType}
            onChange={(e) => setNoteType(e.target.value)}
            className="rounded px-3 py-1.5 text-sm outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', cursor: 'pointer' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
            onBlur={(e)  => { e.currentTarget.style.borderColor = '#30363d'; }}
          >
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#161b22' }}>
                {t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}
              </option>
            ))}
          </select>
          <div className="flex-1" />
          <GoldBtn type="submit" disabled={saving || !content.trim()}>
            {saving ? 'ADDING…' : 'SAVE NOTE'}
          </GoldBtn>
        </div>
        {error && (
          <div className="rounded px-3 py-2 text-sm"
            style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149' }}>
            {error}
          </div>
        )}
      </form>

      {/* Filter dropdown */}
      {notes.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: '#6e7681' }}>Filter:</span>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded px-2 py-1 text-xs outline-none"
            style={{ background: '#161b22', border: '1px solid #30363d', color: '#f0ece3', cursor: 'pointer' }}
          >
            <option value="" style={{ background: '#161b22' }}>All types</option>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t} style={{ background: '#161b22' }}>
                {t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}
              </option>
            ))}
          </select>
          <span className="text-xs" style={{ color: '#6e7681' }}>
            {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Notes list */}
      {loading && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>Loading notes…</div>
      )}
      {!loading && filteredNotes.length === 0 && (
        <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>
          {filterType ? 'No notes for this type' : 'No notes yet'}
        </div>
      )}
      <div className="flex flex-col gap-3">
        {filteredNotes.map((note) => (
          <div
            key={note.id}
            className="rounded-lg p-4 flex flex-col gap-2"
            style={{ background: '#161b22', border: '1px solid #30363d' }}
          >
            {editingId === note.id ? (
              /* Inline edit form */
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-1">
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="rounded px-2 py-1 text-xs outline-none"
                    style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
                  >
                    {NOTE_TYPES.map((t) => (
                      <option key={t} value={t} style={{ background: '#161b22' }}>
                        {t.replace('_', ' ').charAt(0).toUpperCase() + t.replace('_', ' ').slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={3}
                  className="w-full rounded px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: '#0d1117', border: '1px solid #d4af37', color: '#f0ece3' }}
                />
                <div className="flex gap-2 justify-end">
                  <GhostBtn onClick={cancelEdit}>Cancel</GhostBtn>
                  <GoldBtn onClick={() => handleSaveEdit(note.id)} disabled={editSaving || !editContent.trim()}>
                    {editSaving ? 'Saving…' : 'Save'}
                  </GoldBtn>
                </div>
              </div>
            ) : (
              /* Read view */
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <NoteTypeBadge type={note.note_type} />
                  <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                    {formatDateTime(note.created_at)}
                  </span>
                  {note.coach_name && (
                    <span className="text-xs" style={{ color: '#6e7681' }}>by {note.coach_name}</span>
                  )}
                  <button
                    onClick={() => startEdit(note)}
                    className="text-xs px-2 py-0.5 rounded ml-auto"
                    style={{
                      background: 'rgba(212,175,55,0.08)',
                      border: '1px solid rgba(212,175,55,0.2)',
                      color: '#d4af37',
                      cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: '#f0ece3' }}>{note.content}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SessionsTab ─────────────────────────────────────────────────────────────
// POK-78: Game session history + coaching attendance

function SessionsTab({ player }) {
  const [gameSessions, setGameSessions]     = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [expandedSession, setExpandedSession] = useState(null);

  const [coachSessions, setCoachSessions]   = useState([]);
  const [coachLoading, setCoachLoading]     = useState(true);

  useEffect(() => {
    if (!player?.id) return;
    setSessionsLoading(true);
    apiFetch(`/api/admin/players/${player.id}/game-sessions`)
      .then((d) => setGameSessions(d?.sessions ?? []))
      .catch(() => setGameSessions([]))
      .finally(() => setSessionsLoading(false));
  }, [player?.id]);

  useEffect(() => {
    if (!player?.id) return;
    setCoachLoading(true);
    apiFetch(`/api/admin/players/${player.id}/schedule`)
      .then((d) => setCoachSessions(d?.sessions ?? []))
      .catch(() => setCoachSessions([]))
      .finally(() => setCoachLoading(false));
  }, [player?.id]);

  const attended = coachSessions.filter((s) => s.status === 'completed').length;
  const missed   = coachSessions.filter((s) => s.status === 'cancelled').length;
  const attendPct = coachSessions.length > 0
    ? Math.round((attended / coachSessions.length) * 100)
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Game Session History */}
      <div>
        <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#6e7681' }}>SESSION HISTORY</p>

        {sessionsLoading && (
          <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>Loading sessions…</div>
        )}
        {!sessionsLoading && gameSessions.length === 0 && (
          <div className="text-sm text-center py-8" style={{ color: '#6e7681' }}>No sessions recorded</div>
        )}
        {!sessionsLoading && gameSessions.length > 0 && (
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #30363d' }}>
            <div
              className="grid text-xs font-semibold tracking-wider px-4 py-2.5"
              style={{
                background: '#161b22', borderBottom: '1px solid #30363d', color: '#6e7681',
                gridTemplateColumns: '140px 1fr 70px 80px 60px 80px',
              }}
            >
              <span>DATE</span>
              <span>TABLE</span>
              <span>HANDS</span>
              <span>NET</span>
              <span>WIN%</span>
              <span></span>
            </div>
            {gameSessions.map((s, idx) => (
              <div key={s.session_id} className="flex flex-col">
                <div
                  className="grid items-center px-4 py-3"
                  style={{
                    gridTemplateColumns: '140px 1fr 70px 80px 60px 80px',
                    borderBottom: '1px solid #21262d',
                    background: idx % 2 === 0 ? '#0d1117' : 'rgba(22,27,34,0.5)',
                  }}
                >
                  <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                    {formatDate(s.started_at)}
                  </span>
                  <span className="text-xs truncate pr-2" style={{ color: '#8b949e' }}>
                    {s.table_id ?? 'main-table'}
                  </span>
                  <span className="text-xs font-mono" style={{ color: '#f0ece3' }}>
                    {s.hands_played ?? '—'}
                  </span>
                  <span className="text-xs font-mono font-bold" style={{ color: s.net_chips >= 0 ? '#3fb950' : '#f85149' }}>
                    {formatNetChips(s.net_chips)}
                  </span>
                  <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
                    {s.win_rate != null ? `${s.win_rate}%` : '—'}
                  </span>
                  <button
                    onClick={() => setExpandedSession(expandedSession === s.session_id ? null : s.session_id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{
                      background: 'rgba(88,166,255,0.08)',
                      border: '1px solid rgba(88,166,255,0.2)',
                      color: '#58a6ff',
                      cursor: 'pointer',
                    }}
                  >
                    {expandedSession === s.session_id ? 'Hide' : 'Hands'}
                  </button>
                </div>
                {expandedSession === s.session_id && (
                  <SessionHandHistory player={player} sessionId={s.session_id} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance section */}
      <div>
        <p className="text-xs font-semibold tracking-widest mb-3" style={{ color: '#6e7681' }}>COACHING ATTENDANCE</p>
        {coachLoading ? (
          <div className="text-sm text-center py-4" style={{ color: '#6e7681' }}>Loading…</div>
        ) : (
          <div className="rounded-lg p-4 flex flex-col gap-4" style={{ background: '#161b22', border: '1px solid #30363d' }}>
            <div className="flex gap-4">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-widest" style={{ color: '#6e7681' }}>SCHEDULED</span>
                <span className="text-xl font-bold" style={{ color: '#f0ece3' }}>{coachSessions.length}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-widest" style={{ color: '#6e7681' }}>ATTENDED</span>
                <span className="text-xl font-bold" style={{ color: '#3fb950' }}>{attended}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs tracking-widest" style={{ color: '#6e7681' }}>ATTENDANCE %</span>
                <span className="text-xl font-bold" style={{ color: attendPct != null && attendPct < 60 ? '#f85149' : '#d4af37' }}>
                  {attendPct != null ? `${attendPct}%` : '—'}
                </span>
              </div>
            </div>
            {missed > 0 && (
              <div>
                <span className="text-xs uppercase tracking-widest" style={{ color: '#6e7681' }}>MISSED SESSIONS</span>
                <div className="flex flex-col gap-1 mt-2">
                  {coachSessions
                    .filter((s) => s.status === 'cancelled')
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs py-1"
                        style={{ borderBottom: '1px solid #21262d', color: '#8b949e' }}>
                        <span>{formatDateTime(s.scheduled_at)}</span>
                        <span className="px-2 py-0.5 rounded text-xs"
                          style={{ background: 'rgba(110,118,129,0.1)', border: '1px solid rgba(110,118,129,0.25)', color: '#6e7681' }}>
                          CANCELLED
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionHandHistory({ player, sessionId }) {
  const [hands, setHands]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/players/${player.id}/hands?limit=50`)
      .then((d) => {
        const all = Array.isArray(d) ? d : (d.hands ?? []);
        setHands(all.filter((h) => h.session_id === sessionId || !sessionId));
      })
      .catch(() => setHands([]))
      .finally(() => setLoading(false));
  }, [player.id, sessionId]);

  if (loading) return (
    <div className="px-4 py-3 text-xs text-center" style={{ color: '#6e7681', background: '#0d1117' }}>
      Loading hands…
    </div>
  );

  if (hands.length === 0) return (
    <div className="px-4 py-3 text-xs text-center" style={{ color: '#6e7681', background: '#0d1117' }}>
      No hands for this session
    </div>
  );

  return (
    <div className="px-4 py-2" style={{ background: '#0d1117', borderBottom: '1px solid #21262d' }}>
      {hands.slice(0, 10).map((hand, i) => {
        const tags = Array.isArray(hand.auto_tags) ? hand.auto_tags : (hand.tags ?? []);
        return (
          <div key={hand.hand_id ?? i} className="flex items-center gap-3 py-1.5"
            style={{ borderBottom: i < hands.length - 1 ? '1px solid #161b22' : 'none' }}>
            <span className="text-xs font-mono w-28 flex-shrink-0" style={{ color: '#6e7681' }}>
              {formatDate(hand.started_at)}
            </span>
            <div className="flex flex-wrap gap-1 flex-1">
              {tags.slice(0, 4).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.15)', color: '#58a6ff' }}>
                  {t}
                </span>
              ))}
            </div>
            <span className="text-xs font-mono flex-shrink-0" style={{ color: hand.stack_end - hand.stack_start >= 0 ? '#3fb950' : '#f85149' }}>
              {hand.stack_end != null && hand.stack_start != null
                ? formatNetChips(hand.stack_end - hand.stack_start)
                : '—'}
            </span>
          </div>
        );
      })}
      {hands.length > 10 && (
        <div className="text-xs py-1" style={{ color: '#6e7681' }}>
          +{hands.length - 10} more hands this session
        </div>
      )}
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

// ─── Stable Overview (roster grid) ───────────────────────────────────────────

const SORT_OPTIONS = [
  { value: 'name',        label: 'Name' },
  { value: 'last_active', label: 'Last Active' },
  { value: 'hands',       label: 'Hands' },
];

function StableTab({ players, playerStats = [], onSelectPlayer }) {
  const [sortBy, setSortBy] = useState('name');
  const [search, setSearch] = useState('');

  // Merge admin player list (roles/status) with leaderboard stats
  const merged = players.map(p => {
    const s = playerStats.find(st => st.stableId === p.id) || {};
    return {
      ...p,
      total_hands:  s.total_hands  ?? 0,
      vpip_percent: s.vpip_percent ?? null,
      pfr_percent:  s.pfr_percent  ?? null,
      last_hand_at: s.last_hand_at ?? null,
    };
  });

  const filtered = merged.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!(p.display_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name')        return (a.display_name || '').localeCompare(b.display_name || '');
    if (sortBy === 'last_active') return (b.last_hand_at || '').localeCompare(a.last_hand_at || '');
    if (sortBy === 'hands')       return b.total_hands - a.total_hands;
    return 0;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #30363d', background: '#161b22' }}
      >
        <div>
          <h2 className="text-sm font-bold tracking-[0.12em]" style={{ color: '#d4af37' }}>
            STABLE OVERVIEW
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>
            {sorted.length} player{sorted.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter players…"
            data-testid="stable-search"
            className="rounded px-3 py-1.5 text-sm outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3', width: 160 }}
          />
          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            data-testid="stable-sort"
            className="rounded px-2 py-1.5 text-xs outline-none"
            style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {players.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: '#6e7681' }}>
          Loading roster…
        </div>
      ) : sorted.length === 0 ? (
        <div
          className="flex-1 flex items-center justify-center text-sm"
          style={{ color: '#6e7681' }}
          data-testid="stable-empty"
        >
          No players found.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Table header */}
          <div
            className="grid text-xs font-semibold tracking-wider px-6 py-2.5 sticky top-0"
            style={{
              background: '#161b22',
              borderBottom: '1px solid #30363d',
              color: '#6e7681',
              gridTemplateColumns: '1fr 90px 70px 70px 70px 100px',
            }}
            data-testid="stable-roster"
          >
            <span>PLAYER</span>
            <span>LAST ACTIVE</span>
            <span>HANDS</span>
            <span>VPIP</span>
            <span>PFR</span>
            <span></span>
          </div>

          {sorted.map(p => {
            const vpip = p.vpip_percent != null ? `${p.vpip_percent}%` : '—';
            const pfr  = p.pfr_percent  != null ? `${p.pfr_percent}%`  : '—';
            const lastActive = p.last_hand_at
              ? formatDate(p.last_hand_at)
              : p.last_seen ? formatDate(p.last_seen) : '—';

            return (
              <div
                key={p.id}
                className="grid items-center px-6 py-3"
                style={{
                  gridTemplateColumns: '1fr 90px 70px 70px 70px 100px',
                  borderBottom: '1px solid #21262d',
                }}
                data-testid={`stable-row-${p.id}`}
              >
                {/* Player name + role */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0"
                    style={{
                      width: 30, height: 30,
                      background: 'rgba(212,175,55,0.12)',
                      color: '#d4af37',
                      border: '1px solid rgba(212,175,55,0.25)',
                    }}
                  >
                    {getInitials(p.display_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: '#f0ece3' }}>
                      {p.display_name || '—'}
                    </div>
                    <div className="mt-0.5">
                      <RolePill role={p.role} />
                    </div>
                  </div>
                </div>

                {/* Last active */}
                <span className="text-xs font-mono" style={{ color: '#6e7681' }}>{lastActive}</span>

                {/* Hands */}
                <span className="text-xs font-mono" style={{ color: '#8b949e' }}>
                  {p.total_hands > 0 ? p.total_hands.toLocaleString() : '—'}
                </span>

                {/* VPIP */}
                <span className="text-xs font-mono" style={{ color: '#8b949e' }}>{vpip}</span>

                {/* PFR */}
                <span className="text-xs font-mono" style={{ color: '#8b949e' }}>{pfr}</span>

                {/* Action */}
                <button
                  onClick={() => onSelectPlayer(p)}
                  data-testid={`stable-view-crm-${p.id}`}
                  className="text-xs px-3 py-1.5 rounded font-semibold transition-colors"
                  style={{
                    background: 'rgba(212,175,55,0.1)',
                    border: '1px solid rgba(212,175,55,0.3)',
                    color: '#d4af37',
                    cursor: 'pointer',
                  }}
                >
                  View CRM →
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PlayerDetail (right panel) ───────────────────────────────────────────────

function PlayerDetail({ player, crm, crmLoading, onBack, onPlayerUpdate, allGroups }) {
  const [activeTab, setActiveTab] = useState('INFO');

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: '#0d1117' }}>
      {/* Player header */}
      <div
        className="flex items-center gap-4 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: '1px solid #30363d', background: '#161b22' }}
      >
        {onBack && (
          <button
            onClick={onBack}
            data-testid="stable-back"
            className="text-xs flex-shrink-0 mr-1"
            style={{ color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← Stable
          </button>
        )}
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
            {activeTab === 'INFO'       && <InfoTab       player={player} crm={crm} onPlayerUpdate={onPlayerUpdate} allGroups={allGroups} />}
            {activeTab === 'SESSIONS'   && <SessionsTab   player={player} />}
            {activeTab === 'STATS'      && <StatsTab      player={player} crm={crm} />}
            {activeTab === 'NOTES'      && <NotesTab      player={player} />}
            {activeTab === 'STAKING'    && <StakingTab    player={player} />}
            {activeTab === 'SCENARIOS'  && <ScenariosTab  player={player} />}
            {activeTab === 'REPORTS'    && <ReportsTab    player={player} />}
            {activeTab === 'PREP BRIEF' && <PrepBriefTab  player={player} />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── AddStudentModal ──────────────────────────────────────────────────────────

function AddStudentModal({ allGroups, schools, onClose, onCreated }) {
  const [name, setName]         = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail]       = useState('');
  const [role, setRole]         = useState('coached_student');
  const [schoolId, setSchoolId] = useState('');
  const [groupIds, setGroupIds] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  function toggleGroup(id) {
    setGroupIds((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      const player = await apiFetch('/api/admin/students', {
        method: 'POST',
        body: JSON.stringify({
          name:     name.trim(),
          password,
          email:    email.trim() || undefined,
          role,
          schoolId: schoolId || undefined,
          groupIds,
        }),
      });
      onCreated(player);
    } catch (err) {
      setError(err.message || 'Failed to create student.');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3',
    borderRadius: 6, padding: '8px 12px', fontSize: 13, width: '100%', outline: 'none',
  };
  const labelStyle = { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: '#6e7681', textTransform: 'uppercase' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{
          background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)', width: 480, maxHeight: '90vh', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #30363d' }}>
          <h2 className="text-sm font-bold tracking-widest" style={{ color: '#d4af37' }}>ADD STUDENT</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5 overflow-y-auto">
          {/* Name */}
          <div className="flex flex-col gap-1">
            <label style={labelStyle}>Name *</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Display name" autoFocus style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1">
            <label style={labelStyle}>Temporary Password *</label>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters" style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label style={labelStyle}>Email (optional)</label>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com" style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          {/* Role + School row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>Role</label>
              <select
                value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              >
                <option value="coached_student" style={{ background: '#161b22' }}>Coached Student</option>
                <option value="solo_student" style={{ background: '#161b22' }}>Solo Student</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>School</label>
              <select
                value={schoolId} onChange={(e) => setSchoolId(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer', color: schoolId ? '#f0ece3' : '#6e7681' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              >
                <option value="" style={{ background: '#161b22', color: '#6e7681' }}>No school</option>
                {(schools ?? []).map((s) => (
                  <option key={s.id} value={s.id} style={{ background: '#161b22', color: '#f0ece3' }}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Groups */}
          {(allGroups ?? []).length > 0 && (
            <div className="flex flex-col gap-2">
              <label style={labelStyle}>Groups</label>
              <div className="flex flex-wrap gap-2">
                {allGroups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g.id)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
                      style={{
                        background: on ? `${g.color ?? '#58a6ff'}22` : 'transparent',
                        border: `1px solid ${on ? (g.color ?? '#58a6ff') : '#30363d'}`,
                        color: on ? (g.color ?? '#58a6ff') : '#6e7681',
                        cursor: 'pointer',
                      }}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p className="text-xs" style={{ color: '#f85149' }}>{error}</p>}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <GhostBtn onClick={onClose}>Cancel</GhostBtn>
            <GoldBtn type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create Student'}</GoldBtn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PlayerCRM() {
  const location = useLocation();

  const [players, setPlayers]           = useState([]);
  const [playersLoading, setPlayersLoading] = useState(true);
  const [playersError, setPlayersError] = useState(null);

  const [search, setSearch]             = useState('');
  const [filterRole, setFilterRole]     = useState('');
  const [filterGroup, setFilterGroup]   = useState('');
  const [filterArchived, setFilterArchived] = useState(false);
  const [groupView, setGroupView]       = useState(false);

  const [playerStats, setPlayerStats]   = useState([]);
  const [groups, setGroups]             = useState([]);
  const [schools, setSchools]           = useState([]);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [crm, setCrm]                   = useState(null);
  const [crmLoading, setCrmLoading]     = useState(false);

  const [alerts, setAlerts]             = useState([]);
  const [bulkOpen, setBulkOpen]         = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);

  // Compute per-player alert severity band
  const getAlertDot = useCallback((player) => {
    if (!player) return ALERT_DOT.inactive;
    const playerAlerts = alerts.filter(
      (a) => a.player_id === player.id || a.player_name === player.display_name,
    );
    if (playerAlerts.length > 0) {
      const maxSev = Math.max(...playerAlerts.map((a) => a.severity ?? 0));
      if (maxSev >= 0.75) return ALERT_DOT.high;
      if (maxSev >= 0.4)  return ALERT_DOT.moderate;
    }
    if (player.status === 'archived') return ALERT_DOT.inactive;
    if (!player.last_seen && !player.hands_played) return ALERT_DOT.inactive;
    return ALERT_DOT.healthy;
  }, [alerts]);

  // Load player list on mount; auto-select if navigated here with a playerId
  useEffect(() => {
    (async () => {
      setPlayersLoading(true);
      setPlayersError(null);
      try {
        const data = await apiFetch('/api/admin/players');
        const list = Array.isArray(data) ? data : (data.players ?? []);
        setPlayers(list);
        const preselect = location.state?.playerId;
        if (preselect) {
          const match = list.find((p) => p.id === preselect);
          if (match) setSelectedPlayer(match);
        }
      } catch (err) {
        setPlayersError(err.message || 'Failed to load players');
      } finally {
        setPlayersLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load player stats, groups, schools, and alerts in parallel
  useEffect(() => {
    apiFetch('/api/players')
      .then(d => setPlayerStats(d?.players ?? []))
      .catch(() => {});
    apiFetch('/api/admin/groups?includeMembers=1')
      .then(d => setGroups(d?.groups ?? []))
      .catch(() => {});
    apiFetch('/api/admin/schools')
      .then(d => setSchools(d?.schools ?? []))
      .catch(() => {});
    apiFetch('/api/coach/alerts')
      .then((d) => {
        const raw = d?.alerts ?? d;
        setAlerts(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {});
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

  // Build { playerId → groupId[] } map from groups with members
  const playerGroupMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => {
      (g.members ?? []).forEach((m) => {
        if (!map[m.id]) map[m.id] = [];
        map[m.id].push(g.id);
      });
    });
    return map;
  }, [groups]);

  // Filter player list
  const filtered = useMemo(() => players.filter((p) => {
    if (!filterArchived && p.status === 'archived') return false;
    if (filterRole && p.role !== filterRole) return false;
    if (filterGroup) {
      const gids = playerGroupMap[p.id] ?? [];
      if (!gids.includes(filterGroup)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (!(p.display_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  }), [players, filterArchived, filterRole, filterGroup, search, playerGroupMap]);

  // Grouped list: array of { group, players } + ungrouped section
  const groupedSections = useMemo(() => {
    if (!groupView) return null;
    const sections = [];
    groups.forEach((g) => {
      const members = filtered.filter((p) => (playerGroupMap[p.id] ?? []).includes(g.id));
      if (members.length > 0) sections.push({ group: g, players: members });
    });
    const ungrouped = filtered.filter((p) => !(playerGroupMap[p.id]?.length));
    if (ungrouped.length > 0) sections.push({ group: null, players: ungrouped });
    return sections;
  }, [groupView, groups, filtered, playerGroupMap]);

  // Render a single player row (shared between flat + grouped views)
  function PlayerRow({ p }) {
    const selected = selectedPlayer?.id === p.id;
    const dot = getAlertDot(p);
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
        <span className="flex-shrink-0" style={{ color: dot.color, fontSize: 8, lineHeight: 1, marginTop: 1 }} title={dot.title}>●</span>
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-sm font-medium truncate" style={{ color: selected ? '#d4af37' : '#f0ece3' }}>
            {p.display_name || '—'}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <RolePill role={p.role} />
            {(p.last_seen || p.created_at) && (
              <span className="text-xs" style={{ color: '#6e7681' }}>{formatDate(p.last_seen || p.created_at)}</span>
            )}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className="flex"
      style={{ height: '100%', background: '#060a0f', color: '#f0ece3', overflow: 'hidden' }}
    >
      {/* ── Left column ────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{ width: 280, background: '#161b22', borderRight: '1px solid #30363d', height: '100%', overflow: 'hidden' }}
      >
        {/* Left header */}
        <div className="px-4 pt-5 pb-3 flex-shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
          <h1 className="text-sm font-bold tracking-[0.14em]" style={{ color: '#d4af37' }}>STABLE / CRM</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6e7681' }}>{filtered.length} players</p>
        </div>

        {/* Search + filter */}
        <div className="px-3 py-3 flex flex-col gap-2 flex-shrink-0" style={{ borderBottom: '1px solid #30363d' }}>
          {/* Search input */}
          <div className="relative">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#6e7681' }}>
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full rounded pl-8 pr-3 py-1.5 text-sm outline-none"
              style={{ background: '#0d1117', border: '1px solid #30363d', color: '#f0ece3' }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
            />
          </div>

          {/* Role filter + archived toggle */}
          <div className="flex gap-2 items-center">
            <select
              value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
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
              className="px-2 py-1.5 rounded text-xs font-medium"
              style={{
                background: filterArchived ? 'rgba(110,118,129,0.15)' : 'transparent',
                border: `1px solid ${filterArchived ? '#6e7681' : '#30363d'}`,
                color: '#6e7681', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
              title="Toggle archived players"
            >
              {filterArchived ? 'HIDE ARCH' : 'ARCHIVED'}
            </button>
          </div>

          {/* Group filter + grouped view toggle */}
          {groups.length > 0 && (
            <div className="flex gap-2 items-center">
              <select
                value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
                className="flex-1 rounded px-2 py-1.5 text-xs outline-none"
                style={{ background: '#0d1117', border: '1px solid #30363d', color: filterGroup ? '#f0ece3' : '#6e7681', cursor: 'pointer' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
              >
                <option value="" style={{ background: '#161b22', color: '#6e7681' }}>All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id} style={{ background: '#161b22', color: '#f0ece3' }}>{g.name}</option>
                ))}
              </select>
              <button
                onClick={() => setGroupView((v) => !v)}
                className="px-2 py-1.5 rounded text-xs font-medium"
                style={{
                  background: groupView ? 'rgba(88,166,255,0.12)' : 'transparent',
                  border: `1px solid ${groupView ? '#58a6ff' : '#30363d'}`,
                  color: groupView ? '#58a6ff' : '#6e7681',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                title="Toggle grouped view"
              >
                BY GROUP
              </button>
            </div>
          )}
        </div>

        {/* Player list */}
        <div className="flex-1 overflow-y-auto">
          {playersLoading && (
            <div className="flex items-center justify-center py-8 text-xs" style={{ color: '#6e7681' }}>Loading players…</div>
          )}
          {playersError && (
            <div className="px-4 py-3 text-xs" style={{ color: '#f85149' }}>{playersError}</div>
          )}
          {!playersLoading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-8 text-xs" style={{ color: '#6e7681' }}>No players found</div>
          )}

          {/* Grouped view */}
          {!playersLoading && groupView && groupedSections && groupedSections.map((section, i) => (
            <div key={section.group?.id ?? 'ungrouped'}>
              <div
                className="px-3 py-1.5 flex items-center gap-2"
                style={{ background: '#0d1117', borderBottom: '1px solid #21262d' }}
              >
                {section.group ? (
                  <span
                    className="text-xs font-bold tracking-widest"
                    style={{ color: section.group.color ?? '#58a6ff' }}
                  >
                    ● {section.group.name.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-xs font-bold tracking-widest" style={{ color: '#6e7681' }}>UNGROUPED</span>
                )}
                <span className="text-xs ml-auto" style={{ color: '#6e7681' }}>{section.players.length}</span>
              </div>
              {section.players.map((p) => <PlayerRow key={p.id} p={p} />)}
            </div>
          ))}

          {/* Flat view */}
          {!playersLoading && !groupView && filtered.map((p) => <PlayerRow key={p.id} p={p} />)}
        </div>

        {/* Roster footer: Add Student + Bulk Actions */}
        <div className="flex gap-2 px-3 py-3 flex-shrink-0" style={{ borderTop: '1px solid #30363d' }}>
          <GhostBtn
            onClick={() => setAddStudentOpen(true)}
            style={{ flex: 1, textAlign: 'center', fontSize: 11 }}
          >
            + Add Student
          </GhostBtn>
          <div className="relative">
            <GhostBtn
              onClick={() => setBulkOpen((v) => !v)}
              style={{ whiteSpace: 'nowrap', fontSize: 11 }}
            >
              Bulk Actions ▾
            </GhostBtn>
            {bulkOpen && (
              <div
                className="absolute bottom-full left-0 mb-1 rounded-lg overflow-hidden z-20"
                style={{ background: '#161b22', border: '1px solid #30363d', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 160 }}
              >
                {['Assign Playlist', 'Send Announcement', 'Schedule Session'].map((label) => (
                  <button
                    key={label}
                    onClick={() => setBulkOpen(false)}
                    className="w-full text-left px-4 py-2.5 text-xs transition-colors"
                    style={{ color: '#8b949e', background: 'transparent' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#f0ece3'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8b949e'; }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Right column ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden" style={{ background: '#0d1117' }}>
        {!selectedPlayer ? (
          <StableTab players={players} playerStats={playerStats} onSelectPlayer={setSelectedPlayer} />
        ) : (
          <PlayerDetail
            player={selectedPlayer}
            crm={crm}
            crmLoading={crmLoading}
            onBack={() => setSelectedPlayer(null)}
            onPlayerUpdate={(updated) => setSelectedPlayer(updated)}
            allGroups={groups}
          />
        )}
      </div>

      {/* Add Student modal */}
      {addStudentOpen && (
        <AddStudentModal
          allGroups={groups}
          schools={schools}
          onClose={() => setAddStudentOpen(false)}
          onCreated={(newPlayer) => {
            setPlayers((prev) => [newPlayer, ...prev]);
            setSelectedPlayer(newPlayer);
            setAddStudentOpen(false);
          }}
        />
      )}
    </div>
  );
}
