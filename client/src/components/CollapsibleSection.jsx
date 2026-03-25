import React, { useState } from 'react';

export default function CollapsibleSection({ title, children, defaultOpen = true, headerExtra = null, onToggle = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (onToggle) onToggle(next);
  };
  return (
    <div className="coach-panel mb-3">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 flex-1 min-w-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span className="label-sm" style={{ color: '#d4af37', letterSpacing: '0.12em' }}>{title}</span>
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            style={{
              color: '#6e7681',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          >
            <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {headerExtra}
      </div>
      {open && children}
    </div>
  );
}
