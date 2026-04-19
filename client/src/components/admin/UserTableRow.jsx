import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '../../lib/colors.js';

export function Pagination({ page, pageCount, onPrev, onNext }) {
  if (pageCount <= 1) return <span />;
  const btnStyle = (disabled) => ({
    padding: '4px 10px', borderRadius: 4, fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: 'none', border: `1px solid ${colors.borderStrong}`,
    color: disabled ? colors.borderStrong : colors.textSecondary,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  });
  return (
    <div className="flex items-center gap-2" style={{ color: colors.textMuted, fontSize: 12 }}>
      <button onClick={onPrev} disabled={page === 0} style={btnStyle(page === 0)}>
        <ChevronLeft size={12} /> Prev
      </button>
      <span style={{ fontSize: 11, minWidth: 70, textAlign: 'center' }}>
        Page {page + 1} of {pageCount}
      </span>
      <button onClick={onNext} disabled={page >= pageCount - 1} style={btnStyle(page >= pageCount - 1)}>
        Next <ChevronRight size={12} />
      </button>
    </div>
  );
}

const STATUS_STYLES = {
  active:    { bg: colors.successTint,  border: colors.successBorder, text: colors.success },
  suspended: { bg: colors.warningTint,  border: colors.warningBorder, text: colors.warning },
  archived:  { bg: colors.mutedTint,    border: colors.mutedBorder,   text: colors.textMuted },
};

export function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.archived;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold tracking-wider whitespace-nowrap"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
    >
      {status ? status.toUpperCase() : '—'}
    </span>
  );
}

export function RolePill({ role }) {
  if (!role) return null;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: colors.infoTint, border: `1px solid ${colors.infoBorder}`, color: colors.info }}
    >
      {role}
    </span>
  );
}

function relativeTime(iso) {
  if (!iso) return 'Never';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs)) return 'Never';
  const mins  = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days  = Math.floor(diffMs / 86_400_000);
  if (mins  <  1) return 'Just now';
  if (hours <  1) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function UserTableRow({ user, onClick }) {
  const isCoach = user.role === 'coach';

  return (
    <tr
      onClick={() => onClick?.(user.id)}
      style={{ cursor: 'pointer', borderBottom: `1px solid ${colors.borderDefault}` }}
      onMouseEnter={e => { e.currentTarget.style.background = colors.goldSubtle; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
    >
      {/* Name / Email */}
      <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold truncate" style={{ color: colors.textPrimary }}>
            {user.display_name || '—'}
          </span>
          {user.email && (
            <span className="text-xs truncate" style={{ color: colors.textMuted }}>
              {user.email}
            </span>
          )}
        </div>
      </td>

      {/* Role */}
      <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
        <span
          className="text-xs font-medium"
          style={{ color: isCoach ? colors.gold : colors.textMuted }}
        >
          {user.role || '—'}
        </span>
      </td>

      {/* Status */}
      <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
        <StatusBadge status={user.status} />
      </td>

      {/* Last Seen */}
      <td style={{ padding: '10px 16px', verticalAlign: 'middle' }}>
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {relativeTime(user.last_seen)}
        </span>
      </td>
    </tr>
  );
}
