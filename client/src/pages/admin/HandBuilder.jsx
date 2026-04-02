import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import ScenarioBuilder from '../../components/ScenarioBuilder';
import PlaylistEditor from '../../components/PlaylistEditor';

// ── Constants ──────────────────────────────────────────────────────────────────

const TABS = ['Scenarios', 'Playlists'];

const STREET_COLORS = {
  preflop: { bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  text: '#93c5fd' },
  flop:    { bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
  turn:    { bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#fcd34d' },
  river:   { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#fca5a5' },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function StreetBadge({ street }) {
  const c = STREET_COLORS[street] ?? STREET_COLORS.preflop;
  const label = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' }[street] ?? street;
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold tracking-wider"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 9 }}
    >
      {label}
    </span>
  );
}

function TagPill({ tag }) {
  return (
    <span
      style={{
        fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
        background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)',
        color: '#d4af37', letterSpacing: '0.05em',
      }}
    >
      {tag}
    </span>
  );
}

// ── Scenario card in the library list ─────────────────────────────────────────

function ScenarioCard({ scenario, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
        background: selected ? 'rgba(212,175,55,0.08)' : 'transparent',
        border: selected ? '1px solid rgba(212,175,55,0.35)' : '1px solid transparent',
        transition: 'all 0.1s', marginBottom: 4,
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.borderColor = '#30363d';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      <div style={{ fontSize: 12, color: '#f0ece3', fontWeight: 500, marginBottom: 4 }}>
        {scenario.name || `Scenario ${scenario.scenario_id?.slice(0, 6)}`}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <StreetBadge street={scenario.starting_street} />
        {scenario.player_count != null && (
          <span style={{ fontSize: 10, color: '#6e7681' }}>{scenario.player_count}p</span>
        )}
        {scenario.tags?.slice(0, 2).map(t => <TagPill key={t} tag={t} />)}
      </div>
    </button>
  );
}

// ── Playlist card in the library list ─────────────────────────────────────────

function PlaylistCard({ playlist, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
        background: selected ? 'rgba(212,175,55,0.08)' : 'transparent',
        border: selected ? '1px solid rgba(212,175,55,0.35)' : '1px solid transparent',
        transition: 'all 0.1s', marginBottom: 4,
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.borderColor = '#30363d';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }
      }}
    >
      <div style={{ fontSize: 12, color: '#f0ece3', fontWeight: 500, marginBottom: 4 }}>
        {playlist.name}
      </div>
      <div className="flex items-center gap-2">
        <span style={{ fontSize: 10, color: '#6e7681' }}>
          {playlist.hand_count ?? 0} scenario{playlist.hand_count !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  );
}

// ── Empty state for the right panel ───────────────────────────────────────────

