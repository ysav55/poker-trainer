import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiFetch } from '../../lib/api';
import ScenarioBuilder from '../../components/ScenarioBuilder';
import PlaylistTree from '../../components/scenarios/PlaylistTree.jsx';
import EmptyBuilder from '../../components/scenarios/EmptyBuilder.jsx';
import ScenarioToolbar from '../../components/scenarios/ScenarioToolbar.jsx';
import HandBuilderHeader from '../../components/scenarios/HandBuilderHeader.jsx';
import { generatePlaylistColor } from '../../components/scenarios/PLAYLIST_COLORS.js';
import { seedDefaultPlaylists } from '../../lib/seedPlaylists.js';
import { colors } from '../../lib/colors.js';

export default function HandBuilder() {
  const [scenarios, setScenarios]   = useState([]);
  const [playlists, setPlaylists]   = useState([]);
  const [search, setSearch]         = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const seededRef = useRef(false);

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
      const list = Array.isArray(data) ? data : Array.isArray(data?.playlists) ? data.playlists : [];
      if (!seededRef.current && list.length === 0) {
        seededRef.current = true;
        const { seeded } = await seedDefaultPlaylists({ existing: list });
        if (seeded) {
          const reload = await apiFetch('/api/playlists');
          const reloaded = Array.isArray(reload) ? reload : Array.isArray(reload?.playlists) ? reload.playlists : [];
          setPlaylists(reloaded);
          return;
        }
      }
      setPlaylists(list);
    } catch {
      setPlaylists([]);
    }
  }, []);

  useEffect(() => {
    fetchScenarios();
    fetchPlaylists();
  }, [fetchScenarios, fetchPlaylists]);

  const colorMap = useMemo(() => {
    const map = {};
    playlists.forEach((pl, i) => { map[pl.playlist_id] = generatePlaylistColor(i); });
    return map;
  }, [playlists]);

  const scenarioPlaylist = useMemo(() => {
    if (!selectedScenario || selectedScenario === 'new') return null;
    return playlists.find(p => p.playlist_id === selectedScenario.primary_playlist_id) || null;
  }, [selectedScenario, playlists]);

  function handleSelectPlaylist(pl) { setSelectedPlaylist(pl); setSelectedScenario(null); }
  function handleSelectScenario(sc) { setSelectedScenario(sc); }
  function handleNewScenario()      { setSelectedScenario('new'); }
  function handleScenarioSaved(saved) { if (saved) setSelectedScenario(saved); fetchScenarios(); }

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

  async function handleNewPlaylist() {
    const name = (window.prompt('Playlist name?') || '').trim();
    if (!name) return;
    const pl = await apiFetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    await fetchPlaylists();
    if (pl?.playlist_id) setSelectedPlaylist(pl);
  }

  async function handleCrossList(playlist, scenario) {
    if (!playlist?.playlist_id || !scenario?.id) return;
    try {
      await apiFetch(`/api/playlists/${playlist.playlist_id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenario.id }),
      });
    } catch { /* surface later via toast */ }
  }

  const newBtnLabel = selectedPlaylist ? `+ New in ${selectedPlaylist.name}` : '+ New Scenario';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        color: colors.textPrimary,
        background: colors.bgPrimary,
      }}
    >
      <HandBuilderHeader
        playlistCount={playlists.length}
        scenarioCount={scenarios.length}
        selectedScenario={selectedScenario}
        playlists={playlists}
        colorMap={colorMap}
        onAlsoAddTo={handleCrossList}
        onNewPlaylist={handleNewPlaylist}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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

          <div style={{ padding: '10px 12px', borderTop: `1px solid ${colors.borderDefault}`, flexShrink: 0 }}>
            <button
              data-testid="sidebar-new-btn"
              onClick={handleNewScenario}
              style={{
                width: '100%', padding: '7px', borderRadius: 4, background: colors.gold,
                color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.goldHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.gold; }}
            >
              {newBtnLabel}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ScenarioToolbar
            scenario={selectedScenario}
            playlist={scenarioPlaylist}
            playlistColor={scenarioPlaylist ? colorMap[scenarioPlaylist.playlist_id] : null}
            onDuplicate={handleDuplicateScenario}
            onDelete={handleDeleteScenario}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
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
      </div>
    </div>
  );
}
