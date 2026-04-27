import React, { useState } from 'react';
import { Segmented } from './shared.jsx';

const POSITIONS_BY_COUNT = {
  2: ['BTN','BB'],
  3: ['BTN','SB','BB'],
  4: ['CO','BTN','SB','BB'],
  5: ['MP','CO','BTN','SB','BB'],
  6: ['UTG','MP','CO','BTN','SB','BB'],
  7: ['UTG','UTG+1','MP','CO','BTN','SB','BB'],
  8: ['UTG','UTG+1','MP','HJ','CO','BTN','SB','BB'],
  9: ['UTG','UTG+1','UTG+2','MP','HJ','CO','BTN','SB','BB'],
};

export default function TabDrills({ data, emit }) {
  const [mode, setMode] = useState(() => (data.drillSession.active ? 'session' : 'loader'));
  const hasActive = data.drillSession.active;

  // Build sub-tab is intentionally hidden until Phase 4 ships the
  // multi-hand drill builder. Showing the form with a disabled Save button is a
  // UX trap (coach fills it out, then discovers it doesn't work). Keep the
  // DrillBuild component in the file for the next phase to flip back on.
  return (
    <>
      <Segmented
        cols={2}
        options={[
          { value: 'loader',  label: 'Library' },
          { value: 'session', label: hasActive ? '● Session' : 'Session' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'loader'  && <DrillLoader data={data} emit={emit} />}
      {mode === 'session' && <DrillSessionCard data={data} emit={emit} />}
    </>
  );
}

function DrillBuild({ data }) {
  const [numPlayers, setNumPlayers] = useState(4);
  const [heroSeat, setHeroSeat]     = useState(0);
  const [stack, setStack]           = useState(100);
  const [flop, setFlop]             = useState('Ks 9d 4c');
  const [turn, setTurn]             = useState('');
  const [river, setRiver]           = useState('');
  const [script, setScript]         = useState('Hero open 2.5bb · BB 3-bet 9bb · Hero call');
  const [saveName, setSaveName]     = useState('');
  const [savedToPlaylist, setSaved] = useState(null);

  const positions = POSITIONS_BY_COUNT[numPlayers];

  const [playerConfigs, setPlayerConfigs] = useState(() =>
    Array.from({ length: 9 }, (_, i) => ({
      mode: i === 0 ? 'fixed' : 'range',
      hand: i === 0 ? 'AsQs' : '',
      range: i === 0 ? '' : (i === 1 ? '22+, ATs+, KQs, AJo+, KQo' : 'top 25%'),
    }))
  );

  function setPlayer(idx, patch) {
    setPlayerConfigs((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Table Shape</div>
          <div className="card-kicker">{numPlayers} players</div>
        </div>

        <div style={{ marginBottom: 9 }}>
          <span className="lbl">Players</span>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {[2,3,4,5,6,7,8,9].map((n) => (
              <button
                key={n}
                onClick={() => {
                  setNumPlayers(n);
                  if (heroSeat >= n) setHeroSeat(0);
                }}
                className={'chip' + (numPlayers === n ? ' active' : '')}
                style={{ minWidth: 26, justifyContent: 'center', padding: '4px 0' }}
              >{n}</button>
            ))}
          </div>
        </div>

        <div>
          <span className="lbl">Hero position</span>
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {positions.map((pos, i) => (
              <button
                key={pos}
                onClick={() => setHeroSeat(i)}
                className={'chip' + (heroSeat === i ? ' active' : '')}
                style={{ minWidth: 36, justifyContent: 'center' }}
              >{pos}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Players</div>
          <div className="card-kicker">hand · range · fold</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {positions.map((pos, idx) => {
            const isHero = idx === heroSeat;
            const cfg = playerConfigs[idx];
            return (
              <PlayerRow
                key={idx}
                pos={pos}
                isHero={isHero}
                cfg={cfg}
                onChange={(patch) => setPlayer(idx, patch)}
              />
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Board</div>
          <div className="card-kicker">flop · turn · river</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 6 }}>
          <div>
            <span className="lbl">Flop</span>
            <input className="field" value={flop} onChange={(e) => setFlop(e.target.value)} />
          </div>
          <div>
            <span className="lbl">Turn</span>
            <input className="field" value={turn} onChange={(e) => setTurn(e.target.value)} placeholder="—" />
          </div>
          <div>
            <span className="lbl">River</span>
            <input className="field" value={river} onChange={(e) => setRiver(e.target.value)} placeholder="—" />
          </div>
        </div>
        <div className="row" style={{ gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="chip ghost">Random flop</span>
          <span className="chip ghost">Dry</span>
          <span className="chip ghost">Wet</span>
          <span className="chip ghost">Paired</span>
          <span className="chip ghost">Monotone</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Stacks & Script</div>
          <div className="card-kicker">{stack}bb deep</div>
        </div>
        <div style={{ marginBottom: 9 }}>
          <span className="lbl">Effective stack</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="range"
              min="20" max="300" step="10"
              value={stack}
              onChange={(e) => setStack(parseInt(e.target.value, 10))}
              style={{ flex: 1, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 50, textAlign: 'right' }}>{stack}bb</span>
          </div>
        </div>
        <span className="lbl">Action script</span>
        <textarea
          className="field"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={2}
          style={{ resize: 'none', fontSize: 11, lineHeight: 1.5 }}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Save to Playlist</div>
          <div className="card-kicker">{savedToPlaylist ? `→ ${savedToPlaylist}` : 'pick or name'}</div>
        </div>

        <div className="row" style={{ gap: 6, marginBottom: 7 }}>
          <input
            className="field"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={`${positions[heroSeat]} vs field · ${stack}bb`}
            style={{ flex: 1 }}
          />
        </div>

        <div className="lbl">Add to existing</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 7 }}>
          {data.playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setSaved(pl.name)}
              className={'chip' + (savedToPlaylist === pl.name ? ' active' : '')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
            >
              {pl.name}
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-faint)' }}>{pl.count}</span>
            </button>
          ))}
          <button
            onClick={() => setSaved('+ New playlist')}
            className={'chip ghost' + (savedToPlaylist === '+ New playlist' ? ' active' : '')}
          >+ New</button>
        </div>

        <button
          className="btn full"
          disabled
          title="Multi-hand drill builder wires up in Phase 4 (branch_to_drill server event)"
          style={{ opacity: 0.4 }}
        >
          Save Scenario
        </button>
      </div>
    </>
  );
}

function PlayerRow({ pos, isHero, cfg, onChange }) {
  const isFolded = cfg.mode === 'fold';
  const accent = isHero ? 'var(--accent-hot)' : 'var(--ink-dim)';

  return (
    <div
      style={{
        background: isHero ? 'rgba(240,208,96,0.05)' : 'var(--bg-3)',
        border: `1px solid ${isHero ? 'rgba(240,208,96,0.22)' : 'var(--line)'}`,
        borderRadius: 7,
        padding: '7px 8px',
        opacity: isFolded ? 0.5 : 1,
      }}
    >
      <div className="row between" style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700, color: accent, letterSpacing: '0.08em', minWidth: 32, textAlign: 'left' }}>{pos}</span>
          {isHero && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--accent-hot)', textTransform: 'uppercase' }}>HERO</span>}
        </div>

        <div style={{ display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5, padding: 1 }}>
          {[
            { v: 'fixed', l: 'Hand' },
            { v: 'range', l: 'Range' },
            { v: 'fold',  l: 'Fold' },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => onChange({ mode: opt.v })}
              style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '3px 7px',
                background: cfg.mode === opt.v ? 'rgba(201,163,93,0.18)' : 'transparent',
                color: cfg.mode === opt.v ? 'var(--accent-hot)' : 'var(--ink-faint)',
                border: 'none', borderRadius: 3, cursor: 'pointer',
              }}
            >{opt.l}</button>
          ))}
        </div>
      </div>

      {!isFolded && (
        cfg.mode === 'fixed' ? (
          <input
            className="field"
            value={cfg.hand}
            onChange={(e) => onChange({ hand: e.target.value })}
            placeholder="AsQs"
            style={{ fontSize: 11, padding: '5px 8px' }}
          />
        ) : (
          <input
            className="field"
            value={cfg.range}
            onChange={(e) => onChange({ range: e.target.value })}
            placeholder="22+, ATs+, KQs"
            style={{ fontSize: 11, padding: '5px 8px' }}
          />
        )
      )}
    </div>
  );
}

