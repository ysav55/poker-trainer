import React from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { colors } from '../lib/colors.js';

/**
 * DashboardPage — stub for Phase 3 implementation.
 * Will show role-adaptive dashboard with quick links, stats, tables, alerts.
 */
export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold" style={{ color: colors.gold }}>
        Dashboard
      </h1>
      <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
        Welcome back, {user?.name ?? 'Player'}. Dashboard content coming in Phase 3.
      </p>
    </div>
  );
}
