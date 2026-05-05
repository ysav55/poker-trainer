import React from 'react';

/**
 * StatPill — a single stat card: large value + label + optional trend arrow.
 *
 * Props:
 *   value    {string|number}  — main number/text
 *   label    {string}         — descriptor below the value (can be multi-line via \n)
 *   trend    {'up'|'down'|null} — optional trend indicator
 */
export default function StatPill({ value, label, trend }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-4 py-3 rounded-lg min-w-[90px]"
      style={{
        background: '#161b22',
        border: '1px solid #30363d',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color: '#e6edf3' }}
        >
          {value}
        </span>
        {trend === 'up' && (
          <span className="text-xs font-bold" style={{ color: '#4ade80' }}>▲</span>
        )}
        {trend === 'down' && (
          <span className="text-xs font-bold" style={{ color: '#f87171' }}>▼</span>
        )}
      </div>
      <div
        className="mt-1 text-[10px] font-medium text-center leading-tight"
        style={{ color: '#8b949e' }}
      >
        {label}
      </div>
    </div>
  );
}
