import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

const GOLD = '#d4af37';

function TableMiniCard({ tableId, tableIndex, onNavigate }) {
  return (
    <div
      style={{
        background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
        padding: '12px 14px', cursor: 'pointer', transition: 'all 0.12s',
        minWidth: 180,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${GOLD}55`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; }}
      onClick={() => onNavigate(tableId)}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: '#f0ece3', marginBottom: 6 }}>
        Table {tableIndex + 1}
      </div>
      <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 4, wordBreak: 'break-all' }}>
        {tableId}
      </div>
      <button
        onClick={e => { e.stopPropagation(); onNavigate(tableId); }}
        style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
          background: 'none', border: `1px solid ${GOLD}55`, color: GOLD,
          marginTop: 4,
        }}
      >
        Open
      </button>
    </div>
  );
}

export default function TournamentControlPage() {
  const { groupId } = useParams();
  const navigate    = useNavigate();
  const { hasPermission, user } = useAuth();

  const [group, setGroup]         = useState(null);
  const [tableIds, setTableIds]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [message, setMessage]     = useState(null);

  const canManage = hasPermission('tournament:manage') || ['coach','admin','superadmin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/api/tournament-groups/${groupId}`);
      setGroup(data.group);
      setTableIds(data.tableIds ?? []);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this tournament? All players will be refunded.')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/tournament-groups/${groupId}/cancel`, { method: 'PATCH' });
      setMessage('Tournament cancelled.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div style={{ color: '#6e7681', padding: 40, textAlign: 'center' }}>Loading…</div>;
  if (!group)  return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Tournament not found.</div>;
  if (!canManage) return <div style={{ color: '#f85149', padding: 40, textAlign: 'center' }}>Access denied.</div>;

  const btnStyle = (danger = false) => ({
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    padding: '7px 16px', borderRadius: 5, cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    background: danger ? 'rgba(248,81,73,0.12)' : 'none',
    color: danger ? '#f85149' : GOLD,
    border: danger ? '1px solid rgba(248,81,73,0.35)' : `1px solid ${GOLD}55`,
  });

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000, margin: '0 auto' }}>
      {/* Back */}
      <button onClick={() => navigate(`/tournaments/${groupId}`)}
        style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 12, marginBottom: 16, padding: 0 }}>
        ← Back to Tournament
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#f0ece3' }}>{group.name} — Control</h1>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 2 }}>Status: {group.status} · {tableIds.length} table(s)</p>
        </div>

        {/* Global controls */}
        <div className="flex gap-2 flex-wrap">
          {group.status === 'running' && (
            <button style={btnStyle()} onClick={handleFinalize} disabled={busy}>End &amp; Finalize</button>
          )}
          {['pending', 'running'].includes(group.status) && (
            <button style={btnStyle(true)} onClick={handleCancel} disabled={busy}>Cancel Tournament</button>
          )}
        </div>
      </div>

      {error   && <div style={{ color: '#f85149', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      {message && <div style={{ color: '#3fb950', fontSize: 12, marginBottom: 12 }}>{message}</div>}

      {/* Table grid */}
      <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', marginBottom: 12 }}>
        Active Tables
      </h2>
      {tableIds.length === 0 ? (
        <p style={{ color: '#6e7681', fontSize: 13 }}>No tables yet — tournament has not started.</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {tableIds.map((tableId, i) => (
            <TableMiniCard
              key={tableId}
              tableId={tableId}
              tableIndex={i}
              onNavigate={tid => navigate(`/table/${tid}`)}
            />
          ))}
        </div>
      )}

      {/* Standings link */}
      {group.status === 'finished' && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => navigate(`/tournaments/${groupId}`)}
            style={{ fontSize: 12, color: GOLD, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            View Final Standings →
          </button>
        </div>
      )}
    </div>
  );
}
