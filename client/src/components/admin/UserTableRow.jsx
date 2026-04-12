import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '../../lib/colors.js';

export function Pagination({ page, total, pageSize, onPage, label = 'user' }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const btnStyle = (disabled) => ({
    padding: '4px 10px', borderRadius: 4, fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    background: 'none', border: `1px solid ${colors.borderStrong}`,
    color: disabled ? colors.borderStrong : colors.textSecondary,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  });
  return (
    <div className="flex items-center justify-between mt-4" style={{ color: colors.textMuted, fontSize: 12 }}>
      <span>{total} {label}{total !== 1 ? 's' : ''} · page {page + 1} of {totalPages}</span>
      <div className="flex gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 0} style={btnStyle(page === 0)}>
          <ChevronLeft size={12} /> Prev
        </button>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1} style={btnStyle(page >= totalPages - 1)}>
          Next <ChevronRight size={12} />
        </button>
      </div>
    </div>
  );
}

const STATUS_STYLES = {
  active:    { bg: colors.successTint, border: colors.successBorder, text: colors.success },
  suspended: { bg: colors.warningTint, border: colors.warningBorder, text: colors.warning },
  archived:  { bg: colors.mutedTint,   border: colors.mutedBorder,   text: colors.textMuted },
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

function ActionsMenu({ user, currentUserRole, onViewProfile, onEdit, onResetPassword, onSuspend, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const isSuspended = user.status === 'suspended';
  const isSuperAdmin = currentUserRole === 'superadmin';

  const Item = ({ onClick, children, danger = false }) => (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); setOpen(false); }}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '7px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer',
        background: 'none', border: 'none',
        color: danger ? colors.error : colors.textPrimary,
        transition: 'background 0.08s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = danger ? colors.errorTint : colors.bgSurfaceHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
    >
      {children}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 28, height: 28, borderRadius: 4, border: `1px solid ${colors.borderStrong}`,
          background: open ? colors.goldSubtle : 'none',
          color: open ? colors.gold : colors.textMuted, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = colors.gold; e.currentTarget.style.color = colors.gold; }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.borderColor = colors.borderStrong;
            e.currentTarget.style.color = colors.textMuted;
          }
        }}
        title="Actions"
        aria-label="User actions"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: 32, zIndex: 100,
            background: colors.bgSurfaceRaised, border: `1px solid ${colors.borderStrong}`,
            borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            minWidth: 180, overflow: 'hidden',
          }}
        >
          <Item onClick={onViewProfile}>View Profile</Item>
          <Item onClick={onEdit}>Edit User</Item>
          <Item onClick={onResetPassword}>Reset Password</Item>
          <div style={{ height: 1, background: colors.borderDefault, margin: '3px 0' }} />
          <Item onClick={() => onSuspend(!isSuspended)} danger={!isSuspended}>
            {isSuspended ? 'Unsuspend' : 'Suspend'}
          </Item>
          {isSuperAdmin && (
            <Item onClick={() => alert('Login as user — audit log required (not yet implemented)')}>
              Login as User ★
            </Item>
          )}
          <div style={{ height: 1, background: colors.borderDefault, margin: '3px 0' }} />
          <Item onClick={onDelete} danger>Delete Account</Item>
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function UserTableRow({
  user,
  index,
  currentUserRole,
  gridTemplateColumns,
  isLast,
  onView,
  onEdit,
  onResetPassword,
  onSuspend,
  onDelete,
}) {
  const baseBg = index % 2 === 0 ? colors.bgSurface : colors.bgSurfaceRaised;
  return (
    <div
      className="grid items-center px-4 py-3"
      style={{
        gridTemplateColumns,
        borderBottom: isLast ? 'none' : `1px solid ${colors.borderDefault}`,
        background: baseBg,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = colors.goldSubtle; }}
      onMouseLeave={e => { e.currentTarget.style.background = baseBg; }}
    >
      <div className="flex flex-col gap-0.5 min-w-0 cursor-pointer" onClick={() => onView(user.id)}>
        <span
          className="text-sm font-medium truncate"
          style={{ color: colors.textPrimary }}
          onMouseEnter={e => { e.currentTarget.style.color = colors.gold; }}
          onMouseLeave={e => { e.currentTarget.style.color = colors.textPrimary; }}
        >
          {user.display_name || '—'}
        </span>
        {user.email && <span className="text-xs truncate" style={{ color: colors.textMuted }}>{user.email}</span>}
      </div>

      <div><RolePill role={user.role} /></div>
      <div><StatusBadge status={user.status} /></div>
      <div className="text-xs" style={{ color: colors.textMuted }}>
        {user.coach_name ?? (user.coach_id ? user.coach_id.slice(0, 8) + '…' : '—')}
      </div>
      <div className="text-xs font-mono" style={{ color: colors.textMuted }}>{formatDate(user.created_at)}</div>
      <div className="text-xs font-mono" style={{ color: colors.textMuted }}>{formatDate(user.last_seen)}</div>

      <div className="flex justify-end">
        <ActionsMenu
          user={user}
          currentUserRole={currentUserRole}
          onViewProfile={() => onView(user.id)}
          onEdit={() => onEdit(user)}
          onResetPassword={() => onResetPassword(user)}
          onSuspend={(suspend) => onSuspend(user, suspend)}
          onDelete={() => onDelete(user)}
        />
      </div>
    </div>
  );
}
