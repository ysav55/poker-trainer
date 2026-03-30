import React, { useState, useMemo } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { RangeMatrix } from '../RangeMatrix';
import { comboToHandGroup } from '../../utils/comboUtils';

function formatPot(n) {
  if (!n) return '0';
  return Number(n).toLocaleString('en-US');
}

export default function HandLibrarySection({ hands, emit, playlists }) {
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [selectedPlaylistForAdd, setSelectedPlaylistForAdd] = useState('');
  const [scenarioStackMode, setScenarioStackMode] = useState('keep');
  const [rangeFilterOpen, setRangeFilterOpen] = useState(false);
  const [rangeFilter, setRangeFilter] = useState(new Set());

  const filteredHands = useMemo(() => {
    const textFiltered = hands.filter(h => {
      if (!scenarioSearch.trim()) return true;
      const q = scenarioSearch.toLowerCase();
      return (
        (h.winner_name ?? '').toLowerCase().includes(q) ||
        (h.phase_ended ?? '').toLowerCase().includes(q) ||
        (h.hand_id ?? '').toLowerCase().includes(q) ||
        (h.auto_tags ? JSON.stringify(h.auto_tags).toLowerCase().includes(q) : false)
      );
    });
    if (!rangeFilter.size) return textFiltered;
    return textFiltered.filter(h => {
      const hc = h.hero_hole_cards ?? h.hole_cards;
      if (!Array.isArray(hc) || hc.length < 2) return false;
      return rangeFilter.has(comboToHandGroup(hc));
    });
  }, [hands, scenarioSearch, rangeFilter]);

  return (
    <CollapsibleSection title="HAND LIBRARY" defaultOpen={false}>
      <div className="space-y-2">
        {/* Stack mode toggle */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {['keep', 'historical'].map(m => (
            <button
              key={m}
              onClick={() => setScenarioStackMode(m)}
              style={{
                flex: 1, padding: '3px 0', fontSize: '9px', fontWeight: 600,
                borderRadius: 3, cursor: 'pointer', letterSpacing: '0.06em',
                textTransform: 'uppercase',
                border: `1px solid ${scenarioStackMode === m ? 'rgba(212,175,55,0.5)' : '#30363d'}`,
                background: scenarioStackMode === m ? 'rgba(212,175,55,0.12)' : 'transparent',
                color: scenarioStackMode === m ? '#d4af37' : '#6e7681',
              }}
            >
              {m === 'keep' ? 'Keep Stacks' : 'Hist. Stacks'}
            </button>
          ))}
        </div>

        {/* Search filter */}
        <input
          type="text"
          placeholder="Search hands..."
          value={scenarioSearch}
          onChange={e => setScenarioSearch(e.target.value)}
          className="w-full rounded px-2 py-1 text-xs text-white outline-none"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            color: '#f0ece3',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
          onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
        />

        {/* Range filter toggle */}
        <div>
          <button
            onClick={() => setRangeFilterOpen(o => !o)}
            style={{
              width: '100%', padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
              background: rangeFilter.size ? 'rgba(212,175,55,0.12)' : 'transparent',
              border: `1px solid ${rangeFilter.size ? 'rgba(212,175,55,0.4)' : '#30363d'}`,
              color: rangeFilter.size ? '#d4af37' : '#6e7681',
              fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
              textAlign: 'left', display: 'flex', justifyContent: 'space-between',
            }}
          >
            <span>⬡ Filter by Range {rangeFilter.size > 0 ? `(${rangeFilter.size})` : ''}</span>
            <span>{rangeFilterOpen ? '▲' : '▼'}</span>
          </button>
          {rangeFilterOpen && (
            <div style={{ marginTop: 6 }}>
              <RangeMatrix
                selected={rangeFilter}
                onToggle={(handGroup) => {
                  setRangeFilter((prev) => {
                    const next = new Set(prev);
                    if (next.has(handGroup)) next.delete(handGroup);
                    else next.add(handGroup);
                    return next;
                  });
                }}
                colorMode="selected"
              />
              {rangeFilter.size > 0 && (
                <button
                  onClick={() => setRangeFilter(new Set())}
                  style={{
                    marginTop: 4, width: '100%', padding: '2px 0', borderRadius: 3,
                    background: 'transparent', border: '1px solid #30363d',
                    color: '#6e7681', fontSize: '9px', cursor: 'pointer',
                  }}
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* Hand list */}
        <div style={{ maxHeight: '14rem', overflowY: 'auto' }} className="space-y-1">
          {filteredHands.length === 0 ? (
            <p style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>
              {hands.length === 0 ? 'No completed hands yet' : 'No hands match the current filter'}
            </p>
          ) : (
            filteredHands
              .slice(0, 10)
              .map(h => {
                const heroHoleCards = h.hero_hole_cards ?? h.hole_cards;
                const heroHandGroup = Array.isArray(heroHoleCards) && heroHoleCards.length >= 2
                  ? comboToHandGroup(heroHoleCards)
                  : null;
                return (
                <div
                  key={h.hand_id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    transition: 'border-color 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1">
                      {heroHandGroup && (
                        <span style={{
                          fontSize: '9px', fontWeight: 700, fontFamily: 'monospace',
                          padding: '0px 5px', borderRadius: 3,
                          background: 'rgba(59,130,246,0.15)', color: '#60a5fa',
                          border: '1px solid rgba(59,130,246,0.25)', flexShrink: 0,
                        }}>
                          {heroHandGroup}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', fontWeight: 500, color: '#c9c3b8' }} className="truncate">
                        {h.winner_name ?? 'No winner'} — ${formatPot(h.final_pot)}
                      </span>
                    </div>
                    <div className="flex gap-1 mt-0.5 flex-wrap items-center">
                      {h.auto_tags && (Array.isArray(h.auto_tags) ? h.auto_tags : JSON.parse(h.auto_tags || '[]')).map(tag => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '8px',
                            padding: '1px 4px',
                            borderRadius: '2px',
                            background: 'rgba(212,175,55,0.15)',
                            color: '#d4af37',
                            border: '1px solid rgba(212,175,55,0.2)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                      {(() => {
                        const tags = Array.isArray(h.coach_tags) ? h.coach_tags
                          : (h.coach_tags ? JSON.parse(h.coach_tags) : []);
                        return tags.map(tag => (
                          <span key={`ctag-${tag}`} style={{
                            fontSize: '8px', padding: '1px 4px', borderRadius: 2,
                            background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
                            border: '1px solid rgba(99,102,241,0.2)', marginRight: 2,
                          }}>{tag}</span>
                        ));
                      })()}
                      <span style={{ fontSize: '8px', color: '#444' }}>
                        {new Date(h.started_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 ml-2">
                    <button
                      onClick={() => emit.loadHandScenario?.(h.hand_id, scenarioStackMode)}
                      title="Load cards from this hand, keep current stacks"
                      style={{
                        padding: '2px 6px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        border: '1px solid rgba(29,78,216,0.5)',
                        color: '#60a5fa',
                        background: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => emit.addToPlaylist?.(selectedPlaylistForAdd, h.hand_id)}
                      disabled={!selectedPlaylistForAdd}
                      title={selectedPlaylistForAdd ? 'Add to selected playlist' : 'Select a playlist first'}
                      style={{
                        padding: '2px 6px',
                        fontSize: '9px',
                        borderRadius: '3px',
                        border: '1px solid rgba(109,40,217,0.4)',
                        color: selectedPlaylistForAdd ? 'rgba(192,132,252,1)' : 'rgba(192,132,252,0.4)',
                        background: 'none',
                        cursor: selectedPlaylistForAdd ? 'pointer' : 'not-allowed',
                        whiteSpace: 'nowrap',
                        opacity: selectedPlaylistForAdd ? 1 : 0.4,
                      }}
                      onMouseEnter={(e) => { if (selectedPlaylistForAdd) { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)'; e.currentTarget.style.color = '#c084fc'; } }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = selectedPlaylistForAdd ? 'rgba(192,132,252,1)' : 'rgba(192,132,252,0.4)'; }}
                    >
                      + Playlist
                    </button>
                  </div>
                </div>
                );
              })
          )}
        </div>

        {/* Playlist target selector for adding hands */}
        {playlists.length > 0 && (
          <div className="flex items-center gap-2">
            <span style={{ fontSize: '9px', color: '#6e7681', flexShrink: 0 }}>Add to:</span>
            <select
              value={selectedPlaylistForAdd}
              onChange={e => setSelectedPlaylistForAdd(e.target.value)}
              className="flex-1 min-w-0 rounded outline-none"
              style={{ background: '#161b22', border: '1px solid #30363d', padding: '2px 6px', fontSize: '10px', color: '#c9c3b8' }}
            >
              <option value="">— select playlist —</option>
              {playlists.map(pl => (
                <option key={pl.playlist_id} value={pl.playlist_id}>{pl.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
