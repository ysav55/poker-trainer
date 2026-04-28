import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Users, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import StatusBadge from '../components/tournament/StatusBadge.jsx';
import CollapsibleSection from '../components/CollapsibleSection.jsx';
import { colors } from '../lib/colors.js';

function InfoCell({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 13, color: colors.textPrimary, fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  );
}

function BlindStructureSheet({ schedule }) {
  if (!schedule || schedule.length === 0) return <p style={{ color: colors.textMuted, fontSize: 12 }}>No blind schedule.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: colors.textMuted }}>
          {['Lvl', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.map((lvl, i) => (
          <tr key={i} style={{ color: colors.textSecondary }}>
            <td style={{ padding: '4px 0', color: colors.gold, fontWeight: 700 }}>{lvl.level}</td>
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
  if (!registrations || registrations.length === 0) return <p style={{ color: colors.textMuted, fontSize: 12 }}>No registrations yet.</p>;
  return (
    <div className="flex flex-col gap-1">
      {registrations.map(r => (
        <div key={r.id} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: colors.bgSurface, borderRadius: 4, fontSize: 12, color: colors.textSecondary }}>
          <span>{r.player_profiles?.display_name ?? r.player_id}</span>
          <span style={{
            fontSize: 10,
            color: r.status === 'seated' ? colors.success : colors.textMuted,
            textTransform: 'uppercase', fontWeight: 700,
          }}>{r.status}</span>
        </div>
      ))}
    </div>
  );
}

function PayoutsTable({ payoutStructure, buyIn, registrationCount }) {
  if (!payoutStructure || payoutStructure.length === 0) return <p style={{ color: colors.textMuted, fontSize: 12 }}>No payout structure.</p>;
  const totalPool = buyIn * registrationCount;
  return (
    <div className="flex flex-col gap-1">
      {payoutStructure.map(tier => (
        <div key={tier.place} className="flex items-center justify-between"
          style={{ padding: '6px 8px', background: colors.bgSurface, borderRadius: 4, fontSize: 12, color: colors.textSecondary }}>
          <span style={{ color: colors.gold, fontWeight: 700 }}>#{tier.place}</span>
          <span>{tier.percentage}%</span>
          {totalPool > 0 && (
            <span style={{ color: colors.success }}>{Math.floor(totalPool * tier.percentage / 100).toLocaleString()} chips</span>
          )}
        </div>
      ))}
      {totalPool > 0 && (
        <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
          Prize pool: <strong style={{ color: colors.gold }}>{totalPool.toLocaleString()} chips</strong>
        </div>
      )}
    </div>
  );
}

export default function TournamentDetailPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { user, hasPermission } = useAuth();

  const [group, setGroup]                 = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [tableIds, setTableIds]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [actionBusy, setActionBusy]       = useState(false);
  const [error, setError]                 = useState(null);

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

  async function handleRegister() {
    setActionBusy(true); setError(null);
    try { await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'POST' }); await load(); }
    catch (err) { setError(err.message); }
    finally { setActionBusy(false); }
  }
  async function handleUnregister() {
    setActionBusy(true); setError(null);
    try { await apiFetch(`/api/tournament-groups/${groupId}/register`, { method: 'DELETE' }); await load(); }
    catch (err) { setError(err.message); }
    finally { setActionBusy(false); }
  }
  async function handleStart() {
    setActionBusy(true); setError(null);
    try { await apiFetch(`/api/tournament-groups/${groupId}/start`, { method: 'PATCH' }); await load(); }
    catch (err) { setError(err.message); }
    finally { setActionBusy(false); }
  }
  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setActionBusy(true); setError(null);
    try { await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' }); await load(); }
    catch (err) { setError(err.message); }
    finally { setActionBusy(false); }
  }

  if (loading) return <div style={{ color: colors.textMuted, padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group) return <div style={{ color: colors.error, padding: 40, textAlign: 'center' }}>Tournament not found.</div>;

  const schedule = group.shared_config?.blind_schedule ?? [];
  const scheduledAt = group.scheduled_at ? new Date(group.scheduled_at) : null;
  const activeRegs = registrations.filter(r => r.status !== 'cancelled');

  const btnGold = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 18px', borderRadius: 6, cursor: actionBusy ? 'not-allowed' : 'pointer',
    opacity: actionBusy ? 0.6 : 1,
    background: colors.gold, color: colors.bgSurface, border: 'none',
  };
  const btnGhost = {
    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '8px 18px', borderRadius: 6, cursor: actionBusy ? 'not-allowed' : 'pointer',
    opacity: actionBusy ? 0.6 : 1,
    background: 'none', color: colors.gold, border: `1px solid ${colors.goldBorder}`,
  };
  const btnDanger = { ...btnGhost, color: colors.error, borderColor: colors.errorBorder };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/tournaments')}
        style={{
          background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer',
          fontSize: 12, marginBottom: 16, padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <ArrowLeft size={14} /> Back to Tournaments
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: colors.textPrimary, marginBottom: 4 }}>{group.name}</h1>
          <div className="flex items-center gap-3">
            <StatusBadge status={group.status} />
            {scheduledAt && <span style={{ fontSize: 11, color: colors.textMuted }}>{scheduledAt.toLocaleString()}</span>}
            <span style={{ fontSize: 11, color: colors.textMuted, textTransform: 'capitalize' }}>{group.privacy ?? 'public'}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {group.status === 'pending' && !isRegistered && (
            <button style={btnGold} onClick={handleRegister} disabled={actionBusy}>
              Register{group.buy_in > 0 ? ` (${group.buy_in.toLocaleString()} chips)` : ' (Free)'}
            </button>
          )}
          {group.status === 'pending' && isRegistered && (
            <button style={btnGhost} onClick={handleUnregister} disabled={actionBusy}>Unregister</button>
          )}
          {group.status === 'running' && myReg?.status === 'seated' && tableIds.length > 0 && (
            <button style={btnGold} onClick={() => navigate(`/table/${tableIds[0]}`)}>Join Table</button>
          )}
          {canManage && group.status === 'pending' && (
            <button style={btnGold} onClick={handleStart} disabled={actionBusy}>Start Tournament</button>
          )}
          {canManage && ['pending', 'running'].includes(group.status) && (
            <button style={btnDanger} onClick={handleCancel} disabled={actionBusy}>Cancel</button>
          )}
          {canManage && (
            <button style={btnGhost} onClick={() => navigate(`/tournaments/${groupId}/control`)}>Control View</button>
          )}
        </div>
      </div>

      {error && <div style={{ color: colors.error, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* 2-column info grid inside a card */}
      <div style={{
        background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`,
        borderRadius: 8, padding: '16px 20px', marginBottom: 20,
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 24px',
      }}>
        <InfoCell label="Starting Stack" value={(group.shared_config?.starting_stack ?? 0).toLocaleString() + ' chips'} />
        <InfoCell label="Buy-In" value={group.buy_in > 0 ? `${group.buy_in.toLocaleString()} chips` : 'Free'} />
        <InfoCell label="Registrations" value={`${activeRegs.length} players`} />
        {group.late_reg_enabled && <InfoCell label="Late Registration" value={`${group.late_reg_minutes} min after start`} />}
      </div>

      {/* Three collapsible sections */}
      <CollapsibleSection
        storageKey={`tournament-${groupId}-blinds`}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><TrendingUp size={12} /> Blind Structure</span>}
      >
        <BlindStructureSheet schedule={schedule} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey={`tournament-${groupId}-regs`}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={12} /> Registrants</span>}
      >
        <RegistrantsList registrations={activeRegs} />
      </CollapsibleSection>

      <CollapsibleSection
        storageKey={`tournament-${groupId}-payouts`}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ShoppingBag size={12} /> Payouts</span>}
      >
        <PayoutsTable
          payoutStructure={group.payout_structure ?? []}
          buyIn={group.buy_in ?? 0}
          registrationCount={activeRegs.length}
        />
      </CollapsibleSection>
    </div>
  );
}
