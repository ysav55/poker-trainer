/* Shims — minimal stand-ins for client/src/utils/chips.js, lib/api.js,
   EquityBadge/SharedRangeOverlay/PlayerRangePanel — so the phase1/ files
   (which import them by real paths) render standalone in a browser. */

// ── utils/chips ─────────────────────────────────────────────────────────────
window.__fmtChips = function fmtChips(v, bb, bbView) {
  const n = Number(v ?? 0);
  if (bbView && bb > 0) return `${(n / bb).toFixed(1)} BB`;
  return n.toLocaleString('en-US');
};

// ── lib/api ─────────────────────────────────────────────────────────────────
window.__apiFetch = function apiFetch(path) {
  // Return mock hover stats for demo
  return new Promise((res) => setTimeout(() => res({
    session: {
      hands_played: 142,
      vpip_count: 38,
      pfr_count: 24,
      wtsd_count: 18,
      wsd_count: 10,
      three_bet_count: 12,
    },
    allTime: {
      total_hands: 8420,
      vpip_count: 2106,
      pfr_count: 1488,
      wtsd_count: 756,
      wsd_count: 412,
      three_bet_count: 682,
      net_chips: 124500,
    },
  }), 200));
};

// ── EquityBadge ─────────────────────────────────────────────────────────────
window.__EquityBadge = function EquityBadge({ equity, visible }) {
  if (!visible || equity == null) return null;
  const color = equity > 55 ? '#22c55e' : equity > 40 ? '#f59e0b' : '#ef4444';
  return React.createElement('div', {
    style: {
      position: 'absolute', top: -22, left: '50%',
      transform: 'translateX(-50%)', zIndex: 6,
      padding: '1px 7px', borderRadius: 999,
      background: 'rgba(10,14,20,0.9)',
      border: `1.5px solid ${color}55`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.7)',
      whiteSpace: 'nowrap', pointerEvents: 'none',
      fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 700, color,
    },
  }, `${equity}%`);
};

// ── SharedRangeOverlay (stub) ───────────────────────────────────────────────
window.__SharedRangeOverlay = function SharedRangeOverlay() { return null; };

// ── PlayerRangePanel (stub) ─────────────────────────────────────────────────
window.__PlayerRangePanel = function PlayerRangePanel() { return null; };
