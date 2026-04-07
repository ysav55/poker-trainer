import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { GOLD } from './settings/shared.jsx';
import TableDefaultsTab from './settings/TableDefaultsTab.jsx';
import SchoolTab        from './settings/SchoolTab.jsx';
import OrgTab           from './settings/OrgTab.jsx';
import PlatformTab      from './settings/PlatformTab.jsx';
import ProfileTab       from './settings/ProfileTab.jsx';
import AlertsTab        from './settings/AlertsTab.jsx';
import DangerZoneTab    from './settings/DangerZoneTab.jsx';

const ALL_TABS = [
  { id: 'table-defaults', label: 'Table Defaults', roles: ['coach','admin','superadmin'],                                                                         component: TableDefaultsTab },
  { id: 'school',         label: 'School',         roles: ['coach','admin','superadmin'],                                                                         component: SchoolTab        },
  { id: 'alerts',         label: 'Alerts',         roles: ['coach'],                                                                                              component: AlertsTab        },
  { id: 'org',            label: 'Org',            roles: ['admin','superadmin'],                                                                                  component: OrgTab           },
  { id: 'platform',       label: 'Platform',       roles: ['superadmin'],                                                                                          component: PlatformTab      },
  { id: 'profile',        label: 'Profile',        roles: ['coach','admin','superadmin','trial','coached_student','solo_student'],  component: ProfileTab       },
  { id: 'danger-zone',    label: 'Danger Zone',    roles: ['coach','admin','superadmin','trial','coached_student','solo_student'],  component: DangerZoneTab    },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'student';

  const visibleTabs = ALL_TABS.filter(t => t.roles.includes(role));
  const [activeTab, setActiveTab] = useState(() => visibleTabs[0]?.id ?? 'profile');

  const current = visibleTabs.find(t => t.id === activeTab) ?? visibleTabs[0];
  const TabContent = current?.component ?? (() => null);

  return (
    <div style={{ color: '#e5e7eb' }}>
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-4">

        <h1 className="text-lg font-bold" style={{ color: '#f0ece3' }}>Settings</h1>

        <div
          className="flex gap-1 overflow-x-auto pb-1"
          role="tablist"
          style={{ borderBottom: '2px solid #21262d' }}
        >
          {visibleTabs.map(tab => {
            const active = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors rounded-t"
                style={{
                  color:        active ? GOLD         : '#6e7681',
                  background:   active ? 'rgba(212,175,55,0.08)' : 'transparent',
                  borderBottom: active ? `2px solid ${GOLD}` : '2px solid transparent',
                  marginBottom: -2,
                }}
                data-testid={`tab-${tab.id}`}
              >
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
