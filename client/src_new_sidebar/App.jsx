/* ── App.jsx ────────────────────────────────────────────────────────────────
   Shell: top bar, variant switcher, tweaks panel, mode toggles for
   showing off the redesign. Drop-in target: gameState shape matches real
   app so replacing `useGameState` wiring is cosmetic.
─────────────────────────────────────────────────────────────────────────── */

const { useState, useEffect, useMemo } = React;
const { THEMES, PokerTable, makeGameState, MOCK_HERO_ID } = window;

// Tweakable defaults — persisted via host edit-mode
const TWEAKS = /*EDITMODE-BEGIN*/{
  "theme": "velvet",
  "phase": "turn",
  "bbView": false,
  "equityVisible": false,
  "showBetTrails": true,
  "showCoachStrip": true
}/*EDITMODE-END*/;

function TopBar({ T, tweaks, setTweaks }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 20px', height: 56, flexShrink: 0,
      borderBottom: `1px solid ${T.border}`,
      background: T.surface,
      backdropFilter: 'blur(10px)',
      zIndex: 30, position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{
          background: 'transparent', border: `1px solid ${T.border}`,
          color: T.textDim, padding: '5px 10px', borderRadius: 6,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          cursor: 'pointer',
        }}>← LOBBY</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: `linear-gradient(135deg, ${T.accent}, ${T.violet})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.bg.startsWith('#f') ? '#fff' : '#111',
            fontWeight: 800, fontSize: 14,
            fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
          }}>F</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>FeltSide</span>
            <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.2em', marginTop: 2 }}>POKER · TRAINER</span>
          </div>
        </div>
        <span style={{ color: T.textMuted }}>·</span>
        <span style={{ fontSize: 12, color: T.text }}>Stakehouse · NL Hold'em</span>
        <Badge T={T} color={T.accent}>COACHED</Badge>
        <Badge T={T} color={T.textDim} muted>HAND #142</Badge>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Stat T={T} label="SESSION" value="1h 27m"/>
        <div style={{ width: 1, height: 22, background: T.border }}/>
        <Stat T={T} label="HANDS" value="142"/>
        <div style={{ width: 1, height: 22, background: T.border }}/>
        <Stat T={T} label="NET" value="+$480" color={T.positive}/>
      </div>
    </header>
  );
}

function Badge({ children, T, color, muted }) {
  return (
    <span style={{
      padding: '3px 8px', borderRadius: 4,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
      background: muted ? 'rgba(255,255,255,0.03)' : `${color}15`,
      color, border: `1px solid ${muted ? T.border : color + '55'}`,
    }}>{children}</span>
  );
}

function Stat({ T, label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.18em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: color || T.text, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}

function CoachStrip({ T, gameState }) {
  // narrow insight strip: equity winrate, gto suggestion, stake/ev
  const me = gameState.players.find(p => p.id === 'me');
  const myEq = gameState.equities?.find(e => e.playerId === me?.stableId)?.equity ?? 0;
  return (
    <div style={{
      position: 'absolute', top: 14, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', gap: 10, alignItems: 'center',
      padding: '8px 14px',
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 999,
      backdropFilter: 'blur(10px)',
      zIndex: 20,
      fontSize: 11,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
        color: T.accent, padding: '2px 8px', borderRadius: 999,
        background: T.accentSoft, border: `1px solid ${T.accentRim}`,
      }}>COACH LIVE</span>
      <Insight T={T} label="EQUITY" value={`${myEq}%`} color={myEq > 55 ? T.positive : myEq > 30 ? T.warning : T.danger}/>
      <Dot T={T}/>
      <Insight T={T} label="GTO" value="RAISE 2.5×" color={T.accent}/>
      <Dot T={T}/>
      <Insight T={T} label="EV" value="+$184" color={T.positive}/>
      <Dot T={T}/>
      <Insight T={T} label="BOARD" value="DRAW-HEAVY" color={T.info}/>
    </div>
  );
}
function Insight({ T, label, value, color }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.14em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: color || T.text, fontFamily: "'JetBrains Mono', monospace" }}>{value}</span>
    </div>
  );
}
function Dot({ T }) {
  return <span style={{ width: 3, height: 3, borderRadius: '50%', background: T.textMuted }}/>;
}

function TweaksPanel({ tweaks, setTweaks, T, onReset }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{
      position: 'fixed', right: 14, top: 72, zIndex: 100,
      width: open ? 240 : 'auto',
      background: T.surface2,
      border: `1px solid ${T.borderStrong}`,
      borderRadius: 12,
      backdropFilter: 'blur(14px)',
      boxShadow: '0 20px 50px -12px rgba(0,0,0,0.6)',
      fontSize: 12, color: T.text,
      overflow: 'hidden',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', background: 'transparent', border: 'none',
        padding: '10px 12px', color: T.text, cursor: 'pointer',
        borderBottom: open ? `1px solid ${T.border}` : 'none',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', color: T.accent }}>TWEAKS</span>
        <span style={{ color: T.textDim }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Row label="Theme" T={T}>
            <div style={{ display: 'flex', gap: 4, width: '100%' }}>
              {Object.entries(THEMES).map(([k, v]) => (
                <button key={k}
                  onClick={() => setTweaks({ ...tweaks, theme: k })}
                  style={{
                    flex: 1, padding: '6px 4px', borderRadius: 6,
                    background: tweaks.theme === k ? T.accentSoft : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${tweaks.theme === k ? T.accentRim : T.border}`,
                    color: tweaks.theme === k ? T.accent : T.textDim,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                    cursor: 'pointer', textTransform: 'uppercase',
                  }}>{v.name}</button>
              ))}
            </div>
          </Row>
          <div style={{ fontSize: 10, color: T.textMuted, lineHeight: 1.4, marginTop: -4 }}>
            {THEMES[tweaks.theme].subtitle}
          </div>
          <Row label="Phase" T={T}>
            <select value={tweaks.phase} onChange={e => setTweaks({ ...tweaks, phase: e.target.value })}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.04)',
                color: T.text, border: `1px solid ${T.border}`,
                borderRadius: 6, padding: '5px 8px', fontSize: 11,
                fontFamily: 'inherit', outline: 'none',
              }}>
              {['preflop','flop','turn','river','showdown'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Row>
          <Toggle label="BB View"        T={T} value={tweaks.bbView}        onChange={v => setTweaks({...tweaks, bbView: v})}/>
          <Toggle label="Show Equity"    T={T} value={tweaks.equityVisible} onChange={v => setTweaks({...tweaks, equityVisible: v})}/>
          <Toggle label="Bet Trails"     T={T} value={tweaks.showBetTrails} onChange={v => setTweaks({...tweaks, showBetTrails: v})}/>
          <Toggle label="Coach Strip"    T={T} value={tweaks.showCoachStrip} onChange={v => setTweaks({...tweaks, showCoachStrip: v})}/>
        </div>
      )}
    </div>
  );
}
function Row({ label, T, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.16em', fontWeight: 700 }}>{label.toUpperCase()}</span>
      {children}
    </div>
  );
}
function Toggle({ label, T, value, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
      <span style={{ fontSize: 11, color: T.textDim }}>{label}</span>
      <button onClick={() => onChange(!value)} style={{
        width: 32, height: 18, borderRadius: 999,
        background: value ? T.accent : 'rgba(255,255,255,0.08)',
        border: `1px solid ${value ? T.accentRim : T.border}`,
        position: 'relative', cursor: 'pointer', transition: 'all 150ms',
      }}>
        <span style={{
          position: 'absolute', top: 1, left: value ? 15 : 1,
          width: 14, height: 14, borderRadius: '50%',
          background: value ? '#111' : T.textDim,
          transition: 'all 150ms',
        }}/>
      </button>
    </label>
  );
}

