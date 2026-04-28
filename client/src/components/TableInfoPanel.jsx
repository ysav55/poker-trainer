import React from 'react';

// ── Mode metadata ─────────────────────────────────────────────────────────────

const MODE_INFO = {
  uncoached_cash: {
    label: 'Auto Cash Game',
    description: 'Hands deal automatically. No undo, no coach controls. Play at your own pace.',
  },
  tournament: {
    label: 'Tournament',
    description: 'Tournament format with escalating blinds. Eliminations are final.',
  },
};

const DEFAULT_INFO = {
  label: 'Table',
  description: 'Game in progress.',
};

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * TableInfoPanel — shown instead of CoachSidebar on uncoached or tournament tables.
 *
 * Props:
 *   mode  'uncoached_cash' | 'tournament'
 */
export default function TableInfoPanel({ mode }) {
  const info = MODE_INFO[mode] ?? DEFAULT_INFO;

  return (
    <div className="w-56 rounded-xl bg-[#161b22] border border-[#30363d] p-4 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#8b949e] mb-1">
        Mode
      </p>
      <p className="text-base font-semibold text-white mb-3">
        {info.label}
      </p>
      <p className="text-xs text-[#8b949e] leading-relaxed">
        {info.description}
      </p>
    </div>
  );
}
