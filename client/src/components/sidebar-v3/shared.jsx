import React from 'react';

export function MiniCard({ code, ghost }) {
  if (ghost) return <span className="mini-card ghost">·</span>;
  if (!code || code === 'HIDDEN') {
    return (
      <span
        className="mini-card"
        style={{
          background: 'repeating-linear-gradient(45deg, rgba(201,163,93,0.15) 0 2px, transparent 2px 5px)',
          borderStyle: 'dashed',
        }}
      >?</span>
    );
  }
  const rank = code.slice(0, -1);
  const suit = code.slice(-1);
  const suitGlyph = { s: '♠', h: '♥', d: '♦', c: '♣' }[suit.toLowerCase()] || suit;
  const red = suit.toLowerCase() === 'h' || suit.toLowerCase() === 'd';
  return (
    <span className={'mini-card' + (red ? ' red' : '')}>
      {rank}{suitGlyph}
    </span>
  );
}

export function StatusPill({ state }) {
  const map = {
    live:     { color: '#4ad991', label: 'LIVE' },
    paused:   { color: '#f5b25b', label: 'PAUSED' },
    scenario: { color: '#9b7cff', label: 'SCENARIO' },
    review:   { color: '#6aa8ff', label: 'REVIEW' },
    drill:    { color: '#e8c84a', label: 'DRILL' },
  };
  const { color, label } = map[state] || map.live;
  return (
    <div className="sb-status" style={{ color }}>
      <span className="dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </div>
  );
}

export function Segmented({ options, value, onChange, cols }) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${cols || options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value ?? o}
          className={value === (o.value ?? o) ? 'active' : ''}
          onClick={() => onChange(o.value ?? o)}
        >{o.label ?? o}</button>
      ))}
    </div>
  );
}

// Reusable difficulty picker for coach add-bot affordances. Mirrors the
// segmented style but compact (chips). Currently easy/medium/hard — these
// are the levels BotDecisionService supports server-side.
export function DifficultyPicker({ value, onChange }) {
  const opts = [
    { v: 'easy',   label: 'Easy' },
    { v: 'medium', label: 'Medium' },
    { v: 'hard',   label: 'Hard' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {opts.map((o) => (
        <button
          key={o.v}
          className={'chip' + (value === o.v ? ' active' : '')}
          onClick={() => onChange(o.v)}
          style={{ flex: 1, justifyContent: 'center' }}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Head({ status }) {
  return (
    <div className="sb-head">
      <div className="sb-logo">
        FeltSide
      </div>
      <StatusPill state={status} />
    </div>
  );
}

const TABS = [
  { id: 'live',     label: 'Live' },
  { id: 'drills',   label: 'Drills' },
  { id: 'history',  label: 'History' },
  { id: 'review',   label: 'Review' },
  { id: 'setup',    label: 'Setup' },
];

export function TabBar({ tab, onTabChange }) {
  return (
    <div className="sb-tabs">
      {TABS.map((t) => (
        <div
          key={t.id}
          className={'sb-tab' + (tab === t.id ? ' active' : '')}
          onClick={() => onTabChange(t.id)}
        >{t.label}</div>
      ))}
    </div>
  );
}
