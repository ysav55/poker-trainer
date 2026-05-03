const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;
const fmtChips = window.__fmtChips;
const apiFetch = window.__apiFetch;
const EquityBadge = window.__EquityBadge;
const SharedRangeOverlay = window.__SharedRangeOverlay;
const PlayerRangePanel = window.__PlayerRangePanel;


/**
 * Card — drop-in replacement for client/src/components/Card.jsx.
 *
 * API preserved:
 *   props: { card, hidden=false, small=false, className='', onClick, selected=false }
 *   card format: 'As', 'Td', 'HIDDEN', null
 *
 * Visual redesign:
 *   - Warm cream face (#f4f1e8) with Instrument Serif center pip
 *   - General Sans rank + suit, corners top-left and bottom-right (mirrored)
 *   - Deep violet back with diagonal micro-pattern and 'FS' monogram
 *   - Staggered flip-in animation
 */

const RANK_DISPLAY = { T: '10', J: 'J', Q: 'Q', K: 'K', A: 'A' };
const SUIT_CHAR    = { h: '♥', d: '♦', c: '♣', s: '♠' };
const IS_RED       = { h: true, d: true, c: false, s: false };

function parseCard(card) {
  if (!card || card === 'HIDDEN') return null;
  const r = card[0], s = card[1];
  return {
    rank: RANK_DISPLAY[r] ?? r,
    suit: SUIT_CHAR[s] ?? s,
    red:  !!IS_RED[s],
  };
}

const CARD_FACE    = '#f4f1e8';
const CARD_INK     = '#1a1a1f';
const CARD_RED     = '#c24545';
const CARD_BACK    = 'linear-gradient(135deg, #2a1e44 0%, #1a1228 100%)';
const CARD_BACK_INK = 'rgba(201,163,93,0.65)';
const ACCENT       = '#c9a35d';
const ACCENT_RIM   = 'rgba(201,163,93,0.35)';

function Card({
  card,
  hidden = false,
  small = false,
  className = '',
  onClick,
  selected = false,
}) {
  const isFaceDown = hidden || card === 'HIDDEN' || !card;
  const parsed = isFaceDown ? null : parseCard(card);

  const dims = small
    ? { w: 40, h: 56, rank: 14, suitCorner: 10, pip: 24, pad: 4 }
    : { w: 48, h: 68, rank: 16, suitCorner: 12, pip: 32, pad: 5 };

  const clickable = !!onClick;

  const wrapStyle = {
    width: dims.w, height: dims.h,
    borderRadius: 7,
    position: 'relative',
    flexShrink: 0,
    userSelect: 'none',
    cursor: clickable ? 'pointer' : 'default',
    transition: 'transform 180ms cubic-bezier(.2,.8,.2,1)',
  };

  if (isFaceDown) {
    return (
      <div
        className={`card-reveal ${className}`}
        style={{
          ...wrapStyle,
          background: CARD_BACK,
          border: selected ? `2px solid ${ACCENT}` : '1px solid rgba(255,255,255,0.14)',
          boxShadow: selected
            ? `0 0 0 2px ${ACCENT_RIM}, 0 6px 16px rgba(0,0,0,0.55)`
            : '0 6px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}
        onClick={onClick}
      >
        <div style={{
          position: 'absolute', inset: 4, borderRadius: 4,
          background:
            'repeating-linear-gradient(45deg, currentColor 0 1px, transparent 1px 7px),' +
            'repeating-linear-gradient(-45deg, currentColor 0 1px, transparent 1px 7px)',
          color: CARD_BACK_INK, opacity: 0.25,
        }}/>
        <div style={{
          position: 'absolute', inset: 3, borderRadius: 5,
          border: `1px solid ${CARD_BACK_INK}`, opacity: 0.4,
        }}/>
        <span style={{
          fontFamily: "'Instrument Serif', serif",
          fontStyle: 'italic',
          fontSize: small ? 18 : 22,
          color: CARD_BACK_INK,
          letterSpacing: '-0.04em',
          position: 'relative',
          zIndex: 1,
        }}>FS</span>
      </div>
    );
  }

  const ink = parsed.red ? CARD_RED : CARD_INK;

  return (
    <div
      className={`card-reveal ${className}`}
      style={{
        ...wrapStyle,
        background: `linear-gradient(180deg, ${CARD_FACE} 0%, ${CARD_FACE} 65%, rgba(0,0,0,0.04) 100%)`,
        border: selected ? `2px solid ${ACCENT}` : '1px solid rgba(0,0,0,0.08)',
        boxShadow: selected
          ? `0 0 0 2px ${ACCENT_RIM}, 0 8px 20px rgba(0,0,0,0.5)`
          : '0 8px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.9)',
        padding: dims.pad,
      }}
      onClick={onClick}
    >
      {/* Top-left rank + suit */}
      <div style={{
        position: 'absolute', top: dims.pad, left: dims.pad + 1,
        fontFamily: "'General Sans', 'Inter', sans-serif",
        fontWeight: 700, fontSize: dims.rank, lineHeight: 0.95,
        color: ink, letterSpacing: '-0.04em',
      }}>
        <div>{parsed.rank}</div>
        <div style={{ fontSize: dims.suitCorner, marginTop: 1 }}>{parsed.suit}</div>
      </div>
      {/* Center pip */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: ink, fontSize: dims.pip, lineHeight: 1,
        fontFamily: "'Instrument Serif', serif",
        pointerEvents: 'none',
      }}>{parsed.suit}</div>
      {/* Bottom-right rank + suit (mirrored) */}
      <div style={{
        position: 'absolute', bottom: dims.pad, right: dims.pad + 1,
        transform: 'rotate(180deg)',
        fontFamily: "'General Sans', 'Inter', sans-serif",
        fontWeight: 700, fontSize: dims.rank, lineHeight: 0.95,
        color: ink, letterSpacing: '-0.04em',
      }}>
        <div>{parsed.rank}</div>
        <div style={{ fontSize: dims.suitCorner, marginTop: 1 }}>{parsed.suit}</div>
      </div>
    </div>
  );
}

;window.P1_Card = Card;
