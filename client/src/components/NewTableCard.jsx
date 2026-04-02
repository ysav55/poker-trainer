import React from 'react';

/**
 * NewTableCard — ghost/dashed card for "+ New Table".
 * Visible only to users with table:create permission.
 *
 * Props:
 *   onClick {fn}
 */
export default function NewTableCard({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center rounded-lg transition-all duration-150 active:scale-95"
      style={{
        background: 'transparent',
        border: '2px dashed #30363d',
        minHeight: 160,
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#d4af37';
        e.currentTarget.style.background = 'rgba(212,175,55,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#30363d';
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <span className="text-3xl mb-2" style={{ color: '#30363d', lineHeight: 1 }}>+</span>
      <span className="text-xs font-medium" style={{ color: '#6e7681' }}>New Table</span>
    </button>
  );
}
