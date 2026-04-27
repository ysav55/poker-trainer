import React, { useState } from 'react';
import { Segmented } from './shared.jsx';

export default function TabSettings({ data }) {
  const [section, setSection] = useState('blinds');

  return (
    <>
      <Segmented
        cols={3}
        options={[
          { value: 'blinds',  label: 'Blinds' },
          { value: 'seats',   label: 'Seats' },
          { value: 'players', label: 'Players' },
        ]}
        value={section}
        onChange={setSection}
      />

      {section === 'blinds'  && <BlindsSection  data={data} />}
      {section === 'seats'   && <SeatsSection   data={data} />}
      {section === 'players' && <PlayersSection data={data} />}
    </>
  );
}

function BlindsSection({ data }) {
  const [sb, setSb] = useState(data.blindLevels.current.sb);
  const [bb, setBb] = useState(data.blindLevels.current.bb);
  const [ante, setAnte] = useState(data.blindLevels.current.ante);
  const [timerOn, setTimerOn] = useState(data.blindLevels.timer.enabled);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Current Level</div>
          <div className="card-kicker">SB / BB / ante</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div><span className="lbl">SB</span><input className="field" type="number" value={sb} onChange={(e) => setSb(+e.target.value)} /></div>
          <div><span className="lbl">BB</span><input className="field" type="number" value={bb} onChange={(e) => setBb(+e.target.value)} /></div>
          <div><span className="lbl">Ante</span><input className="field" type="number" value={ante} onChange={(e) => setAnte(+e.target.value)} /></div>
        </div>
        <button className="btn primary full" style={{ marginTop: 10 }}>Apply Next Hand</button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Presets</div>
          <div className="card-kicker">cash / tournament</div>
        </div>
        {data.blindLevels.presets.map((p, i) => {
          const active = p.sb === sb && p.bb === bb && p.ante === ante;
          return (
            <div
              key={i}
              className="list-row"
              onClick={() => { setSb(p.sb); setBb(p.bb); setAnte(p.ante); }}
              style={active ? { borderColor: 'var(--accent)', background: 'rgba(201,163,93,0.1)' } : null}
            >
              <div>
                <div className="title">Level {i + 1}</div>
                <div className="meta">{p.sb} / {p.bb}{p.ante ? ` · ante ${p.ante}` : ''}</div>
              </div>
              {active ? <span className="chip active">current</span> : <span className="chip ghost">use</span>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Blinds-Up Timer</div>
          <div className="card-kicker" style={{ color: timerOn ? 'var(--accent)' : 'var(--ink-faint)' }}>{timerOn ? 'ON' : 'OFF'}</div>
        </div>
        <div className="row between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--ink)' }}>Advance every</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)' }}>{data.blindLevels.timer.levelMinutes} min</div>
        </div>
        <div className="row between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Next level in</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 14, color: timerOn ? 'var(--warn)' : 'var(--ink-faint)', fontWeight: 700 }}>
            {String(data.blindLevels.timer.minutesRemaining).padStart(2, '0')}:00
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className={'btn full' + (timerOn ? ' primary' : '')} onClick={() => setTimerOn((t) => !t)}>{timerOn ? 'Pause Timer' : 'Start Timer'}</button>
          <button className="btn full">Skip Level ›</button>
        </div>
      </div>
    </>
  );
}

function SeatsSection({ data }) {
  const [selected, setSelected] = useState(0);
  const seat = data.seatConfig.seats[selected];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Seat Map</div>
          <div className="card-kicker">{data.seatConfig.seats.filter((s) => s.player).length}/9 seated</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {data.seatConfig.seats.map((s, i) => {
            const active = i === selected;
            const occupied = !!s.player;
            return (
              <button
                key={i}
                onClick={() => setSelected(i)}
                style={{
                  padding: '10px 6px', borderRadius: 8,
                  background: active ? 'rgba(201,163,93,0.14)' : occupied ? 'var(--bg-3)' : 'transparent',
                  border: `1px solid ${active ? 'var(--accent)' : occupied ? 'var(--line-strong)' : 'rgba(201,163,93,0.12)'}`,
                  borderStyle: occupied ? 'solid' : 'dashed',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center',
                  transition: 'all 150ms',
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.18em', color: occupied ? 'var(--accent)' : 'var(--ink-faint)' }}>S{i + 1}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: occupied ? 'var(--ink)' : 'var(--ink-faint)', lineHeight: 1.2, textAlign: 'center' }}>
                  {s.player ? s.player.split(' ')[0] : 'empty'}
                </span>
                {occupied && <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-dim)' }}>{s.stack}</span>}
                {s.isHero && <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.22em', color: 'var(--accent-hot)', textTransform: 'uppercase' }}>HERO</span>}
                {s.isBot && <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.22em', color: 'var(--purple)', textTransform: 'uppercase' }}>BOT</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Seat {selected + 1}</div>
          <div className="card-kicker">{seat.player ? (seat.isBot ? 'bot' : 'player') : 'empty'}</div>
        </div>
        {seat.player ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
              {seat.player}{seat.isHero && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 10 }}>· hero</span>}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', marginBottom: 10 }}>
              Stack {seat.stack} · {seat.status}
            </div>
            <div className="row" style={{ gap: 5, marginBottom: 5 }}>
              <button className="btn full sm">Edit Stack</button>
              <button className="btn full sm">Force Sit-Out</button>
            </div>
            <button className="btn danger full sm">Kick Player</button>
          </>
        ) : (
          <div className="row" style={{ gap: 5 }}>
            <button className="btn full">Invite Player</button>
            <button className="btn primary full">Add Bot</button>
          </div>
        )}
      </div>
    </>
  );
}

function PlayersSection({ data }) {
  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Seated Players</div>
          <div className="card-kicker">{data.players.length} at table</div>
        </div>
        {data.players.map((p) => (
          <div key={p.seat} style={{ padding: '9px 2px', borderBottom: '1px solid rgba(201,163,93,0.06)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                {p.name}
                {p.isHero && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}>hero</span>}
                {p.isBot && <span style={{ color: 'var(--purple)', marginLeft: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}>bot</span>}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)', marginTop: 2 }}>
                Seat {p.seat + 1} · Stack {p.stack} · {p.status === 'sitout' ? 'sitting out' : `${p.hands} hands`}
              </div>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button className="btn sm ghost" title="Edit stack">$</button>
              <button className="btn sm ghost" title="Sit out">⏸</button>
              {!p.isHero && <button className="btn sm" style={{ color: 'var(--bad)', borderColor: 'rgba(224,104,104,0.3)' }}>×</button>}
            </div>
          </div>
        ))}
      </div>

      <button className="btn primary full">+ Add Bot</button>
    </>
  );
}
