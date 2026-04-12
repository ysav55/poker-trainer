// 8 hand-picked seed colors for pre-seeded playlists.
// Order maps to Phase 5 seed categories (Dry Flop, Wet Flop, ...).
export const PLAYLIST_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#22c55e', // green
  '#a855f7', // purple
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#ec4899', // pink
];

const GOLDEN_ANGLE = 137.508;

// Infinite non-repeating playlist colors via golden-angle hue distribution.
// Indices 0–7 return the seed palette; beyond that we walk the hue circle
// so each new playlist is maximally distant from those already assigned.
export function generatePlaylistColor(index) {
  if (index < PLAYLIST_COLORS.length) return PLAYLIST_COLORS[index];
  const hue = (index * GOLDEN_ANGLE) % 360;
  return `hsl(${hue.toFixed(2)}, 70%, 55%)`;
}

// Returns the given color with the supplied opacity (0–1) as an rgba()/hsla()
// string. Used for the 20%-opacity left border on ScenarioItem.
export function withOpacity(color, opacity) {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3
      ? hex.split('').map(c => c + c).join('')
      : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  if (color.startsWith('hsl(')) {
    return color.replace('hsl(', 'hsla(').replace(')', `,${opacity})`);
  }
  return color;
}
