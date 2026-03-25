import React, { useState, useEffect } from 'react';
import CollapsibleSection from '../CollapsibleSection';

export default function BlindLevelsSection({ gameState, setBlindLevels }) {
  const [blindBB, setBlindBB] = useState(() => String(gameState?.big_blind ?? ''));

  // Keep blindBB in sync with the current big_blind from server (only when input is empty)
  useEffect(() => {
    if (gameState?.big_blind != null && blindBB === '') {
      setBlindBB(String(gameState.big_blind));
    }
  }, [gameState?.big_blind]);

  return (
    <CollapsibleSection title="BLIND LEVELS" defaultOpen={false}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="label-sm text-gray-500 w-6">BB</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={blindBB}
          onChange={(e) => setBlindBB(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder={gameState?.big_blind ?? '10'}
          className="flex-1 min-w-0 bg-sidebar-800 border border-sidebar-border rounded px-2 py-1 text-sm text-white outline-none"
          disabled={gameState?.phase !== 'waiting'}
        />
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-gray-600">
          Current: {gameState?.big_blind ?? 10} BB / {gameState?.small_blind ?? 5} SB (auto)
        </span>
      </div>
      <button
        onClick={() => {
          const bb = Number(blindBB);
          if (!bb || bb < 2) return;
          const sb = Math.floor(bb / 2);
          setBlindLevels(sb, bb);
          setBlindBB(String(bb));
        }}
        disabled={gameState?.phase !== 'waiting' || !blindBB || Number(blindBB) < 2}
        className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Set Blinds
      </button>
      {gameState?.phase !== 'waiting' && (
        <div className="text-[10px] text-gray-600 text-center mt-1">
          Only available between hands
        </div>
      )}
    </CollapsibleSection>
  );
}
