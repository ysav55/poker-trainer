import React, { useState, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { colors } from '../../lib/colors';
import UserDrawerProfile from './UserDrawerProfile';
import UserDrawerRoleSchool from './UserDrawerRoleSchool';
import UserDrawerAccount from './UserDrawerAccount';

function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    if (!mounted) setMounted(true);
    setOpen(prev => !prev);
  };

  return (
    <div style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
      <button
        onClick={toggle}
        className="flex items-center justify-between w-full px-5 py-3 text-left"
        style={{ color: colors.textPrimary, background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-xs font-semibold tracking-wider uppercase">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {mounted && (
        <div style={{ display: open ? 'block' : 'none', padding: '0 20px 16px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

export default function UserDrawer({ userId, schools, onClose, onUserUpdated }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    apiFetch(`/api/admin/users/${userId}`)
      .then(data => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId]);

  const refreshUser = () => {
    apiFetch(`/api/admin/users/${userId}`).then(setUser);
    onUserUpdated?.();
  };

  if (!userId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
      />
      {/* Drawer */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col overflow-y-auto"
        style={{
          width: 420,
          background: colors.bgSurface,
          borderLeft: `1px solid ${colors.borderDefault}`,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${colors.borderDefault}` }}
        >
          <span className="text-sm font-bold" style={{ color: colors.textPrimary }}>
            User Details
          </span>
          <button onClick={onClose} style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span style={{ color: colors.textMuted }}>Loading…</span>
          </div>
        ) : !user ? (
          <div className="flex-1 flex items-center justify-center">
            <span style={{ color: colors.textMuted }}>User not found</span>
          </div>
        ) : (
          <div className="flex-1">
            <CollapsibleSection title="Profile" defaultOpen={true}>
              <UserDrawerProfile user={user} onUserUpdated={refreshUser} />
            </CollapsibleSection>
            <CollapsibleSection title="Role & School">
              <UserDrawerRoleSchool user={user} schools={schools} onUserUpdated={refreshUser} />
            </CollapsibleSection>
            <CollapsibleSection title="Account">
              <UserDrawerAccount user={user} onUserUpdated={refreshUser} onClose={onClose} />
            </CollapsibleSection>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
          <button
            onClick={onClose}
            className="w-full py-2 rounded text-sm font-semibold"
            style={{
              background: 'transparent',
              border: `1px solid ${colors.borderDefault}`,
              color: colors.textMuted,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
