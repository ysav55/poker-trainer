import React from 'react';
import Card from './Card';

// Color mapping for action badges
const ACTION_STYLES = {
  fold:    { label: 'FOLD',   classes: 'bg-red-900/80 text-red-300 border border-red-700/60' },
  folded:  { label: 'FOLD',   classes: 'bg-red-900/80 text-red-300 border border-red-700/60' },
  check:   { label: 'CHECK',  classes: 'bg-gray-700/80 text-gray-300 border border-gray-600/60' },
  checked: { label: 'CHECK',  classes: 'bg-gray-700/80 text-gray-300 border border-gray-600/60' },
  call:    { label: 'CALL',   classes: 'bg-blue-900/80 text-blue-300 border border-blue-700/60' },
  called:  { label: 'CALL',   classes: 'bg-blue-900/80 text-blue-300 border border-blue-700/60' },
  raise:   { label: 'RAISE',  classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  raised:  { label: 'RAISE',  classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  bet:     { label: 'BET',    classes: 'bg-orange-900/80 text-orange-300 border border-orange-700/60' },
  'all-in':{ label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
  allin:   { label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
  'all_in':{ label: 'ALL-IN', classes: 'bg-purple-900/80 text-purple-300 border border-purple-700/60' },
};

function formatStack(stack) {
  if (stack == null) return '0';
  return Number(stack).toLocaleString('en-US');
}

function EmptyCardSlot({ onClick, isCoach }) {
  return (
    <div
      className={`
        w-12 h-[4.5rem] flex-shrink-0 rounded-[5px] flex items-center justify-center
        transition-colors duration-150
        ${isCoach
          ? 'cursor-pointer hover:border-gold-500/60 hover:bg-gold-500/5'
          : 'cursor-default'}
      `}
      style={{
        border: '1.5px dashed rgba(255,255,255,0.12)',
        background: 'rgba(0,0,0,0.2)',
      }}
      onClick={onClick}
    >
      {isCoach && (
        <span className="text-gray-600 text-sm select-none">+</span>
      )}
    </div>
  );
}

export default function PlayerSeat({
  player,
  isCurrentTurn = false,
  isMe = false,
  isCoach = false,
  style = {},
  onHoleCardClick,
  showdownResult = null,
  isWinner = false,
}) {
  if (!player) return null;

  const isFolded =
    player.action === 'fold' ||
    player.action === 'folded' ||
    player.is_folded === true;

  // Find this player's hand entry in allHands (only present at showdown)
  const isShowdown = showdownResult != null;
  const playerHandEntry = isShowdown
    ? (showdownResult.allHands ?? []).find((h) => h.playerId === player.id) ?? null
    : null;

  const actionKey = player.action?.toLowerCase?.();
  const actionStyle = actionKey ? ACTION_STYLES[actionKey] : null;

  // Determine card visibility: coach sees all, "me" sees own cards
  const showCards = isCoach || isMe;
  // When coach views an opponent's card (not their own), show semi-transparent
  const isOpponentCard = isCoach && !isMe;

  // Hole cards (up to 2)
  const holeCards = player.hole_cards ?? [];

  function handleCardClick(position) {
    if (onHoleCardClick) {
      onHoleCardClick(position);
    }
  }

  function renderCardSlot(position) {
    const card = holeCards[position];
    const hasCard = card != null && card !== '';

    if (!hasCard) {
      return (
        <EmptyCardSlot
          key={position}
          isCoach={isCoach}
          onClick={isCoach ? () => handleCardClick(position) : undefined}
        />
      );
    }

    if (showCards) {
      return (
        <div
          key={position}
          style={isOpponentCard ? { opacity: 0.5 } : undefined}
          title={isOpponentCard ? 'Opponent cards (coach view)' : undefined}
        >
          <Card
            card={card}
            hidden={false}
            small={false}
            onClick={isCoach ? () => handleCardClick(position) : undefined}
            className={isCoach ? 'hover:scale-105 transition-transform duration-150' : ''}
          />
        </div>
      );
    }

    // Hidden back — non-coach, non-me
    return (
      <Card
        key={position}
        card={card}
        hidden={true}
        small={false}
      />
    );
  }

  return (
    <div
      className={`
        absolute flex flex-col items-center gap-1 select-none
        ${isCurrentTurn ? 'turn-indicator rounded-xl' : ''}
        ${isFolded ? 'opacity-40' : 'opacity-100'}
        transition-opacity duration-300
      `}
      style={{
        width: 140,
        ...style,
      }}
    >
      {/* ── Badges row (dealer / blind) ── */}
      <div className="flex items-center gap-1 min-h-[18px]">
        {player.is_dealer && (
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-black leading-none"
            style={{ background: '#d4af37', boxShadow: '0 0 6px rgba(212,175,55,0.6)' }}
          >
            D
          </span>
        )}
        {player.is_small_blind && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-yellow-300 bg-yellow-900/50 border border-yellow-700/40 leading-none">
            SB
          </span>
        )}
        {player.is_big_blind && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-yellow-200 bg-yellow-800/50 border border-yellow-600/40 leading-none">
            BB
          </span>
        )}
        {player.is_all_in && (
          <span className="px-1 py-0.5 rounded text-[9px] font-bold text-purple-300 bg-purple-900/60 border border-purple-700/50 leading-none">
            ALL-IN
          </span>
        )}
      </div>

      {/* ── Seat card ── */}
      <div
        className={`
          w-full rounded-xl flex flex-col items-center gap-2 px-2 py-2
          ${isCurrentTurn
            ? 'bg-felt-800/90 border border-gold-500/60'
            : 'bg-felt-900/80 border border-white/8'}
          transition-all duration-200
        `}
        style={{
          backdropFilter: 'blur(6px)',
          boxShadow: isWinner
            ? '0 0 12px #d4af37, 0 0 24px rgba(212,175,55,0.25)'
            : isCurrentTurn
            ? '0 4px 20px rgba(212,175,55,0.15)'
            : '0 4px 12px rgba(0,0,0,0.5)',
          borderColor: isWinner
            ? '#d4af37'
            : isCurrentTurn
            ? 'rgba(212,175,55,0.55)'
            : 'rgba(255,255,255,0.07)',
        }}
      >
        {/* Name + "You" indicator */}
        <div className="w-full flex items-center justify-between gap-1">
          <span
            className="text-[11px] font-semibold text-gray-100 truncate flex-1 leading-none tracking-wide"
            title={player.name}
          >
            {player.name}
          </span>
          {isMe && (
            <span className="text-[9px] font-bold text-gold-400 uppercase tracking-widest shrink-0 leading-none">
              You
            </span>
          )}
        </div>

        {/* Stack */}
        <div className="flex items-center gap-1">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: '#d4af37', boxShadow: '0 0 4px rgba(212,175,55,0.7)' }}
          />
          <span className="text-[11px] font-mono text-gold-400 leading-none">
            {formatStack(player.stack)}
          </span>
        </div>

        {/* Hole cards */}
        <div className="flex items-center gap-1.5">
          {renderCardSlot(0)}
          {renderCardSlot(1)}
        </div>

        {/* Hand rank badge — only shown at showdown for non-folded players */}
        {playerHandEntry && !isFolded && (
          <div
            className="w-full text-center px-1.5 py-0.5 rounded-full leading-snug"
            style={{
              background: '#1a2332',
              border: `1px solid ${isWinner ? '#d4af37' : '#30363d'}`,
              color: isWinner ? '#d4af37' : '#e6edf3',
              fontSize: '10px',
              lineHeight: '1.3',
            }}
            title={playerHandEntry.handResult?.description ?? ''}
          >
            {playerHandEntry.handResult?.description ?? ''}
          </div>
        )}
      </div>

      {/* ── Action badge ── */}
      {actionStyle && (
        <div
          className={`
            px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase leading-none
            ${actionStyle.classes}
          `}
        >
          {actionStyle.label}
        </div>
      )}
    </div>
  );
}
