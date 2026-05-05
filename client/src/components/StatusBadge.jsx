import React from 'react';

const VARIANTS = {
  active:     { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80', border: 'rgba(34,197,94,0.4)',  label: 'Active' },
  waiting:    { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.4)', label: 'Waiting' },
  paused:     { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: 'rgba(245,158,11,0.4)',  label: 'Paused' },
  scenario:   { bg: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: 'rgba(139,92,246,0.4)', label: 'Scenario' },
  tournament: { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)', label: 'Tournament' },
};

/**
 * StatusBadge — colored pill for table/session status.
 * @param {string} status — 'active' | 'waiting' | 'paused' | 'scenario' | 'tournament'
 */
export default function StatusBadge({ status }) {
  const v = VARIANTS[status] ?? VARIANTS.waiting;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
      style={{ background: v.bg, color: v.color, border: `1px solid ${v.border}` }}
    >
      {v.label}
    </span>
  );
}
