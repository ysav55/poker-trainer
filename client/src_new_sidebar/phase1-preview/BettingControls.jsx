const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;
const fmtChips = window.__fmtChips;
const apiFetch = window.__apiFetch;
const EquityBadge = window.__EquityBadge;
const SharedRangeOverlay = window.__SharedRangeOverlay;
const PlayerRangePanel = window.__PlayerRangePanel;



/**
 * BettingControls — drop-in replacement for client/src/components/BettingControls.jsx.
 * Props preserved 1:1. Action emissions unchanged: emit.placeBet('fold'|'check'|'call'|'raise', amount).
 *
 * Visual redesign:
 *   - Floating glass command bar, 520px wide, lifts up when it's your turn
 *   - Readout chips for stack / pot / to-call / equity
 *   - Pot-fraction presets as segmented chips
 *   - Slider with accent-rim thumb; live "Raise to X (Y BB)" readout
 *   - Three color-keyed primary buttons: fold (rouge), check/call (steel), raise (amber)
 */

const ACTIVE_PHASES = new Set(['preflop', 'flop', 'turn', 'river']);
const ACCENT       = '#c9a35d';
const ACCENT_DIM   = 'rgba(201,163,93,0.5)';
const ACCENT_FAINT = 'rgba(201,163,93,0.15)';
const INK          = '#f0ece3';
const INK_DIM      = 'rgba(240,236,227,0.6)';
const PANEL_BG     = 'linear-gradient(180deg, rgba(8,10,16,0.97) 0%, rgba(14,18,26,0.98) 100%)';

