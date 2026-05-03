/* ── BettingBar.jsx ─────────────────────────────────────────────────────────
   Command bar floating above the hero seat. Redesign goals:
    • Clear hierarchy: FOLD (quiet red), CHECK/CALL (neutral), RAISE (accent)
    • Bet slider uses a chunky tick-mark rail with pot-fraction presets as
      sticky anchors — feels like a telemetry dial
    • Live "to call" and "stack-after-action" readouts so decisions are grounded
─────────────────────────────────────────────────────────────────────────── */

function BettingBar({ gameState, myId, T, onAction, bbView, bigBlind }) {
  const me = gameState.players.find(p => p.id === myId);
  const isMyTurn = gameState.current_turn === myId && ['preflop','flop','turn','river'].includes(gameState.phase);

  const stack = me?.stack ?? 0;
  const playerBet = me?.total_bet_this_round ?? 0;
  const currentBet = gameState.current_bet ?? 0;
  const minRaise = gameState.min_raise ?? currentBet;
  const toCall = Math.max(0, currentBet - playerBet);
  const pot = gameState.pot ?? 0;
  const canCheck = toCall === 0;

  const raiseMin = Math.min(currentBet + minRaise, stack + playerBet);
  const raiseMax = stack + playerBet;

  const [raise, setRaise] = React.useState(raiseMin);
  const [panel, setPanel] = React.useState(false);

  React.useEffect(() => { setRaise(raiseMin); }, [raiseMin]);

  const fmt = (n) => bbView ? `${(n/bigBlind).toFixed(n/bigBlind < 10 ? 1 : 0)}bb` : n.toLocaleString();

  if (!isMyTurn) return null;

  const presets = [
    { label: '⅓', val: Math.round(pot / 3) },
    { label: '½', val: Math.round(pot / 2) },
    { label: '¾', val: Math.round(pot * 0.75) },
    { label: 'POT', val: pot },
    { label: '2×', val: pot * 2 },
  ].filter(p => p.val >= raiseMin && p.val <= raiseMax);

  return (
    <div style={{
      position: 'absolute',
      left: '50%', bottom: 24,
      transform: 'translateX(-50%)',
      width: 'min(680px, 92%)',
      zIndex: 40,
      pointerEvents: 'auto',
      animation: 'chipRise 280ms cubic-bezier(.2,.8,.2,1)',
    }}>
      <div style={{
        background: T.surface2,
        border: `1px solid ${T.borderStrong}`,
        borderRadius: 18,
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        boxShadow: '0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
        overflow: 'hidden',
      }}>
        {/* Header row — stack · to call · projected */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: `1px solid ${T.border}`,
        }}>
          <Stat T={T} label="STACK"       value={fmt(stack)} />
          <Stat T={T} label="POT"         value={fmt(pot)}    color={T.accent}/>
          {toCall > 0 && <Stat T={T} label="TO CALL"     value={fmt(toCall)} color={T.info}/>}
          {panel && <Stat T={T} label="IF RAISE"    value={fmt(raise - playerBet)} color={T.warning}/>}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.24em',
            color: T.accent,
            padding: '4px 10px', borderRadius: 999,
            background: T.accentSoft, border: `1px solid ${T.accentRim}`,
            animation: 'shimmer 1.6s ease-in-out infinite',
          }}>YOUR TURN</div>
        </div>

        {/* Raise panel */}
        {panel && (
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            {/* Presets */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {presets.map(p => (
                <button key={p.label}
                  onClick={() => setRaise(p.val)}
                  style={{
                    flex: 1, padding: '8px 4px', borderRadius: 8,
                    background: raise === p.val ? T.accentSoft : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${raise === p.val ? T.accentRim : T.border}`,
                    color: raise === p.val ? T.accent : T.textDim,
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                    cursor: 'pointer', transition: 'all 140ms',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                  <span>{p.label}</span>
                  <span style={{ fontSize: 9, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{fmt(p.val)}</span>
                </button>
              ))}
              <button
                onClick={() => setRaise(raiseMax)}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8,
                  background: raise === raiseMax ? `${T.violet}22` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${raise === raiseMax ? T.violet + '80' : T.border}`,
                  color: raise === raiseMax ? T.violet : T.textDim,
                  fontSize: 12, fontWeight: 700, letterSpacing: '0.05em',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                <span>ALL-IN</span>
                <span style={{ fontSize: 9, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{fmt(raiseMax)}</span>
              </button>
            </div>
            {/* Slider + input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <input type="range" min={raiseMin} max={raiseMax} step={1}
                value={raise}
                onChange={e => setRaise(Number(e.target.value))}
                style={{
                  flex: 1, height: 4, borderRadius: 2, appearance: 'none',
                  background: `linear-gradient(to right, ${T.accent} 0%, ${T.accent} ${((raise-raiseMin)/(raiseMax-raiseMin))*100}%, ${T.border} ${((raise-raiseMin)/(raiseMax-raiseMin))*100}%)`,
                  outline: 'none', cursor: 'pointer',
                }}/>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${T.border}`, borderRadius: 8,
                padding: '6px 10px', minWidth: 120,
              }}>
                <span style={{ color: T.textMuted, fontSize: 11 }}>♦</span>
                <input type="number" min={raiseMin} max={raiseMax} value={raise}
                  onChange={e => setRaise(Math.max(raiseMin, Math.min(raiseMax, Number(e.target.value))))}
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: T.text, fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 14, fontWeight: 700, textAlign: 'right',
                    minWidth: 0,
                  }}/>
              </div>
            </div>
            <style>{`
              input[type='range']::-webkit-slider-thumb {
                -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%;
                background: ${T.accent}; border: 2px solid ${T.bg};
                box-shadow: 0 0 0 2px ${T.accentRim}, 0 2px 6px rgba(0,0,0,0.5);
                cursor: pointer;
              }
              input[type='range']::-moz-range-thumb {
                width: 18px; height: 18px; border-radius: 50%;
                background: ${T.accent}; border: 2px solid ${T.bg};
                box-shadow: 0 0 0 2px ${T.accentRim};
                cursor: pointer;
              }
            `}</style>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, padding: 12 }}>
          <ActionBtn T={T} variant="ghost" onClick={() => onAction('fold')}>FOLD</ActionBtn>
          {canCheck
            ? <ActionBtn T={T} variant="neutral" onClick={() => onAction('check')}>CHECK</ActionBtn>
            : <ActionBtn T={T} variant="neutral" onClick={() => onAction('call')}>
                CALL <span style={{ opacity: 0.7, fontWeight: 500, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(toCall)}</span>
              </ActionBtn>
          }
          {raiseMax > raiseMin && (
            <ActionBtn T={T} variant="accent"
              onClick={() => panel ? onAction('raise', raise) : setPanel(true)}>
              {panel ? <>RAISE <span style={{ opacity: 0.8, fontWeight: 600, marginLeft: 6, fontFamily: "'JetBrains Mono', monospace" }}>{fmt(raise)}</span></> : 'RAISE'}
            </ActionBtn>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ T, label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: '0.18em', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color || T.text, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  );
}

function ActionBtn({ T, variant, onClick, children }) {
  const styles = {
    ghost:   { bg: 'rgba(255,107,107,0.08)', bd: `${T.danger}44`, fg: T.danger,
               bgHover: 'rgba(255,107,107,0.16)' },
    neutral: { bg: 'rgba(255,255,255,0.05)', bd: T.border, fg: T.text,
               bgHover: 'rgba(255,255,255,0.09)' },
    accent:  { bg: `linear-gradient(180deg, ${T.accent}, ${T.chipEdge})`, bd: T.accentRim, fg: '#111',
               bgHover: `linear-gradient(180deg, ${T.accent}, ${T.accent})` },
  }[variant];
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        flex: 1, padding: '14px 10px',
        borderRadius: 12,
        background: h ? styles.bgHover : styles.bg,
        border: `1px solid ${styles.bd}`,
        color: styles.fg,
        fontSize: 13, fontWeight: 800, letterSpacing: '0.12em',
        cursor: 'pointer',
        transition: 'all 150ms',
        boxShadow: variant === 'accent' ? `0 8px 24px -6px ${T.accentRim}` : 'none',
        transform: h ? 'translateY(-1px)' : 'translateY(0)',
      }}>
      {children}
    </button>
  );
}

window.BettingBar = BettingBar;
