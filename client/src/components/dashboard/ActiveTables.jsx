import React, { useState } from 'react';
import { colors } from '../../lib/colors.js';
import FilterTabs from '../FilterTabs.jsx';
import TableCard from '../TableCard.jsx';
import NewTableCard from '../NewTableCard.jsx';

export default function ActiveTables({ tables, role, userId, canCreate, onTableAction, onManageAction, onNewTable }) {
  const [tab, setTab] = useState('all');

  const showController = role === 'coach' || role === 'admin' || role === 'superadmin';
  const COACH_TABLE_TABS = [
    { id: 'all',        label: 'All' },
    { id: 'cash',       label: 'Cash' },
    { id: 'tournament', label: 'Tournament' },
    { id: 'mine',       label: 'My Tables' },
  ];

  const STUDENT_TABLE_TABS = [
    { id: 'all',        label: 'All' },
    { id: 'cash',       label: 'Cash' },
    { id: 'tournament', label: 'Tournament' },
    { id: 'available',  label: 'Available' },
    { id: 'mine',       label: 'My Tables' },
  ];

  const tabDefs = (role === 'coach' || role === 'admin' || role === 'superadmin')
    ? COACH_TABLE_TABS
    : STUDENT_TABLE_TABS;

  const filterTables = (tableList, filterTab, playerId) => {
    if (filterTab === 'mine') return tableList.filter((t) => (t.createdBy === playerId || t.created_by === playerId));
    if (filterTab === 'cash') return tableList.filter((t) => (t.mode === 'coached_cash' || t.mode === 'uncoached_cash'));
    if (filterTab === 'tournament') return tableList.filter((t) => t.mode === 'tournament');
    if (filterTab === 'available') return tableList.filter((t) => (t.available_seats ?? t.availableSeats ?? 0) > 0);
    return tableList;
  };

  const visible = filterTables(tables, tab, userId);
  const tabsWithBadges = tabDefs.map((t) => ({
    ...t,
    badge: t.id !== 'all' ? (filterTables(tables, t.id, userId).length || null) : null,
  }));

  // Helper to map table to card data (simplified version)
  const mapTableToCard = (table, userRole, uId) => {
    return {
      ...table,
      userRole,
      userId: uId,
      secondaryActionLabel: (userRole === 'coach' || userRole === 'admin') && table.mode !== 'tournament' ? 'Spectate' : null,
    };
  };

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: colors.textSecondary }}>
        Active Tables
      </h2>
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${colors.borderStrong}`, background: colors.bgSurface }}>
        <FilterTabs tabs={tabsWithBadges} active={tab} onChange={setTab} />
        <div className="p-4">
          {visible.length === 0 && !canCreate ? (
            <p className="text-sm text-center py-4" style={{ color: colors.textMuted }}>
              No tables in this view.
            </p>
          ) : (
            <div
              className="grid"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}
            >
              {visible.map((t) => {
                const cardData = mapTableToCard(t, role, userId);
                return (
                  <TableCard
                    key={t.id ?? t.tableId}
                    table={cardData}
                    onAction={onTableAction}
                    onSecondaryAction={cardData.secondaryActionLabel ? onManageAction : undefined}
                    showController={showController}
                  />
                );
              })}
              {canCreate && (
                <NewTableCard
                  onClick={onNewTable}
                  label="+ New Table"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
