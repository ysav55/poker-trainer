/* ── PlayerSeat.jsx ─────────────────────────────────────────────────────────
   Reimagined seat pod. Key moves:
    • Avatar disc with initials (replaces anonymous dim text)
    • Stack as bold mono number + tiny BB line ("247 · 123bb")
    • Action badge morphs into a colored pill that slides up
    • Bet chip uses a real stack visual (pip count scaled to amount)
    • Action timer is a top-arc around the avatar, not a ring around the card
    • Current-turn state lights the whole pod with a soft accent wash
─────────────────────────────────────────────────────────────────────────── */

const ACTION_PILL = (T) => ({
  fold:    { label: 'FOLD',   bg: `rgba(255,107,107,0.12)`, bd: `${T.danger}55`, fg: T.danger },
  folded:  { label: 'FOLD',   bg: `rgba(255,107,107,0.12)`, bd: `${T.danger}55`, fg: T.danger },
  check:   { label: 'CHECK',  bg: `rgba(255,255,255,0.04)`, bd: T.border,         fg: T.textDim },
  checked: { label: 'CHECK',  bg: `rgba(255,255,255,0.04)`, bd: T.border,         fg: T.textDim },
  call:    { label: 'CALL',   bg: `${T.info}18`,             bd: `${T.info}55`,    fg: T.info },
  called:  { label: 'CALL',   bg: `${T.info}18`,             bd: `${T.info}55`,    fg: T.info },
  raise:   { label: 'RAISE',  bg: `${T.accent}20`,           bd: `${T.accentRim}`, fg: T.accent },
  raised:  { label: 'RAISE',  bg: `${T.accent}20`,           bd: `${T.accentRim}`, fg: T.accent },
  bet:     { label: 'BET',    bg: `${T.accent}20`,           bd: `${T.accentRim}`, fg: T.accent },
  'all-in':{ label: 'ALL-IN', bg: `${T.violet}22`,           bd: `${T.violet}60`,  fg: T.violet },
  allin:   { label: 'ALL-IN', bg: `${T.violet}22`,           bd: `${T.violet}60`,  fg: T.violet },
});

function initials(name) {
  return (name || '')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0]).join('').toUpperCase();
}