function BettingControls({
  gameState,
  myId,
  isCoach,
  emit,
  bbView = false,
  bigBlind = 10,
  equityData = null,
}) {
  const fmt = (v) => fmtChips(v ?? 0, bigBlind, bbView);
  const player = gameState?.players?.find(p => p.id === myId) ?? null;

  const isMyTurn =
    gameState &&
    ACTIVE_PHASES.has(gameState.phase) &&
    !gameState.paused &&
    player && gameState.current_turn === myId;

  const currentBet = gameState?.current_bet ?? 0;
  const minRaise   = gameState?.min_raise ?? currentBet;
  const pot        = gameState?.pot ?? 0;
  const stack      = player?.stack ?? 0;
  const betThisRound = player?.total_bet_this_round ?? 0;
  const toCall = Math.max(0, currentBet - betThisRound);

  const raiseMin = currentBet + minRaise;
  const raiseMax = stack + betThisRound;
  const effMin   = Math.min(raiseMin, raiseMax);

  const [raiseAmount, setRaiseAmount] = useState(effMin);
  const [showRaise, setShowRaise] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => { setPending(false); }, [gameState]);
  useEffect(() => {
    if (!isMyTurn) { setPending(false); setShowRaise(false); }
  }, [isMyTurn]);

  useEffect(() => {
    if (isMyTurn) {
      setRaiseAmount(effMin);
      setShowRaise(false);
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [isMyTurn, effMin]);

  const clamp = (v) => Math.max(effMin, Math.min(raiseMax, Number(v)));
  const onRaiseChange = useCallback((v) => setRaiseAmount(clamp(v)), [effMin, raiseMax]);
  const onQuickRaise  = useCallback((v) => setRaiseAmount(clamp(Math.floor(v))), [effMin, raiseMax]);

  const handleFold  = () => { setPending(true); emit.placeBet('fold'); };
  const handleCheck = () => { setPending(true); emit.placeBet('check'); };
  const handleCall  = () => { setPending(true); emit.placeBet('call'); };
  const handleRaise = () => {
    if (!showRaise) { setShowRaise(true); return; }
    setPending(true);
    emit.placeBet('raise', raiseAmount);
  };

  if (!isMyTurn) return null;

  const canCheck = toCall === 0;
  const canRaise = raiseMax > effMin;
  const isAllIn  = raiseAmount >= raiseMax;
  const raiseValid = raiseAmount >= effMin && raiseAmount <= raiseMax;

  const thirdPot = Math.round(pot / 3);
  const halfPot  = Math.round(pot / 2);
  const threeQP  = Math.round(pot * 0.75);
  const onePot   = pot;
  const twoPot   = pot * 2;
  const presets = [
    { label: '⅓',  value: thirdPot },
    { label: '½',  value: halfPot  },
    { label: '¾',  value: threeQP  },
    { label: 'Pot',value: onePot   },
    { label: '2×', value: twoPot   },
  ].filter(p => p.value >= effMin && p.value <= raiseMax);

  const myEquity = equityData?.showToPlayers
    ? (equityData?.equities?.find(e => e.playerId === player?.stableId || e.playerId === myId)?.equity ?? null)
    : null;
  const equityColor = myEquity == null ? INK_DIM : myEquity > 55 ? '#22c55e' : myEquity > 40 ? '#f59e0b' : '#ef4444';

  const sliderPct = raiseMax > effMin
    ? ((raiseAmount - effMin) / (raiseMax - effMin)) * 100
    : 100;
  const raiseBB = bigBlind > 0 ? (raiseAmount / bigBlind).toFixed(1) : null;

  return (
    <div style={{
      width: '100%',
      display: 'flex', justifyContent: 'center',
      transition: 'transform 340ms cubic-bezier(.2,.8,.2,1), opacity 280ms',
      transform: visible ? 'translateY(0)' : 'translateY(100%)',
      opacity: visible ? 1 : 0,
    }}>
      <div style={{ width: 'min(560px, 96vw)' }}>
        <div style={{
          background: PANEL_BG,
          border: `1px solid ${ACCENT_FAINT}`,
          borderBottom: 'none',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          boxShadow: '0 -8px 40px rgba(0,0,0,0.75), 0 -1px 0 rgba(201,163,93,0.08)',
          overflow: 'hidden',
        }}>

          {/* Readout row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 16px 8px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <Readout label="Stack" value={fmt(stack)} color={INK} />
              <Divider />
              <Readout label="Pot" value={fmt(pot)} color={ACCENT} />
              {toCall > 0 && (<>
                <Divider />
                <Readout label="To Call" value={fmt(toCall)} color="#93c5fd" />
              </>)}
              {showRaise && canRaise && (<>
                <Divider />
                <Readout
                  label="If Raise"
                  value={fmt(raiseAmount)}
                  sub={raiseBB != null ? `${raiseBB} BB` : null}
                  color={isAllIn ? '#d8b4fe' : ACCENT}
                />
              </>)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <span style={{
                fontFamily: "'General Sans', 'Inter', sans-serif",
                fontSize: 9, fontWeight: 700, letterSpacing: '0.3em',
                color: ACCENT_DIM,
              }}>YOUR TURN</span>
              {myEquity != null && (
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11, fontWeight: 700, color: equityColor,
                }}>EQ {myEquity}%</span>
              )}
            </div>
          </div>

          {/* Raise panel */}
          {showRaise && canRaise && (
            <div style={{
              padding: '11px 16px 10px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              background: 'rgba(201,163,93,0.03)',
            }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 11 }}>
                {presets.map(p => (
                  <PresetChip
                    key={p.label}
                    label={p.label}
                    sub={fmt(p.value)}
                    onClick={() => onQuickRaise(p.value)}
                    active={raiseAmount === p.value}
                  />
                ))}
                <PresetChip
                  label="ALL-IN"
                  sub={fmt(raiseMax)}
                  onClick={() => onQuickRaise(raiseMax)}
                  danger
                  active={raiseAmount >= raiseMax}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <input
                  type="range"
                  min={effMin} max={raiseMax} step={1}
                  value={raiseAmount}
                  onChange={(e) => onRaiseChange(e.target.value)}
                  className="pt-raise-slider"
                  style={{
                    flex: 1, height: 3, borderRadius: 999,
                    appearance: 'none', cursor: 'pointer',
                    background: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${sliderPct}%, rgba(255,255,255,0.12) ${sliderPct}%, rgba(255,255,255,0.12) 100%)`,
                  }}
                />
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '4px 8px', borderRadius: 6, minWidth: 90,
                  background: 'rgba(0,0,0,0.45)',
                  border: `1px solid ${ACCENT_FAINT}`,
                }}>
                  <span style={{ color: INK_DIM, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>$</span>
                  <input
                    type="number"
                    min={effMin} max={raiseMax} value={raiseAmount}
                    onChange={(e) => onRaiseChange(e.target.value)}
                    style={{
                      width: '100%', background: 'transparent', border: 'none',
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13, fontWeight: 700, color: INK,
                      textAlign: 'right', outline: 'none',
                      appearance: 'textfield',
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex', justifyContent: 'space-between', marginTop: 6,
                fontSize: 9, color: INK_DIM, fontFamily: "'JetBrains Mono', monospace",
                letterSpacing: '0.05em',
              }}>
                <span>min {fmt(effMin)}</span>
                {isAllIn && (
                  <span style={{ color: '#d8b4fe', fontWeight: 700, letterSpacing: '0.2em' }}>ALL-IN</span>
                )}
                <span>max {fmt(raiseMax)}</span>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, padding: '12px 16px' }}>
            <ActionButton
              label="FOLD" tone="rouge"
              disabled={pending}
              onClick={handleFold}
            />
            {canCheck ? (
              <ActionButton
                label="CHECK" tone="steel"
                disabled={pending}
                onClick={handleCheck}
              />
            ) : (
              <ActionButton
                label={`CALL ${fmt(toCall)}`} tone="steel"
                disabled={pending}
                onClick={handleCall}
              />
            )}
            {canRaise && (
              <ActionButton
                label={showRaise ? `RAISE ${fmt(raiseAmount)}${isAllIn ? ' · ALL-IN' : ''}` : 'RAISE'}
                tone="amber"
                active={showRaise}
                disabled={pending || (showRaise && !raiseValid)}
                onClick={handleRaise}
              />
            )}
          </div>

          <style>{`
            .pt-raise-slider::-webkit-slider-thumb {
              -webkit-appearance: none; appearance: none;
              width: 16px; height: 16px; border-radius: 50%;
              background: #f0d060; cursor: pointer;
              border: 2px solid ${ACCENT};
              box-shadow: 0 0 0 3px rgba(201,163,93,0.12), 0 0 10px rgba(201,163,93,0.55);
              transition: transform 120ms;
            }
            .pt-raise-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
            .pt-raise-slider::-moz-range-thumb {
              width: 16px; height: 16px; border-radius: 50%;
              background: #f0d060; cursor: pointer;
              border: 2px solid ${ACCENT};
              box-shadow: 0 0 0 3px rgba(201,163,93,0.12), 0 0 10px rgba(201,163,93,0.55);
            }
          `}</style>
        </div>
      </div>
    </div>
  );
}

function Readout({ label, value, sub, color = INK }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{
        fontFamily: "'General Sans', sans-serif",
        fontSize: 9, fontWeight: 600, letterSpacing: '0.22em',
        color: INK_DIM, textTransform: 'uppercase',
      }}>{label}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13, fontWeight: 700,
        color, lineHeight: 1,
      }}>{value}</span>
      {sub && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 8, color: INK_DIM, marginTop: 1,
        }}>{sub}</span>
      )}
    </div>
  );
}

function Divider() {
  return <span style={{
    width: 1, height: 26,
    background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.12), transparent)',
  }}/>;
}

function PresetChip({ label, sub, onClick, active = false, danger = false }) {
  const bd = danger
    ? 'rgba(239,68,68,0.45)'
    : active ? ACCENT : ACCENT_FAINT;
  const bg = active
    ? 'rgba(201,163,93,0.18)'
    : danger ? 'rgba(127,29,29,0.15)' : 'rgba(0,0,0,0.35)';
  const fg = danger ? '#fca5a5' : ACCENT;
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '6px 8px',
        borderRadius: 8,
        background: bg,
        border: `1px solid ${bd}`,
        color: fg,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        cursor: 'pointer',
        transition: 'all 120ms',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = danger ? 'rgba(127,29,29,0.3)' : 'rgba(201,163,93,0.1)';
          e.currentTarget.style.borderColor = danger ? 'rgba(239,68,68,0.7)' : ACCENT_DIM;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = bg;
          e.currentTarget.style.borderColor = bd;
        }
      }}
    >
      <span style={{
        fontFamily: "'General Sans', sans-serif",
        fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1,
      }}>{label}</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, color: INK_DIM, lineHeight: 1,
      }}>{sub}</span>
    </button>
  );
}

function ActionButton({ label, tone, onClick, disabled = false, active = false }) {
  const PALETTES = {
    rouge: { bg: 'rgba(127,29,29,0.5)',  bd: 'rgba(185,28,28,0.55)',  fg: '#fca5a5', glow: 'rgba(220,38,38,0.25)' },
    steel: { bg: 'rgba(30,58,138,0.55)', bd: 'rgba(59,130,246,0.5)',  fg: '#93c5fd', glow: 'rgba(59,130,246,0.25)' },
    amber: { bg: 'rgba(161,98,7,0.55)',  bd: 'rgba(217,119,6,0.6)',   fg: '#fde68a', glow: 'rgba(201,163,93,0.35)' },
  };
  const p = PALETTES[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: '11px 12px',
        borderRadius: 8,
        background: active ? `linear-gradient(180deg, ${p.bg}, rgba(0,0,0,0.2))` : p.bg,
        border: `1px solid ${active ? p.fg : p.bd}`,
        color: p.fg,
        fontFamily: "'General Sans', sans-serif",
        fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        boxShadow: active ? `0 0 0 1px ${p.fg}, 0 0 16px ${p.glow}` : `0 2px 6px rgba(0,0,0,0.4)`,
        transition: 'all 140ms',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = `0 0 0 1px ${p.fg}, 0 4px 14px ${p.glow}`;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = active ? `0 0 0 1px ${p.fg}, 0 0 16px ${p.glow}` : `0 2px 6px rgba(0,0,0,0.4)`;
        }
      }}
    >
      {label}
    </button>
  );
}

;window.P1_BettingControls = BettingControls;
