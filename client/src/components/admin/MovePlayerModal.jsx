import React, { useState } from 'react';
import { X } from 'lucide-react';
import { colors } from '../../lib/colors.js';

function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        background: colors.bgSurface,
        border: `1px solid ${colors.borderStrong}`,
        borderRadius: 6,
        color: value ? colors.textPrimary : colors.textMuted,
        padding: '7px 10px',
        fontSize: 13,
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export default function MovePlayerModal({ tables, onClose, onMove }) {
  const [fromTable, setFromTable] = useState('');
  const [toTable, setToTable] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [error, setError] = useState('');

  const fromPlayers = fromTable
    ? (tables.find(t => t.id === fromTable)?.players ?? [])
    : [];

  const handleMove = () => {
    if (!fromTable || !toTable || !playerId) {
      setError('All fields are required.');
      return;
    }
    onMove({ fromTableId: fromTable, toTableId: toTable, playerId });
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, borderRadius: 12, padding: 24, width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, borderBottom: `1px solid ${colors.borderStrong}`, paddingBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', color: colors.gold }}>MOVE PLAYER</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', color: colors.textMuted, cursor: 'pointer', display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>FROM TABLE</label>
            <Select
              value={fromTable}
              onChange={val => { setFromTable(val); setPlayerId(''); }}
              options={tables.map(t => ({ value: t.id, label: t.name ?? t.id }))}
              placeholder="Select source table"
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>PLAYER</label>
            <Select
              value={playerId}
              onChange={setPlayerId}
              options={fromPlayers.map(p => ({ value: p.id, label: p.name ?? p.id }))}
              placeholder={fromTable ? 'Select player' : 'Select source table first'}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: colors.textMuted, display: 'block', marginBottom: 4 }}>TO TABLE</label>
            <Select
              value={toTable}
              onChange={setToTable}
              options={tables.filter(t => t.id !== fromTable).map(t => ({ value: t.id, label: t.name ?? t.id }))}
              placeholder="Select target table"
            />
          </div>

          {error && <p style={{ fontSize: 12, color: colors.error, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button
              onClick={onClose}
              style={{ background: 'none', border: `1px solid ${colors.borderStrong}`, borderRadius: 6, color: colors.textSecondary, cursor: 'pointer', padding: '7px 16px', fontSize: 12 }}
            >
              Cancel
            </button>
            <button
              onClick={handleMove}
              style={{ background: colors.goldTint, border: `1px solid ${colors.goldBorder}`, borderRadius: 6, color: colors.gold, cursor: 'pointer', padding: '7px 16px', fontSize: 12, fontWeight: 700 }}
            >
              Move Player
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
