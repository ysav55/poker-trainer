import React from 'react';
import { NavLink } from 'react-router-dom';
import { colors } from '../../lib/colors.js';

export default function NavItem({ icon: Icon, label, path, expanded, active, badge }) {
  return (
    <NavLink
      to={path}
      className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors no-underline"
      style={{
        borderLeft: active ? `3px solid ${colors.gold}` : '3px solid transparent',
        background: active ? colors.goldSubtle : 'transparent',
        color: active ? colors.gold : colors.textSecondary,
      }}
      title={!expanded ? label : undefined}
    >
      <Icon size={20} className="shrink-0" />
      {expanded && (
        <span className="text-xs font-medium truncate">{label}</span>
      )}
      {badge && (
        <span
          data-testid="nav-badge"
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: colors.error, marginLeft: expanded ? 'auto' : 0 }}
        />
      )}
    </NavLink>
  );
}
