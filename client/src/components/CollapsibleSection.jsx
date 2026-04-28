import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { colors } from '../lib/colors.js';

function getInitialOpen(storageKey, defaultOpen) {
  if (storageKey) {
    const stored = localStorage.getItem(`section-${storageKey}`);
    if (stored !== null) return stored === 'true';
  }
  return defaultOpen;
}

export default function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  storageKey,
  headerExtra = null,
  onToggle = null,
}) {
  const [open, setOpen] = useState(() => getInitialOpen(storageKey, defaultOpen));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) localStorage.setItem(`section-${storageKey}`, String(next));
    if (onToggle) onToggle(next);
  };

  return (
    <div
      className="coach-panel mb-3 rounded-lg overflow-hidden"
      style={{
        background: colors.bgSurfaceRaised,
        border: `1px solid ${colors.borderDefault}`,
      }}
    >
      <div className="flex items-center justify-between mb-2 px-4 py-3">
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 flex-1 min-w-0"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          aria-expanded={open}
        >
          <ChevronRight
            size={14}
            style={{
              color: colors.textMuted,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              flexShrink: 0,
            }}
          />
          <span
            className="label-sm"
            style={{
              color: colors.gold,
              letterSpacing: '0.12em',
            }}
          >
            {title}
          </span>
        </button>
        {headerExtra}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

