import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../lib/api';
import ScenarioBuilder from '../../components/ScenarioBuilder';
import PlaylistTree from '../../components/scenarios/PlaylistTree.jsx';
import { colors } from '../../lib/colors.js';

function EmptyBuilder({ onNewScenario }) {
  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ color: colors.textMuted }}
    >
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3, color: colors.gold }}>♠</div>
      <div style={{ fontSize: 13, marginBottom: 6 }}>
        Select a scenario to edit, or build a new one.
      </div>
      <button
        onClick={onNewScenario}
        style={{
          marginTop: 12,
          padding: '7px 18px',
          borderRadius: 4,
          background: colors.gold,
          color: '#000',
          border: 'none',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        + New Scenario
      </button>
    </div>
  );
}

export default function HandBuilder() {
  const [scenarios, setScenarios]   = useState([]);
  const [playlists, setPlaylists]   = useState([]);
  const [search, setSearch]         = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null); // object or 'new'

  const fetchScenarios = useCallback(async () => {
    try {
      const data = await apiFetch('/api/scenarios');
      setScenarios(
        Array.isArray(data) ? data :
        Array.isArray(data?.scenarios) ? data.scenarios :
        Array.isArray(data?.configs) ? data.configs : []
      );
    } catch {
      setScenarios([]);
    }
  }, []);

  const fetchPlaylists = useCallback(async () => {
    try {
      const data = await apiFetch('/api/playlists');
      setPlaylists(
        Array.isArray(data) ? data :
        Array.isArray(data?.playlists) ? data.playlists : []
      );
    } catch {
      setPlaylists([]);
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
    fetchPlaylists();
  }, [fetchScenarios, fetchPlaylists]);

  function handleSelectPlaylist(pl) {
    setSelectedPlaylist(pl);
    setSelectedScenario(null);
  }

  function handleSelectScenario(sc) {
    setSelectedScenario(sc);
    // Preserve selectedPlaylist so "New Scenario in {playlist}" stays contextual.
  }

  function handleNewScenario() {
    setSelectedScenario('new');
  }

  function handleScenarioSaved(saved) {
    if (saved) setSelectedScenario(saved);
    fetchScenarios();
  }

  async function handleDeleteScenario(id) {
    await apiFetch(`/api/scenarios/${id}`, { method: 'DELETE' });
    setSelectedScenario(null);
    fetchScenarios();
  }

  async function handleDuplicateScenario(id) {
    const copy = await apiFetch(`/api/scenarios/${id}/duplicate`, { method: 'POST' });
    fetchScenarios();
    setSelectedScenario(copy);
  }

  const newButtonLabel = selectedPlaylist
    ? `+ New in ${selectedPlaylist.name}`
    : '+ New Scenario';

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        overflow: 'hidden',
        color: colors.textPrimary,
        background: colors.bgPrimary,
      }}
    >
      <h1 className="sr-only">Scenarios</h1>

      {/* Left: playlist tree */}
      <div
        style={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: `1px solid ${colors.borderDefault}`,
          background: colors.bgSurface,
          overflow: 'hidden',
        }}
      >
        <PlaylistTree
          playlists={playlists}
          scenarios={scenarios}
          search={search}
          onSearchChange={setSearch}
          selectedPlaylistId={selectedPlaylist?.playlist_id ?? null}
          selectedScenarioId={selectedScenario && selectedScenario !== 'new' ? selectedScenario.id : null}
          onSelectPlaylist={handleSelectPlaylist}
          onSelectScenario={handleSelectScenario}
        />

        <div
          style={{
            padding: '10px 12px',
            borderTop: `1px solid ${colors.borderDefault}`,
            flexShrink: 0,
          }}
        >
          <button
            data-testid="sidebar-new-btn"
            onClick={handleNewScenario}
            style={{
              width: '100%',
              padding: '7px',
              borderRadius: 4,
              background: colors.gold,
              color: '#000',
              border: 'none',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.goldHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.gold; }}
          >
            {newButtonLabel}
          </button>
        </div>
      </div>

      {/* Right: ScenarioBuilder */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedScenario ? (
          <ScenarioBuilder
            scenario={selectedScenario === 'new' ? null : selectedScenario}
            primaryPlaylistId={selectedScenario === 'new' ? selectedPlaylist?.playlist_id ?? null : undefined}
            onSaved={handleScenarioSaved}
            onDelete={handleDeleteScenario}
            onDuplicate={handleDuplicateScenario}
            onClose={handleScenarioSaved}
          />
        ) : (
          <EmptyBuilder onNewScenario={handleNewScenario} />
        )}
      </div>
    </div>
  );
}
