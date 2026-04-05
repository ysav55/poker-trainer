import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt$(n, forceSign = false) {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : (forceSign && n > 0) ? '+' : '';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtAbs(n) {
  if (n == null) return '—';
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtShortDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORMS = ['PokerStars', 'GGPoker', '888poker', 'PartyPoker', '7xl', 'Winamax', 'Live', 'Other'];
const GAME_FORMATS = ['cash', 'tournament', 'sit_and_go'];
const MAKEUP_POLICY_LABELS = {
  carries:          'Carries over',
  resets_monthly:   'Resets monthly',
  resets_on_settle: 'Resets on settle',
};

// ─── Shared styles ────────────────────────────────────────────────────────────

const inp = {
  background: '#0d1117', border: '0.5px solid #30363d', borderRadius: 6,
  color: '#e6edf3', padding: '6px 8px', fontSize: 13, outline: 'none', width: '100%',
};
const lbl = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: '#8b949e',
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
const btnSm = {
  fontSize: 11, padding: '4px 10px', background: 'transparent',
  border: '0.5px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer',
};
const card = {
  background: '#161b22', border: '0.5px solid #30363d', borderRadius: 12, padding: '14px 16px',
};

// ─── Quick add session form ───────────────────────────────────────────────────

function QuickAddSession({ contractId, onAdded }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    session_date: today, platform: '', game_type: '', game_format: 'cash',
    buy_in: '', cashout: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const net = form.buy_in !== '' && form.cashout !== ''
    ? parseFloat(form.cashout) - parseFloat(form.buy_in)
    : null;

  async function handleAdd() {
    setErr('');
    if (!form.session_date) return setErr('Date is required');
    if (!form.platform)     return setErr('Platform is required');
    if (!form.game_type)    return setErr('Game type is required');
    if (form.buy_in === '') return setErr('Buy-in is required');
    if (form.cashout === '') return setErr('Cashout is required');
    setSaving(true);
    try {
      await apiFetch(`/api/staking/contracts/${contractId}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          session_date:  form.session_date,
          platform:      form.platform,
          game_type:     form.game_type,
          game_format:   form.game_format,
          buy_in:        parseFloat(form.buy_in),
          cashout:       parseFloat(form.cashout),
          notes:         form.notes || undefined,
        }),
      });
      setForm({ session_date: today, platform: '', game_type: '', game_format: 'cash', buy_in: '', cashout: '', notes: '' });
      onAdded();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Report session</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8, alignItems: 'end' }}>
        <label style={lbl}>
          Date
          <input type="date" value={form.session_date} max={today}
            onChange={e => setForm(f => ({ ...f, session_date: e.target.value }))}
            style={inp} />
        </label>
        <label style={lbl}>
          Platform
          <input list="pl-list" value={form.platform}
            onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
            placeholder="PokerStars…" style={inp} />
          <datalist id="pl-list">
            {PLATFORMS.map(p => <option key={p} value={p} />)}
          </datalist>
        </label>
        <label style={lbl}>
          Game
          <input value={form.game_type}
            onChange={e => setForm(f => ({ ...f, game_type: e.target.value }))}
            placeholder="NL200…" style={inp} />
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ ...lbl, flex: 1 }}>
          <input value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Notes (optional)" style={inp} />
        </label>
        {net !== null && (
          <span style={{ fontSize: 13, fontWeight: 500, color: net >= 0 ? '#3fb950' : '#f85149', whiteSpace: 'nowrap' }}>
            Net: {fmt$(net, true)}
          </span>
        )}
        <button onClick={handleAdd} disabled={saving} style={{ ...btnPrimary, whiteSpace: 'nowrap' }}>
          {saving ? 'Adding…' : 'Add Session'}
        </button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#f85149', marginTop: 6 }}>{err}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StakingPlayerPage() {
  const { user } = useAuth();
  const [contract, setContract]       = useState(null);
  const [state, setState]             = useState(null);
  const [sessions, setSessions]       = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [monthly, setMonthly]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [expandedRow, setExpandedRow] = useState(null);
  const [showAll, setShowAll]         = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const { contracts } = await apiFetch('/api/staking/contracts?status=active');
      if (!contracts?.length) {
        setLoading(false);
        return;
      }
      const c = contracts[0];
      setContract(c);

      const [stateData, sessData, settData, monthData] = await Promise.all([
        apiFetch(`/api/staking/contracts/${c.id}/state`),
        apiFetch(`/api/staking/contracts/${c.id}/sessions?limit=0`),
        apiFetch(`/api/staking/contracts/${c.id}/settlements`),
        apiFetch(`/api/staking/contracts/${c.id}/monthly`),
      ]);

      setState(stateData);
      setSessions(sessData.sessions || []);
      setSettlements(settData.settlements || []);
      setMonthly(monthData.breakdown || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleDeleteSession(id) {
    if (!window.confirm('Delete this session?')) return;
    await apiFetch(`/api/staking/sessions/${id}`, { method: 'DELETE' });
    await loadAll();
  }

  async function handleDisputeSession(id) {
    await apiFetch(`/api/staking/sessions/${id}/dispute`, { method: 'POST' });
    await loadAll();
  }

  async function handleProposeSettlement() {
    await apiFetch(`/api/staking/contracts/${contract.id}/settlements`, { method: 'POST' });
    await loadAll();
  }

  async function handleApproveSettlement(id) {
    await apiFetch(`/api/staking/settlements/${id}/approve`, { method: 'PATCH' });
    await loadAll();
  }

  async function handleRejectSettlement(id) {
    const reason = window.prompt('Reason for rejection?');
    if (reason === null) return;
    await apiFetch(`/api/staking/settlements/${id}/reject`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    await loadAll();
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const pendingSettlement = settlements.find(s => s.status === 'proposed');
  const thisMonth = monthly
    ? (() => {
        const m = new Date().toISOString().slice(0, 7);
        return monthly.find(x => x.month === m) || null;
      })()
    : null;
  const visibleSessions = showAll ? sessions : sessions.slice(0, 8);

  // ── No contract ────────────────────────────────────────────────────────────
  if (!loading && !contract) {
    return (
      <div style={{ padding: 24, color: '#e6edf3' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>My Staking</h1>
        <div style={{ ...card, textAlign: 'center', color: '#6e7681', padding: '48px 24px' }}>
          No active staking contract. Contact your coach to get set up.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24, color: '#6e7681', fontSize: 13 }}>Loading…</div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, color: '#e6edf3', maxWidth: 800 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>My Staking Deal</h1>
        {state && (
          <div style={{ fontSize: 13, color: '#8b949e', marginTop: 2 }}>
            Split: {contract.coach_split_pct}/{contract.player_split_pct}{' '}
            ·{' '}
            <span style={{ color: state.status === 'in_makeup' ? '#e3b341' : state.status === 'in_profit' ? '#3fb950' : '#8b949e' }}>
              {state.status === 'in_makeup'
                ? 'in makeup'
                : state.status === 'in_profit'
                  ? 'in profit'
                  : 'even'}
            </span>
          </div>
        )}
      </div>

      {/* Stats pills */}
      {state && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
          <div style={card}>
            <div style={{
              fontSize: 22, fontWeight: 600,
              color: state.current_makeup < 0 ? '#f85149' : state.profit_above_makeup > 0 ? '#3fb950' : '#8b949e',
            }}>
              {state.current_makeup < 0 ? fmt$(state.current_makeup) : fmt$(state.profit_above_makeup, true)}
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>
              {state.current_makeup < 0 ? 'Makeup' : state.profit_above_makeup > 0 ? 'Profit above makeup' : 'Even'}
            </div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{state.sessions_count}</div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>Sessions played</div>
          </div>
          <div style={card}>
            <div style={{
              fontSize: 22, fontWeight: 600,
              color: (thisMonth?.net ?? 0) >= 0 ? '#3fb950' : '#f85149',
            }}>
              {thisMonth ? fmt$(thisMonth.net, true) : '$0'}
            </div>
            <div style={{ fontSize: 11, color: '#8b949e', marginTop: 2 }}>This month</div>
          </div>
        </div>
      )}

      {/* Quick add session */}
      <QuickAddSession contractId={contract.id} onAdded={loadAll} />

      {/* Recent sessions */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Recent sessions</div>
        {sessions.length === 0 ? (
          <div style={{ fontSize: 12, color: '#6e7681' }}>No sessions logged yet.</div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Date', 'Platform', 'Game', 'Buy-in', 'Cashout', 'Net'].map((h, i) => (
                    <th key={h} style={{
                      padding: '6px 8px', color: '#6e7681', fontWeight: 500, fontSize: 11,
                      borderBottom: '0.5px solid #30363d', textAlign: i >= 3 ? 'right' : 'left',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSessions.map(s => {
                  const net = parseFloat(s.cashout) - parseFloat(s.buy_in);
                  const expanded = expandedRow === s.id;
                  const ownSession = s.reported_by === user?.id;
                  const withinWindow = (Date.now() - new Date(s.created_at).getTime()) / 3600000 < 48;
                  return (
                    <React.Fragment key={s.id}>
                      <tr
                        onClick={() => setExpandedRow(expanded ? null : s.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d' }}>
                          {fmtShortDate(s.session_date)}
                        </td>
                        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d' }}>{s.platform}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d' }}>{s.game_type}</td>
                        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', textAlign: 'right' }}>
                          {fmtAbs(s.buy_in)}
                        </td>
                        <td style={{ padding: '8px 8px', borderBottom: '0.5px solid #21262d', textAlign: 'right' }}>
                          {fmtAbs(s.cashout)}
                        </td>
                        <td style={{
                          padding: '8px 8px', borderBottom: '0.5px solid #21262d', textAlign: 'right',
                          fontWeight: 500, color: net >= 0 ? '#3fb950' : '#f85149',
                        }}>
                          {fmt$(net, true)}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={6} style={{
                            background: '#161b22', padding: '8px 12px', fontSize: 11,
                            borderBottom: '0.5px solid #21262d', color: '#8b949e',
                          }}>
                            {s.notes && <span>Notes: <span style={{ color: '#e6edf3' }}>{s.notes}</span> · </span>}
                            Format: {s.game_format}
                            {' · '}
                            {s.reported_by_role === 'coach' ? 'Added by coach' : 'Added by you'}
                            {ownSession && withinWindow && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                                style={{ ...btnSm, marginLeft: 12, color: '#f85149', borderColor: 'rgba(248,81,73,0.3)', fontSize: 10 }}
                              >
                                Delete
                              </button>
                            )}
                            {s.status === 'confirmed' && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDisputeSession(s.id); }}
                                style={{ ...btnSm, marginLeft: 6, fontSize: 10 }}
                              >
                                Dispute
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            {sessions.length > 8 && (
              <button
                onClick={() => setShowAll(!showAll)}
                style={{ ...btnSm, marginTop: 8, fontSize: 11 }}
              >
                {showAll ? 'Show less' : `See all ${sessions.length} sessions →`}
              </button>
            )}
          </>
        )}
      </div>

      {/* This month summary */}
      {state && thisMonth && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>This month</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, fontSize: 12 }}>
            <div>
              <div style={{ color: '#6e7681', fontSize: 11 }}>Sessions</div>
              <div style={{ fontWeight: 500 }}>{thisMonth.sessions}</div>
            </div>
            <div>
              <div style={{ color: '#6e7681', fontSize: 11 }}>Buy-ins</div>
              <div style={{ fontWeight: 500 }}>{fmtAbs(thisMonth.buy_ins)}</div>
            </div>
            <div>
              <div style={{ color: '#6e7681', fontSize: 11 }}>Net</div>
              <div style={{ fontWeight: 500, color: thisMonth.net >= 0 ? '#3fb950' : '#f85149' }}>
                {fmt$(thisMonth.net, true)}
              </div>
            </div>
          </div>
          {state.current_makeup < 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#8b949e', borderTop: '0.5px solid #21262d', paddingTop: 8 }}>
              Running makeup: <strong style={{ color: '#e3b341' }}>{fmt$(state.current_makeup)}</strong>
              {' — '}
              Need to win <strong style={{ color: '#e6edf3' }}>{fmtAbs(-state.current_makeup)}</strong> more to clear makeup.
            </div>
          )}
          {state.profit_above_makeup > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#8b949e', borderTop: '0.5px solid #21262d', paddingTop: 8 }}>
              You're in profit! Your share: <strong style={{ color: '#3fb950' }}>{fmt$(state.player_share)}</strong>
            </div>
          )}
        </div>
      )}

      {/* Settlement section */}
      {state && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Settlement</div>

          {pendingSettlement ? (
            // Pending settlement — player can approve/reject
            <div>
              <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 10 }}>
                Settlement proposed by Coach on {fmtShortDate(pendingSettlement.proposed_at?.slice(0, 10))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: '#8b949e' }}>Your share</span>
                <strong style={{ color: '#3fb950' }}>{fmt$(pendingSettlement.player_share)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: '#8b949e' }}>Coach share</span>
                <span style={{ fontWeight: 500 }}>{fmt$(pendingSettlement.coach_share)}</span>
              </div>
              <div style={{ borderTop: '0.5px solid #30363d', margin: '8px 0' }} />
              <div style={{ fontSize: 12, marginBottom: 12, color: '#8b949e' }}>
                <span style={{ color: pendingSettlement.coach_approved ? '#3fb950' : '#6e7681' }}>
                  {pendingSettlement.coach_approved ? '✓' : '⏳'} Coach
                </span>
                {'  '}
                <span style={{ color: pendingSettlement.player_approved ? '#3fb950' : '#6e7681' }}>
                  {pendingSettlement.player_approved ? '✓' : '⏳'} You
                </span>
              </div>
              {!pendingSettlement.player_approved && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleApproveSettlement(pendingSettlement.id)} style={btnPrimary}>Approve</button>
                  <button onClick={() => handleRejectSettlement(pendingSettlement.id)} style={{ ...btnOutline, color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }}>Reject</button>
                </div>
              )}
            </div>
          ) : state.profit_above_makeup > 0 ? (
            // In profit — can propose
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: '#8b949e' }}>Profit above makeup</span>
                <strong style={{ color: '#3fb950' }}>{fmt$(state.profit_above_makeup)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                <span style={{ color: '#8b949e' }}>Your share ({contract.player_split_pct}%)</span>
                <strong style={{ color: '#3fb950' }}>{fmt$(state.player_share)}</strong>
              </div>
              <div style={{ marginTop: 12 }}>
                <button onClick={handleProposeSettlement} style={btnPrimary}>Propose settlement</button>
              </div>
            </div>
          ) : (
            // In makeup
            <div style={{ fontSize: 12, color: '#6e7681' }}>
              No settlement available — player is in makeup ({fmt$(state.current_makeup)}).
              Makeup must be cleared before profit split applies.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