function EmptyBuilder({ activeTab, onNewScenario, onNewPlaylist }) {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ color: '#444' }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>
        {activeTab === 'Scenarios' ? '♠' : '▤'}
      </div>
      <div style={{ fontSize: 13, color: '#6e7681', marginBottom: 6 }}>
        {activeTab === 'Scenarios'
          ? 'Select a scenario to edit, or build a new one.'
          : 'Select a playlist to edit, or create a new one.'}
      </div>
      <button
        onClick={activeTab === 'Scenarios' ? onNewScenario : onNewPlaylist}
        style={{
          marginTop: 12, padding: '7px 18px', borderRadius: 4,
          background: '#d4af37', color: '#000', border: 'none',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}
      >
        {activeTab === 'Scenarios' ? '+ New Scenario' : '+ New Playlist'}
      </button>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HandBuilder() {
  const [activeTab, setActiveTab]           = useState('Scenarios');
  const [searchQuery, setSearchQuery]       = useState('');
  const [scenarios, setScenarios]           = useState([]);
  const [playlists, setPlaylists]           = useState([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);

  // Selection state
  const [selectedScenario, setSelectedScenario] = useState(null); // scenario object or 'new'
  const [selectedPlaylist, setSelectedPlaylist] = useState(null); // playlist object or 'new'

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchScenarios = useCallback(async () => {
    setScenariosLoading(true);
    try {
      const data = await apiFetch('/api/admin/scenarios');
      setScenarios(
        Array.isArray(data) ? data :
        Array.isArray(data?.configs) ? data.configs :
        Array.isArray(data?.scenarios) ? data.scenarios : []
      );
    } catch {
      setScenarios([]);
    } finally {
      setScenariosLoading(false);
    }
  }, []);

  const fetchPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    try {
      const data = await apiFetch('/api/playlists');
      setPlaylists(
        Array.isArray(data) ? data :
        Array.isArray(data?.playlists) ? data.playlists : []
      );
    } catch {
      setPlaylists([]);
    } finally {
      setPlaylistsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
    fetchPlaylists();
  }, [fetchScenarios, fetchPlaylists]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredScenarios = scenarios.filter(sc => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (sc.name ?? '').toLowerCase().includes(q);
  });

  const filteredPlaylists = playlists.filter(pl => {
    if (!searchQuery.trim()) return true;
    return pl.name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleNewScenario() {
    setSelectedScenario('new');
    setSelectedPlaylist(null);
  }

  function handleNewPlaylist() {
    setSelectedPlaylist('new');
    setSelectedScenario(null);
  }

  function handleSelectScenario(sc) {
    setSelectedScenario(sc);
    setSelectedPlaylist(null);
  }

  function handleSelectPlaylist(pl) {
    setSelectedPlaylist(pl);
    setSelectedScenario(null);
  }

  function handleBuilderClose() {
    setSelectedScenario(null);
    fetchScenarios();
  }

  function handlePlaylistSaved() {
    setSelectedPlaylist(null);
    fetchPlaylists();
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSearchQuery('');
    setSelectedScenario(null);
    setSelectedPlaylist(null);
  }

  // ── Right panel content ────────────────────────────────────────────────────

  function renderRightPanel() {
    if (selectedScenario === 'new') {
      return (
        <ScenarioBuilder
          inline
          playlists={playlists}
          initialScenario={null}
          onClose={handleBuilderClose}
        />
      );
    }
    if (selectedScenario) {
      return (
        <ScenarioBuilder
          inline
          playlists={playlists}
          initialScenario={selectedScenario}
          onClose={handleBuilderClose}
        />
      );
    }
    if (selectedPlaylist === 'new') {
      return (
        <PlaylistEditor
          playlist={null}
          onClose={() => setSelectedPlaylist(null)}
          onSaved={handlePlaylistSaved}
        />
      );
    }
    if (selectedPlaylist) {
      return (
        <PlaylistEditor
          playlist={selectedPlaylist}
          onClose={() => setSelectedPlaylist(null)}
          onSaved={handlePlaylistSaved}
        />
      );
    }
    return (
      <EmptyBuilder
        activeTab={activeTab}
        onNewScenario={handleNewScenario}
        onNewPlaylist={handleNewPlaylist}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: 'flex', height: '100%', overflow: 'hidden',
        color: '#f0ece3',
      }}
    >
      {/* ── Left: Library panel ──────────────────────────────────────────────── */}
      <div
        style={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid #21262d', background: '#0a0e14',
          overflow: 'hidden',
        }}
      >
        {/* Tab toggle */}
        <div
          className="flex flex-shrink-0"
          style={{ borderBottom: '1px solid #21262d' }}
        >
          {TABS.map(tab => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                style={{
                  flex: 1, padding: '10px 8px', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  cursor: 'pointer', border: 'none', transition: 'all 0.1s',
                  borderBottom: active ? '2px solid #d4af37' : '2px solid transparent',
                  background: active ? 'rgba(212,175,55,0.05)' : 'transparent',
                  color: active ? '#d4af37' : '#6e7681',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', flexShrink: 0 }}>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab.toLowerCase()}…`}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 4,
              border: '1px solid #30363d', background: '#0d1117',
              color: '#f0ece3', fontSize: 11, outline: 'none', boxSizing: 'border-box',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
            onBlur={e => { e.target.style.borderColor = '#30363d'; }}
          />
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {activeTab === 'Scenarios' ? (
            scenariosLoading ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                Loading…
              </div>
            ) : filteredScenarios.length === 0 ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                {searchQuery ? 'No matches.' : 'No scenarios yet.'}
              </div>
            ) : (
              filteredScenarios.map(sc => (
                <ScenarioCard
                  key={sc.scenario_id ?? sc.id}
                  scenario={sc}
                  selected={
                    selectedScenario && selectedScenario !== 'new' &&
                    selectedScenario.scenario_id === sc.scenario_id
                  }
                  onClick={() => handleSelectScenario(sc)}
                />
              ))
            )
          ) : (
            playlistsLoading ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                Loading…
              </div>
            ) : filteredPlaylists.length === 0 ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                {searchQuery ? 'No matches.' : 'No playlists yet.'}
              </div>
            ) : (
              filteredPlaylists.map(pl => (
                <PlaylistCard
                  key={pl.playlist_id}
                  playlist={pl}
                  selected={
                    selectedPlaylist && selectedPlaylist !== 'new' &&
                    selectedPlaylist.playlist_id === pl.playlist_id
                  }
                  onClick={() => handleSelectPlaylist(pl)}
                />
              ))
            )
          )}
        </div>

        {/* New button */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid #21262d', flexShrink: 0 }}>
          <button
            onClick={activeTab === 'Scenarios' ? handleNewScenario : handleNewPlaylist}
            style={{
              width: '100%', padding: '7px', borderRadius: 4,
              background: '#d4af37', color: '#000', border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5c450'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#d4af37'; }}
          >
            + {activeTab === 'Scenarios' ? 'New Scenario' : 'New Playlist'}
          </button>
        </div>
      </div>

      {/* ── Right: Builder panel ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {renderRightPanel()}
      </div>
    </div>
  );
}
