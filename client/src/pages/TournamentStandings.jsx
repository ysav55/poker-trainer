import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n) {
  if (n == null) return '?';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function positionStyle(pos) {
  if (pos === 1) return { color: '#d4af37', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)' };
  if (pos === 2) return { color: '#c0c0c0', background: 'rgba(192,192,192,0.08)', border: '1px solid rgba(192,192,192,0.25)' };
  if (pos === 3) return { color: '#cd7f32', background: 'rgba(205,127,50,0.1)',  border: '1px solid rgba(205,127,50,0.3)' };
  return { color: '#6e7681', background: 'rgba(110,118,129,0.08)', border: '1px solid rgba(110,118,129,0.2)' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TournamentStandings() {
  const { tableId } = useParams();
  const navigate    = useNavigate();

  const [config, setConfig]       = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/tables/${tableId}/tournament`);
      setConfig(data.config ?? null);
      setStandings(data.standings ?? []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#6e7681', fontSize: 14 }}>Loading standings…</span>
      </div>
    );
  }

  const winner = standings.find(s => s.finish_position === 1);

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0ece3', padding: '24px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, maxWidth: 600 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 900, letterSpacing: '0.12em', color: '#d4af37', margin: 0 }}>
            FINAL STANDINGS
          </h1>
          <p style={{ fontSize: 11, color: '#6e7681', marginTop: 4 }}>Table: {tableId}</p>
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
        <div style={{ background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 20, maxWidth: 600 }}>
          {error}
        </div>
      )}

      <div style={{ maxWidth: 600 }}>
        {/* Winner banner */}
        {winner && (
          <div style={{
            background: 'rgba(212,175,55,0.1)',
            border: '1px solid rgba(212,175,55,0.4)',
            borderRadius: 12,
            padding: '18px 20px',
            textAlign: 'center',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: '#d4af37', marginBottom: 6 }}>
              TOURNAMENT WINNER
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#f0ece3' }}>
              {winner.player_profiles?.display_name ?? winner.player_id ?? 'Unknown'}
            </div>
            {winner.chips_at_elimination != null && (
              <div style={{ fontSize: 13, color: '#8b949e', marginTop: 4 }}>
                Final stack: {winner.chips_at_elimination.toLocaleString('en-US')} chips
              </div>
            )}
          </div>
        )}

        {/* Standings list */}
        {standings.length === 0 ? (
          <p style={{ color: '#6e7681', fontSize: 14 }}>No standings recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {/* Column header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 16px', marginBottom: 2 }}>
              <span style={{ minWidth: 40 }} />
              <span style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase' }}>Player</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase', minWidth: 60, textAlign: 'right' }}>Prize</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#6e7681', textTransform: 'uppercase' }}>Stack</span>
            </div>
            {standings.map((s, i) => {
              const ps = positionStyle(s.finish_position);
              const name = s.player_profiles?.display_name ?? s.player_id ?? `Player ${i + 1}`;
              return (
                <div
                  key={s.id ?? i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    background: '#161b22',
                    border: '1px solid #21262d',
                    borderRadius: 8,
                    padding: '12px 16px',
                  }}
                >
                  {/* Position badge */}
                  <span style={{
                    ...ps,
                    fontSize: 11,
                    fontWeight: 800,
                    borderRadius: 6,
                    padding: '3px 8px',
                    flexShrink: 0,
                    fontFamily: 'monospace',
                    letterSpacing: '0.06em',
                  }}>
                    {ordinal(s.finish_position)}
                  </span>

                  {/* Name */}
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#e6edf3' }}>
                    {name}
                  </span>

                  {/* Prize */}
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#3fb950', fontFamily: 'monospace', minWidth: 60, textAlign: 'right' }}>
                    {s.prize != null && Number(s.prize) > 0
                      ? s.prize?.toLocaleString() ?? '—'
                      : '—'}
                  </span>

                  {/* Chips at elimination */}
                  {s.chips_at_elimination != null && (
                    <span style={{ fontSize: 12, color: '#6e7681', fontFamily: 'monospace' }}>
                      {s.chips_at_elimination.toLocaleString('en-US')} chips
                    </span>
                  )}

                  {/* Eliminated at time */}
                  {s.eliminated_at && (
                    <span style={{ fontSize: 11, color: '#6e7681' }}>
                      {new Date(s.eliminated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Tournament info footer */}
        {config && (
          <div style={{ marginTop: 20, padding: '12px 16px', background: '#161b22', border: '1px solid #21262d', borderRadius: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: '#6e7681', marginBottom: 8 }}>TOURNAMENT DETAILS</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                ['Starting Stack', config.starting_stack?.toLocaleString('en-US')],
                ['Levels', config.blind_schedule?.length],
                ['Rebuys', config.rebuy_allowed ? 'Yes' : 'No'],
              ].map(([label, value]) => (
                <div key={label} style={{ fontSize: 12 }}>
                  <span style={{ color: '#6e7681' }}>{label}: </span>
                  <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
