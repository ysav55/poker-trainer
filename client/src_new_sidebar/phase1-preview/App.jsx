/* App shell for the Phase 1 production-file preview.
   Loads makeGameState() from mockGame.jsx and renders <P1_PokerTable>. */

const { useState, useEffect } = React;

function Phase1App() {
  const [gameState, setGameState] = useState(() => window.makeGameState());
  const [coachMode, setCoachMode] = useState(false);
  const [showEquity, setShowEquity] = useState(true);

  // Action timer for the hero
  const [actionTimer, setActionTimer] = useState(() => ({
    playerId: 'me',
    startedAt: Date.now(),
    duration: 25000,
  }));
  useEffect(() => {
    const t = setInterval(() => {
      setActionTimer(prev => {
        if (!prev) return prev;
        const elapsed = Date.now() - prev.startedAt;
        if (elapsed > prev.duration) {
          return { ...prev, startedAt: Date.now() };
        }
        return prev;
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  const emit = {
    placeBet: (action, amount) => {
      console.log('placeBet', action, amount);
      setGameState(prev => {
        const next = { ...prev };
        next.players = prev.players.map(p =>
          p.id === 'me' ? { ...p, action } : p
        );
        next.current_turn = 'p2'; // move turn off hero so bar hides
        return next;
      });
    },
    resetHand: () => {
      setGameState(window.makeGameState());
    },
  };

  const equityData = showEquity ? {
    phase: gameState.phase,
    equities: gameState.equities,
    showToPlayers: true,
  } : null;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Topbar with demo controls */}
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        zIndex: 100, pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: "'Instrument Serif', serif",
          fontStyle: 'italic', fontSize: 22,
          color: '#c9a35d', letterSpacing: '-0.02em',
          pointerEvents: 'auto',
        }}>
          FeltSide · <span style={{ color: '#f0ece3', fontSize: 13, fontStyle: 'normal', fontFamily: "'General Sans', sans-serif", letterSpacing: '0.3em', textTransform: 'uppercase', fontWeight: 600 }}>Phase 1 Preview</span>
        </div>
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <DemoToggle label="Coach" active={coachMode} onClick={() => setCoachMode(x => !x)} />
          <DemoToggle label="Equity" active={showEquity} onClick={() => setShowEquity(x => !x)} />
          <DemoToggle label="→ Turn → River" onClick={() => {
            setGameState(prev => {
              const next = { ...prev };
              if (prev.phase === 'turn') {
                next.phase = 'river';
                next.board = [...prev.board, 'Qs'];
              } else if (prev.phase === 'river') {
                next.phase = 'showdown';
                next.winner = 'me';
                next.showdown_result = {
                  winners: [{
                    playerId: 'me', playerName: 'Ariela Simantov',
                    handResult: { description: 'Two Pair, Aces and Sevens' },
                  }],
                  splitPot: false, potAwarded: 1840,
                  allHands: [
                    { playerId: 'me', handResult: { description: 'Two Pair, Aces and Sevens' } },
                    { playerId: 'p2', handResult: { description: 'Pair of Sevens' } },
                    { playerId: 'p4', handResult: { description: 'Pair of Sevens' } },
                    { playerId: 'p5', handResult: { description: 'High Card, Queen' } },
                    { playerId: 'p6', handResult: { description: 'Pair of Fives' } },
                  ],
                };
                // Reveal opponent cards
                next.players = prev.players.map(p =>
                  p.id === 'p2' ? { ...p, hole_cards: ['Ks', 'Qh'] } :
                  p.id === 'p4' ? { ...p, hole_cards: ['Th', '9d'] } :
                  p.id === 'p5' ? { ...p, hole_cards: ['Qd', 'Jc'] } :
                  p.id === 'p6' ? { ...p, hole_cards: ['5c', '4h'] } :
                  p
                );
              } else {
                return window.makeGameState();
              }
              return next;
            });
          }} />
        </div>
      </div>

      <window.P1_PokerTable
        gameState={gameState}
        myId={'me'}
        isCoach={coachMode}
        emit={emit}
        actionTimer={actionTimer}
        bbView={false}
        bigBlind={gameState.big_blind}
        equityData={equityData}
        equityEnabled={coachMode && showEquity}
        tableMode={gameState.table_mode}
      />
    </div>
  );
}

function DemoToggle({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999,
        background: active ? 'rgba(201,163,93,0.18)' : 'rgba(0,0,0,0.5)',
        border: `1px solid ${active ? '#c9a35d' : 'rgba(201,163,93,0.2)'}`,
        color: active ? '#f0d060' : '#c9a35d',
        fontFamily: "'General Sans', sans-serif",
        fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
        textTransform: 'uppercase', cursor: 'pointer',
        transition: 'all 120ms',
      }}
    >{label}</button>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Phase1App />);
