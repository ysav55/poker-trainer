import React, { useState, useEffect, useMemo } from 'react';
import { RangeMatrix } from './RangeMatrix';
import { comboToHandGroup } from '../utils/comboUtils';
import { apiFetch } from '../lib/api';

/**
 * MistakeMatrixPanel — shows a range matrix where red cells indicate hand groups
 * the player has made mistakes with, based on hand_tags in their history.
 *
 * Props:
 *   stableId  {string}   — player's stable UUID
 *   visible   {boolean}  — show/hide the panel
 */
export function MistakeMatrixPanel({ stableId, visible = true }) {
  const [hands, setHands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoveredGroup, setHoveredGroup] = useState(null);

  useEffect(() => {
    if (!stableId || !visible) return;
    setLoading(true);
    apiFetch(`/api/players/${stableId}/hands`)
      .then((data) => setHands(Array.isArray(data) ? data : []))
      .catch(() => setHands([]))
      .finally(() => setLoading(false));
  }, [stableId, visible]);

  // Build mistakeTags map: handGroup → string[] of mistake tag names
  const mistakeTags = useMemo(() => {
    const map = new Map();
    for (const hand of hands) {
      const hc = hand.hero_hole_cards ?? hand.hole_cards;
      if (!Array.isArray(hc) || hc.length < 2) continue;
      const group = comboToHandGroup(hc);
      if (!group) continue;

      const tags = [
        ...(Array.isArray(hand.auto_tags) ? hand.auto_tags : []),
        ...(Array.isArray(hand.coach_tags) ? hand.coach_tags : []),
      ].filter(t => isMistakeTag(t));

      if (tags.length) {
        const existing = map.get(group) ?? [];
        // Merge tags, deduplicate
        const merged = [...new Set([...existing, ...tags])];
        map.set(group, merged);
      }
    }
    return map;
  }, [hands]);

  if (!visible) return null;

  const tooltipTags = hoveredGroup ? (mistakeTags.get(hoveredGroup) ?? []) : [];

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
            colorMode="mistake"
            mistakeTags={mistakeTags}
            readOnly
            onHover={(combo) => setHoveredGroup(combo)}
            onHoverEnd={() => setHoveredGroup(null)}
          />
          {/* Tooltip area */}
          <div style={{ minHeight: 20, marginTop: 6 }}>
            {hoveredGroup && tooltipTags.length > 0 && (
              <div style={{ fontSize: 9, color: '#f87171' }}>
                <strong style={{ color: '#f0ece3' }}>{hoveredGroup}:</strong>{' '}
                {tooltipTags.join(', ')}
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, color: '#6e7681', marginTop: 2, textAlign: 'right' }}>
            {mistakeTags.size} hand group{mistakeTags.size !== 1 ? 's' : ''} with mistakes
          </div>
        </>
      )}
    </div>
  );
}

// Mistake tags come from the mistakes.js analyzer and equity.js analyzer
const MISTAKE_TAG_NAMES = new Set([
  'OPEN_LIMP', 'OVERLIMP', 'LIMP_RERAISE', 'COLD_CALL_3BET',
  'FOLD_TO_PROBE', 'MIN_RAISE', 'UNDO_USED',
  'DREW_THIN', 'EQUITY_FOLD',
]);

function isMistakeTag(tag) {
  return MISTAKE_TAG_NAMES.has(tag);
}
