import React from 'react';

const RANK_MAP = {
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
};

const SUIT_SYMBOL = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const SUIT_COLOR = {
  h: '#dc2626',
  d: '#dc2626',
  c: '#1a1a2e',
  s: '#1a1a2e',
};

function parseCard(card) {
  if (!card || card === 'HIDDEN') return null;
  const rankRaw = card[0];
  const suitRaw = card[1];
  const rank = RANK_MAP[rankRaw] ?? rankRaw;
  const suit = SUIT_SYMBOL[suitRaw] ?? suitRaw;
  const color = SUIT_COLOR[suitRaw] ?? '#1a1a2e';
  return { rank, suit, color, suitRaw };
}

export default function Card({
  card,
  hidden = false,
  small = false,
  className = '',
  onClick,
  selected = false,
}) {
  const isFaceDown = hidden || card === 'HIDDEN' || !card;
  const parsed = isFaceDown ? null : parseCard(card);

  const sizeClasses = small
    ? 'w-9 h-[3.5rem]'
    : 'w-12 h-[4.5rem]';

  const rankSizeClass = small ? 'text-[10px] leading-none' : 'text-xs leading-none';
  const suitCenterClass = small ? 'text-2xl' : 'text-3xl';

  const selectedStyles = selected
    ? 'border-[2px] border-gold-500 shadow-glow-gold'
    : '';

  const clickableStyles = onClick
    ? 'cursor-pointer hover:scale-105 active:scale-95'
    : 'cursor-default';

  if (isFaceDown) {
    return (
      <div
        className={`
          card-reveal relative rounded-[5px] flex items-center justify-center
          select-none transition-transform duration-150 flex-shrink-0
          ${sizeClasses}
          ${selectedStyles}
          ${clickableStyles}
          ${className}
        `}
        style={{
          background: 'linear-gradient(135deg, #0f1b3d 0%, #162244 50%, #0f1b3d 100%)',
          border: selected ? undefined : '1.5px solid #1e2d5a',
          boxShadow: selected
            ? undefined
            : '0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
        onClick={onClick}
      >
        {/* Back pattern grid */}
        <div
          className="absolute inset-[3px] rounded-[3px] opacity-20"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #3b5bdb 0px, #3b5bdb 1px, transparent 1px, transparent 8px), ' +
              'repeating-linear-gradient(-45deg, #3b5bdb 0px, #3b5bdb 1px, transparent 1px, transparent 8px)',
          }}
        />
        {/* Watermark spade */}
        <span
          className={`relative z-10 ${small ? 'text-lg' : 'text-2xl'} opacity-30 select-none`}
          style={{ color: '#4a6fa5' }}
        >
          ♠
        </span>
      </div>
    );
  }

  const { rank, suit, color } = parsed;
  const isRed = color === '#dc2626';

  return (
    <div
      className={`
        card-reveal relative rounded-[5px] flex flex-col justify-between
        select-none transition-transform duration-150 flex-shrink-0
        ${sizeClasses}
        ${selectedStyles}
        ${clickableStyles}
        ${className}
      `}
      style={{
        backgroundColor: '#fafaf8',
        border: selected ? undefined : '1.5px solid #e2e0da',
        boxShadow: selected
          ? undefined
          : '0 2px 8px rgba(0,0,0,0.4)',
        padding: small ? '3px 4px' : '4px 5px',
      }}
      onClick={onClick}
    >
      {/* Top-left rank + suit */}
      <div
        className={`flex flex-col items-start leading-none ${rankSizeClass} font-bold`}
        style={{ color }}
      >
        <span>{rank}</span>
        <span style={{ fontSize: small ? '8px' : '10px', lineHeight: 1 }}>{suit}</span>
      </div>

      {/* Center suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${suitCenterClass} font-normal leading-none pointer-events-none`}
        style={{ color }}
      >
        {suit}
      </div>

      {/* Bottom-right rank + suit (inverted) */}
      <div
        className={`flex flex-col items-end leading-none ${rankSizeClass} font-bold rotate-180`}
        style={{ color }}
      >
        <span>{rank}</span>
        <span style={{ fontSize: small ? '8px' : '10px', lineHeight: 1 }}>{suit}</span>
      </div>
    </div>
  );
}
