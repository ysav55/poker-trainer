import React, { useState, useCallback, useMemo } from 'react';
import { RangeMatrix } from './RangeMatrix';
import { comboArrayToHandGroups } from '../utils/comboUtils';
import { parseRange } from '../utils/rangeParser';

// ── Presets ────────────────────────────────────────────────────────────────────
// Range strings → hand group sets on demand

const PRESETS = [
  { label: 'Top 10%', range: 'AA,KK,QQ,JJ,TT,AKs,AKo,AQs,AQo,AJs,KQs' },
  { label: 'Top 20%', range: 'AA,KK,QQ,JJ,TT,99,88,AKs,AKo,AQs,AQo,AJs,AJo,ATs,KQs,KQo,KJs,QJs' },
  { label: 'EP Open', range: 'AA,KK,QQ,JJ,TT,99,AKs,AKo,AQs,AQo,AJs,KQs' },
  { label: 'CO Open', range: 'AA,KK,QQ,JJ,TT,99,88,77,AKs,AKo,AQs,AQo,AJs,AJo,ATs,A9s,KQs,KQo,KJs,QJs,JTs' },
  { label: 'BTN Open', range: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,AKs,AKo,AQs,AQo,AJs,AJo,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KQo,KJs,KJo,KTs,QJs,QJo,QTs,JTs,J9s,T9s,98s' },
  { label: 'BB Defend', range: 'AA,KK,QQ,JJ,TT,99,88,77,66,55,44,AKs,AKo,AQs,AQo,AJs,AJo,ATs,A9s,A8s,A7s,A6s,A5s,A4s,A3s,A2s,KQs,KQo,KJs,KJo,KTs,K9s,QJs,QJo,QTs,Q9s,JTs,J9s,T9s,98s,87s,76s,65s,54s' },
];

/** Parse a range string (comma-separated hand groups or combo notation) → Set<string> hand groups */
function rangeStringToHandGroups(rangeStr) {
  if (!rangeStr || !rangeStr.trim()) return new Set();
  const combos = parseRange(rangeStr);
  return comboArrayToHandGroups(combos);
}

/** Convert a Set<string> of hand groups back to a comma-separated range string */
function handGroupsToRangeString(handGroups) {
  if (!handGroups || handGroups.size === 0) return '';
  return [...handGroups].join(',');
}

// ── Main component ─────────────────────────────────────────────────────────────

/**
 * RangePicker — inline range editor using the @holdem-poker-tools/hand-matrix grid.
 *
 * Props:
 *   seatLabel    {string}          — displayed in the header
 *   initialRange {string}          — starting range string (e.g. "AA,KK,AKs")
 *   onApply      {(rangeStr) => void}
 *   onCancel     {() => void}
 */
export default function RangePicker({ seatLabel, initialRange = '', onApply, onCancel }) {
  const [selected, setSelected]       = useState(() => rangeStringToHandGroups(initialRange));
  const [textInput, setTextInput]     = useState(initialRange);
  const [textError, setTextError]     = useState(null);

  const comboCount = useMemo(() => {
    let count = 0;
    for (const hg of selected) {
      // Pairs: 6 combos. Suited: 4. Offsuit: 12.
      if (hg.length === 2)           count += 6;   // pair (AA)
      else if (hg.endsWith('s'))     count += 4;   // suited
      else                           count += 12;  // offsuit
    }
    return count;
  }, [selected]);

  // ── Toggle a single hand group ────────────────────────────────────────────

  const handleToggle = useCallback((handGroup) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(handGroup)) next.delete(handGroup);
      else next.add(handGroup);
      setTextInput(handGroupsToRangeString(next));
      return next;
    });
    setTextError(null);
  }, []);

  // ── Presets ───────────────────────────────────────────────────────────────

  const applyPreset = useCallback((rangeStr) => {
    const groups = rangeStringToHandGroups(rangeStr);
    setSelected(groups);
    setTextInput(handGroupsToRangeString(groups));
    setTextError(null);
  }, []);

  // ── Text input sync ───────────────────────────────────────────────────────

  const handleTextChange = useCallback((e) => {
    setTextInput(e.target.value);
    setTextError(null);
  }, []);

  const handleTextApply = useCallback(() => {
    const groups = rangeStringToHandGroups(textInput);
    if (textInput.trim() && groups.size === 0) {
      setTextError('Could not parse range string');
      return;
    }
    setSelected(groups);
    setTextError(null);
  }, [textInput]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setSelected(new Set());
    setTextInput('');
    setTextError(null);
  }, []);

  const handleApply = useCallback(() => {
    onApply?.(handGroupsToRangeString(selected));
  }, [selected, onApply]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: '#0d1117', border: '1px solid #30363d', borderRadius: 8,
        padding: '14px 16px', maxWidth: 520, width: '100%',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#d4af37' }}>
          {seatLabel ?? 'Range'}
        </span>
        <span style={{ fontSize: 11, color: '#6e7681' }}>
          {comboCount} combo{comboCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Hand matrix grid */}
      <div style={{ marginBottom: 12 }}>
        <RangeMatrix
          selected={selected}
          onToggle={handleToggle}
          colorMode="selected"
        />
      </div>

      {/* Presets */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e7681', marginBottom: 6 }}>
          Presets
        </div>
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.range)}
              style={{
                padding: '3px 8px', borderRadius: 3, fontSize: 10, fontWeight: 600,
                border: '1px solid #30363d', background: 'none', color: '#8b949e',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Range string input */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e7681', marginBottom: 5 }}>
          Range String
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={handleTextChange}
            onKeyDown={e => { if (e.key === 'Enter') handleTextApply(); }}
            placeholder="AA,KK,AKs,AKo..."
            style={{
              flex: 1, padding: '5px 8px', borderRadius: 4, fontSize: 11,
              border: textError ? '1px solid #f85149' : '1px solid #30363d',
              background: '#0d1117', color: '#f0ece3', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = textError ? '#f85149' : 'rgba(212,175,55,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = textError ? '#f85149' : '#30363d'; }}
          />
          <button
            onClick={handleTextApply}
            style={{
              padding: '5px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              border: '1px solid #30363d', background: 'none', color: '#8b949e', cursor: 'pointer',
            }}
          >
            Apply
          </button>
        </div>
        {textError && (
          <div style={{ fontSize: 10, color: '#f85149', marginTop: 4 }}>{textError}</div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleClear}
          style={{
            padding: '5px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            border: '1px solid #30363d', background: 'none', color: '#6e7681', cursor: 'pointer',
          }}
        >
          Clear
        </button>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            style={{
              padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              border: '1px solid #30363d', background: 'none', color: '#6e7681', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            style={{
              padding: '5px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700,
              border: 'none', background: '#d4af37', color: '#000', cursor: 'pointer',
            }}
          >
            Use Range
          </button>
        </div>
      </div>
    </div>
  );
}
