/* Tab 3 · History  (v3)

   Two views via segmented:
   • Table   — aggregate session stats + horizontal hand-card scroller.
   • Players — pick a player → see their session stats + their hands.

   Each hand card click → loads in Review (Tab 4).
*/

const { useState: useStateHist, useMemo: useMemoHist } = React;

function TabHistory({ data, onLoadReview }) {
  const [view, setView] = useStateHist('table');
  return (
    <>
      <window.Segmented
        cols={2}
        options={[
          { value: 'table',   label: 'Table' },
          { value: 'players', label: 'Players' },
        ]}
        value={view}
        onChange={setView}
      />
      {view === 'table'   && <TableHistoryView   data={data} onLoadReview={onLoadReview} />}
      {view === 'players' && <PlayersHistoryView data={data} onLoadReview={onLoadReview} />}
    </>
  );
}

/* ─── Table view ──────────────────────────────────────────── */
function TableHistoryView({ data, onLoadReview }) {
  const [filter, setFilter] = useStateHist('all');

  const sessionPnl = data.history.filter(h => h.net != null).reduce((a,b) => a + b.net, 0);
  const handsDone = data.history.filter(h => !h.live).length;
  const wins = data.history.filter(h => h.net > 0).length;
  const losses = data.history.filter(h => h.net < 0).length;
  const agg = data.tableAggregate;

  const filtered = useMemoHist(() => data.history.filter(h => {
    if (filter === 'all') return true;
    if (filter === 'won') return h.net > 0;
    if (filter === 'lost') return h.net < 0;
    if (filter === 'showdown') return h.phase === 'showdown';
    return true;
  }), [filter, data.history]);

  return (
    <>
      {/* Session summary */}
      <div className="card">
        <div className="card-head">
          <div className="card-title">Session</div>
          <div className="card-kicker">{handsDone} hands · {data.session.minutes}m</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
          <div className="stat">
            <div className="stat-lbl">Hero Net</div>
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

        {/* Aggregate table stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <MiniStat label="Avg Pot" value={agg.avgPot} />
          <MiniStat label="Big Pot" value={agg.biggestPot} />
          <MiniStat label="SD %"    value={agg.showdownRate + '%'} />
        </div>
      </div>

      {/* Filter chips */}
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {[
          { v: 'all',      l: 'All' },
          { v: 'won',      l: 'Won' },
          { v: 'lost',     l: 'Lost' },
          { v: 'showdown', l: 'Showdown' },
        ].map(f => (
          <span
            key={f.v}
            className={'chip' + (filter === f.v ? ' active' : ' ghost')}
            onClick={() => setFilter(f.v)}
          >{f.l}</span>
        ))}
      </div>

      {/* Hands scroller */}
      <div className="card" style={{ padding: '12px 12px 8px' }}>
        <div className="card-head">
          <div className="card-title">Recent Hands</div>
          <div className="card-kicker">scroll ↔ · {filtered.length}</div>
        </div>
        <div className="h-scroll">
          {filtered.map(h => (
            <HandCard key={h.n} hand={h} onClick={() => onLoadReview(h.n)} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Players view ────────────────────────────────────────── */
function PlayersHistoryView({ data, onLoadReview }) {
  const playerList = Object.values(data.playerHistory);
  const [selectedId, setSelectedId] = useStateHist(playerList[0].stableId);
  const selected = data.playerHistory[selectedId];

  // Build the full hand objects for this player
  const playerHands = useMemoHist(() => {
    const set = new Set(selected.handIds);
    return data.history.filter(h => set.has(h.n));
  }, [selectedId, data.history]);

  return (
    <>
      {/* Player chooser — chips */}
      <div className="card" style={{ padding: '11px 12px 9px' }}>
        <div className="card-head" style={{ marginBottom: 7 }}>
          <div className="card-title">Player</div>
          <div className="card-kicker">{playerList.length} at table</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {playerList.map(p => {
            const isOn = selectedId === p.stableId;
            const color = data.equityData.colors[p.stableId] || 'var(--accent)';
            return (
              <button
                key={p.stableId}
                className={'chip' + (isOn ? ' active' : '')}
                onClick={() => setSelectedId(p.stableId)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  borderColor: isOn ? color : 'rgba(201,163,93,0.2)',
                }}
              >
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: color,
                  boxShadow: isOn ? `0 0 6px ${color}` : 'none',
                }}/>
                {p.name.split(' ')[0]}
                {p.isHero && <span style={{ fontSize: 8, opacity: 0.7 }}>· you</span>}
                {p.isBot && <span style={{ fontSize: 8, opacity: 0.7 }}>· bot</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Player stats */}
      <PlayerStatsCard player={selected} color={data.equityData.colors[selected.stableId]} />

      {/* Their hands */}
      <div className="card" style={{ padding: '12px 12px 8px' }}>
        <div className="card-head">
          <div className="card-title">{selected.name.split(' ')[0]}'s Hands</div>
          <div className="card-kicker">scroll ↔ · {playerHands.length}</div>
        </div>
        <div className="h-scroll">
          {playerHands.map(h => (
            <HandCard key={h.n} hand={h} onClick={() => onLoadReview(h.n)} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ─── Player stats card ───────────────────────────────────── */
function PlayerStatsCard({ player, color }) {
  const s = player.stats;
  const c = color || 'var(--accent)';

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title" style={{ color: c }}>{player.name}</div>
        <div className="card-kicker">{s.hands} hands</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 6 }}>
        <div className="stat">
          <div className="stat-lbl">Net</div>
          <div className={'stat-val serif ' + (s.net >= 0 ? 'ok' : 'bad')}>
            {s.net >= 0 ? '+' : ''}{s.net}
          </div>
        </div>
        <div className="stat">
          <div className="stat-lbl">bb / 100</div>
          <div className={'stat-val ' + (s.bb100 >= 0 ? 'ok' : 'bad')}>
            {s.bb100 >= 0 ? '+' : ''}{s.bb100}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <MiniStat label="VPIP" value={s.vpip + '%'} />
        <MiniStat label="PFR"  value={s.pfr + '%'} />
        <MiniStat label="W$SD" value={s.wonAtSd + '%'} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="stat" style={{ padding: '6px 8px' }}>
      <div className="stat-lbl" style={{ fontSize: 7 }}>{label}</div>
      <div className="stat-val" style={{ fontSize: 13 }}>{value}</div>
    </div>
  );
}

/* ─── Reusable HandCard (same shape as v2) ────────────────── */
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
          <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', color: 'var(--ok)', textTransform: 'uppercase' }}>● Live</span>
        ) : (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, color: netColor }}>
            {net >= 0 ? '+' : ''}{net}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {hand.heroHand.map((c, i) => <window.MiniCard key={i} code={c} />)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          hand.board[i] ? <window.MiniCard key={i} code={hand.board[i]} /> : <window.MiniCard key={i} ghost />
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-dim)', lineHeight: 1.35, minHeight: 26 }}>
        {hand.action}
      </div>
      <div className="row between" style={{ paddingTop: 5, borderTop: '1px solid rgba(201,163,93,0.08)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-faint)' }}>{hand.phase}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-dim)' }}>pot {hand.pot}</span>
      </div>
    </div>
  );
}

window.TabHistory = TabHistory;
