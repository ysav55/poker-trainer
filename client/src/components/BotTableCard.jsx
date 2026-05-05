import React from 'react';

const GOLD  = '#d4af37';
const PANEL = { background: '#161b22', border: '1px solid #30363d', borderRadius: 8 };

const PHASE_STYLE = {
  waiting:  { background: 'rgba(100,116,139,0.2)', color: '#94a3b8', border: '1px solid rgba(100,116,139,0.35)' },
  preflop:  { background: 'rgba(59,130,246,0.2)',  color: '#93c5fd', border: '1px solid rgba(59,130,246,0.35)' },
  flop:     { background: 'rgba(34,197,94,0.2)',   color: '#86efac', border: '1px solid rgba(34,197,94,0.35)' },
  turn:     { background: 'rgba(245,158,11,0.2)',  color: '#fcd34d', border: '1px solid rgba(245,158,11,0.35)' },
  river:    { background: 'rgba(239,68,68,0.2)',   color: '#fca5a5', border: '1px solid rgba(239,68,68,0.35)' },
  showdown: { background: 'rgba(212,175,55,0.2)',  color: '#d4af37', border: '1px solid rgba(212,175,55,0.35)' },
};

const DIFF_STYLE = {
  easy:   { background: 'rgba(34,197,94,0.15)',  color: '#86efac', border: '1px solid rgba(34,197,94,0.3)'  },
  medium: { background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)' },
  hard:   { background: 'rgba(239,68,68,0.15)',  color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)'  },
};

function Pill({ children, style }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={style}
    >
      {children}
    </span>
  );
}

/**
 * BotTableCard — displays a single bot table with human/bot counts, phase,
 * difficulty, and a JOIN button.
 *
 * Props:
 *   table  — bot table object from GET /api/bot-tables
 *   onJoin — (tableId: string) => void
 */
export default function BotTableCard({ table, onJoin }) {
  const tableId    = table.id ?? table.tableId;
  const name       = table.name ?? `Bot Table ${String(tableId).slice(0, 6)}`;
  const phase      = (table.phase ?? 'waiting').toLowerCase();
  const difficulty = (table.difficulty ?? 'medium').toLowerCase();
  const humanCount = table.human_count ?? table.humanCount ?? 0;
  const botCount   = table.bot_count   ?? table.botCount   ?? 0;
  const phaseStyle = PHASE_STYLE[phase]      ?? PHASE_STYLE.waiting;
  const diffStyle  = DIFF_STYLE[difficulty]  ?? DIFF_STYLE.medium;

  return (
    <div
      data-testid="bot-table-card"
      style={{ ...PANEL, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {/* Name */}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-white leading-tight flex-1 min-w-0 truncate">
          {name}
        </span>
        <Pill style={diffStyle}>{difficulty.toUpperCase()}</Pill>
      </div>

      {/* Phase */}
      <div className="flex items-center gap-2 flex-wrap">
        <Pill style={phaseStyle}>{phase.toUpperCase()}</Pill>
      </div>

      {/* Human / bot counts */}
      <div className="flex items-center gap-3 text-xs">
        <span data-testid="human-count" className="flex items-center gap-1 text-gray-300">
          <span>👤</span>
          <span>{humanCount} human{humanCount !== 1 ? 's' : ''}</span>
        </span>
        <span data-testid="bot-count" className="flex items-center gap-1 text-gray-500">
          <span>🤖</span>
          <span>{botCount} bot{botCount !== 1 ? 's' : ''}</span>
        </span>
      </div>

      {/* JOIN button */}
      <div className="flex justify-end mt-auto">
        <button
          data-testid="join-button"
          onClick={() => onJoin(tableId)}
          className="text-xs px-3 py-1.5 rounded font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
          style={{ background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.45)', color: GOLD }}
        >
          JOIN
        </button>
      </div>
    </div>
  );
}
