/**
 * Leaderboard stat catalog — single source of truth for available leaderboard columns.
 *
 * source 'leaderboard' = derived from the leaderboard table (all-time counts, always available)
 * source 'baselines'   = from student_baselines rolling_30d (null when no baseline or filtered view)
 */

export const STAT_CATALOG = {
  hands_played:        { label: 'Hands',          group: 'core',     source: 'leaderboard', format: 'number',        colorCoded: false },
  bb_per_100:          { label: 'BB/100',          group: 'core',     source: 'baselines',   format: 'signed_number', colorCoded: true  },
  net_chips:           { label: 'Net Chips',       group: 'core',     source: 'leaderboard', format: 'signed_number', colorCoded: true  },
  win_rate:            { label: 'Win %',           group: 'core',     source: 'leaderboard', format: 'percent',       colorCoded: false },
  vpip:                { label: 'VPIP',            group: 'preflop',  source: 'leaderboard', format: 'percent',       colorCoded: false },
  pfr:                 { label: 'PFR',             group: 'preflop',  source: 'leaderboard', format: 'percent',       colorCoded: false },
  three_bet:           { label: '3-Bet',           group: 'preflop',  source: 'leaderboard', format: 'percent',       colorCoded: false },
  wtsd:                { label: 'WTSD',            group: 'postflop', source: 'leaderboard', format: 'percent',       colorCoded: false },
  wsd:                 { label: 'W$SD',            group: 'postflop', source: 'leaderboard', format: 'percent',       colorCoded: false },
  af:                  { label: 'AF',              group: 'postflop', source: 'baselines',   format: 'number_1dp',    colorCoded: false },
  cbet_flop:           { label: 'C-Bet',           group: 'postflop', source: 'baselines',   format: 'percent',       colorCoded: false },
  fold_to_cbet:        { label: 'Fold to CBet',    group: 'postflop', source: 'baselines',   format: 'percent',       colorCoded: false },
  open_limp_rate:      { label: 'Open Limp',       group: 'leaks',    source: 'baselines',   format: 'per_100',       colorCoded: false, sortAsc: true },
  cold_call_3bet_rate: { label: 'CC 3-Bet',        group: 'leaks',    source: 'baselines',   format: 'per_100',       colorCoded: false, sortAsc: true },
  min_raise_rate:      { label: 'Min Raise',       group: 'leaks',    source: 'baselines',   format: 'per_100',       colorCoded: false, sortAsc: true },
  overlimp_rate:       { label: 'Overlimp',        group: 'leaks',    source: 'baselines',   format: 'per_100',       colorCoded: false, sortAsc: true },
  equity_fold_rate:    { label: 'Equity Fold',      group: 'leaks',    source: 'baselines',   format: 'per_100',       colorCoded: false, sortAsc: true },
};

export const VALID_STAT_NAMES = Object.keys(STAT_CATALOG);

export const STAT_GROUPS = [
  { id: 'core',     label: 'Core'     },
  { id: 'preflop',  label: 'Preflop'  },
  { id: 'postflop', label: 'Postflop' },
  { id: 'leaks',    label: 'Leaks'    },
];

export const DEFAULT_COLUMNS = ['hands_played', 'bb_per_100', 'vpip', 'pfr'];
export const DEFAULT_SORT_BY = 'bb_per_100';
export const MAX_COLUMNS = 8;

/** Get the display value for a stat from a player object */
export function getStatValue(player, statName) {
  const h = Number(player.total_hands ?? 0);
  switch (statName) {
    case 'hands_played':        return h;
    case 'net_chips':           return Number(player.total_net_chips ?? player.net_chips ?? 0);
    case 'win_rate':            return h > 0 ? Math.round((Number(player.total_wins ?? 0) / h) * 100) : null;
    case 'vpip':                return player.vpip_percent ?? null;
    case 'pfr':                 return player.pfr_percent ?? null;
    case 'wtsd':                return player.wtsd_percent ?? null;
    case 'wsd':                 return player.wsd_percent ?? null;
    case 'three_bet':           return player.three_bet_percent ?? null;
    // Baseline-sourced (server provides final values)
    case 'bb_per_100':          return player.bb_per_100 ?? null;
    case 'af':                  return player.af ?? null;
    case 'cbet_flop':           return player.cbet_flop ?? null;
    case 'fold_to_cbet':        return player.fold_to_cbet ?? null;
    case 'open_limp_rate':      return player.open_limp_rate ?? null;
    case 'cold_call_3bet_rate': return player.cold_call_3bet_rate ?? null;
    case 'min_raise_rate':      return player.min_raise_rate ?? null;
    case 'overlimp_rate':       return player.overlimp_rate ?? null;
    case 'equity_fold_rate':    return player.equity_fold_rate ?? null;
    default:                    return null;
  }
}

/** Format a stat value for display */
export function formatStatValue(value, statName) {
  if (value == null) return '\u2014';
  const v = Number(value);
  if (Number.isNaN(v)) return '\u2014';

  const meta = STAT_CATALOG[statName];
  if (!meta) return String(v);

  switch (meta.format) {
    case 'percent':       return `${Math.round(v)}%`;
    case 'signed_number': return (v >= 0 ? '+' : '') + Math.round(v).toLocaleString('en-US');
    case 'number':        return v.toLocaleString('en-US');
    case 'number_1dp':    return v.toFixed(1);
    case 'per_100':       return v.toFixed(1);
    default:              return String(v);
  }
}
