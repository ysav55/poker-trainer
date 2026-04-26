import React from 'react';
import { colors } from '../../lib/colors.js';
import { STAT_CATALOG, STAT_GROUPS, MAX_COLUMNS } from '../../lib/leaderboardStats.js';

export default function LeaderboardColumnPicker({ columns, sortBy, onChange }) {
  const allStats = Object.keys(STAT_CATALOG);
  const selected = columns.filter(c => allStats.includes(c));
  const available = allStats.filter(c => !selected.includes(c));

  function addStat(stat) {
    if (selected.length >= MAX_COLUMNS) return;
    const next = [...selected, stat];
    onChange(next, next.includes(sortBy) ? sortBy : next[0]);
  }
  function removeStat(stat) {
    const next = selected.filter(c => c !== stat);
    if (next.length === 0) return;
    const nextSort = stat === sortBy ? next[0] : sortBy;
    onChange(next, nextSort);
  }
  function moveUp(idx) {
    if (idx <= 0) return;
    const next = [...selected];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next, sortBy);
  }
  function moveDown(idx) {
    if (idx >= selected.length - 1) return;
    const next = [...selected];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next, sortBy);
  }
  function toggleSort(stat) {
    onChange(selected, stat);
  }

  const pillStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px', borderRadius: 6, fontSize: 12,
    background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`,
    color: colors.textPrimary,
  };
  const btnStyle = {
    background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px',
    fontSize: 11, color: colors.textMuted, lineHeight: 1,
  };

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold mb-2" style={{ color: colors.textPrimary }}>
        Columns <span style={{ color: colors.textMuted, fontWeight: 400 }}>({selected.length}/{MAX_COLUMNS})</span>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Available */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-xs mb-1" style={{ color: colors.textMuted }}>Available</div>
          <div style={{ background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 8, padding: 8, maxHeight: 220, overflowY: 'auto' }}>
            {STAT_GROUPS.map(group => {
              const groupStats = available.filter(s => STAT_CATALOG[s].group === group.id);
              if (groupStats.length === 0) return null;
              return (
                <div key={group.id} className="mb-2 last:mb-0">
                  <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: colors.textMuted, fontSize: 9 }}>{group.label}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {groupStats.map(stat => (
                      <button
                        key={stat}
                        onClick={() => addStat(stat)}
                        disabled={selected.length >= MAX_COLUMNS}
                        className="text-xs px-2 py-1 rounded transition-colors"
                        style={{
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.borderDefault}`,
                          color: selected.length >= MAX_COLUMNS ? colors.textMuted : colors.textSecondary,
                          cursor: selected.length >= MAX_COLUMNS ? 'not-allowed' : 'pointer',
                        }}
                      >
                        + {STAT_CATALOG[stat].label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {available.length === 0 && <div className="text-xs" style={{ color: colors.textMuted }}>All stats selected</div>}
          </div>
        </div>

        {/* Selected */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-xs mb-1" style={{ color: colors.textMuted }}>Selected (display order)</div>
          <div style={{ background: colors.bgSurface, border: `1px solid ${colors.borderDefault}`, borderRadius: 8, padding: 8, minHeight: 60 }}>
            {selected.map((stat, idx) => (
              <div key={stat} style={{ ...pillStyle, marginBottom: idx < selected.length - 1 ? 4 : 0 }}>
                {/* Star toggle */}
                <button
                  onClick={() => toggleSort(stat)}
                  title={stat === sortBy ? 'Primary sort column' : 'Set as sort column'}
                  style={{ ...btnStyle, color: stat === sortBy ? colors.gold : colors.textMuted, fontSize: 14 }}
                >
                  {stat === sortBy ? '\u2605' : '\u2606'}
                </button>
                {/* Label */}
                <span style={{ flex: 1, fontWeight: stat === sortBy ? 600 : 400 }}>
                  {STAT_CATALOG[stat].label}
                </span>
                {/* Move buttons */}
                <button onClick={() => moveUp(idx)} disabled={idx === 0} style={{ ...btnStyle, opacity: idx === 0 ? 0.3 : 1 }}>{'\u25B2'}</button>
                <button onClick={() => moveDown(idx)} disabled={idx === selected.length - 1} style={{ ...btnStyle, opacity: idx === selected.length - 1 ? 0.3 : 1 }}>{'\u25BC'}</button>
                {/* Remove */}
                <button
                  onClick={() => removeStat(stat)}
                  disabled={selected.length <= 1}
                  style={{ ...btnStyle, color: '#f87171', opacity: selected.length <= 1 ? 0.3 : 1 }}
                >
                  {'\u2715'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
