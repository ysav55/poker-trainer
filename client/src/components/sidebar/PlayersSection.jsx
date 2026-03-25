import React from 'react';
import Card from '../Card';
import CollapsibleSection from '../CollapsibleSection';

const ACTION_COLORS = {
  fold:   { bg: '#2d1a1a', text: '#f85149' },
  call:   { bg: '#1e3a2a', text: '#3fb950' },
  raise:  { bg: '#2d2516', text: '#e3b341' },
  check:  { bg: '#1c2d3f', text: '#58a6ff' },
  bet:    { bg: '#2d2516', text: '#e3b341' },
  allin:  { bg: '#2b1f3a', text: '#bc8cff' },
};

function ActionBadge({ action }) {
  if (!action) return null;
  const key = String(action).toLowerCase();
  const colors = ACTION_COLORS[key] || { bg: '#21262d', text: '#8b949e' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tracking-wide"
      style={{ background: colors.bg, color: colors.text }}
    >
      {String(action).toUpperCase()}
    </span>
  );
}

export default function PlayersSection({ seatedPlayers, phase, emit }) {
  return (
    <CollapsibleSection title="PLAYERS" defaultOpen={true}>
      {seatedPlayers.length === 0 ? (
        <div className="text-xs text-center py-3" style={{ color: '#444' }}>
          No players seated
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {seatedPlayers.map((player, idx) => {
            const holeCards = player.hole_cards || [];
            const isActive = player.is_active;
            const hasFolded = player.is_active === false;
            return (
              <div
                key={player.id ?? idx}
                className="rounded p-2"
                style={{
                  background: isActive ? 'rgba(212,175,55,0.05)' : '#0d1117',
                  border: `1px solid ${isActive ? 'rgba(212,175,55,0.3)' : '#21262d'}`,
                  opacity: hasFolded ? 0.5 : 1,
                  transition: 'opacity 0.2s, border-color 0.2s',
                }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold"
                      style={{ width: '18px', height: '18px', background: isActive ? '#d4af37' : '#21262d', color: isActive ? '#000' : '#6e7681', fontSize: '9px' }}
                    >
                      {player.seat ?? idx + 1}
                    </span>
                    <span
                      className="text-xs font-medium truncate"
                      style={{ color: hasFolded ? '#6e7681' : '#f0ece3', textDecoration: hasFolded ? 'line-through' : 'none' }}
                    >
                      {player.name || `Seat ${player.seat}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                    {player.action && <ActionBadge action={player.action} />}
                    {player.is_dealer && (
                      <span
                        className="inline-flex items-center justify-center rounded-full text-xs font-bold"
                        style={{ width: '16px', height: '16px', background: '#d4af37', color: '#000', fontSize: '8px' }}
                        title="Dealer"
                      >D</span>
                    )}
                    {phase === 'WAITING' && (
                      <button
                        onClick={() => emit.setPlayerInHand?.(player.id, player.in_hand === false)}
                        title={player.in_hand === false ? 'Click to include in next hand' : 'Click to exclude from next hand'}
                        className="inline-flex items-center justify-center rounded transition-colors"
                        style={{
                          width: '16px', height: '16px', fontSize: '10px',
                          background: player.in_hand === false ? 'rgba(239,68,68,0.15)' : 'transparent',
                          color: player.in_hand === false ? '#f85149' : '#3fb950',
                          border: `1px solid ${player.in_hand === false ? '#f8514966' : '#3fb95066'}`,
                        }}
                      >
                        {player.in_hand === false ? '✕' : '✓'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono" style={{ color: '#6e7681' }}>
                    ${Number(player.stack || 0).toLocaleString()}
                    {player.current_bet > 0 && (
                      <span style={{ color: '#e3b341', marginLeft: '4px' }}>
                        +${Number(player.current_bet).toLocaleString()}
                      </span>
                    )}
                  </span>
                  {holeCards.length > 0 && (
                    <div className="flex gap-1">
                      {holeCards.map((c, i) => (
                        <Card key={i} card={c === 'HIDDEN' ? undefined : c} hidden={c === 'HIDDEN' || !c} small />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
