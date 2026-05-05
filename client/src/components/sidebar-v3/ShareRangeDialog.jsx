import React, { useState, useEffect } from 'react';
import { RangeMatrix } from '../RangeMatrix.jsx';

export default function ShareRangeDialog({ open, onSubmit, onClose }) {
  const [groups, setGroups] = useState(new Set());
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset when reopened
  useEffect(() => {
    if (open) {
      setGroups(new Set());
      setLabel('');
    }
  }, [open]);

  if (!open) return null;

  function toggleGroup(g) {
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  function broadcast() {
    if (groups.size === 0) return;
    onSubmit?.([...groups], label);
    onClose?.();
  }

  return (
    <div
      role="dialog"
      aria-label="Share Range"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8,
          padding: 16, minWidth: 360, maxWidth: 520,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-title" style={{ marginBottom: 8 }}>Share Range</div>
        <div className="lbl" style={{ marginBottom: 4 }}>Label</div>
        <input
          className="field"
          placeholder="Label (e.g. BTN open range)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ marginBottom: 10, width: '100%' }}
        />
        <div className="lbl" style={{ marginBottom: 4 }}>Combos ({groups.size} selected)</div>
        <div style={{ marginBottom: 12 }}>
          <RangeMatrix selected={groups} onToggle={toggleGroup} colorMode="selected" />
        </div>
        <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={groups.size === 0} onClick={broadcast}>Broadcast</button>
        </div>
      </div>
    </div>
  );
}
