/* Tab 3 · History
   Per spec:
   • Horizontal-scroll row of 20 hand cards for THIS table session
   • Each card: tiny board + hero hand + pot won/lost + hero action summary
   • Click → "Load in Review" (switches to Tab 4) */

function TabHistory({ data, onLoadReview }) {
  const sessionPnl = data.history
    .filter(h => h.net != null)
    .reduce((a, b) => a + b.net, 0);
  const handsDone = data.history.filter(h => !h.live).length;
  const wins = data.history.filter(h => h.net > 0).length;
  const losses = data.history.filter(h => h.net < 0).length;

  return (
    <>
      {/* Session summary */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Session</div>
          <div className="card-kicker">{handsDone} hands · {data.session.minutes}m</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <div className="stat">
            <div className="stat-lbl">Net</div>
            <div className={'stat-val serif ' + (sessionPnl >= 0 ? 'ok' : 'bad')}>
              {sessionPnl >= 0 ? '+' : ''}{sessionPnl}
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Won</div>
            <div className="stat-val">{wins}</div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Lost</div>
            <div className="stat-val">{losses}</div>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        <span className="chip active">All</span>
        <span className="chip ghost">Won</span>
        <span className="chip ghost">Lost</span>
        <span className="chip ghost">Showdown</span>
        <span className="chip ghost">Tagged</span>
      </div>

      {/* Horizontal scroller with hand cards */}
      <div className="card" style={{ padding: '12px 12px 8px' }}>
        <div className="card-head">
          <div className="card-title">Recent Hands</div>
          <div className="card-kicker">scroll ↔ · {data.history.length}</div>
        </div>
        <div className="h-scroll">
          {data.history.map(h => (
            <HandCard key={h.n} hand={h} onClick={() => onLoadReview(h.n)} />
          ))}
        </div>
      </div>
    </>
  );
}

function HandCard({ hand, onClick }) {
  const isLive = hand.live;
  const net = hand.net;
  const netColor = net == null ? 'var(--ink-dim)' : net >= 0 ? 'var(--ok)' : 'var(--bad)';

  return (
    <div
      onClick={onClick}
      style={{
        flex: '0 0 146px',
        scrollSnapAlign: 'start',
        background: isLive ? 'rgba(201,163,93,0.08)' : 'var(--bg-3)',
        border: `1px solid ${isLive ? 'rgba(201,163,93,0.4)' : 'var(--line)'}`,
        borderRadius: 9,
        padding: '9px 10px',
        cursor: isLive ? 'default' : 'pointer',
        display: 'flex', flexDirection: 'column', gap: 6,
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseOver={e => !isLive && (e.currentTarget.style.borderColor = 'rgba(201,163,93,0.4)')}
      onMouseOut={e => !isLive && (e.currentTarget.style.borderColor = 'var(--line)')}
    >
      <div className="row between">
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--ink-faint)',
        }}>#{hand.n}</span>
        {isLive ? (
          <span style={{
            fontSize: 8, fontWeight: 800, letterSpacing: '0.16em',
            color: 'var(--ok)', textTransform: 'uppercase',
          }}>● Live</span>
        ) : (
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
            color: netColor,
          }}>
            {net >= 0 ? '+' : ''}{net}
          </span>
        )}
      </div>

      {/* Hero hand */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {hand.heroHand.map((c, i) => <window.MiniCard key={i} code={c} />)}
      </div>

      {/* Board (5 slots) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          hand.board[i]
            ? <window.MiniCard key={i} code={hand.board[i]} />
            : <window.MiniCard key={i} ghost />
        ))}
      </div>

      {/* Action summary */}
      <div style={{
        fontSize: 10, color: 'var(--ink-dim)',
        lineHeight: 1.35,
        minHeight: 26,
      }}>
        {hand.action}
      </div>

      {/* Pot + phase */}
      <div className="row between" style={{
        paddingTop: 5,
        borderTop: '1px solid rgba(201,163,93,0.08)',
      }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--ink-faint)',
        }}>{hand.phase}</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10,
          color: 'var(--ink-dim)',
        }}>pot {hand.pot}</span>
      </div>
    </div>
  );
}

window.TabHistory = TabHistory;
