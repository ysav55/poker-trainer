import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { colors } from '../../lib/colors.js';
import TournamentTableCard from '../../components/admin/TournamentTableCard.jsx';
import MovePlayerModal from '../../components/admin/MovePlayerModal.jsx';

function HeaderBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: 6,
        color: colors.textSecondary,
        cursor: 'pointer',
        padding: '6px 14px',
        fontSize: 12,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = colors.gold; e.currentTarget.style.color = colors.gold; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderStrong; e.currentTarget.style.color = colors.textSecondary; }}
    >
      {children}
    </button>
  );
}

export default function RefereeDashboard() {
  const navigate = useNavigate();
  useAuth();

  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [notification, setNotification] = useState(null);

  const fetchTables = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tables');
      const all = Array.isArray(data) ? data : (data.tables ?? data.data ?? []);
      setTables(all.filter(t => t.mode === 'tournament' || t.table_mode === 'tournament'));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  useEffect(() => {
    const id = setInterval(fetchTables, 10_000);
    return () => clearInterval(id);
  }, [fetchTables]);

  const notify = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleAdvanceLevel = async (tableId) => {
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/advance-level`, { method: 'POST' });
      notify(`Blind level advanced on ${tableId}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleEndTournament = async (tableId) => {
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/end`, { method: 'POST' });
      notify(`Tournament ended on ${tableId}`);
      fetchTables();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleMovePlayer = ({ playerId, toTableId }) => {
    notify(`Move requested: player ${playerId.slice(0, 8)} → ${toTableId}`);
  };

  const isError = notification?.type === 'error';

  return (
    <div style={{ minHeight: '100vh', background: colors.bgSurface, color: colors.textPrimary, padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: colors.textPrimary, margin: 0 }}>Referee Dashboard</h1>
          <p className="text-sm" style={{ color: colors.textMuted, marginTop: 4 }}>
            {tables.length} active tournament table{tables.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <HeaderBtn onClick={fetchTables}><RefreshCw size={12} /> Refresh</HeaderBtn>
          <HeaderBtn onClick={() => navigate('/dashboard')}><ArrowLeft size={12} /> Dashboard</HeaderBtn>
        </div>
      </div>

      {notification && (
        <div
          style={{
            position: 'fixed', top: 16, right: 16, zIndex: 99,
            background: isError ? colors.errorTint : colors.successTint,
            border: `1px solid ${isError ? colors.errorBorder : colors.successBorder}`,
            color: isError ? colors.error : colors.success,
            borderRadius: 8, padding: '10px 16px', fontSize: 13, maxWidth: 320,
          }}
        >
          {notification.msg}
        </div>
      )}

      {error && (
        <div
          style={{
            background: colors.errorTint,
            border: `1px solid ${colors.errorBorder}`,
            color: colors.error,
            borderRadius: 6,
            padding: '10px 14px',
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: colors.textMuted, fontSize: 14 }}>Loading tables…</p>
      ) : tables.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>No active tournament tables.</p>
          <button
            onClick={() => navigate('/tournaments')}
            style={{
              background: colors.goldTint,
              border: `1px solid ${colors.goldBorder}`,
              borderRadius: 8,
              color: colors.gold,
              cursor: 'pointer',
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Create Tournament
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {tables.map(table => (
            <TournamentTableCard
              key={table.id}
              table={table}
              onAdvanceLevel={handleAdvanceLevel}
              onEndTournament={handleEndTournament}
              onMovePlayer={(t) => setMoveTarget(t)}
              onNavigate={(id) => navigate(`/table/${id}`)}
            />
          ))}
        </div>
      )}

      {moveTarget && (
        <MovePlayerModal
          tables={tables}
          onClose={() => setMoveTarget(null)}
          onMove={handleMovePlayer}
        />
      )}
    </div>
  );
}
