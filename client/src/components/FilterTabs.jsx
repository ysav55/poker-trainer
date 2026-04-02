import React from 'react';

/**
 * FilterTabs — horizontal tab bar with optional badge counts.
 *
 * Props:
 *   tabs    {Array<{id, label, badge?}>} — tab definitions
 *   active  {string}                     — id of the active tab
 *   onChange {fn(id)}                    — called when a tab is clicked
 *   onRefresh {fn?}                      — optional refresh icon handler (right side)
 */
export default function FilterTabs({ tabs, active, onChange, onRefresh }) {
  return (
    <div className="flex items-center gap-0" style={{ borderBottom: '1px solid #30363d' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              color: isActive ? '#d4af37' : '#8b949e',
              borderBottom: isActive ? '2px solid #d4af37' : '2px solid transparent',
              marginBottom: -1,
              background: 'transparent',
            }}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                style={{ background: '#d4af37', color: '#0d1117' }}
              >
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        );
      })}

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="ml-auto mr-1 p-1.5 rounded transition-colors"
          style={{ color: '#8b949e' }}
          title="Refresh"
        >
          🔄
        </button>
      )}
    </div>
  );
}
