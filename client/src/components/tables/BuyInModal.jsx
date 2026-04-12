import React, { useState, useEffect } from 'react';
import { colors } from '../../lib/colors.js';
import { apiFetch } from '../../lib/api.js';

export default function BuyInModal({ table, userId, onConfirm, onClose }) {
  const bb = table.bigBlind ?? table.config?.bb ?? 50;
  const [multiplier, setMultiplier] = useState(100);
  const [chipBalance, setChipBalance] = useState(null);

  useEffect(() => {
    if (!userId) return;
    apiFetch(`/api/players/${userId}/stats`).then((d) => {
      setChipBalance(d?.chip_bank ?? d?.chipBank ?? null);
    }).catch(() => {});
  }, [userId]);

  const buyInAmount = Math.round(multiplier * bb);
  const canAfford = chipBalance == null || chipBalance >= buyInAmount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="flex flex-col gap-5 rounded-xl w-full max-w-xs"
        style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`, padding: 24 }}
      >
        <h2 className="text-sm font-bold tracking-widest uppercase" style={{ color: colors.gold }}>
          Buy In — {table.name}
        </h2>

        {chipBalance != null && (
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Your chip bank: <span style={{ color: colors.textPrimary }}>{Number(chipBalance).toLocaleString()}</span>
          </p>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-xs tracking-widest uppercase" style={{ color: colors.textMuted }}>
            Amount: <span style={{ color: colors.textPrimary }}>{buyInAmount.toLocaleString()} chips ({multiplier} BB)</span>
          </label>
          <input
            type="range" min="50" max="200" step="10"
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            style={{ accentColor: colors.gold, width: '100%' }}
          />
          <div className="flex justify-between text-xs" style={{ color: colors.textMuted }}>
            <span>50 BB</span><span>200 BB</span>
          </div>
        </div>

        {!canAfford && (
          <p className="text-xs" style={{ color: colors.error }}>
            Insufficient chips — you need {buyInAmount.toLocaleString()} but have {Number(chipBalance).toLocaleString()}.
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#9ca3af' }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(buyInAmount)}
            disabled={!canAfford}
            className="text-xs px-4 py-2 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50"
            style={{ background: 'rgba(212,175,55,0.2)', border: `1px solid rgba(212,175,55,0.5)`, color: colors.gold }}
          >
            Join Table
          </button>
        </div>
      </div>
    </div>
  );
}
