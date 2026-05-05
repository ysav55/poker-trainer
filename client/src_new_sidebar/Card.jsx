/* ── Card.jsx ───────────────────────────────────────────────────────────────
   Rebuilt playing card. Same card string format as real app ("As", "Td",
   "HIDDEN"). Modern typography (stacked rank/suit in corner), confident
   center pip, subtle paper texture via gradient + inset hairline.
─────────────────────────────────────────────────────────────────────────── */

const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const SUIT_CHAR    = { h: '♥', d: '♦', c: '♣', s: '♠' };
const IS_RED       = { h: true, d: true, c: false, s: false };

function parseCardStr(card) {
  if (!card || card === 'HIDDEN') return null;
  const r = card[0], s = card[1];
  return {
    rank: RANK_DISPLAY[r] ?? r,
    suit: SUIT_CHAR[s] ?? s,
    red:  !!IS_RED[s],
  };
}

function Card({ card, hidden = false, size = 'md', theme, pending = false, dimmed = false, style = {}, flipDelay = 0 }) {
  const T = theme;
  const isFaceDown = hidden || card === 'HIDDEN' || !card;
  const parsed = isFaceDown ? null : parseCardStr(card);

  const dims = {
    xs: { w: 30, h: 42, rank: 11, suitCorner: 8,  pip: 18, pad: 3 },
    sm: { w: 40, h: 56, rank: 14, suitCorner: 10, pip: 24, pad: 4 },
    md: { w: 56, h: 80, rank: 20, suitCorner: 14, pip: 40, pad: 6 },
    lg: { w: 72, h: 104, rank: 26, suitCorner: 18, pip: 54, pad: 8 },
  }[size];

  const wrapStyle = {
    width: dims.w, height: dims.h,
    borderRadius: 8,
    position: 'relative',
    flexShrink: 0,
    userSelect: 'none',
    transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), opacity 200ms',
    opacity: dimmed ? 0.35 : 1,
    ...style,
  };

  if (isFaceDown) {
    return (
      <div style={{
        ...wrapStyle,
        background: T.cardBack,
        border: `1px solid ${T.borderStrong}`,
        boxShadow: '0 6px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* diagonal micro-pattern */}
        <div style={{
          position: 'absolute', inset: 4, borderRadius: 5,
          background:
            'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px),' +
            'repeating-linear-gradient(-45deg, currentColor 0 1px, transparent 1px 7px)',
          color: T.cardBackInk, opacity: 0.25,
        }}/>
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 6,
          border: `1px solid ${T.cardBackInk}`, opacity: 0.4,
        }}/>
        {/* Monogram */}
        <span style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: size === 'lg' ? 32 : size === 'md' ? 24 : 16,
          fontStyle: 'italic',
          color: T.cardBackInk,
          letterSpacing: '-0.04em',
        }}>FS</span>
      </div>
    );
  }

  const ink = parsed.red ? T.cardRed : T.cardInk;

  return (
    <div style={{
      ...wrapStyle,
      background:
        `linear-gradient(180deg, ${T.cardFace} 0%, ${T.cardFace} 65%, rgba(0,0,0,0.04) 100%)`,
      border: `1px solid rgba(0,0,0,0.08)`,
      boxShadow: '0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
      padding: dims.pad,
      animation: `flipIn 320ms ${flipDelay}ms backwards cubic-bezier(.2,.8,.2,1)`,
    }}>
      {/* corner top-left */}
      <div style={{
        position: 'absolute', top: dims.pad, left: dims.pad + 1,
        fontFamily: "'General Sans', sans-serif",
        fontWeight: 700, fontSize: dims.rank, lineHeight: 0.95,
        color: ink, letterSpacing: '-0.04em',
      }}>
        <div>{parsed.rank}</div>
        <div style={{ fontSize: dims.suitCorner, marginTop: 1 }}>{parsed.suit}</div>
      </div>
      {/* center pip */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: ink, fontSize: dims.pip, lineHeight: 1,
        fontFamily: "'Instrument Serif', serif",
      }}>{parsed.suit}</div>
      {/* corner bottom-right (mirrored) */}
      <div style={{
        position: 'absolute', bottom: dims.pad, right: dims.pad + 1,
        transform: 'rotate(180deg)',
        fontFamily: "'General Sans', sans-serif",
        fontWeight: 700, fontSize: dims.rank, lineHeight: 0.95,
        color: ink, letterSpacing: '-0.04em',
      }}>
        <div>{parsed.rank}</div>
        <div style={{ fontSize: dims.suitCorner, marginTop: 1 }}>{parsed.suit}</div>
      </div>
      {pending && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 8,
          boxShadow: `0 0 0 2px ${T.accent}, 0 0 18px ${T.accentRim}`,
          pointerEvents: 'none',
        }}/>
      )}
    </div>
  );
}

// keyframes only need registering once
if (typeof document !== 'undefined' && !document.getElementById('card-keyframes')) {
  const s = document.createElement('style');
  s.id = 'card-keyframes';
  s.textContent = `
    @keyframes flipIn {
      0%   { transform: rotateY(90deg) translateY(-6px); opacity: 0; }
      60%  { opacity: 1; }
      100% { transform: rotateY(0) translateY(0); opacity: 1; }
    }
    @keyframes chipRise {
      0% { transform: translateY(12px) scale(0.85); opacity: 0; }
      100% { transform: translateY(0) scale(1); opacity: 1; }
    }
    @keyframes ping {
      0%   { transform: scale(0.9); opacity: 0.9; }
      100% { transform: scale(1.8); opacity: 0; }
    }
    @keyframes shimmer {
      0%, 100% { opacity: 0.55; }
      50%      { opacity: 1; }
    }
    @keyframes marchDash {
      to { stroke-dashoffset: -40; }
    }
  `;
  document.head.appendChild(s);
}

window.Card = Card;
window.parseCardStr = parseCardStr;
