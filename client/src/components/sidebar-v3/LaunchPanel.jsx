import React, { useState } from 'react';
import { Segmented } from './shared.jsx';

export default function LaunchPanel({ playlist, fitCount, onLaunch, onCancel, emit }) {
  const [heroMode, setHeroMode] = useState('sticky');
  const [order, setOrder] = useState('sequential');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [allowZeroMatch, setAllowZeroMatch] = useState(false);

  const fitsZero = fitCount === 0;
  const canLaunch = !fitsZero || allowZeroMatch;

  function launch() {
    if (!canLaunch) return;
    onLaunch?.({
      playlistId: playlist.id,
      heroMode,
      order,
      autoAdvance,
      allowZeroMatch,
    });
  }

  return (
    <div className="card" style={{ marginTop: 6 }}>
      <div className="card-head">
        <div className="card-title">Launch "{playlist.name}"</div>
        <div className="card-kicker">{playlist.count} hand{playlist.count === 1 ? '' : 's'}</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>Hero mode</div>
        <Segmented
          cols={3}
          options={[
            { value: 'sticky',   label: 'Sticky' },
            { value: 'per_hand', label: 'Per hand' },
            { value: 'rotate',   label: 'Rotate' },
          ]}
          value={heroMode}
          onChange={setHeroMode}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>Order</div>
        <Segmented
          cols={2}
          options={[
            { value: 'sequential', label: 'Sequential' },
            { value: 'random',     label: 'Random' },
          ]}
          value={order}
          onChange={setOrder}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6 }}>
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => setAutoAdvance(e.target.checked)}
        />
        Auto-advance to next spot
      </label>

      {fitsZero && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 6, color: 'var(--warn)' }}>
          <input
            type="checkbox"
            checked={allowZeroMatch}
            onChange={(e) => setAllowZeroMatch(e.target.checked)}
          />
          Allow zero-match (no hands fit current table)
        </label>
      )}

      <div className="row" style={{ gap: 5, marginTop: 8 }}>
        <button className="btn ghost full" onClick={onCancel}>Cancel</button>
        <button className="btn primary full" onClick={launch} disabled={!canLaunch}>Launch →</button>
      </div>
    </div>
  );
}
