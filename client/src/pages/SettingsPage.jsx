import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { colors } from '../lib/colors.js';
import { SlidersHorizontal, School, Bell, Building2, Server, User, AlertTriangle } from 'lucide-react';
import TableDefaultsTab from './settings/TableDefaultsTab.jsx';
import SchoolTab        from './settings/SchoolTab.jsx';
import OrgTab           from './settings/OrgTab.jsx';
import PlatformTab      from './settings/PlatformTab.jsx';
import ProfileTab       from './settings/ProfileTab.jsx';
import AlertsTab        from './settings/AlertsTab.jsx';
import DangerZoneTab    from './settings/DangerZoneTab.jsx';

const ALL_TABS = [
  { id: 'table-defaults', label: 'Table Defaults', icon: SlidersHorizontal, roles: ['coach','admin','superadmin'],                                                component: TableDefaultsTab },
  { id: 'school',         label: 'School',         icon: School,             roles: ['coach','admin','superadmin'],                                                component: SchoolTab        },
  { id: 'alerts',         label: 'Alerts',         icon: Bell,               roles: ['coach'],                                                                     component: AlertsTab        },
  { id: 'org',            label: 'Org',            icon: Building2,          roles: ['admin','superadmin'],                                                         component: OrgTab           },
  { id: 'platform',       label: 'Platform',       icon: Server,             roles: ['superadmin'],                                                                 component: PlatformTab      },
  { id: 'profile',        label: 'Profile',        icon: User,               roles: ['coach','admin','superadmin','trial','coached_student','solo_student'],         component: ProfileTab       },
  { id: 'danger-zone',    label: 'Danger Zone',    icon: AlertTriangle,      roles: ['coach','admin','superadmin','trial','coached_student','solo_student'],         component: DangerZoneTab    },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'student';

  const visibleTabs = ALL_TABS.filter(t => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.id ?? 'profile');

  const current = visibleTabs.find(t => t.id === activeTab) ?? visibleTabs[0];
  const TabContent = current?.component ?? (() => null);

  return (
    <div style={{ color: colors.textPrimary }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        <h1 className="text-lg font-bold" style={{ color: colors.textPrimary }}>Settings</h1>

        <div
          className="flex gap-1 overflow-x-auto pb-1"
          role="tablist"
          style={{ borderBottom: `2px solid ${colors.borderDefault}` }}
        >
          {visibleTabs.map(tab => {
            const active = tab.id === current?.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors rounded-t flex items-center gap-1.5"
                style={{
                  color:        active ? colors.gold      : colors.textMuted,
                  background:   active ? colors.goldSubtle : 'transparent',
                  borderBottom: active ? `2px solid ${colors.gold}` : '2px solid transparent',
                  marginBottom: -2,
                }}
                data-testid={`tab-${tab.id}`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <TabContent onSwitchTab={setActiveTab} />
      </div>
    </div>
  );
}
