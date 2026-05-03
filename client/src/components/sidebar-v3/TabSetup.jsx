import React, { useState, useEffect } from 'react';
import { Segmented, DifficultyPicker } from './shared.jsx';

export default function TabSetup({ data, emit }) {
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

      {section === 'blinds'  && <BlindsSection  data={data} emit={emit} />}
      {section === 'seats'   && <SeatsSection   data={data} emit={emit} />}
      {section === 'players' && <PlayersSection data={data} emit={emit} />}
    </>
  );
}

// ── Blinds ─────────────────────────────────────────────────────────────────
function BlindsSection({ data, emit }) {
  const liveBb = data.blindLevels.current.bb;
  const [bb, setBb] = useState(liveBb);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    setBb(liveBb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveBb]);

  const sb = Math.max(1, Math.floor(bb / 2));
  const dirty = bb !== liveBb;
  const valid = Number.isInteger(bb) && bb > 1;

  function applyBlinds() {
    if (!emit?.setBlindLevels || !valid || !dirty) return;
    emit.setBlindLevels(sb, bb);
    setApplied(true);
    setTimeout(() => setApplied(false), 1500);
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Current Level</div>
          <div className="card-kicker">SB / BB (auto)</div>
        </div>
        <div>
          <span className="lbl">Big Blind</span>
          <input
            className="field"
            type="number"
            value={bb}
            onChange={(e) => setBb(parseInt(e.target.value, 10) || 0)}
            min={2}
          />
          <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginTop: 4 }}>
            SB auto-set to {sb}
          </div>
        </div>
        {dirty && !valid && (
          <div style={{ fontSize: 10, color: 'var(--bad)', marginTop: 6 }}>
            BB must be a positive integer greater than 1.
          </div>
        )}
        <button
          className="btn primary full"
          style={{ marginTop: 10 }}
          onClick={applyBlinds}
          disabled={!emit?.setBlindLevels || !dirty || !valid}
        >
          {applied ? '✓ Applied' : dirty ? `Apply ${sb}/${bb}` : 'Already current'}
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Cash Presets</div>
          <div className="card-kicker">click to load</div>
        </div>
        {data.blindLevels.presets.map((p, i) => {
          const active = p.sb === sb && p.bb === bb;
          return (
            <div
              key={i}
              className="list-row"
              onClick={() => { setSb(p.sb); setBb(p.bb); }}
              style={active ? { borderColor: 'var(--accent)', background: 'rgba(201,163,93,0.1)' } : null}
            >
              <div>
                <div className="title">Level {i + 1}</div>
                <div className="meta">{p.sb} / {p.bb}</div>
              </div>
              {active ? <span className="chip active">selected</span> : <span className="chip ghost">use</span>}
            </div>
          );
        })}
      </div>

      {/* Blinds-up timer is tournament-only on the server (TournamentController);
          coached_cash tables don't auto-advance. Hidden in v3 cash sidebar. */}
    </>
  );
}

// ── Seats ──────────────────────────────────────────────────────────────────
function SeatsSection({ data, emit }) {
  const seats = data.seatConfig.seats;
  const occupiedDefault = seats.findIndex((s) => s.player);
  const [selected, setSelected] = useState(occupiedDefault === -1 ? 0 : occupiedDefault);
  const seat = seats[selected];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Seat Map</div>
          <div className="card-kicker">{seats.filter((s) => s.player).length}/{data.seatConfig.maxSeats} seated</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {seats.map((s, i) => {
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
                {s.isHero && <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.22em', color: 'var(--accent-hot)', textTransform: 'uppercase' }}>YOU</span>}
                {s.isBot && <span style={{ fontSize: 7, fontWeight: 800, letterSpacing: '0.22em', color: 'var(--purple)', textTransform: 'uppercase' }}>BOT</span>}
              </button>
            );
          })}
        </div>
      </div>

      <SeatDetailCard seat={seat} seatIndex={selected} emit={emit} />
    </>
  );
}

