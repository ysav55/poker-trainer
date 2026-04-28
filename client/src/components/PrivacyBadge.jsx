import React from 'react';

const VARIANTS = {
  open:    null, // no badge for open tables
  school:  { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)', label: 'School' },
  private: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: 'rgba(100,116,139,0.35)', label: '🔒 Private' },
};

/**
 * PrivacyBadge — top-right privacy indicator on table cards.
 * Returns null for 'open' tables (no badge shown).
 * @param {string} privacy — 'open' | 'school' | 'private'
 */
export default function PrivacyBadge({ privacy }) {
  const v = VARIANTS[privacy];
  if (!v) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}
    >
      {v.label}
    </span>
  );
}
