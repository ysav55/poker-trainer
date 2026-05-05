/* Tab 1 · Live
   Per spec:
   • Current turn / timer / phase readouts at top (pulled from
     gameState.current_turn, actionTimer, gameState.phase)
   • Live equity bars (kept) — reads equityData.equities[]
   • Action feed (kept) — reads gameState.hand_history[]
   • (Drills Library removed — now lives in Tab 2) */

const { useState: useStateLive, useEffect: useEffectLive } = React;

function TabLive({ data }) {
  const { gameState, actionTimer, equityData, myStableId } = data;

  // Live-tick the timer for demo feel (in real app: driven by socket event)
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

  const phaseLabel = {
    preflop: 'Preflop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
    showdown: 'Showdown',
  }[gameState.phase] || gameState.phase;

  // Equity — join with player names + colors
  const equityRows = equityData.equities
    .map(e => {
      const p = gameState.players.find(pp => pp.stableId === e.playerId);
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

  // Feed — most recent first
  const feed = [...gameState.hand_history].reverse();

  return (
    <>
      {/* Turn / Phase / Timer header */}
      <div className="card" style={{ padding: '11px 12px 10px' }}>
        <div className="row between" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--serif)', fontStyle: 'italic',
              fontSize: 17, color: 'var(--accent)', lineHeight: 1,
            }}>{phaseLabel}</span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10,
              color: 'var(--ink-faint)', letterSpacing: '0.08em',
            }}>#{gameState.hand_number}</span>
          </div>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 11,
            color: 'var(--ink-dim)',
          }}>
            Pot <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{gameState.pot}</span>
          </div>
        </div>

        <div className="row between" style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: 'var(--ink-faint)', letterSpacing: '0.1em', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>On clock · </span>
            <span style={{
              color: isMyTurn ? 'var(--accent-hot)' : 'var(--ink)',
              fontWeight: isMyTurn ? 700 : 500,
            }}>{onTurn ? onTurn.name : '—'}</span>
            {isMyTurn && <span style={{ color: 'var(--accent-hot)', marginLeft: 4 }}>· you</span>}
          </div>
          <div style={{
            fontFamily: 'var(--mono)',
            fontSize: 13, fontWeight: 700,
            color: timerColor,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {(remaining / 1000).toFixed(1)}s
          </div>
        </div>

        <div style={{
          height: 3,
          background: 'rgba(201,163,93,0.1)',
          borderRadius: 2,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${timerPct * 100}%`,
            background: timerColor,
            transition: 'width 100ms linear, background-color 300ms',
            boxShadow: `0 0 6px ${timerColor}`,
          }}/>
        </div>

        {/* Board mini */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
            textTransform: 'uppercase', color: 'var(--ink-faint)',
            marginRight: 8,
          }}>Board</span>
          {gameState.board.map((c, i) => <window.MiniCard key={i} code={c} />)}
          {Array.from({ length: 5 - gameState.board.length }).map((_, i) => (
            <window.MiniCard key={'g' + i} ghost />
          ))}
        </div>
      </div>

      {/* Live equity */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Live Equity</div>
          <div className="card-kicker">
            {equityData.showToPlayers ? 'visible to players' : 'coach only'}
          </div>
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
                <div className="eq-bar-fill" style={{
                  width: `${r.pct}%`,
                  background: r.color,
                  boxShadow: r.isMe ? `0 0 8px ${r.color}66` : 'none',
                }}/>
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
              <span className="feed-phase">{({
                preflop: 'PRE', flop: 'FLOP', turn: 'TURN', river: 'RIV', showdown: 'SD'
              })[row.street] || row.street.slice(0,3).toUpperCase()}</span>
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

window.TabLive = TabLive;