function SeatDetailCard({ seat, seatIndex, emit }) {
  const [editingStack, setEditingStack] = useState(false);
  const [difficulty, setDifficulty] = useState('easy');

  if (!seat?.player) {
    return (
      <div className="card">
        <div className="card-head">
          <div className="card-title">Seat {seatIndex + 1}</div>
          <div className="card-kicker">empty</div>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--ink-dim)',
          padding: '8px 10px',
          background: 'rgba(106,168,255,0.06)',
          border: '1px solid rgba(106,168,255,0.2)',
          borderRadius: 6, marginBottom: 9, lineHeight: 1.4,
        }}>
          Adding a bot here drops them into the next open seat (server-assigned).
          Seat-specific placement lands later.
        </div>
        <div className="lbl" style={{ marginBottom: 5 }}>Bot difficulty</div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <button
          className="btn primary full"
          style={{ marginTop: 10 }}
          onClick={() => emit?.coachAddBot?.(difficulty)}
          disabled={!emit?.coachAddBot}
        >+ Add {difficulty} bot to next open seat</button>
      </div>
    );
  }

  const sitting = seat.status === 'sitout';
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Seat {seatIndex + 1}</div>
        <div className="card-kicker">{seat.isBot ? 'bot' : 'player'}</div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
        {seat.player}{seat.isHero && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 10 }}>· you</span>}
      </div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)', marginBottom: 10 }}>
        Stack {seat.stack} · {sitting ? 'sitting out' : 'active'}
      </div>

      {editingStack ? (
        <AdjustStackEditor
          currentStack={seat.stack}
          onCancel={() => setEditingStack(false)}
          onApply={(newStack) => {
            emit?.adjustStack?.(seat.playerId, newStack);
            setEditingStack(false);
          }}
        />
      ) : (
        <div className="row" style={{ gap: 5, marginBottom: 5 }}>
          <button
            className="btn full sm"
            onClick={() => setEditingStack(true)}
            disabled={!emit?.adjustStack || !seat.playerId}
          >Edit Stack</button>
          <button
            className="btn full sm"
            onClick={() => emit?.setPlayerInHand?.(seat.playerId, sitting)}
            disabled={!emit?.setPlayerInHand || !seat.playerId}
          >{sitting ? 'Sit In' : 'Sit Out'}</button>
        </div>
      )}

      {!editingStack && !seat.isHero && (
        <button
          className="btn danger full sm"
          onClick={() => {
            if (typeof window !== 'undefined' &&
                !window.confirm(`Kick ${seat.player}? Stack returns to chip bank.`)) return;
            emit?.coachKickPlayer?.(seat.playerId);
          }}
          disabled={!emit?.coachKickPlayer || !seat.playerId}
        >Kick Player</button>
      )}
    </div>
  );
}

// ── Players ────────────────────────────────────────────────────────────────
function PlayersSection({ data, emit }) {
  const [editingId, setEditingId] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');

  return (
    <>
      <div className="card">
        <div className="card-head">
          <div className="card-title">Seated Players</div>
          <div className="card-kicker">{data.players.length} at table</div>
        </div>
        {data.players.map((p) => {
          const playerId = p.playerId;
          const sitting = p.status === 'sitout';
          const isEditing = editingId === playerId;
          return (
            <div
              key={p.seat}
              style={{
                padding: '9px 2px',
                borderBottom: '1px solid rgba(201,163,93,0.06)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
                    {p.name}
                    {p.isHero && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}>you</span>}
                    {p.isBot && <span style={{ color: 'var(--purple)', marginLeft: 6, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase' }}>bot</span>}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)', marginTop: 2 }}>
                    Seat {p.seat + 1} · Stack {p.stack} · {sitting ? 'sitting out' : 'active'}
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <button
                    className="btn sm ghost"
                    title="Edit stack"
                    onClick={() => setEditingId(isEditing ? null : playerId)}
                    disabled={!emit?.adjustStack || !playerId}
                  >$</button>
                  <button
                    className="btn sm ghost"
                    title={sitting ? 'Sit in' : 'Sit out'}
                    onClick={() => emit?.setPlayerInHand?.(playerId, sitting)}
                    disabled={!emit?.setPlayerInHand || !playerId}
                  >{sitting ? '▶' : '⏸'}</button>
                  {!p.isHero && (
                    <button
                      className="btn sm"
                      style={{ color: 'var(--bad)', borderColor: 'rgba(224,104,104,0.3)' }}
                      onClick={() => {
                        if (typeof window !== 'undefined' &&
                            !window.confirm(`Kick ${p.name}? Stack returns to chip bank.`)) return;
                        emit?.coachKickPlayer?.(playerId);
                      }}
                      disabled={!emit?.coachKickPlayer || !playerId}
                    >×</button>
                  )}
                </div>
              </div>
              {isEditing && (
                <AdjustStackEditor
                  currentStack={p.stack}
                  onCancel={() => setEditingId(null)}
                  onApply={(newStack) => {
                    emit?.adjustStack?.(playerId, newStack);
                    setEditingId(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">Add Bot</div>
          <div className="card-kicker">{difficulty}</div>
        </div>
        <div className="lbl" style={{ marginBottom: 5 }}>Difficulty</div>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <button
          className="btn primary full"
          style={{ marginTop: 10 }}
          onClick={() => emit?.coachAddBot?.(difficulty)}
          disabled={!emit?.coachAddBot}
        >+ Add {difficulty} bot</button>
      </div>
    </>
  );
}

// ── Adjust stack inline editor ─────────────────────────────────────────────
function AdjustStackEditor({ currentStack, onApply, onCancel }) {
  const [value, setValue] = useState(String(currentStack ?? 0));
  const parsed = parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= 0;
  const changed = valid && parsed !== currentStack;
  return (
    <div style={{
      background: 'var(--bg-3)', border: '1px solid var(--line)', borderRadius: 6,
      padding: '8px 9px', marginBottom: 5,
    }}>
      <div className="lbl" style={{ marginBottom: 4 }}>New stack</div>
      <input
        className="field"
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        style={{ marginBottom: 6 }}
      />
      <div className="row" style={{ gap: 5 }}>
        <button
          className="btn primary full sm"
          onClick={() => onApply(parsed)}
          disabled={!changed}
        >Apply</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
      </div>
      {valid && parsed < currentStack && (
        <div style={{ fontSize: 9, color: 'var(--warn)', marginTop: 5, lineHeight: 1.4 }}>
          Reducing stack mid-hand is rejected if it goes below already-committed chips.
        </div>
      )}
    </div>
  );
}
