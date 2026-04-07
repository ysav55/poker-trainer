import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTableSocket } from '../hooks/useTableSocket.js';

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

function formatMoney(n) {
  if (n == null) return '—';
  return n.toLocaleString();
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value, highlight = false }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #21262d' }}>
      <span style={{ fontSize: 11, color: '#6e7681' }}>{label}</span>
      <span style={{ fontSize: 12, color: highlight ? '#d4af37' : '#f0ece3', fontWeight: highlight ? 700 : 500 }}>
        {value ?? '—'}
      </span>
    </div>
  );
}

// ── Blind Structure Sheet ─────────────────────────────────────────────────────

function BlindStructureSheet({ schedule, currentLevelIndex = -1 }) {
  if (!schedule || schedule.length === 0) {
    return <p style={{ color: '#6e7681', fontSize: 12 }}>No blind schedule configured.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#6e7681' }}>
          {['Lvl', 'SB', 'BB', 'Ante', 'Duration'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 700, letterSpacing: '0.08em', fontSize: 10, textTransform: 'uppercase' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {schedule.map((lvl, i) => {
          const isActive = i === currentLevelIndex;
          return (
            <tr key={i} style={{
              background: isActive ? 'rgba(212,175,55,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              color: isActive ? '#d4af37' : '#c9d1d9',
            }}>
              <td style={{ padding: '5px 8px 5px 0', fontWeight: 700, color: isActive ? '#d4af37' : '#d4af37' }}>
                {isActive && '▶ '}{lvl.level ?? i + 1}
              </td>
              <td style={{ padding: '5px 8px 5px 0' }}>{lvl.sb ?? lvl.small_blind}</td>
              <td style={{ padding: '5px 8px 5px 0' }}>{lvl.bb ?? lvl.big_blind}</td>
              <td style={{ padding: '5px 8px 5px 0' }}>{lvl.ante ?? 0}</td>
              <td style={{ padding: '5px 0 5px 0', color: '#8b949e' }}>
                {lvl.duration_minutes ?? Math.round((lvl.durationMs ?? 0) / 60000)} min
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Entrants List ─────────────────────────────────────────────────────────────

function EntrantsList({ players }) {
  if (!players || players.length === 0) {
    return <p style={{ color: '#6e7681', fontSize: 12 }}>No players registered yet.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {players.map((p, i) => {
        const isElim = p.is_eliminated;
        return (
          <div key={p.id ?? i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 0', borderBottom: '1px solid #21262d',
            opacity: isElim ? 0.45 : 1,
          }}>
            <span style={{ fontSize: 10, color: '#6e7681', minWidth: 24, textAlign: 'right' }}>
              #{i + 1}
            </span>
            <span style={{ flex: 1, fontSize: 12, color: isElim ? '#6e7681' : '#f0ece3' }}>
              {p.player_profiles?.display_name ?? p.player_id}
            </span>
            {!isElim && p.chip_count != null && (
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#8b949e' }}>
                {p.chip_count.toLocaleString()}
              </span>
            )}
            {isElim && (
              <span style={{ fontSize: 9, fontWeight: 700, color: '#f85149', letterSpacing: '0.08em' }}>OUT</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Payouts Table ─────────────────────────────────────────────────────────────

function PayoutsTable({ payouts, prizePool }) {
  if (!payouts || payouts.length === 0) {
    return <p style={{ color: '#6e7681', fontSize: 12 }}>No payout structure configured.</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ color: '#6e7681' }}>
          {['Place', 'Share', 'Amount'].map(h => (
            <th key={h} style={{ textAlign: 'left', paddingBottom: 6, fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {payouts.map((p, i) => (
          <tr key={i} style={{ color: i === 0 ? '#d4af37' : '#c9d1d9' }}>
            <td style={{ padding: '5px 8px 5px 0', fontWeight: 700 }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${p.place ?? i + 1}`}
            </td>
            <td style={{ padding: '5px 8px 5px 0', color: '#8b949e' }}>{p.percent ?? '—'}%</td>
            <td style={{ padding: '5px 0' }}>
              {prizePool && p.percent ? formatMoney(Math.floor(prizePool * p.percent / 100)) : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Countdown Bar ─────────────────────────────────────────────────────────────

function CountdownBar({ targetMs, totalMs }) {
  const elapsed = Math.min(1, (Date.now() - (targetMs - totalMs)) / totalMs);
  const remaining = Math.max(0, 1 - elapsed);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 4, background: '#21262d', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99,
          width: `${remaining * 100}%`,
          background: remaining > 0.25 ? '#d4af37' : '#f85149',
          transition: 'width 1s linear, background 0.3s',
        }} />
      </div>
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ title, children, titleColor = '#6e7681', action }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10 }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #21262d' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: titleColor }}>
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: '12px 16px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TournamentLobby() {
  const { tableId, groupId } = useParams();
  const navigate    = useNavigate();
  const { hasPermission } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [starting, setStarting]     = useState(false);
  const [registered, setRegistered] = useState(false);
  const [countdown, setCountdown]   = useState(null);
  const [lateRegOpen, setLateRegOpen] = useState(false);
  const { socketRef, connected } = useTableSocket(tableId, { managerMode: false });

  // Role flags
  const canManage   = hasPermission('tournament:manage');
  const isReferee   = hasPermission('referee:dashboard');

  const fetchData = useCallback(async () => {
    try {
      // Try standalone tournament API first, fall back to table-scoped
      let data;
      try {
        data = await apiFetch(`/api/tournaments/${tableId}`);
        setTournament(data);
        if (data.scheduled_for) {
          setCountdown(new Date(data.scheduled_for).getTime());
        }
      } catch {
        data = await apiFetch(`/api/tables/${tableId}/tournament`);
        setTournament(data.config ?? null);
        if (data.config?.scheduled_for) {
          setCountdown(new Date(data.config.scheduled_for).getTime());
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Register tournament late-reg listeners on the shared socket
  useEffect(() => {
    if (!connected) return;
    const socket = socketRef.current;
    if (!socket) return;

    socket.on('tournament:late_reg_open', () => setLateRegOpen(true));
    socket.on('tournament:late_reg_closed', () => setLateRegOpen(false));
    socket.on('tournament:late_reg_rejected', ({ reason }) => {
      setError(reason ?? 'Cannot join: tournament is already in progress');
    });

    return () => {
      socket.off('tournament:late_reg_open');
      socket.off('tournament:late_reg_closed');
      socket.off('tournament:late_reg_rejected');
    };
  }, [connected, socketRef]);

  // Countdown ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const handleStart = async () => {
    setStarting(true);
    try {
      try {
        await apiFetch(`/api/tournaments/${tableId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'running' }) });
      } catch {
        await apiFetch(`/api/tables/${tableId}/tournament/start`, { method: 'POST' });
      }
      navigate(`/table/${tableId}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  };

  const handleRegister = async () => {
    try {
      await apiFetch(`/api/tournaments/${tableId}/register`, { method: 'POST' });
      setRegistered(true);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#6e7681', fontSize: 14 }}>Loading tournament…</span>
      </div>
    );
  }

  const t = tournament;
  const schedule = t?.blind_structure ?? t?.blindSchedule ?? t?.blind_schedule ?? [];
  const players  = t?.players ?? [];
  const payouts  = t?.payout_structure ?? [];
  const prizePool = (t?.buy_in ?? 0) * players.length;
  const currentLevelIdx = t?.current_level_index ?? -1;
  const startingStack = t?.starting_stack ?? t?.startingStack;
  const scheduledFor  = t?.scheduled_for ?? t?.scheduledFor;
  const totalCountdownMs = scheduledFor ? new Date(scheduledFor).getTime() - (t?.created_at ? new Date(t.created_at).getTime() : Date.now() - 3600000) : null;

  const statusColors = {
    pending:  '#93c5fd',
    running:  '#3fb950',
    paused:   '#e3b341',
    finished: '#6e7681',
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0ece3', padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, letterSpacing: '0.1em', color: '#d4af37', margin: 0 }}>
            {t?.name ?? 'Tournament Lobby'}
          </h1>
          {t?.status && (
            <span style={{ fontSize: 11, color: statusColors[t.status] ?? '#6e7681', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {t.status}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {canManage && groupId && (
            <Link
              to={`/admin/tournaments/group/${groupId}/balancer`}
              style={{ background: 'none', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 6, color: '#58a6ff', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}
            >
              Table Balancer
            </Link>
          )}
          {canManage && (
            <button onClick={() => navigate(`/admin/tournaments`)}
              style={{ background: 'none', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 6, color: '#d4af37', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(212,175,55,0.3)'; }}>
              Edit Tournament
            </button>
          )}
          {isReferee && (
            <button onClick={() => navigate(`/admin/referee`)}
              style={{ background: 'none', border: '1px solid rgba(88,166,255,0.3)', borderRadius: 6, color: '#58a6ff', cursor: 'pointer', padding: '6px 14px', fontSize: 12, fontWeight: 600 }}>
              Referee Dashboard
            </button>
          )}
          <button onClick={() => navigate('/lobby')}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '6px 14px', fontSize: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}>
            ← Lobby
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {!t ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ color: '#f85149', fontSize: 14, marginBottom: 8 }}>Tournament configuration not found.</div>
          <div style={{ color: '#6e7681', fontSize: 12, marginBottom: 20 }}>This table may not have been set up correctly.</div>
          <button
            onClick={() => navigate('/lobby')}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: 6, color: '#8b949e', cursor: 'pointer', padding: '7px 16px', fontSize: 12 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
          >
            ← Back to Lobby
          </button>
        </div>
      ) : (
        <>
          {/* Countdown progress bar */}
          {countdown && countdown > Date.now() && totalCountdownMs && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6e7681', marginBottom: 4 }}>
                <span>Starting in</span>
                <span style={{ fontFamily: 'monospace', color: '#d4af37', fontWeight: 700, fontSize: 14 }}>
                  {formatCountdown(countdown)}
                </span>
              </div>
              <CountdownBar targetMs={countdown} totalMs={totalCountdownMs} />
            </div>
          )}

          {/* Two-column top */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

            {/* Tournament info card */}
            <Card title="Tournament Info" titleColor="#d4af37">
              <InfoRow label="Format" value={t.format ?? 'Freezeout'} />
              <InfoRow label="Status" value={t.status} highlight />
              <InfoRow label="Starting Stack" value={startingStack ? formatMoney(startingStack) : null} />
              {t.buy_in != null && <InfoRow label="Buy-In" value={t.buy_in > 0 ? `$${t.buy_in}` : 'Free'} />}
              {t.guaranteed != null && <InfoRow label="Guaranteed" value={`$${formatMoney(t.guaranteed)}`} highlight />}
              {scheduledFor && (
                <InfoRow label="Start Time" value={new Date(scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
              )}
              {t.late_registration_levels != null && (
                <InfoRow label="Late Reg" value={`Until level ${t.late_registration_levels}`} />
              )}
              <InfoRow label="Players" value={players.length > 0 ? `${players.filter(p => !p.is_eliminated).length} active / ${players.length} total` : '0 registered'} />
              <InfoRow label="Rebuys" value={t.rebuy_allowed ? 'Yes' : 'No'} />

              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Register button (non-coach players) */}
                {!canManage && !registered && (
                  <button onClick={handleRegister}
                    style={{
                      padding: '10px 20px', borderRadius: 8,
                      background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.4)',
                      color: '#d4af37', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.12)'; }}>
                    Register
                  </button>
                )}
                {!canManage && registered && (
                  <div style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#3fb950', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                    ✓ Registered
                  </div>
                )}
                {/* Join table button */}
                {t.status === 'running' && !lateRegOpen && (
                  <button onClick={() => navigate(`/table/${tableId}`)}
                    style={{ padding: '10px 20px', borderRadius: 8, background: '#d4af37', border: 'none', color: '#0d1117', fontWeight: 900, fontSize: 13, cursor: 'pointer' }}>
                    Join Table →
                  </button>
                )}
                {/* Late registration button */}
                {lateRegOpen && !registered && (
                  <button onClick={() => navigate(`/table/${tableId}`)}
                    style={{
                      padding: '10px 20px', borderRadius: 8,
                      background: 'rgba(227,179,65,0.15)', border: '1px solid rgba(227,179,65,0.5)',
                      color: '#e3b341', fontWeight: 900, fontSize: 13, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(227,179,65,0.25)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(227,179,65,0.15)'; }}>
                    Join Late →
                  </button>
                )}
                {/* Start button (coach/admin) */}
                {canManage && t.status === 'pending' && (
                  <button onClick={handleStart} disabled={starting}
                    style={{
                      padding: '10px 20px', borderRadius: 8,
                      background: starting ? 'rgba(212,175,55,0.35)' : '#d4af37',
                      border: 'none', color: starting ? '#888' : '#0d1117',
                      fontWeight: 900, fontSize: 13, cursor: starting ? 'not-allowed' : 'pointer',
                    }}
                    onMouseEnter={e => { if (!starting) e.currentTarget.style.background = '#c9a227'; }}
                    onMouseLeave={e => { if (!starting) e.currentTarget.style.background = '#d4af37'; }}>
                    {starting ? 'Starting…' : 'Start Tournament'}
                  </button>
                )}
              </div>
            </Card>

            {/* Blind structure card */}
            <Card title="Blind Structure">
              <BlindStructureSheet schedule={schedule} currentLevelIndex={currentLevelIdx} />
            </Card>
          </div>

          {/* Two-column bottom */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Card title={`Entrants (${players.length})`}>
              <EntrantsList players={players} />
            </Card>
            <Card title="Payouts">
              <PayoutsTable payouts={payouts} prizePool={prizePool} />
              {prizePool > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: '#6e7681' }}>
                  Prize pool: <strong style={{ color: '#d4af37' }}>${formatMoney(prizePool)}</strong>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
