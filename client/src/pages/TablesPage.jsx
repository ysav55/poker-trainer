import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { colors } from '../lib/colors.js';
import FilterTabs from '../components/FilterTabs.jsx';
import TableCard from '../components/TableCard.jsx';
import NewTableCard from '../components/NewTableCard.jsx';
import CreateTableModal from '../components/tables/CreateTableModal.jsx';
import BuyInModal from '../components/tables/BuyInModal.jsx';
import { WizardModal } from './admin/TournamentSetup.jsx';

const TABLE_TABS = [
  { id: 'all',         label: 'All' },
  { id: 'cash',        label: 'Cash' },
  { id: 'tournament',  label: 'Tournament' },
  { id: 'bot',         label: 'Bot Practice' },
];

function filterTables(tableList, filterTab) {
  if (filterTab === 'cash') {
    return tableList.filter((t) => t.mode === 'coached_cash' || t.mode === 'uncoached_cash');
  }
  if (filterTab === 'tournament') {
    return tableList.filter((t) => t.mode === 'tournament');
  }
  if (filterTab === 'bot') {
    return tableList.filter((t) => t.mode === 'bot_cash');
  }
  return tableList;
}

export default function TablesPage() {
  const { user, hasPermission } = useAuth();
  const { activeTables, refreshTables } = useLobby();
  const navigate = useNavigate();

  const role = user?.role ?? 'player';
  const userId = user?.id;
  const isCoach = role === 'coach' || role === 'admin' || role === 'superadmin';
  const canCreate = hasPermission('table:create');

  const [tab, setTab] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTournamentWizard, setShowTournamentWizard] = useState(false);
  const [buyInTable, setBuyInTable] = useState(null);

  const visible = filterTables(activeTables, tab);
  const tabsWithBadges = TABLE_TABS.map((t) => ({
    ...t,
    badge: t.id !== 'all' ? (filterTables(activeTables, t.id).length || null) : null,
  }));

  const mapTableToCard = (table) => {
    return {
      ...table,
      userRole: role,
      userId,
      secondaryActionLabel: isCoach && table.mode !== 'tournament' ? 'Spectate' : null,
    };
  };

  const handleTableAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/tournament/${tableId}/lobby`);
    } else if (table?.mode === 'uncoached_cash' && !isCoach) {
      // Non-coach players must buy in for uncoached tables
      setBuyInTable(table);
    } else {
      navigate(`/table/${tableId}`);
    }
  }, [activeTables, navigate, isCoach]);

  const handleManageAction = useCallback((tableId) => {
    const table = activeTables.find((t) => (t.id ?? t.tableId) === tableId);
    if (table?.mode === 'tournament') {
      navigate(`/table/${tableId}?manager=true`);
    } else {
      navigate(`/table/${tableId}?spectate=true`);
    }
  }, [activeTables, navigate]);

  const handleBuyInConfirm = useCallback((buyInAmount) => {
    if (!buyInTable) return;
    const tableId = buyInTable.id ?? buyInTable.tableId;
    setBuyInTable(null);
    navigate(`/table/${tableId}`, { state: { buyInAmount } });
  }, [buyInTable, navigate]);

  const handleCreated = useCallback((table) => {
    setShowCreateModal(false);
    refreshTables();
    const tableId = table.id ?? table.tableId;
    if (tableId) navigate(`/table/${tableId}`);
  }, [navigate, refreshTables]);

  const handleTournamentCreated = useCallback(({ groupId }) => {
    setShowTournamentWizard(false);
    refreshTables();
    if (groupId) navigate(`/tournaments/${groupId}`);
  }, [navigate, refreshTables]);

  const handleNewTable = () => {
    if (tab === 'tournament') {
      setShowTournamentWizard(true);
    } else {
      setShowCreateModal(true);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl">
      <h1 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Tables</h1>

      <section>
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
                  const cardData = mapTableToCard(t);
                  return (
                    <TableCard
                      key={t.id ?? t.tableId}
                      table={cardData}
                      onAction={handleTableAction}
                      onSecondaryAction={cardData.secondaryActionLabel ? handleManageAction : undefined}
                      showController={isCoach}
                    />
                  );
                })}
                {canCreate && (
                  <NewTableCard
                    onClick={handleNewTable}
                    label={tab === 'tournament' ? '+ New Tournament' : '+ New Table'}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Create Table Modal */}
      {showCreateModal && (
        <CreateTableModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Buy-In Modal */}
      {buyInTable && (
        <BuyInModal
          table={buyInTable}
          userId={userId}
          onConfirm={handleBuyInConfirm}
          onClose={() => setBuyInTable(null)}
        />
      )}

      {/* Tournament Wizard */}
      {showTournamentWizard && (
        <WizardModal
          onClose={() => setShowTournamentWizard(false)}
          onCreated={handleTournamentCreated}
        />
      )}
    </div>
  );
}
