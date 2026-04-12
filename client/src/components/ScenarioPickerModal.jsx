import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

// ── ScenarioPickerModal ────────────────────────────────────────────────────────
//
// Props:
//   playlistId  {string}          — target playlist
//   onClose     {() => void}
//   onAdded     {(newItems) => void}  — called with the newly-added item objects

export default function ScenarioPickerModal({ playlistId, onClose, onAdded }) {
  const [scenarios, setScenarios]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [playerFilter, setPlayer]   = useState('');
  const [selected, setSelected]     = useState(new Set());
  const [adding, setAdding]         = useState(false);
  const [error, setError]           = useState(null);

  // Load available scenarios
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim())  params.set('search', search.trim());
    if (playerFilter)   params.set('player_count', playerFilter);
    apiFetch(`/api/scenarios?${params}`)
      .then(data => setScenarios(Array.isArray(data?.scenarios) ? data.scenarios : []))
      .catch(() => setScenarios([]))
      .finally(() => setLoading(false));
  }, [search, playerFilter]);

  const toggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAdd = useCallback(async () => {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    try {
      const results = [];
      for (const scenarioId of selected) {
        const item = await apiFetch(`/api/playlists/${playlistId}/items`, {
          method: 'POST',
          body: JSON.stringify({ scenario_id: scenarioId }),
        });
        results.push(item);
      }
      onAdded?.(results);
      onClose?.();
    } catch (err) {
      setError(err.message ?? 'Failed to add scenarios');
    } finally {
      setAdding(false);
    }
  }, [selected, playlistId, onAdded, onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9];

  return (
    // Backdrop
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: '#0d1117', border: '1px solid #30363d', borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <span style={{ color: '#d4af37', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            Add Scenarios
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid #30363d',
              background: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#6e7681'; }}
          >×</button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #21262d' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search scenarios…"
            style={{
              flex: 1, padding: '6px 10px', borderRadius: 4, fontSize: 12,
              border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = '#30363d'; }}
          />
          <select
            value={playerFilter}
            onChange={e => setPlayer(e.target.value)}
            style={{
              padding: '6px 8px', borderRadius: 4, fontSize: 12,
              border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Any players</option>
            {PLAYER_COUNTS.map(n => (
              <option key={n} value={n}>{n}p</option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 16px' }}>
          {loading ? (
            <div style={{ color: '#444', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>Loading…</div>
          ) : scenarios.length === 0 ? (
            <div style={{ color: '#444', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
              No scenarios found.
            </div>
          ) : (
            scenarios.map(s => {
              const isSelected = selected.has(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 10px', borderRadius: 4, marginBottom: 3, cursor: 'pointer',
                    background: isSelected ? 'rgba(212,175,55,0.08)' : 'transparent',
                    border: isSelected ? '1px solid rgba(212,175,55,0.25)' : '1px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                    border: isSelected ? '2px solid #d4af37' : '2px solid #30363d',
                    background: isSelected ? '#d4af37' : 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <span style={{ flex: 1, fontSize: 12, color: '#f0ece3', fontWeight: 500 }}>{s.name}</span>
                  <span style={{ fontSize: 10, color: '#6e7681' }}>{s.player_count}p</span>
                  {Array.isArray(s.tags) && s.tags.length > 0 && (
                    <div className="flex gap-1">
                      {s.tags.slice(0, 3).map(t => (
                        <span key={t} style={{
                          fontSize: 9, padding: '1px 5px', borderRadius: 10,
                          background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
                          color: '#d4af37', fontWeight: 600,
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid #30363d' }}
        >
          <span style={{ fontSize: 11, color: '#6e7681' }}>
            {selected.size > 0 ? `${selected.size} selected` : 'Select scenarios to add'}
          </span>
          {error && (
            <span style={{ fontSize: 11, color: '#f85149', flex: 1, marginLeft: 12 }}>{error}</span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              style={{
                padding: '6px 14px', borderRadius: 4,
                border: '1px solid #30363d', background: 'none',
                color: '#6e7681', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || adding}
              style={{
                padding: '6px 16px', borderRadius: 4,
                background: selected.size === 0 || adding ? '#a07a20' : '#d4af37',
                color: '#000', border: 'none', fontSize: 11, fontWeight: 700,
                cursor: selected.size === 0 || adding ? 'not-allowed' : 'pointer',
                letterSpacing: '0.06em', opacity: selected.size === 0 ? 0.5 : 1,
              }}
            >
              {adding ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
