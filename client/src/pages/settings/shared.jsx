import React from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

export const GOLD = '#d4af37';

// ─── Shared primitives ────────────────────────────────────────────────────────

export function SectionHeader({ title }) {
  return (
    <div className="mb-3 mt-5 first:mt-0">
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#6e7681' }}>
        {title}
      </span>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-sm font-semibold" style={{ color: '#e5e7eb' }}>{label}</label>
      {children}
      {hint && <span className="text-xs" style={{ color: '#6e7681' }}>{hint}</span>}
    </div>
  );
}

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: '#0d1117', border: '1px solid #30363d', color: '#e5e7eb' };

export function Input({ value, onChange, type = 'text', placeholder, ...props }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
      style={inputStyle}
      {...props}
    />
  );
}

export function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={inputCls}
      style={inputStyle}
    >
      {children}
    </select>
  );
}

export function Toggle({ value, onChange, yes = 'Yes', no = 'No' }) {
  return (
    <div className="flex gap-2">
      {[true, false].map(v => (
        <button
          key={String(v)}
          onClick={() => onChange(v)}
          className="px-4 py-1.5 rounded text-sm font-semibold transition-colors"
          style={
            value === v
              ? { background: GOLD, color: '#0d1117' }
              : { background: '#21262d', color: '#6e7681', border: '1px solid #30363d' }
          }
        >
          {v ? yes : no}
        </button>
      ))}
    </div>
  );
}

export function SaveButton({ onClick, label = 'Save' }) {
  return (
    <button
      onClick={onClick}
      className="mt-5 px-5 py-2 rounded text-sm font-bold"
      style={{ background: GOLD, color: '#0d1117' }}
    >
      {label}
    </button>
  );
}

export function Card({ children }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: '#161b22', border: '1px solid #30363d' }}
    >
      {children}
    </div>
  );
}
