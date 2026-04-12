import React from 'react';
import { RefreshCw } from 'lucide-react';
import { colors } from '../../lib/colors.js';

const ROLES = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student'];
const STATUSES = ['active', 'suspended', 'archived'];

const STATUS_STYLES = {
  active:    { bg: colors.successTint, text: colors.success },
  suspended: { bg: colors.warningTint, text: colors.warning },
  archived:  { bg: colors.mutedTint,   text: colors.textMuted },
};

export default function UserFilters({
  search,
  onSearchChange,
  filterRole,
  onFilterRoleChange,
  filterStatus,
  onFilterStatusChange,
  loading,
  onRefresh,
}) {
  return (
    <div
      className="rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center gap-3"
      style={{ background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}` }}
    >
      <div className="flex-1" style={{ minWidth: 180 }}>
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded pl-3 pr-3 py-1.5 text-sm outline-none"
          style={{ background: colors.bgSurface, border: `1px solid ${colors.borderStrong}`, color: colors.textPrimary }}
          onFocus={e => { e.currentTarget.style.borderColor = colors.gold; }}
          onBlur={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
        />
      </div>

      <select
        value={filterRole}
        onChange={e => onFilterRoleChange(e.target.value)}
        className="rounded px-3 py-1.5 text-sm outline-none"
        style={{
          background: colors.bgSurface,
          border: `1px solid ${colors.borderStrong}`,
          color: filterRole ? colors.textPrimary : colors.textMuted,
          cursor: 'pointer',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = colors.gold; }}
        onBlur={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
      >
        <option value="">All roles</option>
        {ROLES.map(r => (
          <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
        ))}
      </select>

      <div className="flex rounded overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}` }}>
        {STATUSES.map((s, i) => {
          const active = filterStatus === s;
          const style = STATUS_STYLES[s];
          return (
            <button
              key={s}
              onClick={() => onFilterStatusChange(active ? '' : s)}
              className="px-3 py-1.5 text-xs font-semibold tracking-wider"
              style={{
                background: active ? style.bg : 'transparent',
                color: active ? style.text : colors.textMuted,
                border: 'none',
                cursor: 'pointer',
                borderRight: i !== STATUSES.length - 1 ? `1px solid ${colors.borderStrong}` : 'none',
              }}
            >
              {s.toUpperCase()}
            </button>
          );
        })}
      </div>

      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          width: 32,
          height: 32,
          borderRadius: 4,
          background: 'none',
          border: `1px solid ${colors.borderStrong}`,
          color: colors.textMuted,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: loading ? 0.5 : 1,
          flexShrink: 0,
        }}
        title="Refresh"
        aria-label="Refresh"
        onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = colors.gold; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderStrong; }}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
