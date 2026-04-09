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

function flattenFolders(folders, depth = 0) {
  const result = [];
  for (const f of folders) {
    result.push({ ...f, depth });
    if (f.children?.length) {
      result.push(...flattenFolders(f.children, depth + 1));
    }
  }
  return result;
}

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
        {scenario.name || `Scenario ${(scenario.id ?? scenario.scenario_id)?.slice(0, 6)}`}
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

// ── QuickSavePanel ────────────────────────────────────────────────────────────

/**
 * Compact inline panel shown immediately after a scenario is saved.
 * Lets the user assign the new scenario to an existing playlist without
 * leaving the Scenarios tab.
 *
 * Props:
 *   scenario  {object}        — the just-saved scenario (must have scenario_id)
 *   playlists {object[]}      — array of { playlist_id, name }
 *   onDone    {() => void}    — called after save OR skip
 */
function QuickSavePanel({ scenario, playlists, onDone }) {
  const [selectedId, setSelectedId] = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState(null);

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/api/playlists/${selectedId}/items`, {
        method: 'POST',
        body: JSON.stringify({ scenario_id: scenario.scenario_id }),
      });
      onDone();
    } catch (err) {
      setError(err.message ?? 'Failed to add to playlist');
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="quick-save-panel"
      style={{
        margin: '0 16px 16px',
        padding: '12px 16px',
        borderRadius: 8,
        background: '#161b22',
        border: '1px solid #30363d',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      {playlists.length === 0 ? (
        <>
          <span style={{ fontSize: 11, color: '#6e7681', flex: 1 }}>
            No playlists yet. Go to the Playlists tab to create one.
          </span>
          <button
            data-testid="quick-save-skip"
            onClick={onDone}
            style={{ fontSize: 11, color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Skip
          </button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 11, color: '#8b949e', flexShrink: 0 }}>
            Save to playlist:
          </span>
          <select
            data-testid="quick-save-select"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{
              flex: 1, minWidth: 120,
              padding: '5px 8px', borderRadius: 4,
              border: '1px solid #30363d',
              background: '#0d1117',
              color: selectedId ? '#e5e7eb' : '#6e7681',
              fontSize: 11, outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="">— choose —</option>
            {playlists.map(pl => (
              <option key={pl.playlist_id} value={pl.playlist_id}>
                {pl.name}
              </option>
            ))}
          </select>
          <button
            data-testid="quick-save-btn"
            onClick={handleSave}
            disabled={!selectedId || saving}
            style={{
              padding: '5px 14px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: !selectedId || saving ? 'transparent' : 'rgba(212,175,55,0.15)',
              border: !selectedId || saving ? '1px solid #30363d' : '1px solid rgba(212,175,55,0.4)',
              color: !selectedId || saving ? '#444' : '#d4af37',
              cursor: !selectedId || saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.1s',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            data-testid="quick-save-skip"
            onClick={onDone}
            style={{
              fontSize: 11, color: '#6e7681', background: 'none',
              border: 'none', cursor: 'pointer', padding: '5px 4px',
            }}
          >
            Skip
          </button>
          {error && (
            <span style={{ width: '100%', fontSize: 11, color: '#f85149', marginTop: 2 }}>
              {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HandBuilder() {
  const [activeTab, setActiveTab]           = useState('Scenarios');
  const [searchQuery, setSearchQuery]       = useState('');
  const [folderFilter, setFolderFilter]     = useState('');
  const [scenarios, setScenarios]           = useState([]);
  const [playlists, setPlaylists]           = useState([]);
  const [folders, setFolders]               = useState([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);

  // Selection state
  const [selectedScenario, setSelectedScenario] = useState(null); // scenario object or 'new'
  const [selectedPlaylist, setSelectedPlaylist] = useState(null); // playlist object or 'new'
  const [showQuickSave, setShowQuickSave]       = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchScenarios = useCallback(async () => {
    setScenariosLoading(true);
    try {
      const data = await apiFetch('/api/scenarios');
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

  const fetchFolders = useCallback(async () => {
    try {
      const data = await apiFetch('/api/scenarios/folders');
      setFolders(Array.isArray(data?.folders) ? data.folders : []);
    } catch {
      setFolders([]);
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
    fetchFolders();
    fetchPlaylists();
  }, [fetchScenarios, fetchFolders, fetchPlaylists]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredScenarios = scenarios.filter(sc => {
    if (folderFilter && sc.folder_id !== folderFilter) return false;
    if (!searchQuery.trim()) return true;
    return (sc.name ?? '').toLowerCase().includes(searchQuery.toLowerCase());
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

  function handleScenarioSaved(savedScenario) {
    // Stay on the saved scenario — do NOT reset to the empty splash.
    // fetchScenarios refreshes the sidebar list so the updated name/state appears.
    if (savedScenario) setSelectedScenario(savedScenario);
    setShowQuickSave(true);
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

  function handlePlaylistSaved() {
    setSelectedPlaylist(null);
    fetchPlaylists();
  }

  function handleTabChange(tab) {
    setActiveTab(tab);
    setSearchQuery('');
    setFolderFilter('');
    setSelectedScenario(null);
    setSelectedPlaylist(null);
  }

  // ── Right panel content ────────────────────────────────────────────────────

  function renderRightPanel() {
    if (selectedScenario === 'new') {
      return (
        <>
          <ScenarioBuilder
            scenario={null}
            folders={folders}
            onSaved={handleScenarioSaved}
            onDelete={handleDeleteScenario}
            onDuplicate={handleDuplicateScenario}
            onClose={handleScenarioSaved}
          />
          {showQuickSave && (
            <QuickSavePanel
              scenario={selectedScenario === 'new' ? {} : selectedScenario}
              playlists={playlists}
              onDone={() => setShowQuickSave(false)}
            />
          )}
        </>
      );
    }
    if (selectedScenario) {
      return (
        <>
          <ScenarioBuilder
            scenario={selectedScenario}
            folders={folders}
            onSaved={handleScenarioSaved}
            onDelete={handleDeleteScenario}
            onDuplicate={handleDuplicateScenario}
            onClose={handleScenarioSaved}
          />
          {showQuickSave && (
            <QuickSavePanel
              scenario={selectedScenario}
              playlists={playlists}
              onDone={() => setShowQuickSave(false)}
            />
          )}
        </>
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

  const flatFolders = flattenFolders(folders);

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
        <div style={{ padding: '10px 12px 6px', flexShrink: 0 }}>
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

        {/* Folder filter (Scenarios tab only) */}
        {activeTab === 'Scenarios' && (
          <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
            <select
              value={folderFilter}
              onChange={e => setFolderFilter(e.target.value)}
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 4,
                border: '1px solid #30363d', background: '#0d1117',
                color: folderFilter ? '#f0ece3' : '#6e7681',
                fontSize: 11, outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
              }}
            >
              <option value="">All folders</option>
              {flatFolders.map(f => (
                <option key={f.id} value={f.id}>
                  {'\u00a0'.repeat(f.depth * 2)}{f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {activeTab === 'Scenarios' ? (
            scenariosLoading ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                Loading…
              </div>
            ) : filteredScenarios.length === 0 ? (
              <div style={{ color: '#444', fontSize: 11, padding: '20px', textAlign: 'center' }}>
                {searchQuery || folderFilter ? 'No matches.' : 'No scenarios yet.'}
              </div>
            ) : (
              filteredScenarios.map(sc => (
                <ScenarioCard
                  key={sc.id ?? sc.scenario_id}
                  scenario={sc}
                  selected={
                    selectedScenario && selectedScenario !== 'new' && (
                      selectedScenario.id === sc.id ||
                      (selectedScenario.scenario_id && selectedScenario.scenario_id === sc.scenario_id)
                    )
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
            data-testid="sidebar-new-btn"
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
