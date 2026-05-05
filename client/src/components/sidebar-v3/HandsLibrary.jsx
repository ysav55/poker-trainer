import React, { useState } from 'react';
import useHandsLibrary from '../../hooks/useHandsLibrary.js';

export default function HandsLibrary({ emit, playlists = [] }) {
  const [q, setQ] = useState('');
  const [stackMode, setStackMode] = useState('keep');
  const [loadingId, setLoadingId] = useState(null);
  const { hands, total, loading } = useHandsLibrary({ q });

  function loadHand(handId, mode) {
    setLoadingId(handId);
    emit?.loadHandScenario?.(handId, mode);
    setTimeout(() => setLoadingId(null), 1000);
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Search Hands</div>
          <div className="card-kicker">{total} matches</div>
        </div>
        <input
          className="field"
          placeholder="Search by winner / hand id / tag..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%', marginBottom: 8 }}
        />
        <div className="row" style={{ gap: 4 }}>
          <button
            className={'chip' + (stackMode === 'keep' ? ' active' : '')}
            onClick={() => setStackMode('keep')}
            style={{ flex: 1 }}
          >Keep Stacks</button>
          <button
            className={'chip' + (stackMode === 'historical' ? ' active' : '')}
            onClick={() => setStackMode('historical')}
            style={{ flex: 1 }}
          >Hist. Stacks</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Results</div>
          <div className="card-kicker">{loading ? 'searching…' : `${hands.length} shown`}</div>
        </div>
        {loading && hands.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: '12px 8px' }}>Searching…</div>
        ) : hands.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: '12px 8px' }}>No hands match.</div>
        ) : (
          hands.map((h) => (
            <div key={h.hand_id} className="list-row" style={{ padding: '6px 0', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(201,163,93,0.06)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.winner_name ?? '—'} won {h.pot_end ?? ''}
                </div>
                <div style={{ fontSize: 9, color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                  {String(h.hand_id).slice(0, 8)} · {h.phase_ended ?? '—'}
                </div>
              </div>
              <button
                className="btn sm"
                onClick={() => loadHand(h.hand_id, stackMode)}
                disabled={!emit?.loadHandScenario || loadingId === h.hand_id}
                title={`Load with ${stackMode === 'keep' ? 'current stacks' : 'historical stacks'}`}
              >{loadingId === h.hand_id ? '…' : 'Load'}</button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
