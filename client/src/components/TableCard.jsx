import React from 'react';
import StatusBadge from './StatusBadge';
import PrivacyBadge from './PrivacyBadge';

/**
 * TableCard — lobby table preview card.
 *
 * Props:
 *   table {object}:
 *     id          {string}
 *     name        {string}
 *     status      {string}     — 'active'|'waiting'|'paused'|'scenario'|'tournament'
 *     privacy     {string}     — 'open'|'school'|'private'
 *     gameType    {string}     — e.g. 'NLHE'
 *     tableType   {string}     — 'Cash'|'Tournament'
 *     maxPlayers  {number}
 *     playerCount {number}
 *     smallBlind  {number}
 *     bigBlind    {number}
 *     pot         {number?}
 *     controller  {string?}    — coach name if applicable
 *     actionLabel {string}     — 'JOIN'|'SPECTATE'|'MANAGE'|'PLAYING'|'REGISTER'
 *
 *   onAction {fn(tableId)}
 *   onSecondaryAction {fn(tableId)?}  — optional second action (e.g. "MANAGE" alongside "PLAY")
 *   secondaryActionLabel {string?}
 *   showController {bool}     — whether to show the "Controller:" line (false for students)
 */
const MODE_BADGE = {
  coached_cash:   { label: 'Coached',    bg: 'rgba(212,175,55,0.15)',  color: '#d4af37',  border: 'rgba(212,175,55,0.4)' },
  uncoached_cash: { label: 'Auto Deal',  bg: 'rgba(74,222,128,0.12)',  color: '#4ade80',  border: 'rgba(74,222,128,0.35)' },
  tournament:     { label: 'Tournament', bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa',  border: 'rgba(96,165,250,0.35)' },
  bot_cash:       { label: 'Bot Table',  bg: 'rgba(167,139,250,0.12)', color: '#a78bfa',  border: 'rgba(167,139,250,0.35)' },
};

export default function TableCard({ table, onAction, onSecondaryAction, showController = false }) {
  const {
    id,
    name,
    status = 'waiting',
    privacy = 'open',
    gameType = 'NLHE',
    tableType = 'Cash',
    mode,
    maxPlayers = 9,
    playerCount = 0,
    smallBlind,
    bigBlind,
    pot,
    controller,
    actionLabel = 'JOIN',
    secondaryActionLabel = null,
  } = table;

  const modeBadge = mode ? MODE_BADGE[mode] : null;

  const actionColors = {
    JOIN:      { bg: 'rgba(212,175,55,0.15)', color: '#d4af37', border: 'rgba(212,175,55,0.4)' },
    PLAYING:   { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80', border: 'rgba(34,197,94,0.4)' },
    SPECTATE:  { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: 'rgba(100,116,139,0.35)' },
    MANAGE:    { bg: 'rgba(212,175,55,0.2)',   color: '#d4af37', border: 'rgba(212,175,55,0.5)' },
    REGISTER:  { bg: 'rgba(59,130,246,0.15)',  color: '#60a5fa', border: 'rgba(59,130,246,0.4)' },
  };
  const actionStyle = actionColors[actionLabel] ?? actionColors.SPECTATE;

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden transition-all duration-150"
      style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        minHeight: 160,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#d4af37'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#30363d'; }}
    >
      {/* Top row: status + privacy */}
      <div className="flex items-center justify-between px-3 pt-3">
        <StatusBadge status={status} />
        <PrivacyBadge privacy={privacy} />
      </div>

      {/* Name + subtitle */}
      <div className="px-3 pt-2">
        <div
          className="text-sm font-semibold leading-tight truncate"
          style={{ color: '#e6edf3' }}
        >
          {name}
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: '#8b949e' }}>
          {gameType} · {tableType}
        </div>
        {modeBadge && (
          <div className="mt-1">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: modeBadge.bg, color: modeBadge.color, border: `1px solid ${modeBadge.border}` }}
            >
              {modeBadge.label}
            </span>
          </div>
        )}
      </div>

      {/* Info chips */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <InfoChip value={`${playerCount}/${maxPlayers}`} label="seats" />
        {smallBlind != null && bigBlind != null && (
          <InfoChip value={`${smallBlind}/${bigBlind}`} label="blinds" />
        )}
        {pot != null && (
          <InfoChip value={pot.toLocaleString()} label="pot" />
        )}
      </div>

      {/* Controller line */}
      {showController && controller && (
        <div className="px-3 pt-1.5 text-[10px]" style={{ color: '#6e7681' }}>
          Controller: {controller}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Action button(s) */}
      <div className="px-3 pb-3 pt-2">
        {secondaryActionLabel && onSecondaryAction ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onAction?.(id)}
              className="py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-all duration-150 active:scale-95"
              style={{
                flex: 1,
                background: actionStyle.bg,
                color: actionStyle.color,
                border: `1px solid ${actionStyle.border}`,
              }}
            >
              {actionLabel}
            </button>
            <button
              onClick={() => onSecondaryAction?.(id)}
              className="py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-all duration-150 active:scale-95"
              style={{
                flex: 1,
                background: (actionColors[secondaryActionLabel] ?? actionColors.SPECTATE).bg,
                color: (actionColors[secondaryActionLabel] ?? actionColors.SPECTATE).color,
                border: `1px solid ${(actionColors[secondaryActionLabel] ?? actionColors.SPECTATE).border}`,
              }}
            >
              {secondaryActionLabel}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onAction?.(id)}
            className="w-full py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-all duration-150 active:scale-95"
            style={{
              background: actionStyle.bg,
              color: actionStyle.color,
              border: `1px solid ${actionStyle.border}`,
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function InfoChip({ value, label }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-2 py-1 rounded"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #30363d', minWidth: 44 }}
    >
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: '#e6edf3' }}>
        {value}
      </span>
      <span className="text-[9px]" style={{ color: '#8b949e' }}>{label}</span>
    </div>
  );
}
