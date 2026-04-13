import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Users, TrendingUp } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { colors } from '../lib/colors.js';

function TableMiniCard({ tableId, tableIndex, playerCount, blindLevel, onNavigate }) {
  return (
    <div
      style={{
        background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, borderRadius: 8,
        padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s',
        minWidth: 200,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.goldBorder; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
      onClick={() => onNavigate(tableId)}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary, marginBottom: 6 }}>
        Table {tableIndex + 1}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
        <span style={{
          fontSize: 10, color: colors.textMuted, display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', background: colors.mutedTint, borderRadius: 3,
        }}>
          <Users size={10} /> {playerCount ?? '—'}
        </span>
        <span style={{
          fontSize: 10, color: colors.gold, display: 'inline-flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', background: colors.goldTint, borderRadius: 3,
        }}>
          <TrendingUp size={10} /> Lvl {blindLevel ?? '—'}
        </span>
      </div>
      <div style={{ fontSize: 9, color: colors.textMuted, marginBottom: 6, wordBreak: 'break-all' }}>
        {tableId}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onNavigate(tableId); }}
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${colors.goldBorder}`, color: colors.gold,
          marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <Eye size={11} /> Spectate
      </button>
    </div>
  );
}

export default function TournamentControlPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { hasPermission, user } = useAuth();

  const [group, setGroup]       = useState(null);
  const [tableIds, setTableIds] = useState([]);
  const [tableMeta, setTableMeta] = useState({}); // { tableId: { playerCount, blindLevel } }
  const [loading, setLoading]   = useState(true);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(null);
  const [message, setMessage]   = useState(null);

  const canManage = hasPermission('tournament:manage') || ['coach','admin','superadmin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/tournament-groups/${groupId}`);
      setGroup(data.group);
      setTableIds(data.tableIds ?? []);
      setTableMeta(data.tableMeta ?? {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  async function handleFinalize() {
    if (!window.confirm('Finalize this tournament? Prizes will be distributed and it cannot be undone.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/finalize`, { method: 'POST', body: JSON.stringify({}) });
      setMessage('Tournament finalized. Prizes distributed.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' });
      setMessage('Tournament cancelled.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (loading) return <div style={{ color: colors.textMuted, padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group)  return <div style={{ color: colors.error, padding: 40, textAlign: 'center' }}>Tournament not found.</div>;
  if (!canManage) return <div style={{ color: colors.error, padding: 40, textAlign: 'center' }}>Access denied.</div>;

  const btnGhost = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '7px 16px', borderRadius: 5, cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    background: 'none', color: colors.gold, border: `1px solid ${colors.goldBorder}`,
  };
  const btnDanger = {
    ...btnGhost,
    color: colors.error, borderColor: colors.errorBorder, background: colors.errorTint,
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      <button
        onClick={() => navigate(`/tournaments/${groupId}`)}
        style={{
          background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer',
          fontSize: 12, marginBottom: 16, padding: 0,
          display: 'inline-flex', alignItems: 'center', gap: 4,
        }}
      >
        <ArrowLeft size={14} /> Back to Tournament
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: colors.textPrimary }}>{group.name} — Control</h1>
          <p style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Status: {group.status} · {tableIds.length} table(s)</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {group.status === 'running' && (
            <button style={btnGhost} onClick={handleFinalize} disabled={busy}>End &amp; Finalize</button>
          )}
          {['pending', 'running'].includes(group.status) && (
            <button style={btnDanger} onClick={handleCancel} disabled={busy}>Cancel Tournament</button>
          )}
        </div>
      </div>

      {error   && <div style={{ color: colors.error,   fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: colors.success, fontSize: 12, marginBottom: 12 }}>{message}</div>}

      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: colors.textMuted, textTransform: 'uppercase', marginBottom: 12 }}>
        Active Tables
      </h2>
      {tableIds.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 13 }}>No tables yet — tournament has not started.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tableIds.map((tableId, i) => (
            <TableMiniCard
              key={tableId}
              tableId={tableId}
              tableIndex={i}
              playerCount={tableMeta[tableId]?.playerCount}
              blindLevel={tableMeta[tableId]?.blindLevel ?? group.current_level}
              onNavigate={tid => navigate(`/table/${tid}`)}
            />
          ))}
        </div>
      )}

      {group.status === 'finished' && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => navigate(`/tournaments/${groupId}`)}
            style={{
              fontSize: 12, color: colors.gold, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            View Final Standings <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
          </button>
        </div>
      )}
    </div>
  );
}
