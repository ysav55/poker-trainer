import React, { useState, useEffect, useMemo } from 'react';
import { RangeMatrix } from './RangeMatrix';
import { comboToHandGroup } from '../utils/comboUtils';
import { apiFetch } from '../lib/api';

/**
 * PlayerHeatmap — personal combo frequency visualization.
 * Shows which hands a player has actually been dealt/played, as a gold heatmap.
 *
 * Props:
 *   stableId     {string}  — player's stable UUID
 *   visible      {boolean} — controlled by coach toggle or always-on for admin
 */
export function PlayerHeatmap({ stableId, visible = true }) {
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!stableId || !visible) return;
    setLoading(true);
    apiFetch(`/api/players/${stableId}/hands`)
      .then((data) => setHands(Array.isArray(data) ? data : []))
      .catch(() => setHands([]))
      .finally(() => setLoading(false));
  }, [stableId, visible]);

  // Build frequency map: handGroup → count of times dealt
  const frequencies = useMemo(() => {
    const map = new Map();
    for (const hand of hands) {
      const hc = hand.hole_cards ?? hand.hero_hole_cards;
      if (!Array.isArray(hc) || hc.length < 2) continue;
      const group = comboToHandGroup(hc);
      if (group) map.set(group, (map.get(group) ?? 0) + 1);
    }
    return map;
  }, [hands]);

  if (!visible) return null;

  return (
    <div>
      {loading ? (
        <div style={{ fontSize: 10, color: '#6e7681', padding: '8px 0', textAlign: 'center' }}>
          Loading hands…
        </div>
      ) : hands.length === 0 ? (
        <div style={{ fontSize: 10, color: '#6e7681', padding: '8px 0', textAlign: 'center' }}>
          No hand history yet
        </div>
      ) : (
        <>
          <RangeMatrix
            colorMode="frequency"
            frequencies={frequencies}
            readOnly
          />
          <div style={{ fontSize: 9, color: '#6e7681', marginTop: 6, textAlign: 'right' }}>
            {hands.length} hand{hands.length !== 1 ? 's' : ''} in history
          </div>
        </>
      )}
    </div>
  );
}
