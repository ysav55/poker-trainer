import React from 'react';
import { useLobby } from '../contexts/LobbyContext.jsx';
import { colors } from '../lib/colors.js';

/**
 * TablesPage — stub for Phase 3 implementation.
 * Will show filter tabs (All | Cash | Tournament | Bot Practice),
 * table card grid, create modal, buy-in modal.
 */
export default function TablesPage() {
  const { activeTables } = useLobby();

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold" style={{ color: colors.gold }}>
        Tables
      </h1>
      <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
        {activeTables.length} active table{activeTables.length !== 1 ? 's' : ''}.
        Full table grid coming in Phase 3.
      </p>
    </div>
  );
}
