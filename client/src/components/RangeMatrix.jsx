import React, { useCallback, useRef } from 'react';
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
// Hand group regex: pairs (AA), suited (AKs), offsuit (AKo)
const HAND_GROUP_RE = /^[AKQJT98765432]{2}[so]?$/;

function getComboAtPoint(clientX, clientY, containerEl) {
  // elementsFromPoint returns ALL elements at that coordinate (topmost first),
  // regardless of pointer-events CSS. Skip the container itself and look for
  // a HandMatrix cell whose text matches a hand group.
  const els = document.elementsFromPoint(clientX, clientY);
  for (const el of els) {
    if (el === containerEl || el === document.body || el === document.documentElement) continue;
    const text = el.textContent?.trim();
    if (text && HAND_GROUP_RE.test(text)) return text;
    // Also check the closest ancestor with matching text
    const parent = el.parentElement;
    if (parent && parent !== containerEl) {
      const pt = parent.textContent?.trim();
      if (pt && HAND_GROUP_RE.test(pt)) return pt;
    }
  }
  return null;
}

export function RangeMatrix({
  selected,
  onToggle,
  readOnly = false,
  colorMode = 'selected',
  frequencies,
  mistakeTags,
  highlightHand,
  onHover,
  onHoverEnd,
}) {
  const containerRef     = useRef(null);
  const isDragging       = useRef(false);
  const dragMode         = useRef('add');   // 'add' | 'remove'
  const lastCombo        = useRef(null);
  const lastHoveredCombo = useRef(null);

  // ── Drag-select handlers ─────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e) => {
    if (readOnly || !onToggle) return;
    e.preventDefault(); // prevent text selection
    isDragging.current = true;
    lastCombo.current  = null;
    e.currentTarget.setPointerCapture(e.pointerId);

    const combo = getComboAtPoint(e.clientX, e.clientY, containerRef.current);
    if (combo) {
      dragMode.current  = selected?.has(combo) ? 'remove' : 'add';
      lastCombo.current = combo;
      onToggle(combo);
    }
  }, [readOnly, onToggle, selected]);

  const handlePointerMove = useCallback((e) => {
    if (!isDragging.current || readOnly || !onToggle) return;
    const combo = getComboAtPoint(e.clientX, e.clientY, containerRef.current);
    if (!combo || combo === lastCombo.current) return;
    lastCombo.current = combo;
    const isSelected  = selected?.has(combo);
    // Only toggle if cell state doesn't already match drag intention
    if ((dragMode.current === 'add' && !isSelected) || (dragMode.current === 'remove' && isSelected)) {
      onToggle(combo);
    }
  }, [readOnly, onToggle, selected]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    lastCombo.current  = null;
  }, []);

  // ── Hover tracking (works in readOnly mode too) ──────────────────────────────

  const handleHoverMove = useCallback((e) => {
    if (!onHover) return;
    const combo = getComboAtPoint(e.clientX, e.clientY, containerRef.current);
    if (combo === lastHoveredCombo.current) return;
    lastHoveredCombo.current = combo;
    if (combo) onHover(combo);
    else if (onHoverEnd) onHoverEnd();
  }, [onHover, onHoverEnd]);

  const handlePointerLeave = useCallback(() => {
    lastHoveredCombo.current = null;
    if (onHoverEnd) onHoverEnd();
  }, [onHoverEnd]);

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
    <div
      ref={containerRef}
      style={{ width: '100%', userSelect: 'none', touchAction: 'none' }}
      onPointerDown={readOnly ? undefined : handlePointerDown}
      onPointerMove={readOnly ? handleHoverMove : (e) => { handlePointerMove(e); handleHoverMove(e); }}
      onPointerUp={readOnly ? undefined : handlePointerUp}
      onPointerLeave={handlePointerLeave}
    >
      <HandMatrix
        comboStyle={comboStyle}
        onSelect={undefined}
        colorize={false}
        showText={true}
      />
    </div>
  );
}
