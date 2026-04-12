import React, { useState } from 'react';
import { colors } from '../../lib/colors.js';

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: colors.textMuted }}>
        {label.toUpperCase()}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{value}</span>
    </div>
  );
}

const VARIANT_STYLES = {
  info:    { color: colors.info,    tint: colors.infoTint,    border: colors.infoBorder },
  muted:   { color: colors.textSecondary, tint: colors.mutedTint, border: colors.mutedBorder },
  gold:    { color: colors.gold,    tint: colors.goldTint,    border: colors.goldBorder },
  danger:  { color: colors.error,   tint: colors.errorTint,   border: colors.errorBorder },
};

function ActionBtn({ onClick, label, variant = 'muted', disabled }) {
  const [hover, setHover] = useState(false);
  const style = VARIANT_STYLES[variant] ?? VARIANT_STYLES.muted;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && !disabled ? style.tint : 'none',
        border: `1px solid ${disabled ? colors.mutedBorder : style.border}`,
        borderRadius: 5,
        color: disabled ? colors.textMuted : style.color,
        fontSize: 11,
        fontWeight: 700,
        padding: '5px 10px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.06em',
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}

export default function TournamentTableCard({ table, onAdvanceLevel, onEndTournament, onMovePlayer, onNavigate }) {
  const [advancing, setAdvancing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const handleAdvance = async () => {
    setAdvancing(true);
    try { await onAdvanceLevel(table.id); } finally { setAdvancing(false); }
  };

  const handleEnd = async () => {
    if (!confirmEnd) { setConfirmEnd(true); return; }
    setEnding(true);
    try { await onEndTournament(table.id); } finally { setEnding(false); setConfirmEnd(false); }
  };

  const activePlayers = (table.players ?? []).filter(p => (p.stack ?? 0) > 0).length;
  const totalPlayers = (table.players ?? []).length;

  return (
    <div
      style={{
        background: colors.bgSurfaceRaised,
        border: `1px solid ${colors.goldBorder}`,
        borderRadius: 10,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>{table.name ?? table.id}</span>
        <span
          style={{
            fontSize: 10,
            background: colors.goldTint,
            border: `1px solid ${colors.goldBorder}`,
            borderRadius: 4,
            padding: '2px 7px',
            color: colors.gold,
            fontWeight: 700,
            letterSpacing: '0.1em',
          }}
        >
          TOURNAMENT
        </span>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <Stat label="Active" value={`${activePlayers} / ${totalPlayers}`} />
        {table.currentLevel && <Stat label="Level" value={table.currentLevel.level ?? '—'} />}
        {table.currentLevel && <Stat label="Blinds" value={`${table.currentLevel.sb}/${table.currentLevel.bb}`} />}
      </div>

      {totalPlayers > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {(table.players ?? []).map((p, i) => {
            const out = (p.stack ?? 0) <= 0;
            return (
              <div key={p.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span style={{ color: out ? colors.textMuted : colors.textPrimary, textDecoration: out ? 'line-through' : 'none' }}>
                  {p.name ?? p.id ?? `Player ${i + 1}`}
                </span>
                <span style={{ color: colors.textSecondary, fontFamily: 'monospace', fontSize: 11 }}>
                  {(p.stack ?? 0).toLocaleString('en-US')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        <ActionBtn onClick={() => onNavigate(table.id)} label="Monitor" variant="info" />
        <ActionBtn onClick={() => onMovePlayer(table)} label="Move Player" variant="muted" />
        <ActionBtn onClick={handleAdvance} label={advancing ? '…' : 'Adv. Level'} variant="gold" disabled={advancing} />
        <ActionBtn
          onClick={handleEnd}
          label={confirmEnd ? (ending ? '…' : 'Confirm End') : 'End'}
          variant="danger"
          disabled={ending}
        />
      </div>
    </div>
  );
}
