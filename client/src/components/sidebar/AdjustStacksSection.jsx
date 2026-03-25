import React, { useState, useCallback } from 'react';
import CollapsibleSection from '../CollapsibleSection';

export default function AdjustStacksSection({ emit, seatedPlayers }) {
  const [stackAdjustTarget, setStackAdjustTarget] = useState('');
  const [stackAdjustValue, setStackAdjustValue] = useState('');

  const handleSetStack = useCallback(() => {
    const val = parseFloat(stackAdjustValue);
    if (emit.adjustStack && stackAdjustTarget && !isNaN(val) && val >= 0) {
      emit.adjustStack(stackAdjustTarget, val);
      setStackAdjustValue('');
    }
  }, [emit, stackAdjustTarget, stackAdjustValue]);

  return (
    <CollapsibleSection title="ADJUST STACKS" defaultOpen={false}>
      <select
        value={stackAdjustTarget}
        onChange={(e) => setStackAdjustTarget(e.target.value)}
        className="w-full rounded text-xs py-1.5 px-2 mb-2"
        style={{ background: '#161b22', border: '1px solid #30363d', color: stackAdjustTarget ? '#f0ece3' : '#6e7681', outline: 'none' }}
      >
        <option value="" disabled>Select player…</option>
        {seatedPlayers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name || `Seat ${p.seat}`}
            {p.stack !== undefined ? ` — $${Number(p.stack).toLocaleString()}` : ''}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          type="number"
          min="0"
          step="50"
          placeholder="New stack…"
          value={stackAdjustValue}
          onChange={(e) => setStackAdjustValue(e.target.value)}
          className="flex-1 rounded text-xs py-1.5 px-2 min-w-0 font-mono"
          style={{ background: '#161b22', border: '1px solid #30363d', color: '#f0ece3', outline: 'none' }}
          onFocus={(e) => (e.target.style.borderColor = '#d4af37')}
          onBlur={(e) => (e.target.style.borderColor = '#30363d')}
        />
        <button
          onClick={handleSetStack}
          disabled={!stackAdjustTarget || stackAdjustValue === ''}
          className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
        >
          Set
        </button>
      </div>
    </CollapsibleSection>
  );
}
