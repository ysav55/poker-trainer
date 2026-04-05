import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../../lib/api.js';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt$(n) {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtAbs(n) {
  if (n == null) return '—';
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getInitials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ['PokerStars', 'GGPoker', '888poker', 'PartyPoker', '7xl', 'Winamax', 'Live', 'Other'];
const GAME_FORMATS = ['cash', 'tournament', 'sit_and_go'];
const MAKEUP_POLICIES = ['carries', 'resets_monthly', 'resets_on_settle'];
const MAKEUP_POLICY_LABELS = {
  carries:          'Carries over',
  resets_monthly:   'Resets monthly',
  resets_on_settle: 'Resets on settle',
};
const ADJUSTMENT_TYPES = ['forgive_makeup', 'adjust_makeup', 'correction', 'bonus', 'penalty'];
const ADJUSTMENT_LABELS = {
  forgive_makeup:  'Forgive makeup',
  adjust_makeup:   'Adjust makeup',
  correction:      'Correction',
  bonus:           'Bonus',
  penalty:         'Penalty',
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusColor(status) {
  if (status === 'in_makeup')  return '#e3b341';
  if (status === 'in_profit')  return '#3fb950';
  if (status === 'even')       return '#8b949e';
  return '#58a6ff';
}

function statusLabel(status, state) {
  if (!state) return '—';
  if (status === 'in_makeup')  return fmt$(state.current_makeup) + ' makeup';
  if (status === 'in_profit')  return fmt$(state.profit_above_makeup) + ' profit';
  if (status === 'even')       return 'even';
  return status;
}

function pillStyle(status) {
  if (status === 'in_makeup')
    return { background: 'rgba(227,179,65,0.15)', color: '#e3b341' };
  if (status === 'in_profit')
    return { background: 'rgba(63,185,80,0.12)', color: '#3fb950' };
  return { background: 'rgba(139,148,158,0.12)', color: '#8b949e' };
}

function avatarStyle(status) {
  if (status === 'in_makeup')  return { background: 'rgba(227,179,65,0.15)', color: '#e3b341' };
  if (status === 'in_profit')  return { background: 'rgba(63,185,80,0.12)', color: '#3fb950' };
  if (status === 'settlement_pending') return { background: 'rgba(88,166,255,0.12)', color: '#58a6ff' };
  return { background: 'rgba(139,148,158,0.12)', color: '#8b949e' };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MonthlyBars({ breakdown }) {
  if (!breakdown?.length) {
    return <div style={{ color: '#6e7681', fontSize: 12 }}>No sessions logged yet.</div>;
  }
  const maxAbs = Math.max(...breakdown.map(m => Math.abs(m.net)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {breakdown.map(m => {
        const pct = Math.abs(m.net) / maxAbs * 45; // max 45% of half-track
        const pos = m.net >= 0;
        return (
          <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 32, color: '#8b949e', fontSize: 11, flexShrink: 0 }}>
              {m.month.slice(5)}
            </span>
            <div style={{
              flex: 1, height: 16, background: '#161b22', borderRadius: 3,
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3, position: 'absolute',
                width: `${pct}%`,
                left: pos ? '50%' : undefined,
                right: pos ? undefined : `calc(50% - ${pct}% + 0%)`,
                background: pos ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)',
              }} />
              <div style={{
                position: 'absolute', left: '50%', top: 0, bottom: 0,
                width: 1, background: '#30363d',
              }} />
            </div>
            <span style={{
              width: 64, textAlign: 'right', fontWeight: 500, fontSize: 11,
              color: m.net >= 0 ? '#3fb950' : '#f85149',
            }}>
              {fmt$(m.net)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SessionRow({ session, onExpand, expanded, onEdit, onDelete, onDispute, isCoach }) {
  const net = parseFloat(session.cashout) - parseFloat(session.buy_in);
  return (
    <>
      <tr
        onClick={() => onExpand(session.id)}
        style={{ cursor: 'pointer' }}
      >
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12 }}>
          {fmtShortDate(session.session_date)}
        </td>
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12 }}>
          {session.platform}
        </td>
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12 }}>
          {session.game_type}
        </td>
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12, textAlign: 'right' }}>
          {fmtAbs(session.buy_in)}
        </td>
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12, textAlign: 'right' }}>
          {fmtAbs(session.cashout)}
        </td>
        <td style={{
          padding: '8px 8px', borderBottom: '0.5px solid #21262d', fontSize: 12,
          textAlign: 'right', fontWeight: 500,
          color: net >= 0 ? '#3fb950' : '#f85149',
        }}>
          {fmt$(net)}
        </td>
        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d' }}>
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 6,
            ...(session.reported_by_role === 'coach'
              ? { background: 'rgba(88,166,255,0.12)', color: '#58a6ff' }
              : { background: 'rgba(139,148,158,0.12)', color: '#8b949e' }),
          }}>
            {session.reported_by_role}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{
            background: '#161b22', padding: '10px 12px', fontSize: 12,
            borderBottom: '0.5px solid #21262d',
          }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              {session.notes && (
                <span style={{ color: '#8b949e' }}>Notes: <span style={{ color: '#e6edf3' }}>{session.notes}</span></span>
              )}
              {session.duration_hours && (
                <span style={{ color: '#8b949e' }}>Duration: <span style={{ color: '#e6edf3' }}>{session.duration_hours}h</span></span>
              )}
              <span style={{ color: '#8b949e' }}>Format: <span style={{ color: '#e6edf3' }}>{session.game_format}</span></span>
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                {(isCoach || session.reported_by_role === 'player') && (
                  <button onClick={e => { e.stopPropagation(); onEdit(session); }} style={btnSm}>Edit</button>
                )}
                {session.status === 'confirmed' && (
                  <button onClick={e => { e.stopPropagation(); onDispute(session.id); }} style={btnSm}>Dispute</button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); onDelete(session.id); }}
                  style={{ ...btnSm, color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Add Session Modal ────────────────────────────────────────────────────────

function SessionModal({ onClose, onSave, editSession, playerName }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    session_date:   editSession?.session_date  ?? today,
    platform:       editSession?.platform      ?? '',
    game_type:      editSession?.game_type     ?? '',
    game_format:    editSession?.game_format   ?? 'cash',
    buy_in:         editSession?.buy_in        ?? '',
    cashout:        editSession?.cashout       ?? '',
    duration_hours: editSession?.duration_hours ?? '',
    notes:          editSession?.notes         ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const net = form.buy_in !== '' && form.cashout !== ''
    ? parseFloat(form.cashout) - parseFloat(form.buy_in)
    : null;

  async function handleSave() {
    setErr('');
    if (!form.session_date) return setErr('Date is required');
    if (!form.platform)     return setErr('Platform is required');
    if (!form.game_type)    return setErr('Game type is required');
    if (form.buy_in === '') return setErr('Buy-in is required');
    if (form.cashout === '') return setErr('Cashout is required');
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
          {editSession ? 'Edit session' : `Add session${playerName ? ` — ${playerName}` : ''}`}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={lbl}>
            Date
            <input type="date" value={form.session_date} max={today}
              onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
              style={inp} />
          </label>
          <label style={lbl}>
            Platform
            <input list="platforms" value={form.platform}
              onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
              placeholder="PokerStars…" style={inp} />
            <datalist id="platforms">
              {PLATFORMS.map(p => <option key={p} value={p} />)}
            </datalist>
          </label>
          <label style={lbl}>
            Game type
            <input value={form.game_type}
              onChange={e => setForm(f => ({ ...f, game_type: e.target.value }))}
              placeholder="NL200…" style={inp} />
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={lbl}>
            Format
            <select value={form.game_format}
              onChange={e => setForm(f => ({ ...f, game_format: e.target.value }))}
              style={inp}>
              {GAME_FORMATS.map(g => <option key={g} value={g}>{g.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label style={lbl}>
            Buy-in ($)
            <input type="number" min="0" step="0.01" value={form.buy_in}
              onChange={e => setForm(f => ({ ...f, buy_in: e.target.value }))}
              placeholder="0" style={inp} />
          </label>
          <label style={lbl}>
            Cashout ($)
            <input type="number" min="0" step="0.01" value={form.cashout}
              onChange={e => setForm(f => ({ ...f, cashout: e.target.value }))}
              placeholder="0" style={inp} />
          </label>
          <label style={lbl}>
            Duration (h)
            <input type="number" min="0" step="0.5" value={form.duration_hours}
              onChange={e => setForm(f => ({ ...f, duration_hours: e.target.value }))}
              placeholder="optional" style={inp} />
          </label>
        </div>

        <label style={{ ...lbl, marginBottom: 10 }}>
          Notes (optional)
          <input value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="…" style={inp} />
        </label>

        {net !== null && (
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            Net:{' '}
            <strong style={{ color: net >= 0 ? '#3fb950' : '#f85149' }}>{fmt$(net)}</strong>
          </div>
        )}

        {err && <div style={{ fontSize: 12, color: '#f85149', marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnOutline}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : (editSession ? 'Save changes' : 'Add Session')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Adjustment Modal ─────────────────────────────────────────────────────────

function AdjustmentModal({ onClose, onSave, currentMakeup }) {
  const [form, setForm] = useState({ type: 'forgive_makeup', amount: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const preview = form.amount !== ''
    ? currentMakeup + parseFloat(form.amount)
    : null;

  async function handleSave() {
    setErr('');
    if (!form.amount) return setErr('Amount is required');
    if (!form.reason) return setErr('Reason is required');
    setSaving(true);
    try {
      await onSave({ type: form.type, amount: parseFloat(form.amount), reason: form.reason });
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>Makeup adjustment</div>

        <label style={{ ...lbl, marginBottom: 10 }}>
          Type
          <select value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            style={inp}>
            {ADJUSTMENT_TYPES.map(t => <option key={t} value={t}>{ADJUSTMENT_LABELS[t]}</option>)}
          </select>
        </label>

        <label style={{ ...lbl, marginBottom: 10 }}>
          Amount ($) — positive = player's favor
          <input type="number" step="0.01" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
            placeholder="e.g. 500" style={inp} />
        </label>

        <label style={{ ...lbl, marginBottom: 10 }}>
          Reason (required)
          <input value={form.reason}
            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
            placeholder="Reason for adjustment…" style={inp} />
        </label>

        <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
          Current makeup: <strong style={{ color: '#e6edf3' }}>{fmt$(currentMakeup)}</strong>
          {preview !== null && (
            <> → After: <strong style={{ color: preview >= 0 ? '#3fb950' : '#e3b341' }}>{fmt$(Math.min(0, preview))}</strong></>
          )}
        </div>

        {err && <div style={{ fontSize: 12, color: '#f85149', marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnOutline}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : 'Apply Adjustment'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Contract Edit Modal ──────────────────────────────────────────────────────

function ContractModal({ contract, players, onClose, onSave }) {
  const [form, setForm] = useState(contract ? {
    player_id:       contract.player_id,
    coach_split_pct: contract.coach_split_pct,
    makeup_policy:   contract.makeup_policy,
    bankroll_cap:    contract.bankroll_cap ?? '',
    start_date:      contract.start_date,
    end_date:        contract.end_date ?? '',
    notes:           contract.notes ?? '',
  } : {
    player_id:       '',
    coach_split_pct: 50,
    makeup_policy:   'carries',
    bankroll_cap:    '',
    start_date:      new Date().toISOString().slice(0, 10),
    end_date:        '',
    notes:           '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function handleSave() {
    setErr('');
    if (!contract && !form.player_id) return setErr('Player is required');
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
          {contract ? 'Edit contract' : 'New contract'}
        </div>

        {!contract && (
          <label style={{ ...lbl, marginBottom: 10 }}>
            Player
            <select value={form.player_id}
              onChange={e => setForm(f => ({ ...f, player_id: e.target.value }))}
              style={inp}>
              <option value="">Select player…</option>
              {(players || []).map(p => (
                <option key={p.id} value={p.id}>{p.display_name}</option>
              ))}
            </select>
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={lbl}>
            Coach split %
            <input type="number" min="1" max="99" value={form.coach_split_pct}
              onChange={e => setForm(f => ({ ...f, coach_split_pct: parseInt(e.target.value, 10) }))}
              style={inp} />
            <span style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
              Player gets {100 - (form.coach_split_pct || 0)}%
            </span>
          </label>
          <label style={lbl}>
            Makeup policy
            <select value={form.makeup_policy}
              onChange={e => setForm(f => ({ ...f, makeup_policy: e.target.value }))}
              style={inp}>
              {MAKEUP_POLICIES.map(p => <option key={p} value={p}>{MAKEUP_POLICY_LABELS[p]}</option>)}
            </select>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <label style={lbl}>
            Bankroll cap ($)
            <input type="number" min="0" step="100" value={form.bankroll_cap}
              onChange={e => setForm(f => ({ ...f, bankroll_cap: e.target.value }))}
              placeholder="unlimited" style={inp} />
          </label>
          <label style={lbl}>
            Start date
            <input type="date" value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              style={inp} />
          </label>
          <label style={lbl}>
            End date
            <input type="date" value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              placeholder="open-ended" style={inp} />
          </label>
        </div>

        <label style={{ ...lbl, marginBottom: 10 }}>
          Notes
          <textarea value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2} style={{ ...inp, resize: 'vertical' }} />
        </label>

        {err && <div style={{ fontSize: 12, color: '#f85149', marginBottom: 8 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnOutline}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            {saving ? 'Saving…' : (contract ? 'Save changes' : 'Create contract')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
};
const modal = {
  background: '#161b22', border: '0.5px solid #30363d', borderRadius: 12,
  padding: '20px 24px', width: 520, maxHeight: '90vh', overflowY: 'auto',
  color: '#e6edf3',
};
const lbl = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#8b949e',
};
const inp = {
  background: '#0d1117', border: '0.5px solid #30363d', borderRadius: 6,
  color: '#e6edf3', padding: '6px 8px', fontSize: 13, outline: 'none',
};
const btnSm = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '0.5px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer',
};
const btnOutline = {
  fontSize: 12, padding: '6px 14px', background: 'transparent',
  border: '0.5px solid #30363d', borderRadius: 8, color: '#8b949e', cursor: 'pointer',
};
const btnPrimary = {
  fontSize: 12, padding: '6px 14px',
  background: 'rgba(63,185,80,0.15)', color: '#3fb950',
  border: '0.5px solid rgba(63,185,80,0.4)', borderRadius: 8,
  cursor: 'pointer', fontWeight: 500,
};
const btnDanger = {
  ...btnOutline, color: '#f85149', borderColor: 'rgba(248,81,73,0.3)',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function StakingPage() {
  const [overview, setOverview]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null); // contract id
  const [detail, setDetail]           = useState(null); // { contract, state, sessions, settlements, adjustments, monthly }
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editSession, setEditSession] = useState(null);
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [editContract, setEditContract] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [sessionPage, setSessionPage] = useState(0);
  const [allSessions, setAllSessions] = useState(false);
  const SESSION_PAGE_SIZE = 10;

  // ── Load overview ──────────────────────────────────────────────────────────
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/staking/overview');
      setOverview(data.contracts || []);
      // Auto-select first
      if (!selected && data.contracts?.length) {
        setSelected(data.contracts[0].contract.id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => { loadOverview(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load players for contract creation ────────────────────────────────────
  useEffect(() => {
    apiFetch('/api/admin/players')
      .then(d => setAvailablePlayers(d.players || d || []))
      .catch(() => {});
  }, []);

  // ── Load detail when selected changes ─────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    setDetailLoading(true);
    setSessionPage(0);
    setAllSessions(false);

    Promise.all([
      apiFetch(`/api/staking/contracts/${selected}/state`),
      apiFetch(`/api/staking/contracts/${selected}/sessions?limit=0`),
      apiFetch(`/api/staking/contracts/${selected}/settlements`),
      apiFetch(`/api/staking/contracts/${selected}/adjustments`),
      apiFetch(`/api/staking/contracts/${selected}/monthly`),
    ]).then(([state, sessData, settData, adjData, monthData]) => {
      const contract = overview.find(o => o.contract.id === selected)?.contract;
      setDetail({
        contract,
        state,
        sessions:    sessData.sessions || [],
        settlements: settData.settlements || [],
        adjustments: adjData.adjustments || [],
        monthly:     monthData.breakdown || [],
      });
    }).catch(e => console.error(e))
      .finally(() => setDetailLoading(false));
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh detail state + overview after a change ────────────────────────
  const refreshDetail = useCallback(async () => {
    if (!selected) return;
    const [state, sessData, settData, adjData, monthData] = await Promise.all([
      apiFetch(`/api/staking/contracts/${selected}/state`),
      apiFetch(`/api/staking/contracts/${selected}/sessions?limit=0`),
      apiFetch(`/api/staking/contracts/${selected}/settlements`),
      apiFetch(`/api/staking/contracts/${selected}/adjustments`),
      apiFetch(`/api/staking/contracts/${selected}/monthly`),
    ]);
    setDetail(d => ({
      ...d,
      state,
      sessions:    sessData.sessions || [],
      settlements: settData.settlements || [],
      adjustments: adjData.adjustments || [],
      monthly:     monthData.breakdown || [],
    }));
    // Refresh overview counts too
    const ov = await apiFetch('/api/staking/overview');
    setOverview(ov.contracts || []);
  }, [selected]);

  // ── Session handlers ───────────────────────────────────────────────────────
  async function handleAddSession(form) {
    await apiFetch(`/api/staking/contracts/${selected}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        session_date:   form.session_date,
        platform:       form.platform,
        game_type:      form.game_type,
        game_format:    form.game_format,
        buy_in:         parseFloat(form.buy_in),
        cashout:        parseFloat(form.cashout),
        notes:          form.notes || undefined,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : undefined,
      }),
    });
    await refreshDetail();
  }

  async function handleEditSession(form) {
    await apiFetch(`/api/staking/sessions/${editSession.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        session_date:   form.session_date,
        platform:       form.platform,
        game_type:      form.game_type,
        game_format:    form.game_format,
        buy_in:         parseFloat(form.buy_in),
        cashout:        parseFloat(form.cashout),
        notes:          form.notes || undefined,
        duration_hours: form.duration_hours ? parseFloat(form.duration_hours) : undefined,
      }),
    });
    setEditSession(null);
    await refreshDetail();
  }

  async function handleDeleteSession(id) {
    if (!window.confirm('Delete this session?')) return;
    await apiFetch(`/api/staking/sessions/${id}`, { method: 'DELETE' });
    await refreshDetail();
  }

  async function handleDisputeSession(id) {
    await apiFetch(`/api/staking/sessions/${id}/dispute`, { method: 'POST' });
    await refreshDetail();
  }

  // ── Settlement handlers ────────────────────────────────────────────────────
  async function handleProposeSettlement() {
    await apiFetch(`/api/staking/contracts/${selected}/settlements`, { method: 'POST' });
    await refreshDetail();
  }

  async function handleApproveSettlement(id) {
    await apiFetch(`/api/staking/settlements/${id}/approve`, { method: 'PATCH' });
    await refreshDetail();
  }

  async function handleRejectSettlement(id) {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null) return;
    await apiFetch(`/api/staking/settlements/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    await refreshDetail();
  }

  // ── Adjustment handler ─────────────────────────────────────────────────────
  async function handleAdjust(form) {
    await apiFetch(`/api/staking/contracts/${selected}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(form),
    });
    await refreshDetail();
  }

  // ── Contract handlers ──────────────────────────────────────────────────────
  async function handleSaveContract(form) {
    if (editContract) {
      await apiFetch(`/api/staking/contracts/${editContract.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          coach_split_pct: form.coach_split_pct,
          makeup_policy:   form.makeup_policy,
          bankroll_cap:    form.bankroll_cap ? parseFloat(form.bankroll_cap) : null,
          end_date:        form.end_date || null,
          notes:           form.notes || null,
        }),
      });
    } else {
      const created = await apiFetch('/api/staking/contracts', {
        method: 'POST',
        body: JSON.stringify({
          player_id:       form.player_id,
          coach_split_pct: form.coach_split_pct,
          makeup_policy:   form.makeup_policy,
          bankroll_cap:    form.bankroll_cap ? parseFloat(form.bankroll_cap) : null,
          start_date:      form.start_date,
          end_date:        form.end_date || null,
          notes:           form.notes || null,
        }),
      });
      setSelected(created.id);
    }
    setEditContract(null);
    await loadOverview();
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const selectedOverview = overview.find(o => o.contract?.id === selected);
  const state    = detail?.state;
  const contract = detail?.contract ?? selectedOverview?.contract;
  const sessions = detail?.sessions ?? [];
  const settlements = detail?.settlements ?? [];
  const monthly  = detail?.monthly ?? [];

  const pendingSettlement = settlements.find(s => s.status === 'proposed');
  const lastApproved = settlements.find(s => s.status === 'approved');

  const visibleSessions = allSessions
    ? sessions
    : sessions.slice(sessionPage * SESSION_PAGE_SIZE, (sessionPage + 1) * SESSION_PAGE_SIZE);

  // ── Render: empty state ────────────────────────────────────────────────────
  if (!loading && overview.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#e6edf3' }}>Staking</h1>
          <button
            onClick={() => { setEditContract(null); setShowContractModal(true); }}
            style={btnPrimary}
          >
            + New contract
          </button>
        </div>
        <div style={{
          background: '#161b22', border: '0.5px solid #30363d', borderRadius: 12,
          padding: '48px 24px', textAlign: 'center', color: '#6e7681',
        }}>
          No active staking contracts. Create one to get started.
        </div>
        {showContractModal && (
          <ContractModal
            contract={null}
            players={availablePlayers}
            onClose={() => setShowContractModal(false)}
            onSave={handleSaveContract}
          />
        )}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, color: '#e6edf3' }}>
      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>Staking</h1>
        <button
          onClick={() => { setEditContract(null); setShowContractModal(true); }}
          style={btnSm}
        >
          + New contract
        </button>
      </div>

      {/* Master-detail grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)',
        border: '0.5px solid #30363d', borderRadius: 12, overflow: 'hidden',
        minHeight: 600,
      }}>
        {/* ── Roster ─────────────────────────────────────────────────────── */}
        <div style={{ background: '#161b22', borderRight: '0.5px solid #30363d', padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#8b949e', marginBottom: 8 }}>
            Staked players ({overview.length})
          </div>
          {loading ? (
            <div style={{ fontSize: 12, color: '#6e7681' }}>Loading…</div>
          ) : overview.map(({ contract: c, state: s }) => {
            const st = s?.status ?? 'even';
            const isActive = c.id === selected;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: 8,
                  borderRadius: 8, cursor: 'pointer', width: '100%', marginBottom: 2,
                  background: isActive ? '#0d1117' : 'transparent',
                  border: isActive ? '0.5px solid #30363d' : '0.5px solid transparent',
                  textAlign: 'left',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 500, flexShrink: 0,
                  ...avatarStyle(st),
                }}>
                  {getInitials(c.player_name || c.player_id)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.player_name || 'Player'}
                  </div>
                  <div style={{ fontSize: 10, color: statusColor(st) }}>
                    {statusLabel(st, s)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Detail ─────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', background: '#0d1117', overflowY: 'auto' }}>
          {detailLoading || !detail ? (
            <div style={{ color: '#6e7681', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 500 }}>
                    {contract?.player_name || 'Player'}
                  </span>
                  {state && (
                    <span style={{
                      fontSize: 11, fontWeight: 500, padding: '2px 10px',
                      borderRadius: 10, ...pillStyle(state.status),
                    }}>
                      {state.status.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => { setEditContract(contract); setShowContractModal(true); }}
                  style={btnSm}
                >
                  Edit contract
                </button>
              </div>

              {/* Stats row */}
              {state && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    {
                      val: fmt$(state.current_makeup || state.profit_above_makeup),
                      color: state.current_makeup < 0 ? '#f85149' : state.profit_above_makeup > 0 ? '#3fb950' : '#e6edf3',
                      label: state.current_makeup < 0 ? 'current makeup' : 'profit above makeup',
                    },
                    { val: fmtAbs(contract?.total_invested),     label: 'total invested' },
                    { val: fmtAbs(state.total_cashouts),         label: 'total cashed out' },
                    { val: state.sessions_count,                 label: 'sessions played' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: '#161b22', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 18, fontWeight: 500, color: s.color || '#e6edf3' }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Contract terms */}
              {contract && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#8b949e', marginBottom: 8 }}>Contract terms</div>
                  <div style={{
                    background: '#161b22', border: '0.5px solid #30363d',
                    borderRadius: 12, padding: '14px 16px',
                    display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12,
                  }}>
                    {[
                      { label: 'split', val: `${contract.coach_split_pct} / ${contract.player_split_pct}` },
                      { label: 'makeup', val: MAKEUP_POLICY_LABELS[contract.makeup_policy] },
                      { label: 'bankroll cap', val: contract.bankroll_cap ? fmtAbs(contract.bankroll_cap) : 'Unlimited' },
                      { label: 'contract end', val: contract.end_date ? fmtDate(contract.end_date) : 'Open-ended' },
                    ].map(item => (
                      <div key={item.label}>
                        <div style={{ fontSize: 11, color: '#6e7681', marginBottom: 2 }}>{item.label}</div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly P&L */}
              {monthly.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#8b949e', marginBottom: 8 }}>Monthly P&L</div>
                  <MonthlyBars breakdown={monthly} />
                </div>
              )}

              {/* Session log */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#8b949e' }}>Session log</span>
                  <button onClick={() => { setEditSession(null); setShowSessionModal(true); }} style={btnSm}>
                    + Add session
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#6e7681' }}>No sessions logged yet.</div>
                ) : (
                  <>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          {['Date', 'Platform', 'Game', 'Buy-in', 'Cashout', 'Net', 'By'].map((h, i) => (
                            <th key={h} style={{
                              padding: '7px 8px', color: '#6e7681', fontWeight: 500, fontSize: 11,
                              borderBottom: '0.5px solid #30363d',
                              textAlign: i >= 3 && i <= 5 ? 'right' : 'left',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleSessions.map(s => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            expanded={expandedRow === s.id}
                            onExpand={id => setExpandedRow(expandedRow === id ? null : id)}
                            onEdit={session => { setEditSession(session); setShowSessionModal(true); }}
                            onDelete={handleDeleteSession}
                            onDispute={handleDisputeSession}
                            isCoach={true}
                          />
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: '#6e7681' }}>
                        {allSessions
                          ? `Showing all ${sessions.length} sessions`
                          : `Showing ${Math.min((sessionPage + 1) * SESSION_PAGE_SIZE, sessions.length)} of ${sessions.length}`}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!allSessions && sessions.length > SESSION_PAGE_SIZE && (
                          <>
                            {sessionPage > 0 && (
                              <button onClick={() => setSessionPage(p => p - 1)} style={btnSm}>←</button>
                            )}
                            {(sessionPage + 1) * SESSION_PAGE_SIZE < sessions.length && (
                              <button onClick={() => setSessionPage(p => p + 1)} style={btnSm}>→</button>
                            )}
                          </>
                        )}
                        {sessions.length > SESSION_PAGE_SIZE && (
                          <button onClick={() => setAllSessions(!allSessions)} style={btnSm}>
                            {allSessions ? 'Paginate' : 'Show all'}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Settlement section */}
              {state && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#8b949e', marginBottom: 8 }}>Settlement</div>
                  <div style={{
                    background: '#0d1117', border: '0.5px solid #30363d',
                    borderRadius: 12, padding: 16,
                  }}>
                    {pendingSettlement ? (
                      // Pending settlement
                      <>
                        <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 8 }}>
                          Settlement proposed by {pendingSettlement.proposed_by === contract?.coach_id ? 'Coach' : 'Player'} on {fmtShortDate(pendingSettlement.proposed_at?.slice(0,10))}
                        </div>
                        {[
                          { label: 'Coach share', val: fmt$(pendingSettlement.coach_share) },
                          { label: 'Player share', val: fmt$(pendingSettlement.player_share) },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                            <span style={{ color: '#8b949e' }}>{r.label}</span>
                            <span style={{ fontWeight: 500 }}>{r.val}</span>
                          </div>
                        ))}
                        <div style={{ borderTop: '0.5px solid #30363d', margin: '8px 0' }} />
                        <div style={{ fontSize: 12, marginBottom: 12 }}>
                          <span style={{ color: pendingSettlement.coach_approved ? '#3fb950' : '#6e7681' }}>
                            {pendingSettlement.coach_approved ? '✓' : '⏳'} Coach {pendingSettlement.coach_approved ? 'approved' : 'pending'}
                          </span>
                          {'  '}
                          <span style={{ color: pendingSettlement.player_approved ? '#3fb950' : '#6e7681' }}>
                            {pendingSettlement.player_approved ? '✓' : '⏳'} Player {pendingSettlement.player_approved ? 'approved' : 'pending'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {!pendingSettlement.coach_approved && (
                            <button onClick={() => handleApproveSettlement(pendingSettlement.id)} style={btnPrimary}>
                              Approve
                            </button>
                          )}
                          <button onClick={() => handleRejectSettlement(pendingSettlement.id)} style={btnDanger}>
                            Reject
                          </button>
                        </div>
                      </>
                    ) : (
                      // No pending settlement
                      <>
                        {[
                          { label: `Total P&L (since ${fmtShortDate(state.period_start)})`, val: fmt$(state.gross_pnl), color: state.gross_pnl >= 0 ? '#3fb950' : '#f85149' },
                          { label: 'Makeup entering period', val: fmt$(state.prior_makeup) },
                          { label: 'Current makeup', val: fmt$(state.current_makeup) },
                          { label: 'Profit above makeup', val: fmt$(state.profit_above_makeup), color: state.profit_above_makeup > 0 ? '#3fb950' : '#e6edf3' },
                        ].map(r => (
                          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                            <span style={{ color: '#8b949e' }}>{r.label}</span>
                            <span style={{ fontWeight: 500, color: r.color || '#e6edf3' }}>{r.val}</span>
                          </div>
                        ))}
                        {state.profit_above_makeup > 0 && (
                          <>
                            <div style={{ borderTop: '0.5px solid #30363d', margin: '8px 0' }} />
                            {[
                              { label: `Coach share (${contract?.coach_split_pct}%)`, val: fmt$(state.coach_share) },
                              { label: `Player share (${contract?.player_split_pct}%)`, val: fmt$(state.player_share) },
                            ].map(r => (
                              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                                <span style={{ color: '#8b949e' }}>{r.label}</span>
                                <span style={{ fontWeight: 500 }}>{r.val}</span>
                              </div>
                            ))}
                            <div style={{ borderTop: '0.5px solid #30363d', margin: '8px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, padding: '4px 0' }}>
                              <span style={{ fontWeight: 500 }}>Player owes coach</span>
                              <span style={{ fontWeight: 500 }}>{fmt$(state.coach_share)}</span>
                            </div>
                          </>
                        )}
                        {state.profit_above_makeup <= 0 && (
                          <div style={{ fontSize: 11, color: '#6e7681', marginTop: 6 }}>
                            No settlement available — player is in makeup. Makeup must be cleared before profit split applies.
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button
                            onClick={handleProposeSettlement}
                            disabled={state.profit_above_makeup <= 0}
                            style={{
                              ...btnPrimary,
                              opacity: state.profit_above_makeup <= 0 ? 0.4 : 1,
                              cursor: state.profit_above_makeup <= 0 ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Propose settlement
                          </button>
                          <button onClick={() => setShowAdjModal(true)} style={btnOutline}>Adjust makeup</button>
                          <button
                            onClick={() => {
                              // Prefill forgive_makeup with full amount
                              setShowAdjModal(true);
                            }}
                            style={btnOutline}
                          >
                            Forgive makeup
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Settlement history */}
              {settlements.filter(s => s.status === 'approved').length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#8b949e', marginBottom: 8 }}>Settlement history</div>
                  <div style={{ background: '#0d1117', border: '0.5px solid #30363d', borderRadius: 12, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          {['#', 'Date', 'Period', 'Gross P&L', 'Coach share'].map((h, i) => (
                            <th key={h} style={{
                              padding: '7px 12px', color: '#6e7681', fontWeight: 500, fontSize: 11,
                              borderBottom: '0.5px solid #30363d', textAlign: i >= 3 ? 'right' : 'left',
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {settlements.filter(s => s.status === 'approved').map((s, i, arr) => (
                          <tr key={s.id} style={{ borderBottom: '0.5px solid #21262d' }}>
                            <td style={{ padding: '8px 12px', color: '#6e7681' }}>{arr.length - i}</td>
                            <td style={{ padding: '8px 12px' }}>{fmtShortDate(s.settled_at?.slice(0, 10))}</td>
                            <td style={{ padding: '8px 12px', color: '#8b949e' }}>
                              {fmtShortDate(s.period_start)} – {fmtShortDate(s.period_end)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', color: s.gross_pnl >= 0 ? '#3fb950' : '#f85149' }}>
                              {fmt$(s.gross_pnl)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500 }}>
                              {fmt$(s.coach_share)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {(showSessionModal || editSession) && (
        <SessionModal
          editSession={editSession}
          playerName={contract?.player_name}
          onClose={() => { setShowSessionModal(false); setEditSession(null); }}
          onSave={editSession ? handleEditSession : handleAddSession}
        />
      )}
      {showAdjModal && (
        <AdjustmentModal
          currentMakeup={state?.current_makeup ?? 0}
          onClose={() => setShowAdjModal(false)}
          onSave={handleAdjust}
        />
      )}
      {showContractModal && (
        <ContractModal
          contract={editContract}
          players={availablePlayers}
          onClose={() => { setShowContractModal(false); setEditContract(null); }}
          onSave={handleSaveContract}
        />
      )}
    </div>
  );
}
