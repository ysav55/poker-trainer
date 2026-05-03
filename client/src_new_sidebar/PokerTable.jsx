/* ── PokerTable.jsx ─────────────────────────────────────────────────────────
   The table surface. Key reinvention:
    • Rounded-rect (or hex) table, not an oval — modern, screen-friendly
    • Subtle neon rim instead of gold wood. Felt has soft linear gradient,
      thin inner line, centered brand mark
    • Bet trails — animated dotted lines from player seats to the pot
    • Pot block is elevated: count-up digits + side-pot chips
    • Current-turn spotlight = radial wash behind the active seat
    • Seats use POSITIONS_BY_COUNT rotation logic from the real app, so
      wiring is drop-in
─────────────────────────────────────────────────────────────────────────── */

const SEAT_POSITIONS = [
  { left: '50%', top: '96%' }, // 0 bottom-center (hero)
  { left: '18%', top: '90%' }, // 1 bottom-left
  { left: '2%',  top: '56%' }, // 2 left
  { left: '12%', top: '14%' }, // 3 top-left
  { left: '34%', top: '2%'  }, // 4 top-center-l
  { left: '66%', top: '2%'  }, // 5 top-center-r
  { left: '88%', top: '14%' }, // 6 top-right
  { left: '98%', top: '56%' }, // 7 right
  { left: '82%', top: '90%' }, // 8 bottom-right
];

const POSITIONS_BY_COUNT = {
  1: [0], 2: [0, 4], 3: [0, 3, 6], 4: [0, 2, 5, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 1, 3, 5, 6, 8],
  7: [0, 1, 3, 4, 5, 6, 8], 8: [0, 1, 2, 4, 5, 6, 7, 8],
  9: [0, 1, 2, 3, 4, 5, 6, 7, 8],
};

