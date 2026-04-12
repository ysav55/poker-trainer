import React from 'react';
import { useLocation } from 'react-router-dom';
import {
  Home, Table2, Trophy, Clock, Medal,
  Users, FolderOpen, Target,
  Settings, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { colors } from '../../lib/colors.js';
import { useSidebarState } from './useSidebarState.js';
import SidebarHeader from './SidebarHeader.jsx';
import NavGroup from './NavGroup.jsx';
import NavItem from './NavItem.jsx';

const COACH_ROLES = new Set(['coach', 'admin', 'superadmin']);

const HOME_ITEMS = [
  { icon: Home,   label: 'Dashboard',   path: '/dashboard' },
  { icon: Table2, label: 'Tables',      path: '/tables' },
  { icon: Trophy, label: 'Tournaments', path: '/tournaments' },
  { icon: Clock,  label: 'History',     path: '/history' },
  { icon: Medal,  label: 'Leaderboard', path: '/leaderboard' },
];

const COACHING_ITEMS = [
  { icon: Users,      label: 'Students',  path: '/students',    badgeKey: 'students' },
  { icon: FolderOpen, label: 'Groups',    path: '/groups' },
  { icon: Target,     label: 'Scenarios', path: '/admin/hands' },
];

export default function SideNav({ chipBalance, badges = {}, schoolName, studentsOnline, activeTables }) {
  const { user } = useAuth();
  const location = useLocation();
  const { expanded, toggle } = useSidebarState();
  const role = user?.role;
  const showCoaching = COACH_ROLES.has(role);

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <nav
      className="flex flex-col shrink-0 h-full overflow-y-auto overflow-x-hidden"
      style={{
        width: expanded ? 220 : 56,
        background: colors.bgSurface,
        borderRight: `1px solid ${colors.borderDefault}`,
        transition: 'width 0.15s ease',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-3" style={{ minHeight: 48 }}>
        <span className="text-base" style={{ color: colors.gold }}>♠</span>
        {expanded && (
          <span className="text-sm font-bold tracking-wide" style={{ color: colors.gold }}>
            Holdem Hub
          </span>
        )}
      </div>

      {/* User info + chips */}
      <SidebarHeader
        expanded={expanded}
        chipBalance={chipBalance}
        schoolName={schoolName}
        studentsOnline={studentsOnline}
        activeTables={activeTables}
      />

      {/* HOME */}
      <NavGroup label="HOME" expanded={expanded}>
        {HOME_ITEMS.map((item) => (
          <NavItem
            key={item.path}
            icon={item.icon}
            label={item.label}
            path={item.path}
            expanded={expanded}
            active={isActive(item.path)}
            badge={item.badgeKey ? badges[item.badgeKey] : false}
          />
        ))}
      </NavGroup>

      {/* COACHING — coach+ only */}
      {showCoaching && (
        <NavGroup label="COACHING" expanded={expanded}>
          {COACHING_ITEMS.map((item) => (
            <NavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              path={item.path}
              expanded={expanded}
              active={isActive(item.path)}
              badge={item.badgeKey ? badges[item.badgeKey] : false}
            />
          ))}
        </NavGroup>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom: Settings + Collapse toggle */}
      <div className="flex flex-col gap-0.5 pb-3" style={{ borderTop: `1px solid ${colors.borderDefault}` }}>
        <NavItem
          icon={Settings}
          label="Settings"
          path="/settings"
          expanded={expanded}
          active={isActive('/settings')}
        />
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 transition-colors"
          style={{ color: colors.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {expanded ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          {expanded && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
