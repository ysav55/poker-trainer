import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import ScenarioBuilder from '../../components/ScenarioBuilder';

// ── Constants ──────────────────────────────────────────────────────────────────

const STREET_LABELS = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

// ── Small helpers ──────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function StreetBadge({ street }) {
  const colors = {
    preflop: { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  text: '#93c5fd' },
    flop:    { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
    turn:    { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#fcd34d' },
    river:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#fca5a5' },
  };
  const c = colors[street] ?? colors.preflop;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
    >
      {STREET_LABELS[street] ?? street}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HandBuilder() {
  const navigate = useNavigate();

  // Builder overlay state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editScenario, setEditScenario] = useState(null); // null = new, object = edit

  // Data
  const [playlists, setPlaylists] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ── Fetch playlists + scenarios ─────────────────────────────────────────────

  const fetchPlaylists = useCallback(async () => {
    try {
      const data = await apiFetch('/api/playlists');
      setPlaylists(Array.isArray(data) ? data : data?.playlists ?? []);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
      // Non-fatal — builder works with empty list
    } finally {
      setPlaylistsLoading(false);
    }
  }, []);

  const fetchScenarios = useCallback(async () => {
    setScenariosLoading(true);
    try {
      const data = await apiFetch('/api/admin/scenarios');
      setScenarios(Array.isArray(data) ? data : data?.scenarios ?? []);
    } catch (err) {
      setLoadError(err.message ?? 'Failed to load scenarios');
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaylists();
    fetchScenarios();
  }, [fetchPlaylists, fetchScenarios]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  function openNewBuilder() {
    setEditScenario(null);
    setBuilderOpen(true);
  }

  function openEditBuilder(scenario) {
    setEditScenario(scenario);
    setBuilderOpen(true);
  }

  function handleBuilderClose() {
    setBuilderOpen(false);
    setEditScenario(null);
    // Refresh scenarios list after a potential save
    fetchScenarios();
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ color: '#f0ece3' }}>

      {/* Build Scenario action bar */}
      <div className="flex items-center justify-end px-6 py-3" style={{ borderBottom: '1px solid #21262d' }}>
        <button
          onClick={openNewBuilder}
          style={{
            padding: '6px 16px', borderRadius: 4,
            background: '#d4af37', color: '#000',
            border: 'none', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#e5c450'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#d4af37'; }}
        >
          + Build Scenario
        </button>
      </div>

      {/* Body */}
      <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '24px 24px' }}>

        {/* Info note when no playlists loaded */}
        {!playlistsLoading && playlists.length === 0 && (
          <div
            style={{
              marginBottom: 20, padding: '10px 14px', borderRadius: 6,
              background: 'rgba(227,179,65,0.07)', border: '1px solid rgba(227,179,65,0.2)',
              fontSize: 11, color: '#e3b341',
            }}
          >
            No playlists found. You can create one inline when saving a scenario.
          </div>
        )}

        {/* Scenarios list */}
        <div>
          <div
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.15em',
              color: '#6e7681', textTransform: 'uppercase', marginBottom: 12,
            }}
          >
            Saved Scenarios
          </div>

          {loadError && (
            <div
              style={{
                padding: '10px 14px', borderRadius: 6,
                background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)',
                fontSize: 11, color: '#f85149', marginBottom: 16,
              }}
            >
              {loadError}
            </div>
          )}

          {scenariosLoading ? (
            <div style={{ color: '#444', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>
              Loading scenarios…
            </div>
          ) : scenarios.length === 0 ? (
            <div
              style={{
                padding: '32px', textAlign: 'center', borderRadius: 8,
                border: '1px dashed #21262d', color: '#444', fontSize: 12,
              }}
            >
              No scenarios yet.{' '}
              <button
                onClick={openNewBuilder}
                style={{
                  background: 'none', border: 'none', color: '#d4af37',
                  cursor: 'pointer', fontSize: 12, textDecoration: 'underline',
                }}
              >
                Build your first scenario.
              </button>
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #21262d', borderRadius: 8, overflow: 'hidden',
              }}
            >
              {/* Table header */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 80px 100px 110px 100px',
                  padding: '8px 14px',
                  background: '#0d1117',
                  borderBottom: '1px solid #21262d',
                }}
              >
                {['Name', 'Players', 'Street', 'Created', ''].map(h => (
                  <div
                    key={h}
                    style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                      color: '#6e7681', textTransform: 'uppercase',
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* Table rows */}
              {scenarios.map((sc, idx) => (
                <div
                  key={sc.scenario_id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 100px 110px 100px',
                    padding: '10px 14px',
                    background: idx % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.015)',
                    borderBottom: idx < scenarios.length - 1 ? '1px solid #161b22' : 'none',
                    alignItems: 'center',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? '#0d1117' : 'rgba(255,255,255,0.015)'; }}
                >
                  {/* Name */}
                  <div>
                    <span style={{ fontSize: 12, color: '#f0ece3', fontWeight: 500 }}>
                      {sc.name}
                    </span>
                  </div>

                  {/* Player count */}
                  <div>
                    <span style={{ fontSize: 11, color: '#8b949e' }}>
                      {sc.player_count ?? '—'}
                    </span>
                  </div>

                  {/* Starting street */}
                  <div>
                    <StreetBadge street={sc.starting_street} />
                  </div>

                  {/* Created */}
                  <div>
                    <span style={{ fontSize: 10, color: '#6e7681' }}>
                      {formatDate(sc.created_at)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div>
                    <button
                      onClick={() => openEditBuilder(sc)}
                      style={{
                        padding: '3px 10px', borderRadius: 3,
                        border: '1px solid rgba(212,175,55,0.3)', background: 'none',
                        color: '#d4af37', fontSize: 10, fontWeight: 600,
                        letterSpacing: '0.05em', cursor: 'pointer',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,175,55,0.08)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >
                      Load into Builder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ScenarioBuilder overlay */}
      {builderOpen && (
        <ScenarioBuilder
          socket={null}
          playlists={playlists}
          initialScenario={editScenario}
          onClose={handleBuilderClose}
        />
      )}
    </div>
  );
}
