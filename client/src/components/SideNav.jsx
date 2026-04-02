import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * Role matrix from spec §2.3
 * Columns: coach | student (coached) | solo | trial | admin | superadmin
 *
 * In the codebase:
 *   coach       → 'coach'
 *   student     → 'player'    (coached_student maps to 'player' role in JWT)
 *   solo        → 'player'    (no coach — same role, differentiated by data)
 *   trial       → 'trial'
 *   admin       → 'admin'
 *   superadmin  → 'superadmin'
 *   moderator   → same as admin for nav purposes
 */
const NAV_ITEMS = [
  {
    icon: '🏠',
    label: 'Lobby',
    path: '/lobby',
    roles: ['coach', 'player', 'trial', 'admin', 'superadmin', 'moderator', 'referee'],
  },
  {
    icon: '🃏',
    label: 'Tables',
    path: '/lobby',
    hash: '#tables',
    roles: ['coach', 'player', 'trial', 'admin', 'superadmin', 'moderator', 'referee'],
    badgeKey: 'tables',
  },
  {
    icon: '📋',
    label: 'CRM',
    path: '/admin/crm',
    roles: ['coach', 'admin', 'superadmin', 'moderator'],
    badgeKey: 'crm',
  },
  {
    icon: '🎯',
    label: 'Scenarios',
    path: '/admin/hands',
    roles: ['coach', 'admin', 'superadmin'],
  },
  {
    icon: '📖',
    label: 'History',
    path: '/history',
    roles: ['coach', 'player', 'admin', 'superadmin'],
  },
  {
    icon: '🔬',
    label: 'Review',
    path: '/review',
    roles: ['coach', 'player'],
  },
  {
    icon: '📊',
    label: 'Analysis',
    path: '/analysis',
    roles: ['coach', 'admin', 'superadmin'],
  },
  {
    icon: '⊞',
    label: 'Multi',
    path: '/multi',
    roles: ['coach', 'admin', 'superadmin'],
  },
  {
    icon: '🏆',
    label: 'Leaderboard',
    path: '/leaderboard',
    roles: ['coach', 'player', 'trial', 'admin', 'superadmin', 'moderator', 'referee'],
  },
  {
    icon: '📢',
    label: 'Alerts',
    path: '/admin/alerts',
    roles: ['coach', 'admin', 'superadmin'],
    badgeKey: 'alerts',
  },
  {
    icon: '👤',
    label: 'Users',
    path: '/admin/users',
    roles: ['admin', 'superadmin'],
  },
  {
    icon: '⚙️',
    label: 'Settings',
    path: '/settings',
    roles: ['coach', 'admin', 'superadmin'],
  },
];

/**
 * SideNav — icon-only sidebar, 64px wide, always visible.
 *
 * Props:
 *   role   {string}           — current user role
 *   badges {object?}          — { tables: 2, alerts: 4, crm: 1 }
 */
export default function SideNav({ role, badges = {} }) {
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  const isActive = (item) => {
    if (item.hash) return location.pathname + location.hash === item.path + item.hash;
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  };

  return (
    <nav
      className="flex flex-col items-center py-3 gap-1 shrink-0"
      style={{
        width: 64,
        background: '#0d1117',
        borderRight: '1px solid #21262d',
      }}
    >
      {visibleItems.map((item) => {
        const active = isActive(item);
        const badge = item.badgeKey ? badges[item.badgeKey] : null;

        return (
          <button
            key={item.path + (item.hash ?? '')}
            onClick={() => navigate(item.path + (item.hash ?? ''))}
            className="relative flex flex-col items-center justify-center w-full py-2.5 gap-0.5 transition-colors"
            style={{
              borderLeft: active ? '3px solid #d4af37' : '3px solid transparent',
              background: active ? 'rgba(212,175,55,0.07)' : 'transparent',
            }}
            title={item.label}
          >
            <span className="text-base leading-none" role="img" aria-hidden="true">
              {item.icon}
            </span>
            <span
              className="text-[9px] font-medium leading-none mt-0.5"
              style={{ color: active ? '#d4af37' : '#8b949e' }}
            >
              {item.label}
            </span>

            {badge > 0 && (
              <span
                className="absolute top-1 right-2 inline-flex items-center justify-center rounded-full text-[8px] font-bold"
                style={{
                  background: '#d4af37',
                  color: '#0d1117',
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                }}
              >
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
