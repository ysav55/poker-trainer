import React, { useState } from 'react';

export default function TagDialog({ open, availableTags = [], initialTags = [], onSubmit, onClose }) {
  const [selected, setSelected] = useState(new Set(initialTags));
  const [custom, setCustom] = useState('');

  if (!open) return null;

  function toggle(tag) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  function addCustom() {
    const t = custom.trim().toUpperCase();
    if (!t) return;
    setSelected((prev) => new Set([...prev, t]));
    setCustom('');
  }

  function save() {
    onSubmit?.([...selected]);
    onClose?.();
  }

  return (
    <div
      role="dialog"
      aria-label="Tag this hand"
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
          padding: 16, minWidth: 320, maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-title" style={{ marginBottom: 8 }}>Tag this hand</div>
        <div className="lbl" style={{ marginBottom: 4 }}>Choose tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
          {availableTags.map((t) => (
            <button
              key={t}
              className={'chip' + (selected.has(t) ? ' active' : '')}
              onClick={() => toggle(t)}
            >{t}</button>
          ))}
        </div>
        <div className="lbl" style={{ marginBottom: 4 }}>Custom tag</div>
        <div className="row" style={{ gap: 5, marginBottom: 12 }}>
          <input
            className="field"
            placeholder="Custom tag (e.g. BLUFF_RAISE)"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn" onClick={addCustom} disabled={!custom.trim()}>Add</button>
        </div>
        <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </div>
  );
}
