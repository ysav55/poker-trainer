/* Tab 1 · Live  (v3)
   Sections:
   • Status header (turn / phase / pot / EE timer / mini board)
   • Table strip (seats + sit-out / stack / kick / +bot)
   • Configure Hand  (mode + per-player cards/range + board+textures)
   • Live equity
   • Action feed
*/

const { useState: useStateLive, useEffect: useEffectLive } = React;

function TabLive({ data }) {
  const { gameState, actionTimer, equityData, myStableId } = data;

  const [remaining, setRemaining] = useStateLive(actionTimer.remaining);
  useEffectLive(() => {
    if (gameState.current_turn !== actionTimer.playerId) return;
    const id = setInterval(() => setRemaining(r => Math.max(0, r - 100)), 100);
    return () => clearInterval(id);
  }, [gameState.current_turn, actionTimer.playerId]);

  const timerPct = Math.max(0, Math.min(1, remaining / actionTimer.duration));
  const timerColor = timerPct > 0.5 ? 'var(--ok)' : timerPct > 0.25 ? 'var(--warn)' : 'var(--bad)';
  const onTurn = gameState.players.find(p => p.id === gameState.current_turn);
  const isMyTurn = onTurn && onTurn.stableId === myStableId;
  const phaseLabel = ({preflop:'Preflop',flop:'Flop',turn:'Turn',river:'River',showdown:'Showdown'})[gameState.phase] || gameState.phase;

  const equityRows = equityData.equities
    .map(e => {
      const p = gameState.players.find(pp => pp.stableId === e.playerId);
      if (!p) return null;
      return { key: e.playerId, name: p.name, pct: e.equity,
        color: equityData.colors[e.playerId] || '#c9a35d',
        isMe: e.playerId === myStableId };
    }).filter(Boolean).sort((a,b) => b.pct - a.pct);

  const feed = [...gameState.hand_history].reverse();

  return (
    <>
      {/* Status header */}
      <div className="card" style={{ padding: '11px 12px 10px' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 17, color: 'var(--accent)', lineHeight: 1 }}>{phaseLabel}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.08em' }}>#{gameState.hand_number}</span>
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
          <div style={{ height: '100%', width: `${timerPct * 100}%`, background: timerColor, transition: 'width 100ms linear, background-color 300ms', boxShadow: `0 0 6px ${timerColor}` }}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginRight: 8 }}>Board</span>
          {gameState.board.map((c, i) => <window.MiniCard key={i} code={c} />)}
          {Array.from({ length: 5 - gameState.board.length }).map((_, i) => <window.MiniCard key={'g' + i} ghost />)}
        </div>
      </div>

      <TableStrip data={data} />
      <window.ConfigureHand data={data} />

      {/* Live equity */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Live Equity</div>
          <div className="card-kicker">{equityData.showToPlayers ? 'visible to players' : 'coach only'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {equityRows.map(r => (
            <div key={r.key}>
              <div className="eq-row">
                <span className={'eq-name' + (r.isMe ? ' me' : '')}>
                  {r.name}{r.isMe && <span style={{ opacity: 0.6, fontSize: 10 }}> · you</span>}
                </span>
                <span className="eq-pct" style={{ color: r.color }}>{r.pct}%</span>
              </div>
              <div className="eq-bar">
                <div className="eq-bar-fill" style={{ width: `${r.pct}%`, background: r.color, boxShadow: r.isMe ? `0 0 8px ${r.color}66` : 'none' }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action feed */}
      <div className="card" style={{ flex: 1, minHeight: 180 }}>
        <div className="card-head">
          <div className="card-title">Action Feed</div>
          <div className="card-kicker">this hand</div>
        </div>
        <div>
          {feed.map((row, i) => (
            <div key={i} className="feed-row">
              <span className="feed-phase">{({preflop:'PRE',flop:'FLOP',turn:'TURN',river:'RIV',showdown:'SD'})[row.street] || row.street.slice(0,3).toUpperCase()}</span>
              <span className="feed-text">
                <b>{row.who}</b> {row.act}
                {row.pending && <span style={{ color: 'var(--accent-hot)', marginLeft: 6, fontSize: 10, letterSpacing: '0.1em' }}>· pending</span>}
              </span>
              <span className="feed-amt">{row.amt != null ? row.amt : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Table strip ──────────────────────────────────────── */
function TableStrip({ data }) {
  const seats = data.seatConfig.seats;
  const filled = seats.filter(s => s.player);
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">Table</div>
        <div className="card-kicker">
          {filled.length}/{data.seatConfig.maxSeats} seats
          <span style={{ marginLeft: 8 }}>
            <button className="btn ghost sm" style={{ padding: '4px 8px' }}>+ Bot</button>
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filled.map(s => {
          const isHero = s.isHero;
          const isBot = s.isBot;
          const sitting = s.status === 'sitout';
          return (
            <div key={s.seat} style={{
              display: 'grid', gridTemplateColumns: '20px 1fr auto auto',
              gap: 8, alignItems: 'center', padding: '6px 8px',
              background: isHero ? 'rgba(240,208,96,0.06)' : 'transparent',
              border: `1px solid ${isHero ? 'rgba(240,208,96,0.18)' : 'transparent'}`,
              borderRadius: 6,
            }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-faint)', textAlign: 'center' }}>{s.seat + 1}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: sitting ? 'var(--ink-faint)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.player}</span>
                {isHero && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--accent-hot)', textTransform: 'uppercase' }}>HERO</span>}
                {isBot && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--purple)', textTransform: 'uppercase' }}>BOT</span>}
                {sitting && <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--warn)', textTransform: 'uppercase' }}>SIT</span>}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-dim)' }}>{s.stack.toLocaleString()}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                <SeatBtn title={sitting ? 'Sit in' : 'Sit out'}>{sitting ? '▶' : '❚❚'}</SeatBtn>
                <SeatBtn title="Adjust stack">±</SeatBtn>
                <SeatBtn title="Kick" danger>×</SeatBtn>
              </div>
            </div>
          );
        })}
        {filled.length < data.seatConfig.maxSeats && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px', fontSize: 10, fontFamily: 'var(--mono)',
            color: 'var(--ink-faint)', borderTop: '1px dashed var(--line)',
            marginTop: 2, paddingTop: 7,
          }}>
            <span>{data.seatConfig.maxSeats - filled.length} empty</span>
            <span style={{ display: 'flex', gap: 4 }}>
              {seats.filter(s => !s.player).map(s => (
                <span key={s.seat} style={{
                  width: 14, height: 14, border: '1px dashed var(--line-strong)',
                  borderRadius: 3, fontSize: 8, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>{s.seat + 1}</span>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function SeatBtn({ children, title, danger }) {
  return (
    <button title={title} style={{
      width: 22, height: 22,
      background: danger ? 'rgba(224,104,104,0.06)' : 'rgba(201,163,93,0.06)',
      border: `1px solid ${danger ? 'rgba(224,104,104,0.2)' : 'var(--line-strong)'}`,
      borderRadius: 4,
      color: danger ? 'var(--bad)' : 'var(--accent)',
      fontSize: 10, fontWeight: 700, cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }}>{children}</button>
  );
}

window.TabLive = TabLive;
