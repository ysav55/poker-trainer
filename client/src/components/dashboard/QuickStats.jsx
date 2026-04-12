import React from 'react';
import { colors } from '../../lib/colors.js';
import StatPill from '../StatPill.jsx';

export default function QuickStats({ stats, activeTables, role, rank, alerts }) {
  const isCoach = role === 'coach' || role === 'admin' || role === 'superadmin';
  const alertCount = alerts?.filter((a) => (a.severity ?? 0) >= 0.4).length ?? 0;
  const chipBalance = stats?.chip_bank ?? stats?.chipBank ?? null;

  const coachStats = [
    { value: activeTables?.length ?? 0, label: 'Active\nTables' },
    { value: stats?.students_online ?? '—', label: 'Students\nOnline' },
    { value: stats?.hands_this_week ?? '—', label: 'Hands\nThis Wk' },
    { value: stats?.avg_grade ?? '—', label: 'Avg\nGrade' },
  ];

  const studentStats = [
    { value: chipBalance != null ? Number(chipBalance).toLocaleString() : '—', label: 'Chip\nBank' },
    { value: stats?.hands_played ?? '—', label: 'Hands\nPlayed' },
    { value: stats?.vpip ?? '—', label: 'VPIP' },
    { value: stats?.pfr ?? '—', label: 'PFR' },
    { value: rank != null ? `#${rank}` : '—', label: 'Leader\nboard' },
  ];

  const statRow = isCoach ? coachStats : studentStats;

  return (
    <section>
      <h2 className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: colors.textSecondary }}>
        Quick Stats
      </h2>
      <div className="flex flex-wrap gap-3">
        {statRow.map((s, i) => (
          <StatPill key={i} value={s.value} label={s.label} />
        ))}
      </div>
    </section>
  );
}