function DrillLoader({ data, emit }) {
  const playlists = data.playlists ?? [];
  const activeId = data.drillSession?.active ? data.drillSession.playlistId : null;
  const onLoad = (id) => emit?.activatePlaylist?.(id);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Playlists</div>
          <div className="card-kicker">{playlists.length} saved</div>
        </div>
        {playlists.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center', padding: '14px 8px', lineHeight: 1.5 }}>
            No playlists yet. Save hands from the History tab into one to start drilling.
          </div>
        ) : (
          playlists.map((pl) => {
            const isActive = pl.id === activeId;
            return (
              <div
                key={pl.id}
                className="list-row"
                style={isActive ? { borderColor: 'var(--accent)', background: 'rgba(201,163,93,0.1)' } : null}
              >
                <div>
                  <div className="title">{pl.name}</div>
                  <div className="meta">{pl.count} hand{pl.count === 1 ? '' : 's'}{pl.description ? ` · ${pl.description}` : ''}</div>
                </div>
                <button
                  className={'btn sm' + (isActive ? '' : ' primary')}
                  onClick={() => !isActive && onLoad(pl.id)}
                  disabled={isActive || !emit?.activatePlaylist || pl.count === 0}
                  title={pl.count === 0 ? 'Empty playlist — add hands first' : isActive ? 'Active' : 'Load this playlist on the table'}
                >
                  {isActive ? '● Running' : 'Load'}
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Saved scenarios are not yet a server-side entity — playlists hold hands
          directly. Hide the section in live mode (was a Phase 0 mock affordance). */}
    </>
  );
}

function DrillSessionCard({ data, emit }) {
  const s = data.drillSession;
  if (!s.active) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10 }}>
          No active session
        </div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14 }}>
          Launch a playlist from the Library tab to start drilling.
        </div>
      </div>
    );
  }
  const total = Math.max(1, s.handsTotal);
  const { correct, mistake, uncertain } = s.results;
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Active Drill</div>
          <div className="card-kicker">{s.handsDone}/{s.handsTotal}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{s.scenarioName}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 12 }}>{s.currentSpot}</div>
        <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: 'rgba(201,163,93,0.08)', marginBottom: 10 }}>
          <div style={{ width: `${(correct / total) * 100}%`, background: 'var(--ok)' }} />
          <div style={{ width: `${(mistake / total) * 100}%`, background: 'var(--bad)' }} />
          <div style={{ width: `${(uncertain / total) * 100}%`, background: 'var(--warn)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div className="stat"><div className="stat-lbl">Correct</div><div className="stat-val ok">{correct}</div></div>
          <div className="stat"><div className="stat-lbl">Mistake</div><div className="stat-val bad">{mistake}</div></div>
          <div className="stat"><div className="stat-lbl">Unsure</div><div className="stat-val" style={{ color: 'var(--warn)' }}>{uncertain}</div></div>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <button
          className="btn full"
          onClick={() => emit?.deactivatePlaylist?.()}
          disabled={!emit?.deactivatePlaylist}
        >End Drill</button>
        <button
          className="btn primary full"
          disabled
          title="Auto-advance is server-driven — Phase 4 wires manual 'Next Spot' override"
        >Next Spot →</button>
      </div>
    </>
  );
}
