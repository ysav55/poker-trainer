import React, { useState } from 'react';
import { Play, Pause, ChevronRight, XCircle, CircleAlert } from 'lucide-react';
import { colors } from '../../lib/colors';

export default function ScenarioLaunchPanel({ playlists = [], activePlayers = [], drill }) {
  const [playlistId, setPlaylistId]         = useState('');
  const [heroPlayerId, setHeroPlayerId]     = useState('');
  const [heroMode, setHeroMode]             = useState('sticky');
  const [ordering, setOrdering]             = useState('sequential');
  const [autoAdvance, setAutoAdvance]       = useState(false);
  const [allowZeroMatch, setAllowZeroMatch] = useState(false);

  if (drill.resumable) {
    const { priorPosition, priorTotal } = drill.resumable;
    return (
      <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
        <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>Resume playlist?</div>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 12 }}>
          Paused at position {priorPosition} / {priorTotal}.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={drill.resume}  style={btnGold}>Resume from {priorPosition}</button>
          <button onClick={drill.restart} style={btnGhost}>Restart</button>
          <button onClick={drill.cancel}  style={btnDanger}>Discard & Exit</button>
        </div>
      </div>
    );
  }

  if (drill.session || drill.paused) {
    const s = drill.session || {};
    const isPaused = drill.paused;

    return (
      <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
        <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 4 }}>
          {isPaused ? 'Paused' : 'Scenario Active'}
        </div>
        <div style={{ color: colors.textMuted, fontSize: 13, marginBottom: 8 }}>
          {s.current_position ?? 0} / {s.items_total ?? 0} · {s.hero_mode} · auto: {s.auto_advance ? 'on' : 'off'}
        </div>

        {/* Scenario queue — if items available */}
        {Array.isArray(s.items) && (
          <div style={{ maxHeight: 120, overflowY: 'auto', marginBottom: 10, paddingRight: 4 }}>
            <div style={{ fontSize: 11, color: colors.textMuted, marginBottom: 4 }}>Queue:</div>
            {s.items.map((item, i) => {
              const isDone = i < (s.current_position ?? 0);
              const isCurrent = i === (s.current_position ?? 0);
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 12,
                    padding: '2px 4px',
                    color: isDone ? colors.textMuted : isCurrent ? colors.gold : colors.textSecondary,
                    textDecoration: isDone ? 'line-through' : 'none',
                    backgroundColor: isCurrent ? colors.goldSubtle : 'transparent',
                    marginBottom: 2,
                  }}
                >
                  {i+1}. {item.name || `Scenario ${item.id}`}
                </div>
              );
            })}
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {!isPaused && (
            <>
              <button onClick={drill.pause} style={btnGhost}><Pause size={14} /> Pause</button>
              <button onClick={drill.advance} style={btnGhost}><ChevronRight size={14} /> Advance</button>
            </>
          )}
          {isPaused && (
            <>
              <button onClick={drill.resume} style={btnGold}><Play size={14} /> Resume</button>
            </>
          )}
          <button onClick={drill.cancel} style={btnDanger}><XCircle size={14} /> Exit Drill</button>
        </div>

        {/* Live toggles — auto-advance and order */}
        <div style={{ borderTop: `1px solid ${colors.borderDefault}`, paddingTop: 8, fontSize: 12 }}>
          <label style={{ display: 'block', marginBottom: 6, color: colors.textMuted }}>
            <input
              type="checkbox"
              checked={drill.autoAdvance}
              onChange={(e) => drill.setMode({ auto_advance: e.target.checked })}
            /> Auto-advance
          </label>
          <div style={{ color: colors.textMuted, marginBottom: 4 }}>Order:</div>
          {['sequential', 'random'].map(o => (
            <label key={o} style={{ marginRight: 8, color: colors.textMuted }}>
              <input
                type="radio"
                name="liveorder"
                value={o}
                checked={drill.order === o}
                onChange={() => drill.setMode({ order: o })}
              /> {o}
            </label>
          ))}
        </div>

        {/* Log */}
        <ul style={{ marginTop: 10, fontSize: 11, color: colors.textMuted, listStyle: 'none', padding: 0 }}>
          {drill.log.slice(0, 3).map((e, i) => (
            <li key={i}>{e.kind}: {e.scenarioId ?? e.reason ?? ''}</li>
          ))}
        </ul>
      </div>
    );
  }

  const launchDisabled = !playlistId || !heroPlayerId || (drill.fitCount === 0 && !allowZeroMatch);

  return (
    <div style={{ padding: 12, background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 6 }}>
      <div style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: 8 }}>Scenario Launch</div>

      <label htmlFor="pl" style={lbl}>Playlist</label>
      <select id="pl" aria-label="Playlist" value={playlistId} onChange={(e) => setPlaylistId(e.target.value)} style={inp}>
        <option value="">— choose —</option>
        {playlists.map(p => <option key={p.playlist_id} value={p.playlist_id}>{p.name}</option>)}
      </select>

      <label htmlFor="hero" style={lbl}>Hero</label>
      <select id="hero" aria-label="Hero" value={heroPlayerId} onChange={(e) => setHeroPlayerId(e.target.value)} disabled={!playlistId} style={inp}>
        <option value="">— choose —</option>
        {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <fieldset style={{ border: 'none', padding: 0, margin: '8px 0' }}>
        <legend style={{ ...lbl, marginBottom: 4 }}>Hero mode</legend>
        {['sticky', 'per_hand', 'rotate'].map(m => (
          <label key={m} style={{ marginRight: 10, color: colors.textMuted, fontSize: 13 }}>
            <input type="radio" name="mode" aria-label={m} value={m} checked={heroMode === m} onChange={() => setHeroMode(m)} /> {m}
          </label>
        ))}
      </fieldset>

      <fieldset style={{ border: 'none', padding: 0, margin: '8px 0' }}>
        <legend style={{ ...lbl, marginBottom: 4 }}>Order</legend>
        {['sequential', 'random'].map(o => (
          <label key={o} style={{ marginRight: 10, color: colors.textMuted, fontSize: 13 }}>
            <input type="radio" name="order" value={o} checked={ordering === o} onChange={() => setOrdering(o)} /> {o}
          </label>
        ))}
      </fieldset>

      <label style={{ display: 'block', marginBottom: 8, color: colors.textMuted, fontSize: 13 }}>
        <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} /> Auto-advance
      </label>

      {drill.fitCount === 0 && (
        <div style={{ color: colors.warning, fontSize: 13, margin: '8px 0' }}>
          <CircleAlert size={14} style={{ verticalAlign: 'middle' }} /> No scenarios fit current seat count.
          <label style={{ display: 'block', marginTop: 4 }}>
            <input type="checkbox" checked={allowZeroMatch} onChange={(e) => setAllowZeroMatch(e.target.checked)} /> Launch anyway — wait for count
          </label>
        </div>
      )}

      <button
        onClick={() => drill.launch({ playlistId, heroPlayerId, heroMode, autoAdvance })}
        disabled={launchDisabled}
        style={{ ...btnGold, opacity: launchDisabled ? 0.4 : 1 }}
      >
        <Play size={14} /> Launch
      </button>
    </div>
  );
}

const lbl = { display: 'block', fontSize: 12, color: colors.textMuted, marginTop: 8 };
const inp = { width: '100%', padding: '4px 6px', background: colors.bgSurfaceRaised, color: colors.textPrimary, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, marginTop: 4 };
const btnGold  = { padding: '6px 10px', background: colors.gold, color: '#000', border: 'none', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
const btnGhost = { padding: '6px 10px', background: 'transparent', color: colors.textPrimary, border: `1px solid ${colors.borderDefault}`, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 };
const btnDanger = { padding: '6px 10px', background: 'transparent', color: colors.error, border: `1px solid ${colors.error}`, borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13 };
