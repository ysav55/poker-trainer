/**
 * GroupStatsTable.jsx
 *
 * Displays aggregated stats for group members.
 * Rows: one per member (display_name, vpip%, pfr%, wtsd%, wsd%, hands)
 * Summary row at bottom: aggregate averages
 *
 * Data source: memberStats[playerId] = { vpip, pfr, wtsd, wsd, hands_played, ... }
 */

import React, { useMemo } from 'react';
import { colors } from '../../lib/colors';

export default function GroupStatsTable({ members, memberStats }) {
  const stats = useMemo(() => {
    // Prepare row data for each member
    const rows = members.map((member) => {
      const stat = memberStats[member.id];
      return {
        playerId: member.id,
        name: member.display_name,
        vpip: stat?.vpip ?? null,
        pfr: stat?.pfr ?? null,
        wtsd: stat?.wtsd ?? null,
        wsd: stat?.wsd ?? null,
        hands: stat?.hands_played ?? 0,
      };
    });

    // Compute aggregates
    const withStats = rows.filter((r) => memberStats[r.playerId]);
    const aggregate = {
      vpip: null,
      pfr: null,
      wtsd: null,
      wsd: null,
      hands: 0,
    };

    if (withStats.length > 0) {
      const vpipVals = withStats.map((r) => r.vpip).filter((v) => v != null);
      const pfrVals = withStats.map((r) => r.pfr).filter((v) => v != null);
      const wtsdVals = withStats.map((r) => r.wtsd).filter((v) => v != null);
      const wsdVals = withStats.map((r) => r.wsd).filter((v) => v != null);

      if (vpipVals.length > 0) aggregate.vpip = (vpipVals.reduce((a, b) => a + b, 0) / vpipVals.length).toFixed(1);
      if (pfrVals.length > 0) aggregate.pfr = (pfrVals.reduce((a, b) => a + b, 0) / pfrVals.length).toFixed(1);
      if (wtsdVals.length > 0) aggregate.wtsd = (wtsdVals.reduce((a, b) => a + b, 0) / wtsdVals.length).toFixed(1);
      if (wsdVals.length > 0) aggregate.wsd = (wsdVals.reduce((a, b) => a + b, 0) / wsdVals.length).toFixed(1);

      aggregate.hands = withStats.reduce((sum, r) => sum + (r.hands || 0), 0);
    }

    return { rows, aggregate };
  }, [members, memberStats]);

  const cellStyle = (isHeader = false) => ({
    padding: '8px 10px',
    textAlign: 'left',
    fontSize: isHeader ? 11 : 12,
    color: isHeader ? colors.textMuted : colors.textSecondary,
    fontWeight: isHeader ? 600 : 400,
    borderBottom: `1px solid ${colors.borderDefault}`,
  });

  const rowStyle = (isAggregate = false) => ({
    display: 'grid',
    gridTemplateColumns: '1.5fr 0.7fr 0.7fr 0.7fr 0.7fr 0.7fr',
    background: isAggregate ? colors.bgSurfaceRaised : 'transparent',
    borderTop: isAggregate ? `1px solid ${colors.borderStrong}` : 'none',
  });

  return (
    <div style={{ width: '100%' }}>
      <h3 style={{ color: colors.textPrimary, fontSize: 13, fontWeight: 600, margin: '0 0 8px 0' }}>
        Stats
      </h3>

      <div style={{ ...rowStyle(false), marginBottom: 2 }}>
        <div style={cellStyle(true)}>Player</div>
        <div style={cellStyle(true)}>VPIP%</div>
        <div style={cellStyle(true)}>PFR%</div>
        <div style={cellStyle(true)}>WTSD%</div>
        <div style={cellStyle(true)}>W$D%</div>
        <div style={cellStyle(true)}>Hands</div>
      </div>

      {stats.rows.map((row) => (
        <div key={row.playerId} style={rowStyle(false)}>
          <div style={cellStyle()}>{row.name}</div>
          <div style={cellStyle()}>{row.vpip !== null ? `${row.vpip}%` : '—'}</div>
          <div style={cellStyle()}>{row.pfr !== null ? `${row.pfr}%` : '—'}</div>
          <div style={cellStyle()}>{row.wtsd !== null ? `${row.wtsd}%` : '—'}</div>
          <div style={cellStyle()}>{row.wsd !== null ? `${row.wsd}%` : '—'}</div>
          <div style={cellStyle()}>{row.hands || 0}</div>
        </div>
      ))}

      {stats.rows.length > 0 && (
        <div style={rowStyle(true)}>
          <div style={{ ...cellStyle(true), color: colors.textSecondary }}>Group Avg</div>
          <div style={{ ...cellStyle(true), color: colors.gold }}>
            {stats.aggregate.vpip !== null ? `${stats.aggregate.vpip}%` : '—'}
          </div>
          <div style={{ ...cellStyle(true), color: colors.gold }}>
            {stats.aggregate.pfr !== null ? `${stats.aggregate.pfr}%` : '—'}
          </div>
          <div style={{ ...cellStyle(true), color: colors.gold }}>
            {stats.aggregate.wtsd !== null ? `${stats.aggregate.wtsd}%` : '—'}
          </div>
          <div style={{ ...cellStyle(true), color: colors.gold }}>
            {stats.aggregate.wsd !== null ? `${stats.aggregate.wsd}%` : '—'}
          </div>
          <div style={{ ...cellStyle(true), color: colors.gold }}>{stats.aggregate.hands}</div>
        </div>
      )}
    </div>
  );
}
