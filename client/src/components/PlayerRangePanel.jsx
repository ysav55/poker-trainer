import React from 'react';
import { RangeMatrix } from './RangeMatrix';
import { comboArrayToHandGroups } from '../utils/comboUtils';

/**
 * PlayerRangePanel — shows the player their assigned range from the hand config
 * when the coach has enabled showRangesToPlayers and config_phase is active.
 *
 * Props:
 *   gameState   {object}   — raw game state
 *   myId        {string}   — this client's stableId / player id
 *   equitySettings {object} — { showRangesToPlayers: bool }
 */
export function PlayerRangePanel({ gameState, myId, equitySettings }) {
  const showRangesToPlayers = equitySettings?.showRangesToPlayers === true;
  const configPhase = gameState?.config_phase === true;

  if (!showRangesToPlayers || !configPhase) return null;

  // Find this player's assigned combos in the config
  const combos = gameState?.config?.hole_cards_combos?.[myId];
  if (!combos || combos.length === 0) return null;

  const handGroups = comboArrayToHandGroups(combos);
  if (!handGroups.size) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 60,
        background: '#161b22',
        border: '1px solid #30363d',
        borderRadius: 10,
        padding: '12px 14px',
        width: 280,
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, color: '#d4af37', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
        Your Range
      </div>
      <RangeMatrix
        selected={handGroups}
        colorMode="selected"
        readOnly
      />
      <div style={{ fontSize: 9, color: '#6e7681', marginTop: 6, textAlign: 'right' }}>
        {combos.length} combo{combos.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
