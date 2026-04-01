import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCountdown(targetMs) {
  const diff = Math.max(0, targetMs - Date.now());
  const totalSec = Math.floor(diff / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BlindStructureSheet({ schedule }) {
  if (!schedule || schedule.length === 0) {
    return <p style={{ color: '#6e7681', fontSize: 12 }}>No blind schedule configured.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#6e7681' }}>
          {['Level', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 600, letterSpacing: '0.08em', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.map((lvl, i) => (
          <tr
            key={i}
            style={{
              background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              color: '#c9d1d9',
            }}
          >
            <td style={{ padding: '5px 8px 5px 0', fontWeight: 700, color: '#d4af37' }}>
              {lvl.level ?? i + 1}
            </td>
            <td style={{ padding: '5px 8px 5px 0' }}>{lvl.sb}</td>
            <td style={{ padding: '5px 8px 5px 0' }}>{lvl.bb}</td>
            <td style={{ padding: '5px 8px 5px 0' }}>{lvl.ante ?? 0}</td>
            <td style={{ padding: '5px 0 5px 0', color: '#8b949e' }}>
              {lvl.duration_minutes ?? Math.round((lvl.durationMs ?? 0) / 60000)} min
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TournamentLobby() {
  const { tableId } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const [config, setConfig]         = useState(null);
  const [standings, setStandings]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [starting, setStarting]     = useState(false);
  const [countdown, setCountdown]   = useState(null); // ms until scheduled start

  const canManage = hasPermission('tournament:manage');

  const fetchData = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/tables/${tableId}/tournament`);
      setConfig(data.config ?? null);
      setStandings(data.standings ?? []);
      // Compute countdown if scheduledFor is set
      if (data.config?.scheduled_for) {
        setCountdown(new Date(data.config.scheduled_for).getTime());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Countdown ticker
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const handleStart = async () => {
    setStarting(true);
    try {
      await apiFetch(`/api/tables/${tableId}/tournament/start`, { method: 'POST' });
      navigate(`/table/${tableId}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#6e7681', fontSize: 14 }}>Loading tournament…</span>
      </div>
    );
  }

  const tableName = config ? `Tournament Lobby` : 'Tournament';

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0ece3', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.12em', color: '#d4af37', margin: 0 }}>
            {tableName}
          </h1>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>
            Table: {tableId}
          </p>
        </div>
        <button
          onClick={() => navigate('/lobby')}
          style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
        >
          ← Lobby
        </button>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {!config ? (
        <div style={{ color: '#6e7681', fontSize: 14 }}>No tournament config found for this table.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>

          {/* Left: Config + Start */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Status card */}
            <div style={{ background: '#161b22', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', marginBottom: 10 }}>TOURNAMENT INFO</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Row label="Starting Stack" value={config.starting_stack?.toLocaleString('en-US')} />
                <Row label="Levels" value={config.blind_schedule?.length ?? '—'} />
                <Row label="Rebuys" value={config.rebuy_allowed ? `Yes (cap: lvl ${config.rebuy_level_cap})` : 'No'} />
                {config.scheduled_for && (
                  <Row
                    label="Starts At"
                    value={new Date(config.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  />
                )}
              </div>
            </div>

            {/* Countdown */}
            {countdown && countdown > Date.now() && (
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '16px 18px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', marginBottom: 6 }}>STARTS IN</div>
                <div style={{ fontSize: 36, fontFamily: 'monospace', fontWeight: 900, color: '#d4af37' }}>
                  {formatCountdown(countdown)}
                </div>
              </div>
            )}

            {/* Start button (coach only) */}
            {canManage && (
              <button
                onClick={handleStart}
                disabled={starting}
                style={{
                  background: starting ? 'rgba(212,175,55,0.35)' : '#d4af37',
                  border: 'none',
                  borderRadius: 8,
                  color: starting ? '#888' : '#0d1117',
                  fontWeight: 900,
                  letterSpacing: '0.12em',
                  fontSize: 13,
                  padding: '12px 20px',
                  cursor: starting ? 'not-allowed' : 'pointer',
                  opacity: starting ? 0.75 : 1,
                }}
                onMouseEnter={e => { if (!starting) e.currentTarget.style.background = '#c9a227'; }}
                onMouseLeave={e => { if (!starting) e.currentTarget.style.background = '#d4af37'; }}
              >
                {starting ? 'STARTING…' : 'START TOURNAMENT'}
              </button>
            )}

            {/* Join button (non-coach) */}
            {!canManage && (
              <button
                onClick={() => navigate(`/table/${tableId}`)}
                style={{
                  background: 'rgba(212,175,55,0.12)',
                  border: '1px solid rgba(212,175,55,0.35)',
                  borderRadius: 8,
                  color: '#d4af37',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  fontSize: 13,
                  padding: '12px 20px',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.12)'; }}
              >
                JOIN TABLE
              </button>
            )}
          </div>

          {/* Right: Blind structure */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', marginBottom: 12 }}>BLIND STRUCTURE</div>
              <BlindStructureSheet schedule={config.blind_schedule} />
            </div>

            {/* Registered players (from standings if already populated) */}
            {standings.length > 0 && (
              <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', marginBottom: 10 }}>RESULTS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {standings.map((s, i) => (
                    <div key={s.id ?? i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: i === 0 ? '#d4af37' : '#6e7681', minWidth: 24 }}>#{s.finish_position}</span>
                      <span style={{ color: '#c9d1d9' }}>{s.player_profiles?.display_name ?? s.player_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: '#6e7681' }}>{label}</span>
      <span style={{ color: '#f0ece3', fontWeight: 600 }}>{value ?? '—'}</span>
    </div>
  );
}
