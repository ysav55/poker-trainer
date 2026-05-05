import React, { useState, useEffect } from 'react';
import { MiniCard } from './shared.jsx';
import ConfigureHand from './LiveConfigureHand.jsx';
import NotesPanel from './NotesPanel.jsx';
import EquityToggleRow from './EquityToggleRow.jsx';
import useNotes from '../../hooks/useNotes.js';

export default function TabLive({ data, emit, notesOpen = false }) {
  const { gameState, actionTimer, equityData, myStableId } = data;

  const handId = data.gameState?.hand_id ?? null;
  const notesApi = useNotes(handId);

  const [remaining, setRemaining] = useState(actionTimer.remaining);
  useEffect(() => {
    setRemaining(actionTimer.remaining);
  }, [actionTimer.remaining, actionTimer.playerId]);
  useEffect(() => {
    if (!actionTimer.playerId || gameState.current_turn !== actionTimer.playerId) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        const next = Math.max(0, r - 100);
        if (next === 0) clearInterval(id);
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [gameState.current_turn, actionTimer.playerId]);

  const timerPct = Math.max(0, Math.min(1, remaining / actionTimer.duration));
  const timerColor = timerPct > 0.5 ? 'var(--ok)' : timerPct > 0.25 ? 'var(--warn)' : 'var(--bad)';
  const onTurn = gameState.players.find((p) => p.id === gameState.current_turn);
  const isMyTurn = onTurn && onTurn.stableId === myStableId;
  const phaseLabel = ({ preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' })[gameState.phase] || gameState.phase;

  const equityRows = equityData.equities
    .map((e) => {
      const p = gameState.players.find((pp) => pp.stableId === e.playerId);
      if (!p) return null;
      return {
        key: e.playerId,
        name: p.name,
        pct: e.equity,
        color: equityData.colors[e.playerId] || '#c9a35d',
        isMe: e.playerId === myStableId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pct - a.pct);

  return (
    <>
      <div className="card" style={{ padding: '11px 12px 10px' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--accent)', lineHeight: 1 }}>{phaseLabel}</span>
            {gameState.hand_number != null && (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>#{gameState.hand_number}</span>
            )}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)' }}>
            Pot <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{gameState.pot}</span>
          </div>
        </div>
        <div className="row between" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--ink-faint)', letterSpacing: '0.1em', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>On clock · </span>
            <span style={{ color: isMyTurn ? 'var(--accent-hot)' : 'var(--ink)', fontWeight: isMyTurn ? 700 : 500 }}>{onTurn ? onTurn.name : '—'}</span>
            {isMyTurn && <span style={{ color: 'var(--accent-hot)', marginLeft: 4 }}>· you</span>}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: timerColor, fontVariantNumeric: 'tabular-nums' }}>{(remaining / 1000).toFixed(1)}s</div>
        </div>
        <div style={{ height: 3, background: 'rgba(201,163,93,0.1)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${timerPct * 100}%`, background: timerColor, transition: 'width 100ms linear, background-color 300ms', boxShadow: `0 0 6px ${timerColor}` }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginRight: 8 }}>Board</span>
          {gameState.board.map((c, i) => <MiniCard key={i} code={c} />)}
          {Array.from({ length: 5 - gameState.board.length }).map((_, i) => <MiniCard key={'g' + i} ghost />)}
        </div>
      </div>

      <TableStrip data={data} emit={emit} />
      <ConfigureHand data={data} emit={emit} />

      <div className="card">
        <div className="card-head">
          <div className="card-title">Live Equity</div>
        </div>
        <EquityToggleRow
          visibility={data.equity_visibility}
          emit={emit}
          onShareRange={() => { /* D.3 will wire this */ }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {equityRows.map((r) => (
            <div key={r.key}>
              <div className="eq-row">
                <span className={'eq-name' + (r.isMe ? ' me' : '')}>
                  {r.name}{r.isMe && <span style={{ opacity: 0.6, fontSize: 10 }}> · you</span>}
                </span>
                <span className="eq-pct" style={{ color: r.color }}>{r.pct}%</span>
              </div>
              <div className="eq-bar">
                <div className="eq-bar-fill" style={{ width: `${r.pct}%`, background: r.color, boxShadow: r.isMe ? `0 0 8px ${r.color}66` : 'none' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ flex: 1, minHeight: 180 }}>
        <div className="card-head">
          <div className="card-title">Action Log</div>
          <div className="card-kicker">{(data.actions_log?.length || 0) + ' rows'}</div>
        </div>
        {(!data.actions_log || data.actions_log.length === 0) ? (
          <div style={{
            fontSize: 11, color: 'var(--ink-faint)', textAlign: 'center',
            padding: '18px 8px', lineHeight: 1.5,
          }}>
            No actions yet — the log fills as the hand plays.
          </div>
        ) : (
          <div>
            {data.actions_log.map((row, i) => (
              <div key={i} className="feed-row">
                <span className="feed-phase">
                  {({ preflop: 'PRE', flop: 'FLOP', turn: 'TURN', river: 'RIV', showdown: 'SD' })[row.street] || (row.street || '').slice(0, 3).toUpperCase()}
                </span>
                <span className="feed-text">
                  <b>{row.who}</b> {row.act}
                  {row.pending && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 10, letterSpacing: '0.1em' }}>· pending</span>}
                </span>
                <span className="feed-amt">{row.amt != null ? row.amt : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {notesOpen && (
        <NotesPanel mode="inline-live" handId={handId} api={notesApi} />
      )}
    </>
  );
}

function TableStrip({ data, emit }) {
  const seats = data.seatConfig.seats;
  const filled = seats.filter((s) => s.player);
  const onToggleSitout = (s) => {
    if (!emit?.setPlayerInHand || !s.playerId) return;
    emit.setPlayerInHand(s.playerId, s.status === 'sitout');
  };
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Table</div>
        <div className="card-kicker">
          {filled.length}/{data.seatConfig.maxSeats} seats
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filled.map((s) => {
          const isHero = s.isHero;
          const isBot = s.isBot;
          const sitting = s.status === 'sitout';
          return (
            <div
              key={s.seat}
              style={{
                display: 'grid', gridTemplateColumns: '20px 1fr auto auto',
                gap: 8, alignItems: 'center', padding: '6px 8px',
                background: isHero ? 'rgba(240,208,96,0.06)' : 'transparent',
                border: `1px solid ${isHero ? 'rgba(240,208,96,0.18)' : 'transparent'}`,
                borderRadius: 6,
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center' }}>{s.seat + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: sitting ? 'var(--ink-faint)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.player}</span>
                {isHero && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--accent-hot)', textTransform: 'uppercase' }}>HERO</span>}
                {isBot && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--purple)', textTransform: 'uppercase' }}>BOT</span>}
                {sitting && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--warn)', textTransform: 'uppercase' }}>SIT</span>}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)' }}>{s.stack.toLocaleString()}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                <SeatBtn title={sitting ? 'Sit in' : 'Sit out'} onClick={() => onToggleSitout(s)}>
                  {sitting ? '▶' : '❚❚'}
                </SeatBtn>
              </div>
            </div>
          );
        })}
        {filled.length < data.seatConfig.maxSeats && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--ink-faint)', borderTop: '1px dashed var(--line)', marginTop: 2, paddingTop: 7 }}>
            <span>{data.seatConfig.maxSeats - filled.length} empty</span>
            <span style={{ display: 'flex', gap: 4 }}>
              {seats.filter((s) => !s.player).map((s) => (
                <span key={s.seat} style={{ width: 14, height: 14, border: '1px dashed var(--line-strong)', borderRadius: 3, fontSize: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.seat + 1}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SeatBtn({ children, title, danger, disabled, onClick }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 22, height: 22,
        background: danger ? 'rgba(224,104,104,0.06)' : 'rgba(201,163,93,0.06)',
        border: `1px solid ${danger ? 'rgba(224,104,104,0.2)' : 'var(--line-strong)'}`,
        borderRadius: 4,
        color: danger ? 'var(--bad)' : 'var(--accent)',
        fontSize: 10, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}
    >{children}</button>
  );
}
