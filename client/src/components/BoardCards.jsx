import React from 'react';
import Card from './Card';

const PHASE_LABELS = {
  waiting: null,
  preflop: null,
  flop: 'FLOP',
  turn: 'TURN',
  river: 'RIVER',
  showdown: 'SHOWDOWN',
};

// Returns which slots are "revealed" based on phase
function getRevealedSlots(phase) {
  switch (phase) {
    case 'flop':      return [0, 1, 2];
    case 'turn':      return [0, 1, 2, 3];
    case 'river':     return [0, 1, 2, 3, 4];
    case 'showdown':  return [0, 1, 2, 3, 4];
    default:          return [];
  }
}

function EmptySlot({ small, onClick, isCoach }) {
  return (
    <div
      className={`
        flex-shrink-0 rounded-[5px] flex items-center justify-center
        ${small ? 'w-9 h-[3.5rem]' : 'w-12 h-[4.5rem]'}
        ${isCoach ? 'cursor-pointer hover:border-gold-500/60 hover:bg-gold-500/5 transition-colors duration-150' : 'cursor-default'}
      `}
      style={{
        border: '1.5px dashed rgba(255,255,255,0.12)',
        background: 'rgba(0,0,0,0.15)',
      }}
      onClick={onClick}
    >
      {isCoach && (
        <span className="text-gray-600 text-xs select-none">+</span>
      )}
    </div>
  );
}

export default function BoardCards({
  board = [],
  phase = 'waiting',
  isCoach = false,
  onCardClick,
}) {
  const revealedSlots = getRevealedSlots(phase);
  const phaseLabel = PHASE_LABELS[phase];

  // Build 5-slot array
  const slots = Array.from({ length: 5 }, (_, i) => board[i] ?? null);

  function handleSlotClick(position) {
    if (isCoach && onCardClick) {
      onCardClick(position);
    }
  }

  const flopSlots = slots.slice(0, 3);
  const turnRiverSlots = slots.slice(3, 5);

  function renderSlot(cardValue, index) {
    const isRevealed = revealedSlots.includes(index);
    const hasCard = cardValue !== null && cardValue !== undefined;

    if (isRevealed && hasCard) {
      return (
        <Card
          key={index}
          card={cardValue}
          small={false}
          onClick={isCoach ? () => handleSlotClick(index) : undefined}
          className={isCoach ? 'hover:scale-105 transition-transform duration-150' : ''}
        />
      );
    }

    if (isRevealed && !hasCard && isCoach) {
      return (
        <EmptySlot
          key={index}
          small={false}
          isCoach={true}
          onClick={() => handleSlotClick(index)}
        />
      );
    }

    // Not revealed yet
    return (
      <EmptySlot
        key={index}
        small={false}
        isCoach={isCoach && isRevealed}
        onClick={isCoach && isRevealed ? () => handleSlotClick(index) : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Phase label */}
      {phaseLabel && (
        <div className="label-sm text-gold-500/70 tracking-[0.25em]">
          {phaseLabel}
        </div>
      )}

      {/* Card slots row */}
      <div className="flex items-center gap-1.5">
        {/* Flop: slots 0-2 */}
        <div className="flex items-center gap-1">
          {flopSlots.map((cardValue, i) => renderSlot(cardValue, i))}
        </div>

        {/* Subtle divider between flop and turn/river */}
        <div
          className="w-px mx-1 self-stretch opacity-20 rounded-full"
          style={{ background: 'linear-gradient(to bottom, transparent, #d4af37, transparent)' }}
        />

        {/* Turn + River: slots 3-4 */}
        <div className="flex items-center gap-1">
          {turnRiverSlots.map((cardValue, i) => renderSlot(cardValue, i + 3))}
        </div>
      </div>

      {/* Coach hint */}
      {isCoach && (
        <div className="text-[10px] text-gray-600 tracking-wide mt-0.5">
          click a slot to set card
        </div>
      )}
    </div>
  );
}