function App() {
  const [tweaks, setTweaks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feltside_tweaks')) || TWEAKS; }
    catch { return TWEAKS; }
  });
  useEffect(() => { localStorage.setItem('feltside_tweaks', JSON.stringify(tweaks)); }, [tweaks]);

  // Edit-mode host integration
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode')   window.__EDIT = true;
      if (e.data?.type === '__deactivate_edit_mode') window.__EDIT = false;
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  const T = THEMES[tweaks.theme] ?? THEMES.velvet;

  // phase drives board length
  const gameState = useMemo(() => {
    const boardsByPhase = {
      preflop:  [],
      flop:     ['7c', '7d', '5h'],
      turn:     ['7c', '7d', '5h', '3s'],
      river:    ['7c', '7d', '5h', '3s', 'Kh'],
      showdown: ['7c', '7d', '5h', '3s', 'Kh'],
    };
    const base = makeGameState({
      phase: tweaks.phase,
      board: boardsByPhase[tweaks.phase] ?? [],
    });
    if (tweaks.phase === 'showdown') {
      base.showdown_result = {
        winners: [{ playerId: 'me', playerName: 'Ariela Simantov' }],
        handByPlayer: {
          'me': 'Two Pair, Aces and Sevens',
          'p2': 'Pair of Sevens, A High',
          'p4': 'Pair of Sevens, Q High',
          'p5': 'Pair of Sevens, T High',
          'p6': 'Pair of Sevens, 9 High',
        },
      };
    }
    return base;
  }, [tweaks.phase]);

  const handleAction = (action, amount) => {
    console.log('place_bet', { action, amount });
    // In real app: socket.emit('place_bet', { action, amount })
  };

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: T.bg,
      color: T.text,
    }}>
      <TopBar T={T} tweaks={tweaks} setTweaks={setTweaks}/>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {tweaks.showCoachStrip && <CoachStrip T={T} gameState={gameState}/>}
        <PokerTable
          gameState={gameState}
          myId={MOCK_HERO_ID}
          T={T}
          onAction={handleAction}
          bbView={tweaks.bbView}
          equityVisible={tweaks.equityVisible}
          tableShape={T.tableShape}
          showBetTrails={tweaks.showBetTrails}
        />
      </div>
      <TweaksPanel tweaks={tweaks} setTweaks={setTweaks} T={T}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
