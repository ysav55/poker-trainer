/* Tab 2 · Drills
   Per spec:
   • Hand Configuration — hero (fixed/range), villain (fixed/range),
     board texture, action script, stack depths, positions, "Save as Scenario"
   • Scenario / Playlist Loader — saved scenarios + playlists with "Load"
   • Drill Session — in-flight progress (done/total, current spot) */

const { useState: useStateDrills } = React;

function TabDrills({ data, setToast }) {
  const [mode, setMode] = useStateDrills('config'); // 'config' | 'loader' | 'session'

  const hasActive = data.drillSession.active;

  return (
    <>
      <window.Segmented
        cols={3}
        options={[
          { value: 'config',  label: 'Build' },
          { value: 'loader',  label: 'Library' },
          { value: 'session', label: hasActive ? '● Session' : 'Session' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === 'config'  && <DrillConfig data={data} />}
      {mode === 'loader'  && <DrillLoader data={data} />}
      {mode === 'session' && <DrillSessionCard data={data} />}
    </>
  );
}

/* ─── Config (Hand Configuration) ─────────────────────────── */
function DrillConfig({ data }) {
  const [heroMode, setHeroMode] = useStateDrills('fixed');
  const [villainMode, setVillainMode] = useStateDrills('range');
  const [heroHand, setHeroHand] = useStateDrills('AsQs');
  const [villainRange, setVillainRange] = useStateDrills('22+, ATs+, KQs, AJo+, KQo');
  const [flop, setFlop] = useStateDrills('Ks 9d 4c');
  const [turn, setTurn] = useStateDrills('');
  const [river, setRiver] = useStateDrills('');
  const [stack, setStack] = useStateDrills(100);
  const [heroPos, setHeroPos] = useStateDrills('BTN');
  const [villainPos, setVillainPos] = useStateDrills('BB');
  const [script, setScript] = useStateDrills('Hero open 2.5bb · Villain 3-bet 9bb · Hero call');

  const positions = ['UTG','MP','CO','BTN','SB','BB'];

  return (
    <>
      {/* Hero */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Hero</div>
          <window.Segmented
            options={[{value:'fixed',label:'Hand'},{value:'range',label:'Range'}]}
            value={heroMode}
            onChange={setHeroMode}
          />
        </div>
        <input
          className="field"
          value={heroHand}
          onChange={e => setHeroHand(e.target.value)}
          placeholder={heroMode === 'fixed' ? 'AsQs' : '22+, AJs+, KQs'}
          style={{ marginBottom: 8 }}
        />
        <div className="row" style={{ gap: 6 }}>
          <div style={{ flex: 1 }}>
            <span className="lbl">Position</span>
            <div className="row" style={{ gap: 3, flexWrap: 'wrap' }}>
              {positions.map(p => (
                <span key={p} className={'chip' + (heroPos === p ? ' active' : '')} onClick={() => setHeroPos(p)}>{p}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Villain */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Villain</div>
          <window.Segmented
            options={[{value:'fixed',label:'Hand'},{value:'range',label:'Range'}]}
            value={villainMode}
            onChange={setVillainMode}
          />
        </div>
        <textarea
          className="field"
          value={villainRange}
          onChange={e => setVillainRange(e.target.value)}
          rows={2}
          style={{ resize: 'none', marginBottom: 8, fontSize: 11, lineHeight: 1.5 }}
        />
        <div>
          <span className="lbl">Position</span>
          <div className="row" style={{ gap: 3, flexWrap: 'wrap' }}>
            {positions.map(p => (
              <span key={p} className={'chip' + (villainPos === p ? ' active' : '')} onClick={() => setVillainPos(p)}>{p}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Board texture */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Board</div>
          <div className="card-kicker">flop · turn · river</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 6 }}>
          <div>
            <span className="lbl">Flop</span>
            <input className="field" value={flop} onChange={e => setFlop(e.target.value)} />
          </div>
          <div>
            <span className="lbl">Turn</span>
            <input className="field" value={turn} onChange={e => setTurn(e.target.value)} placeholder="—" />
          </div>
          <div>
            <span className="lbl">River</span>
            <input className="field" value={river} onChange={e => setRiver(e.target.value)} placeholder="—" />
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

      {/* Stacks + script */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Stacks & Script</div>
          <div className="card-kicker">{stack}bb deep</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
          <div>
            <span className="lbl">Hero</span>
            <input className="field" value={`${stack}bb`} onChange={e => setStack(parseInt(e.target.value) || 100)} />
          </div>
          <div>
            <span className="lbl">Villain</span>
            <input className="field" value={`${stack}bb`} onChange={e => setStack(parseInt(e.target.value) || 100)} />
          </div>
        </div>
        <span className="lbl">Action script</span>
        <textarea className="field" value={script} onChange={e => setScript(e.target.value)} rows={2} style={{ resize: 'none', fontSize: 11, lineHeight: 1.5 }} />
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className="btn full">Preview</button>
        <button className="btn primary full">Save as Scenario</button>
      </div>
    </>
  );
}

/* ─── Loader (Scenarios + Playlists) ──────────────────────── */
function DrillLoader({ data }) {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Playlists</div>
          <div className="card-kicker">{data.playlists.length} saved</div>
        </div>
        {data.playlists.map(pl => (
          <div key={pl.id} className="list-row">
            <div>
              <div className="title">{pl.name}</div>
              <div className="meta">{pl.count} hands · {pl.scenarios.length} scenarios</div>
            </div>
            <button className="btn sm primary">Load</button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Scenarios</div>
          <div className="card-kicker">{data.scenarios.length} saved</div>
        </div>
        {data.scenarios.map(s => (
          <div key={s.id} className="list-row">
            <div>
              <div className="title">{s.name}</div>
              <div className="meta">{s.detail}</div>
              <div className="meta" style={{ opacity: 0.6, marginTop: 2 }}>{s.hands} hands · run {s.lastRun} ago</div>
            </div>
            <button className="btn sm">Load</button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─── Session (in-flight) ────────────────────────────────── */
function DrillSessionCard({ data }) {
  const s = data.drillSession;
  if (!s.active) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 32 }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.28em', textTransform: 'uppercase',
          color: 'var(--ink-faint)', fontWeight: 700, marginBottom: 10,
        }}>No active session</div>
        <div style={{ color: 'var(--ink-dim)', fontSize: 12, marginBottom: 14 }}>
          Launch a scenario or playlist to start drilling.
        </div>
        <button className="btn primary">Open Library</button>
      </div>
    );
  }

  const pct = Math.round((s.handsDone / s.handsTotal) * 100);
  const { correct, mistake, uncertain } = s.results;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Active Drill</div>
          <div className="card-kicker">{s.handsDone}/{s.handsTotal}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
          {s.scenarioName}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 12 }}>
          {s.currentSpot}
        </div>

        {/* Progress bar with result segments */}
        <div style={{
          height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex',
          background: 'rgba(201,163,93,0.08)', marginBottom: 10,
        }}>
          <div style={{ width: `${(correct/s.handsTotal)*100}%`, background: 'var(--ok)' }}/>
          <div style={{ width: `${(mistake/s.handsTotal)*100}%`, background: 'var(--bad)' }}/>
          <div style={{ width: `${(uncertain/s.handsTotal)*100}%`, background: 'var(--warn)' }}/>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div className="stat">
            <div className="stat-lbl">Correct</div>
            <div className="stat-val ok">{correct}</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Mistake</div>
            <div className="stat-val bad">{mistake}</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Unsure</div>
            <div className="stat-val" style={{ color: 'var(--warn)' }}>{uncertain}</div>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 6 }}>
        <button className="btn full">End Drill</button>
        <button className="btn primary full">Next Spot →</button>
      </div>
    </>
  );
}

window.TabDrills = TabDrills;
