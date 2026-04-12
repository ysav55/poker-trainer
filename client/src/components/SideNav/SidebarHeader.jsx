import React from 'react';
import { colors } from '../../lib/colors.js';
import { Coins } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

export default function SidebarHeader({ expanded, chipBalance, schoolName, studentsOnline, activeTables }) {
  const { user } = useAuth();
  const isCoach = COACH_ROLES.has(user?.role);
  const chipDisplay = chipBalance != null ? Number(chipBalance).toLocaleString() : 'N/A';

  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-1 py-3 px-2">
        <Coins size={16} style={{ color: colors.gold }} />
        <span className="text-[10px] font-mono tabular-nums" style={{ color: colors.textSecondary }}>
          {chipBalance != null ? Number(chipBalance).toLocaleString() : '—'}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-4" style={{ borderBottom: `1px solid ${colors.borderDefault}` }}>
      <span className="text-sm font-bold truncate" style={{ color: colors.textPrimary }}>
        {user?.name ?? 'User'}
      </span>
      <div className="flex items-center gap-1.5">
        <Coins size={14} style={{ color: colors.gold }} />
        <span className="text-xs font-mono tabular-nums" style={{ color: colors.textPrimary }}>
          {chipDisplay}
        </span>
      </div>
      {isCoach && studentsOnline != null && (
        <span className="text-xs" style={{ color: colors.textMuted }}>
          {studentsOnline} online · {activeTables ?? 0} tables
        </span>
      )}
      {!isCoach && schoolName && (
        <span className="text-xs truncate" style={{ color: colors.textMuted }}>
          {schoolName}
        </span>
      )}
    </div>
  );
}
