const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = React;
const fmtChips = window.__fmtChips;
const apiFetch = window.__apiFetch;
const EquityBadge = window.__EquityBadge;
const SharedRangeOverlay = window.__SharedRangeOverlay;
const PlayerRangePanel = window.__PlayerRangePanel;
const Card = window.P1_Card;



/**
 * BoardCards — drop-in replacement for client/src/components/BoardCards.jsx.
 *
 * API preserved: { board=[], phase='waiting', isCoach=false, onCardClick }
 *
 * Visual redesign:
 *   - Phase progress strip above the row (PRE → FLOP → TURN → RIVER)
 *   - Empty slots: faint amber dashed rings on obsidian
 *   - Subtle vertical separator between flop and turn/river (amber gradient)
 */

const PHASE_ORDER = ['preflop', 'flop', 'turn', 'river'];
const PHASE_DISPLAY = {
  preflop: 'PRE',
  flop:    'FLOP',
  turn:    'TURN',
  river:   'RIVER',
};

function revealedSlots(phase) {
  switch (phase) {
    case 'flop':     return [0, 1, 2];
    case 'turn':     return [0, 1, 2, 3];
    case 'river':
    case 'showdown':
    case 'replay':   return [0, 1, 2, 3, 4];
    default:         return [];
  }
}

function EmptySlot({ isCoach, onClick }) {
  return (
    <div
      className="board-empty-slot"
      style={{
        width: 48, height: 68, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px dashed rgba(201,163,93,0.22)',
        background: 'rgba(0,0,0,0.28)',
        cursor: isCoach ? 'pointer' : 'default',
        transition: 'border-color 150ms, background 150ms',
      }}
      onMouseEnter={(e) => {
        if (isCoach) {
          e.currentTarget.style.borderColor = 'rgba(201,163,93,0.55)';
          e.currentTarget.style.background  = 'rgba(201,163,93,0.06)';
        }
      }}
      onMouseLeave={(e) => {
        if (isCoach) {
          e.currentTarget.style.borderColor = 'rgba(201,163,93,0.22)';
          e.currentTarget.style.background  = 'rgba(0,0,0,0.28)';
        }
      }}
      onClick={onClick}
    >
      {isCoach && (
        <span style={{ color: 'rgba(201,163,93,0.45)', fontSize: 14, lineHeight: 1 }}>+</span>
      )}
    </div>
  );
}

function PhaseStrip({ phase }) {
  if (phase === 'waiting' || phase === 'showdown') return null;
  const idx = PHASE_ORDER.indexOf(phase);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '4px 10px',
      borderRadius: 999,
      background: 'rgba(0,0,0,0.35)',
      border: '1px solid rgba(201,163,93,0.15)',
    }}>
      {PHASE_ORDER.map((p, i) => {
        const active = i === idx;
        const past   = i < idx;
        return (
          <React.Fragment key={p}>
            <span style={{
              fontFamily: "'General Sans', 'Inter', sans-serif",
              fontSize: 9, fontWeight: 700,
              letterSpacing: '0.28em',
              color: active ? '#c9a35d' : past ? 'rgba(201,163,93,0.55)' : 'rgba(255,255,255,0.22)',
              textShadow: active ? '0 0 8px rgba(201,163,93,0.45)' : 'none',
            }}>
              {PHASE_DISPLAY[p]}
            </span>
            {i < PHASE_ORDER.length - 1 && (
              <span style={{
                width: 12, height: 1,
                background: i < idx ? 'rgba(201,163,93,0.55)' : 'rgba(255,255,255,0.1)',
              }}/>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function BoardCards({
  board = [],
  phase = 'waiting',
  isCoach = false,
  onCardClick,
}) {
  const revealed = revealedSlots(phase);
  const slots = Array.from({ length: 5 }, (_, i) => board[i] ?? null);
  const flop = slots.slice(0, 3);
  const turnRiver = slots.slice(3, 5);

  function handleSlotClick(position) {
    if (isCoach && onCardClick) onCardClick(position);
  }

  function renderSlot(cardValue, index) {
    const isRevealed = revealed.includes(index);
    const hasCard = cardValue != null;

    if (isRevealed && hasCard) {
      return (
        <div
          key={index}
          style={{ animationDelay: `${index * 80}ms` }}
          className="card-reveal"
        >
          <Card
            card={cardValue}
            onClick={isCoach ? () => handleSlotClick(index) : undefined}
          />
        </div>
      );
    }
    return (
      <EmptySlot
        key={index}
        isCoach={isCoach && isRevealed}
        onClick={isCoach && isRevealed ? () => handleSlotClick(index) : undefined}
      />
    );
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      userSelect: 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {flop.map((c, i) => renderSlot(c, i))}
        </div>
        <div style={{
          width: 1, alignSelf: 'stretch',
          margin: '0 4px',
          background: 'linear-gradient(to bottom, transparent, rgba(201,163,93,0.35), transparent)',
          opacity: 0.6,
        }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {turnRiver.map((c, i) => renderSlot(c, i + 3))}
        </div>
      </div>

      <PhaseStrip phase={phase} />

      {/* coach hint removed — board placement makes slot-clickability obvious */}

      <style>{`
        @keyframes card-reveal-anim {
          from { opacity: 0; transform: translateY(-4px) rotateX(20deg); }
          to   { opacity: 1; transform: translateY(0)    rotateX(0);    }
        }
        .card-reveal { animation: card-reveal-anim 280ms cubic-bezier(.2,.8,.2,1) both; }
      `}</style>
    </div>
  );
}

;window.P1_BoardCards = BoardCards;