function Avatar({ player, size = 46, T, isTurn, timerPct }) {
  const ring = timerPct != null ? timerPct : null;
  const radius = (size / 2) - 3;
  const c = 2 * Math.PI * radius;
  const color = ring == null ? null : ring > 50 ? T.positive : ring > 25 ? T.warning : T.danger;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: `linear-gradient(135deg, ${player.avatar}, ${player.avatar}88)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'General Sans', sans-serif", fontWeight: 700,
        fontSize: size * 0.34, color: '#fff',
        letterSpacing: '-0.02em',
        boxShadow: `inset 0 -8px 14px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.4)`,
        border: `2px solid ${isTurn ? T.accent : 'rgba(255,255,255,0.14)'}`,
        transition: 'border-color 300ms',
      }}>
        {initials(player.name)}
      </div>
      {ring != null && (
        <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none"
            stroke={color} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - ring/100)}
            style={{ transition: 'stroke-dashoffset 100ms linear, stroke 250ms' }}/>
        </svg>
      )}
      {player.is_dealer && (
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 18, height: 18, borderRadius: '50%',
          background: T.accent, color: '#141214',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `2px solid ${T.bg.startsWith('#f') ? '#fff' : '#0a0a10'}`,
          boxShadow: `0 0 0 1px ${T.accentRim}, 0 0 10px ${T.accentRim}`,
        }}>D</span>
      )}
    </div>
  );
}

function BetChip({ amount, bigBlind, bbView, T, position }) {
  if (!amount) return null;
  const bb = amount / bigBlind;
  // count chips to stack: 1..6 based on amount, log scale
  const stackCount = Math.max(1, Math.min(6, Math.ceil(Math.log2(bb + 1))));
  const chips = Array.from({ length: stackCount });
  const label = bbView ? `${bb.toFixed(bb < 10 ? 1 : 0)}bb` : amount.toLocaleString();
  return (
    <div style={{
      position: 'absolute',
      ...position,
      display: 'flex', alignItems: 'center', gap: 8,
      animation: 'chipRise 260ms cubic-bezier(.2,.8,.2,1)',
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', width: 22, height: 22 + stackCount * 2 }}>
        {chips.map((_, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, bottom: i * 2,
            width: 22, height: 8, borderRadius: '50%',
            background: `radial-gradient(ellipse at 40% 30%, ${T.chipCore}, ${T.chipEdge})`,
            border: `1px solid rgba(0,0,0,0.5)`,
            boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}/>
        ))}
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, fontWeight: 600,
        color: T.accent,
        background: 'rgba(0,0,0,0.55)',
        padding: '2px 7px', borderRadius: 999,
        border: `1px solid ${T.accentRim}`,
        whiteSpace: 'nowrap',
      }}>{label}</span>
    </div>
  );
}

function PlayerSeat({
  player, T, isCurrentTurn, isMe, isWinner, showdownResult,
  actionTimerPct, equity, equityVisible, bbView, bigBlind,
  seatStyle, stackBasis = 'chips',
}) {
  const isFolded = !player.in_hand || player.action === 'fold' || player.action === 'folded';
  const showCards = isMe || (showdownResult && !isFolded);
  const actionKey = player.action?.toLowerCase?.();
  const actionPill = actionKey ? ACTION_PILL(T)[actionKey] : null;

  const stackBB = (player.stack / bigBlind).toFixed(stackBasis === 'bb' ? 1 : 0);
  const stackText = bbView ? `${stackBB}bb` : player.stack.toLocaleString();
  const subStack = bbView ? player.stack.toLocaleString() : `${stackBB}bb`;

  return (
    <div style={{
      position: 'absolute', ...seatStyle,
      transform: 'translate(-50%, -50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      width: 168, pointerEvents: 'auto',
      opacity: isFolded ? 0.38 : player.disconnected ? 0.55 : 1,
      transition: 'opacity 280ms',
      filter: isFolded ? 'grayscale(0.6)' : 'none',
    }}>
      {/* Hole cards — above the pod */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: -12,
        filter: isFolded ? 'blur(0.5px)' : 'none',
      }}>
        {[0, 1].map(i => {
          const c = player.hole_cards?.[i];
          const hidden = !showCards || c === 'HIDDEN';
          return (
            <Card key={i}
              card={c}
              hidden={hidden}
              size="sm"
              theme={T}
              flipDelay={i * 60}
              style={{
                transform: `rotate(${i === 0 ? -6 : 6}deg) translateY(${i === 0 ? 0 : 2}px)`,
              }}
            />
          );
        })}
      </div>

      {/* Pod */}
      <div style={{
        width: '100%',
        padding: '18px 10px 10px',
        borderRadius: 14,
        background: isCurrentTurn
          ? `linear-gradient(180deg, ${T.accentSoft}, ${T.surface})`
          : T.surface,
        border: `1px solid ${isCurrentTurn ? T.accentRim : isWinner ? T.accent : T.border}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: isWinner
          ? `0 0 0 1px ${T.accent}, 0 0 40px -5px ${T.accentRim}, 0 8px 24px rgba(0,0,0,0.5)`
          : isCurrentTurn
            ? `0 12px 30px -10px ${T.accentRim}, 0 4px 14px rgba(0,0,0,0.45)`
            : '0 4px 14px rgba(0,0,0,0.45)',
        position: 'relative',
        transition: 'box-shadow 300ms, border-color 300ms',
      }}>
        {/* Avatar — overlaps top */}
        <div style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)' }}>
          <Avatar player={player} size={44} T={T} isTurn={isCurrentTurn} timerPct={isCurrentTurn ? actionTimerPct : null}/>
        </div>

        {/* Blind marker row (top-right, small) */}
        <div style={{ position: 'absolute', top: 6, right: 8, display: 'flex', gap: 3 }}>
          {player.is_small_blind && <BlindDot T={T} label="SB"/>}
          {player.is_big_blind   && <BlindDot T={T} label="BB"/>}
          {player.is_bot && <BlindDot T={T} label="BOT" variant="muted"/>}
        </div>

        {/* Name */}
        <div style={{
          marginTop: 4,
          fontSize: 12, fontWeight: 600,
          color: T.text, textAlign: 'center',
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {player.name}
          {isMe && <span style={{ color: T.accent, marginLeft: 6, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>YOU</span>}
        </div>

        {/* Stack — big mono + subline */}
        <div style={{
          marginTop: 6,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16, fontWeight: 700, lineHeight: 1,
            color: player.stack === 0 ? T.textMuted : T.text,
            letterSpacing: '-0.03em',
          }}>
            {stackText}
          </div>
          <div style={{
            fontSize: 9, color: T.textMuted,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.04em',
          }}>
            {subStack}
          </div>
        </div>

        {/* Equity bar (thin strip bottom) */}
        {equityVisible && equity != null && (
          <div style={{
            marginTop: 8, width: '100%', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              width: `${equity}%`, height: '100%',
              background: equity > 55 ? T.positive : equity > 30 ? T.warning : T.danger,
              boxShadow: `0 0 8px currentColor`,
              transition: 'width 400ms',
            }}/>
            <span style={{
              position: 'absolute', right: 4, top: -14,
              fontSize: 9, fontWeight: 700,
              fontFamily: "'JetBrains Mono', monospace",
              color: equity > 55 ? T.positive : equity > 30 ? T.warning : T.danger,
            }}>{equity}%</span>
          </div>
        )}

        {/* Showdown hand rank */}
        {showdownResult && !isFolded && showdownResult.handByPlayer?.[player.id] && (
          <div style={{
            marginTop: 8, fontSize: 10, fontWeight: 600,
            color: isWinner ? T.accent : T.textDim,
            textAlign: 'center', letterSpacing: '0.02em',
          }}>{showdownResult.handByPlayer[player.id]}</div>
        )}
      </div>

      {/* Action pill below */}
      {actionPill && (
        <div style={{
          marginTop: 6,
          padding: '3px 10px',
          borderRadius: 999,
          background: actionPill.bg,
          border: `1px solid ${actionPill.bd}`,
          color: actionPill.fg,
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
        }}>{actionPill.label}</div>
      )}

      {/* Bet chip — visually toward table center */}
    </div>
  );
}

function BlindDot({ T, label, variant }) {
  const dim = variant === 'muted';
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.12em',
      padding: '2px 5px', borderRadius: 4, lineHeight: 1,
      background: dim ? 'rgba(255,255,255,0.04)' : T.accentSoft,
      color:      dim ? T.textMuted : T.accent,
      border:     `1px solid ${dim ? T.border : T.accentRim}`,
    }}>{label}</span>
  );
}

window.PlayerSeat = PlayerSeat;
window.BetChip = BetChip;
