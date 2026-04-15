import React from 'react';
import { colors } from '../../lib/colors.js';

// ─── Shared primitives ────────────────────────────────────────────────────────

export function SectionHeader({ title, icon: Icon }) {
  return (
    <div className="mb-3 mt-5 first:mt-0 flex items-center gap-2">
      {Icon && <Icon size={14} style={{ color: colors.textMuted }} />}
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: colors.textMuted }}>
        {title}
      </span>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1 mb-3">
      <label className="text-sm font-semibold" style={{ color: colors.textPrimary }}>{label}</label>
      {children}
      {hint && <span className="text-xs" style={{ color: colors.textMuted }}>{hint}</span>}
    </div>
  );
}

const inputCls = 'rounded px-3 py-1.5 text-sm outline-none';
const inputStyle = { background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary };

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
              ? { background: colors.gold, color: colors.bgSurface }
              : { background: colors.borderDefault, color: colors.textMuted, border: `1px solid ${colors.borderStrong}` }
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
      style={{ background: colors.gold, color: colors.bgSurface }}
    >
      {label}
    </button>
  );
}

export function Card({ children }) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}` }}
    >
      {children}
    </div>
  );
}
