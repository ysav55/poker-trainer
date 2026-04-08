import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const GOLD = '#d4af37';

function StatusBadge({ status }) {
  const COLOR = { pending: '#93c5fd', running: '#3fb950', paused: '#e3b341', finished: '#6e7681' };
  const c = COLOR[status] ?? '#6e7681';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 3, background: `${c}18`, border: `1px solid ${c}55`, color: c }}>
      {status}
    </span>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #21262d' }}>
      <span style={{ fontSize: 11, color: '#6e7681' }}>{label}</span>
      <span style={{ fontSize: 12, color: '#f0ece3', fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  );
}

function BlindStructureSheet({ schedule }) {
  if (!schedule || schedule.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No blind schedule.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#6e7681' }}>
          {['Lvl', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.map((lvl, i) => (
          <tr key={i} style={{ color: '#c9d1d9' }}>
            <td style={{ padding: '4px 0', color: GOLD, fontWeight: 700 }}>{lvl.level}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.sb?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.bb?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.ante?.toLocaleString()}</td>
            <td style={{ padding: '4px 8px' }}>{lvl.duration_minutes} min</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RegistrantsList({ registrations }) {
  if (!registrations || registrations.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No registrations yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {registrations.map(r => (
        <div key={r.id} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: '#0d1117', borderRadius: 4, fontSize: 12, color: '#c9d1d9' }}>
          <span>{r.player_profiles?.display_name ?? r.player_id}</span>
          <span style={{ fontSize: 10, color: r.status === 'seated' ? '#3fb950' : '#6e7681', textTransform: 'uppercase', fontWeight: 700 }}>{r.status}</span>
        </div>
      ))}
    </div>
  );
}

function PayoutsTable({ payoutStructure, buyIn, registrationCount }) {
  if (!payoutStructure || payoutStructure.length === 0) return <p style={{ color: '#6e7681', fontSize: 12 }}>No payout structure.</p>;
  const totalPool = buyIn * registrationCount;
  return (
    <div className="flex flex-col gap-1">
      {payoutStructure.map(tier => (
        <div key={tier.place} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: '#0d1117', borderRadius: 4, fontSize: 12, color: '#c9d1d9' }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>#{tier.place}</span>
          <span>{tier.percentage}%</span>
          {totalPool > 0 && (
            <span style={{ color: '#3fb950' }}>{Math.floor(totalPool * tier.percentage / 100).toLocaleString()} chips</span>
          )}
        </div>
      ))}
      {totalPool > 0 && (
        <div style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
          Prize pool: <strong style={{ color: GOLD }}>{totalPool.toLocaleString()} chips</strong>
        </div>
      )}
    </div>
  );
}

export default function TournamentDetailPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { user, hasPermission } = useAuth();

  const [group, setGroup]               = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [tableIds, setTableIds]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [actionBusy, setActionBusy]     = useState(false);
  const [error, setError]               = useState(null);

  const playerId = user?.stableId ?? user?.id;
  const isCoachOrAdmin = ['coach', 'admin', 'superadmin'].includes(user?.role);
  const canManage = hasPermission('tournament:manage') || isCoachOrAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/tournament-groups/${groupId}`);
      setGroup(data.group);
      setRegistrations(data.registrations ?? []);
      setTableIds(data.tableIds ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const isRegistered = registrations.some(r => r.player_id === playerId && r.status !== 'cancelled');
  const myReg = registrations.find(r => r.player_id === playerId && r.status !== 'cancelled');
  const myTableId = myReg?.status === 'seated' ? tableIds[0] : null;

  async function handleRegister() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleUnregister() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStart() {
    setActionBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/start`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setActionBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#6e7681', padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group) return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Tournament not found.</div>;

  const schedule = group.shared_config?.blind_schedule ?? [];
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;

  const btnStyle = (primary = false) => ({
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 18px', borderRadius: 6, cursor: actionBusy ? 'not-allowed' : 'pointer',
    opacity: actionBusy ? 0.6 : 1,
    background: primary ? GOLD : 'none',
    color: primary ? '#0d1117' : GOLD,
    border: primary ? 'none' : `1px solid ${GOLD}55`,
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate('/tournaments')}
        style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 12, marginBottom: 16, padding: 0 }}>
        ← Back to Tournaments
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#f0ece3', marginBottom: 4 }}>{group.name}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={group.status} />
            {scheduledAt && <span style={{ fontSize: 11, color: '#6e7681' }}>{scheduledAt.toLocaleString()}</span>}
            <span style={{ fontSize: 11, color: '#6e7681', textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap justify-end">
          {group.status === 'pending' && !isRegistered && (
            <button style={btnStyle(true)} onClick={handleRegister} disabled={actionBusy}>
              Register{group.buy_in > 0 ? ` (${group.buy_in.toLocaleString()} chips)` : ' (Free)'}
            </button>
          )}
          {group.status === 'pending' && isRegistered && (
            <button style={btnStyle()} onClick={handleUnregister} disabled={actionBusy}>Unregister</button>
          )}
          {group.status === 'running' && myReg?.status === 'seated' && tableIds.length > 0 && (
            <button style={btnStyle(true)} onClick={() => navigate(`/table/${tableIds[0]}`)}>Join Table</button>
          )}
          {canManage && group.status === 'pending' && (
            <button style={btnStyle(true)} onClick={handleStart} disabled={actionBusy}>Start Tournament</button>
          )}
          {canManage && ['pending', 'running'].includes(group.status) && (
            <button style={{ ...btnStyle(), color: '#f85149', borderColor: 'rgba(248,81,73,0.3)' }} onClick={handleCancel} disabled={actionBusy}>Cancel</button>
          )}
          {canManage && (
            <button style={btnStyle()} onClick={() => navigate(`/tournaments/${groupId}/control`)}>Control View</button>
          )}
        </div>
      </div>

      {error && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* Info grid */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, padding: '12px 16px', marginBottom: 20 }}>
        <InfoRow label="Starting Stack" value={(group.shared_config?.starting_stack ?? 0).toLocaleString() + ' chips'} />
        <InfoRow label="Buy-In" value={group.buy_in > 0 ? `${group.buy_in.toLocaleString()} chips` : 'Free'} />
        <InfoRow label="Registrations" value={`${registrations.filter(r => r.status !== 'cancelled').length} players`} />
        {group.late_reg_enabled && <InfoRow label="Late Registration" value={`${group.late_reg_minutes} minutes after start`} />}
      </div>

      {/* Three columns: blind structure, registrants, payouts */}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Blind Structure</h3>
          <BlindStructureSheet schedule={schedule} />
        </section>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Registrants</h3>
          <RegistrantsList registrations={registrations.filter(r => r.status !== 'cancelled')} />
        </section>
        <section>
          <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 10 }}>Payouts</h3>
          <PayoutsTable
            payoutStructure={group.payout_structure ?? []}
            buyIn={group.buy_in ?? 0}
            registrationCount={registrations.filter(r => r.status !== 'cancelled').length}
          />
        </section>
      </div>
    </div>
  );
}
