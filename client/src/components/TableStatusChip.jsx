import React from 'react';

const PHASE_COLORS = {
  waiting:  '#6e7681',
  preflop:  '#58a6ff',
  flop:     '#3fb950',
  turn:     '#e3b341',
  river:    '#f85149',
  showdown: '#bc8cff',
};

function PhaseBadge({ phase }) {
  const color = PHASE_COLORS[(phase ?? 'waiting').toLowerCase()] ?? '#6e7681';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {(phase ?? 'WAITING').toUpperCase()}
    </span>
  );
}

function TinyCard({ card }) {
  if (!card || card === 'HIDDEN') {
    return (
      <span
        style={{
          display: 'inline-block',
          width: 14,
          height: 20,
          borderRadius: 2,
          background: 'linear-gradient(135deg, #0f1b3d, #162244)',
          border: '1px solid #1e2d5a',
          flexShrink: 0,
        }}
      />
    );
  }
  const rankRaw = card[0];
  const suitRaw = card[1];
  const rank = rankRaw === 'T' ? '10' : rankRaw;
  const suit = { h: '♥', d: '♦', c: '♣', s: '♠' }[suitRaw] ?? suitRaw;
  const isRed = suitRaw === 'h' || suitRaw === 'd';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafaf8',
        borderRadius: 2,
        fontSize: 9,
        fontWeight: 700,
        minWidth: 14,
        height: 20,
        padding: '0 2px',
        color: isRed ? '#dc2626' : '#1a1a2e',
        lineHeight: 1,
        flexShrink: 0,
        border: '1px solid #e2e0da',
      }}
    >
      {rank}{suit}
    </span>
  );
}

export default function TableStatusChip({ gameState, tableId, tableName }) {
  const phase = gameState?.phase ?? 'waiting';
  const players = gameState?.players ?? [];
  const pot = gameState?.pot ?? 0;
  const board = gameState?.board ?? [];
  const currentTurnId = gameState?.current_player ?? gameState?.current_turn ?? null;
  const currentPlayer = players.find((p) => p.id === currentTurnId);
  const playerCount = players.filter((p) => p.seat !== undefined && p.seat !== null).length;

  const streetLabel = phase.toUpperCase() === 'WAITING' ? null : phase.toUpperCase();
  const subtitle = streetLabel
    ? `${playerCount} player${playerCount !== 1 ? 's' : ''} · ${streetLabel}`
    : `${playerCount} player${playerCount !== 1 ? 's' : ''}`;

  return (
    <div
      style={{
        background: '#161b22',
        borderRadius: 8,
        padding: 8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
      }}
    >
      {/* Header row: table name + phase badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span
          className="text-xs font-bold truncate"
          style={{ color: '#e6edf3' }}
        >
          {tableName ?? tableId ?? 'Table'}
        </span>
        <PhaseBadge phase={phase} />
      </div>

      {/* Players · Street */}
      <span className="text-xs" style={{ color: '#8b949e' }}>
        {subtitle}
      </span>

      {/* Community cards */}
      {board.length > 0 && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'nowrap', marginTop: 2 }}>
          {board.map((card, i) => (
            <TinyCard key={i} card={card} />
          ))}
        </div>
      )}

      {/* Pot */}
      {pot > 0 && (
        <span className="text-xs" style={{ color: '#d4af37' }}>
          Pot: {Number(pot).toLocaleString('en-US')}
        </span>
      )}

      {/* Current acting player */}
      {currentPlayer && (
        <span className="text-xs truncate" style={{ color: '#d4af37' }}>
          Acting: {currentPlayer.name}
        </span>
      )}
    </div>
  );
}
