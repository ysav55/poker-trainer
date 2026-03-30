import React, { useCallback } from 'react';
import { HandMatrix } from '@holdem-poker-tools/hand-matrix';

/**
 * RangeMatrix — wrapper around @holdem-poker-tools/hand-matrix.
 *
 * Props:
 *   selected       {Set<string>}           — selected hand groups ('AKs', 'QQ', ...)
 *   onToggle       {(handGroup) => void}   — called when a cell is clicked
 *   readOnly       {boolean}               — disables click events
 *   colorMode      {'selected'|'frequency'|'mistake'}
 *   frequencies    {Map<string, number>}   — hand group → count (for colorMode='frequency')
 *   mistakeTags    {Map<string, string[]>} — hand group → tag names (for colorMode='mistake')
 *   highlightHand  {string}               — single hand group to highlight (e.g. in history)
 */
export function RangeMatrix({
  selected,
  onToggle,
  readOnly = false,
  colorMode = 'selected',
  frequencies,
  mistakeTags,
  highlightHand,
}) {
  const comboStyle = useCallback((combo) => {
    // colorMode: 'selected' — highlight selected cells
    if (colorMode === 'selected') {
      const isSelected = selected?.has(combo);
      if (combo === highlightHand) {
        return { backgroundColor: '#3b82f6', color: '#fff' };
      }
      return {
        backgroundColor: isSelected ? '#22c55e' : 'transparent',
        color: isSelected ? '#fff' : undefined,
        opacity: isSelected ? 1 : 0.3,
      };
    }

    // colorMode: 'frequency' — heatmap by play frequency
    if (colorMode === 'frequency') {
      const freq = frequencies?.get(combo) ?? 0;
      const intensity = Math.min(1, freq / 10); // normalize to max=10 occurrences
      return { backgroundColor: `rgba(212,175,55,${intensity.toFixed(2)})` };
    }

    // colorMode: 'mistake' — red cells for combos with mistake tags
    if (colorMode === 'mistake') {
      const tags = mistakeTags?.get(combo) ?? [];
      if (combo === highlightHand) {
        return { backgroundColor: '#3b82f6', color: '#fff' };
      }
      return {
        backgroundColor: tags.length ? '#ef4444' : 'transparent',
        opacity: tags.length ? 1 : 0.2,
      };
    }

    return {};
  }, [selected, colorMode, frequencies, mistakeTags, highlightHand]);

  return (
    <div style={{ width: '100%' }}>
      <HandMatrix
        comboStyle={comboStyle}
        onSelect={readOnly ? undefined : (combo) => onToggle?.(combo)}
        colorize={false}
        showText={true}
      />
    </div>
  );
}