function PokerTable({ gameState, myId, T, onAction, bbView = false, equityVisible = false, tableShape = 'rounded-rect', showBetTrails = true }) {
  const players = gameState.players ?? [];
  const bigBlind = gameState.big_blind ?? 20;
  const board = gameState.board ?? [];
  const phase = gameState.phase ?? 'waiting';
  const pot = gameState.pot ?? 0;
  const currentTurn = gameState.current_turn;

  // centerPot = pot minus uncommitted bets (those live near players)
  const committedThisStreet = players.reduce((s, p) => s + (p.total_bet_this_round ?? 0), 0);
  const centerPot = Math.max(0, pot - committedThisStreet);

  // action timer mock
  const [timerPct, setTimerPct] = React.useState(100);
  React.useEffect(() => {
    const start = Date.now();
    const dur = 20000;
    const iv = setInterval(() => {
      setTimerPct(Math.max(0, 100 - ((Date.now() - start) / dur) * 100));
    }, 150);
    return () => clearInterval(iv);
  }, [currentTurn]);

  // seat rotation so hero is bottom-center
  const sortedBySeat = [...players].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
  const myIdx = sortedBySeat.findIndex(p => p.id === myId);
  const n = sortedBySeat.length;
  const positions = POSITIONS_BY_COUNT[n] ?? POSITIONS_BY_COUNT[9];

  function getSeatStyle(player) {
    const pIdx = sortedBySeat.findIndex(p => p.id === player.id);
    const relative = (pIdx - (myIdx >= 0 ? myIdx : 0) + n) % n;
    return SEAT_POSITIONS[positions[relative]] ?? SEAT_POSITIONS[0];
  }

  const fmt = (n) => bbView ? `${(n/bigBlind).toFixed(n/bigBlind < 10 ? 1 : 0)}bb` : n.toLocaleString();

  const tableBorderRadius = tableShape === 'hex'
    ? 0
    : '140px / 120px';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bgGrad,
      overflow: 'hidden',
    }}>

      {/* Ambient atmosphere */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(800px 400px at 50% 40%, ${T.accentSoft}, transparent 70%)`,
        opacity: 0.6,
      }}/>

      {/* Table — the felt */}
      <div style={{
        position: 'relative',
        width: 'min(86%, 1000px)',
        height: 'min(70%, 560px)',
        borderRadius: tableBorderRadius,
        background: T.feltBase,
        boxShadow: T.feltGlow,
        border: `1px solid ${T.borderStrong}`,
        clipPath: tableShape === 'hex'
          ? 'polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)'
          : 'none',
      }}>
        {/* Outer rim glow */}
        <div style={{
          position: 'absolute', inset: -8,
          borderRadius: tableShape === 'hex' ? 0 : '160px / 140px',
          background: T.feltRim,
          opacity: 0.5,
          filter: 'blur(12px)',
          zIndex: -1,
        }}/>

        {/* Inner hairline frame */}
        <div style={{
          position: 'absolute', inset: 16,
          borderRadius: tableShape === 'hex' ? 0 : '120px / 100px',
          border: `1px solid ${T.feltInnerLine}`,
          pointerEvents: 'none',
        }}/>

        {/* Felt texture overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: tableBorderRadius,
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.008) 0 1px, transparent 1px 3px),' +
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.008) 0 1px, transparent 1px 3px)',
          pointerEvents: 'none',
          opacity: 0.6,
        }}/>

        {/* Brand mark — watermark, bottom-center */}
        <div style={{
          position: 'absolute', bottom: '10%', left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
          fontSize: 52, letterSpacing: '-0.04em',
          color: T.textMuted, opacity: 0.12,
          pointerEvents: 'none',
        }}>FeltSide</div>

        {/* Active-turn spotlight */}
        {currentTurn && (() => {
          const turnPlayer = players.find(p => p.id === currentTurn);
          if (!turnPlayer) return null;
          const st = getSeatStyle(turnPlayer);
          return (
            <div style={{
              position: 'absolute',
              left: st.left, top: st.top,
              width: 300, height: 300,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${T.accentSoft}, transparent 60%)`,
              pointerEvents: 'none',
              zIndex: 1,
              animation: 'shimmer 2.4s ease-in-out infinite',
            }}/>
          );
        })()}

        {/* Bet trails — animated dashed lines from each player with a live bet toward center pot */}
        {showBetTrails && phase !== 'showdown' && (
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
            {players.filter(p => (p.total_bet_this_round ?? 0) > 0).map(p => {
              const st = getSeatStyle(p);
              const x1 = parseFloat(st.left);
              const y1 = parseFloat(st.top);
              return (
                <line key={p.id}
                  x1={`${x1}%`} y1={`${y1}%`}
                  x2="50%" y2="42%"
                  stroke={T.accent}
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  strokeLinecap="round"
                  opacity="0.28"
                  style={{ animation: 'marchDash 1.2s linear infinite' }}
                />
              );
            })}
          </svg>
        )}

        {/* Board + Pot — centered */}
        <div style={{
          position: 'absolute', left: '50%', top: '42%',
          transform: 'translate(-50%, -50%)',
          zIndex: 3,
        }}>
          <BoardCards board={board} phase={phase} T={T} potDisplay={fmt(pot)} bigBlind={bigBlind} bbView={bbView}/>
        </div>

        {/* Seats */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 4 }}>
          {players.map(p => {
            const st = getSeatStyle(p);
            const isTurn = p.id === currentTurn;
            const isMe = p.id === myId;
            const eq = gameState.equities?.find(e => e.playerId === p.stableId)?.equity ?? null;
            return (
              <React.Fragment key={p.id}>
                <PlayerSeat
                  player={p} T={T}
                  isCurrentTurn={isTurn} isMe={isMe}
                  actionTimerPct={isTurn ? timerPct : null}
                  equity={eq} equityVisible={equityVisible}
                  bbView={bbView} bigBlind={bigBlind}
                  seatStyle={st}
                  showdownResult={gameState.showdown_result}
                  isWinner={false}
                />
                {/* Bet chip — positioned between seat and pot */}
                {(p.total_bet_this_round ?? 0) > 0 && (() => {
                  const x = parseFloat(st.left);
                  const y = parseFloat(st.top);
                  // move 28% of the way from seat toward center
                  const cx = x + (50 - x) * 0.35;
                  const cy = y + (42 - y) * 0.35;
                  return (
                    <div style={{
                      position: 'absolute',
                      left: `${cx}%`, top: `${cy}%`,
                      transform: 'translate(-50%, -50%)',
                      zIndex: 5,
                    }}>
                      <BetChip amount={p.total_bet_this_round} bigBlind={bigBlind} bbView={bbView} T={T} position={{}}/>
                    </div>
                  );
                })()}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Betting bar — always anchored bottom-center of viewport */}
      <BettingBar gameState={gameState} myId={myId} T={T} onAction={onAction} bbView={bbView} bigBlind={bigBlind}/>
    </div>
  );
}

window.PokerTable = PokerTable;
