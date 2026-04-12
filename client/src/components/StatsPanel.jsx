import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

function parseTagsFromRows(hand_tags = []) {
  return {
    auto_tags:    (hand_tags || []).filter(t => t.tag_type === 'auto').map(t => t.tag),
    mistake_tags: (hand_tags || []).filter(t => t.tag_type === 'mistake').map(t => t.tag),
    coach_tags:   (hand_tags || []).filter(t => t.tag_type === 'coach').map(t => t.tag),
  };
}

// ─── Tag color helpers ────────────────────────────────────────────────────────

const TAG_COLORS = {
  // ── Preflop structure ──────────────────────────────────────────────────────
  WALK:           { bg: 'rgba(110,118,129,0.18)', text: '#8b949e', border: 'rgba(110,118,129,0.3)'  },
  LIMPED_POT:     { bg: 'rgba(139,108,70,0.18)',  text: '#a07850', border: 'rgba(139,108,70,0.3)'   },
  '3BET_POT':     { bg: 'rgba(188,140,255,0.15)', text: '#bc8cff', border: 'rgba(188,140,255,0.3)'  },
  FOUR_BET_POT:   { bg: 'rgba(219,90,255,0.18)',  text: '#db5aff', border: 'rgba(219,90,255,0.35)'  },
  SQUEEZE_POT:    { bg: 'rgba(255,153,51,0.15)',  text: '#ff9933', border: 'rgba(255,153,51,0.3)'   },
  ALL_IN_PREFLOP: { bg: 'rgba(220,38,38,0.18)',   text: '#f87171', border: 'rgba(220,38,38,0.35)'   },
  // ── Position / blind ──────────────────────────────────────────────────────
  BTN_OPEN:       { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)'   },
  BLIND_DEFENSE:  { bg: 'rgba(20,184,166,0.15)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.3)'   },
  // ── Streets reached ───────────────────────────────────────────────────────
  SAW_FLOP:           { bg: 'rgba(75,85,99,0.18)',   text: '#9ca3af', border: 'rgba(75,85,99,0.3)'    },
  SAW_TURN:           { bg: 'rgba(75,85,99,0.22)',   text: '#b0b8c4', border: 'rgba(75,85,99,0.35)'   },
  SAW_RIVER:          { bg: 'rgba(75,85,99,0.26)',   text: '#c4cdd6', border: 'rgba(75,85,99,0.4)'    },
  WENT_TO_SHOWDOWN:   { bg: 'rgba(34,197,94,0.13)',  text: '#4ade80', border: 'rgba(34,197,94,0.28)'  },
  // ── Stack depth ───────────────────────────────────────────────────────────
  SHORT_STACK:    { bg: 'rgba(239,68,68,0.13)',   text: '#fca5a5', border: 'rgba(239,68,68,0.28)'   },
  DEEP_STACK:     { bg: 'rgba(6,182,212,0.13)',   text: '#67e8f9', border: 'rgba(6,182,212,0.28)'   },
  WHALE_POT:      { bg: 'rgba(63,185,80,0.15)',   text: '#3fb950', border: 'rgba(63,185,80,0.3)'    },
  // ── Player count ──────────────────────────────────────────────────────────
  MULTIWAY:       { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c', border: 'rgba(249,115,22,0.3)'   },
  // ── Postflop patterns ─────────────────────────────────────────────────────
  C_BET:          { bg: 'rgba(88,166,255,0.15)',  text: '#58a6ff', border: 'rgba(88,166,255,0.3)'   },
  DONK_BET:       { bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', border: 'rgba(245,158,11,0.3)'   },
  CHECK_RAISE:    { bg: 'rgba(227,179,65,0.15)',  text: '#e3b341', border: 'rgba(227,179,65,0.3)'   },
  BLUFF_CATCH:    { bg: 'rgba(248,81,73,0.15)',   text: '#f85149', border: 'rgba(248,81,73,0.3)'    },
  RIVER_RAISE:    { bg: 'rgba(251,113,133,0.15)', text: '#fb7185', border: 'rgba(251,113,133,0.3)'  },
  OVERBET:        { bg: 'rgba(220,38,38,0.12)',   text: '#f87171', border: 'rgba(220,38,38,0.25)'   },
  // ── Board texture ─────────────────────────────────────────────────────────
  MONOTONE_BOARD: { bg: 'rgba(59,130,246,0.12)',  text: '#93c5fd', border: 'rgba(59,130,246,0.25)'  },
  PAIRED_BOARD:   { bg: 'rgba(236,72,153,0.12)',  text: '#f9a8d4', border: 'rgba(236,72,153,0.25)'  },
  // ── Mistakes ──────────────────────────────────────────────────────────────
  OPEN_LIMP:      { bg: 'rgba(234,88,12,0.12)',   text: '#fdba74', border: 'rgba(234,88,12,0.25)'   },
  MIN_RAISE:      { bg: 'rgba(202,138,4,0.12)',   text: '#fcd34d', border: 'rgba(202,138,4,0.25)'   },
  UNDO_USED:      { bg: 'rgba(248,81,73,0.10)',   text: '#f85149', border: 'rgba(248,81,73,0.2)'    },
};

function TagPill({ tag }) {
  const colors = TAG_COLORS[tag] || {
    bg: 'rgba(212,175,55,0.12)', text: '#d4af37', border: 'rgba(212,175,55,0.25)'
  };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: '999px',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.04em',
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  );
}

// ─── Suit / card rendering ────────────────────────────────────────────────────

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

function CardCode({ card }) {
  if (!card || card === 'HIDDEN') return null;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const suitChar = SUIT_SYMBOLS[suit] || suit;
  const isRed = suit === 'h' || suit === 'd';
  return (
    <span
      style={{
        fontSize: '11px',
        fontFamily: 'monospace',
        fontWeight: 700,
        color: isRed ? '#f85149' : '#adbac7',
        letterSpacing: '-0.02em',
      }}
    >
      {rank}{suitChar}
    </span>
  );
}

function CardList({ cards }) {
  if (!cards || cards.length === 0) return <span style={{ color: '#444' }}>—</span>;
  return (
    <span className="flex items-center gap-0.5">
      {cards.map((c, i) => <CardCode key={i} card={c} />)}
    </span>
  );
}

// ─── Global Hand History view ─────────────────────────────────────────────────

function HandHistoryView() {
  const [hands, setHands]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/hands?limit=50')
      .then(data => {
        setHands((data.hands || []).map(h => ({ ...h, ...parseTagsFromRows(h.hand_tags) })));
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, []);

  function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function parseTags(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val); } catch { return []; }
  }

  return (
    <div className="flex flex-col h-full">
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <h2 style={{ color: '#d4af37', fontSize: '13px', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Hand History
        </h2>
        <p style={{ color: '#6e7681', fontSize: '11px', marginTop: 2 }}>
          Last 50 completed hands
        </p>
      </div>

      {loading && (
        <div style={{ color: '#6e7681', textAlign: 'center', padding: '40px 20px', fontSize: '13px' }}>
          Loading…
        </div>
      )}
      {error && (
        <div style={{ color: '#f85149', textAlign: 'center', padding: '40px 20px', fontSize: '13px' }}>
          Error: {error}
        </div>
      )}
      {!loading && !error && hands.length === 0 && (
        <div style={{ color: '#444', textAlign: 'center', padding: '60px 20px', fontSize: '13px', fontStyle: 'italic' }}>
          No completed hands yet
        </div>
      )}

      {!loading && !error && hands.length > 0 && (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Date', 'Winner', 'Pot', 'Phase', 'Tags'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hands.map((h) => {
                const autoTags = parseTags(h.auto_tags);
                const coachTags = parseTags(h.coach_tags);
                const allTags = [...autoTags, ...coachTags];
                return (
                  <tr
                    key={h.hand_id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.1s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '8px 10px', color: '#6e7681', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {formatDate(h.started_at)}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#e6edf3', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.winner_name || <span style={{ color: '#444' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#e3b341', fontFamily: 'monospace', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      ${Number(h.final_pot || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      {h.phase_ended ? (
                        <span style={{
                          fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                          color: h.phase_ended === 'showdown' ? '#bc8cff' : h.phase_ended?.startsWith('fold') ? '#3fb950' : '#f85149',
                          background: h.phase_ended === 'showdown' ? 'rgba(188,140,255,0.1)' : h.phase_ended?.startsWith('fold') ? 'rgba(63,185,80,0.1)' : 'rgba(248,81,73,0.1)',
                          padding: '2px 6px', borderRadius: '3px'
                        }}>
                          {h.phase_ended}
                        </span>
                      ) : <span style={{ color: '#444' }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {allTags.length > 0
                          ? allTags.map((t, i) => <TagPill key={i} tag={t} />)
                          : <span style={{ color: '#333', fontSize: '11px' }}>—</span>
                        }
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Stats mode toggle ────────────────────────────────────────────────────────

const STATS_MODES = [
  { id: 'overall', label: 'Overall' },
  { id: 'human',   label: 'Human Only' },
  { id: 'bot',     label: 'vs Bots' },
];

function StatsModeToggle({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {STATS_MODES.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          style={{
            padding: '3px 9px',
            fontSize: '10px',
            fontWeight: 600,
            borderRadius: '5px',
            border: `1px solid ${value === m.id ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
            background: value === m.id ? 'rgba(212,175,55,0.14)' : 'transparent',
            color: value === m.id ? '#d4af37' : '#6e7681',
            cursor: 'pointer',
            transition: 'all 0.1s',
            letterSpacing: '0.03em',
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── Player Detail view ───────────────────────────────────────────────────────

function PlayerDetailView({ player, onBack }) {
  const [hands, setHands]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [statsMode, setStatsMode] = useState('overall');
  const [modeStats, setModeStats] = useState(null); // null = use player prop

  // Re-fetch mode-specific stats whenever mode changes (except overall which uses the prop)
  useEffect(() => {
    if (statsMode === 'overall') { setModeStats(null); return; }
    if (!player?.stableId) return;
    apiFetch(`/api/players/${encodeURIComponent(player.stableId)}/stats?mode=${statsMode}`)
      .then(data => setModeStats(data))
      .catch(() => setModeStats(null));
  }, [statsMode, player?.stableId]);

  // Re-fetch hands whenever mode changes
  useEffect(() => {
    if (!player?.stableId) return;
    setLoading(true);
    apiFetch(`/api/players/${encodeURIComponent(player.stableId)}/hands?limit=50&mode=${statsMode}`)
      .then(data => { setHands(data.hands || []); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [player?.stableId, statsMode]);

  // Display stats: mode-specific if available, otherwise fall back to overall from prop
  const displayStats = modeStats ?? player;
  const winPct = (displayStats?.total_hands ?? 0) > 0
    ? ((displayStats.total_wins / displayStats.total_hands) * 100).toFixed(1)
    : '0.0';
  const net = displayStats?.total_net_chips ?? 0;

  function formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={onBack}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '6px',
              cursor: 'pointer',
              padding: '4px 10px',
              color: '#8b949e',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; e.currentTarget.style.borderColor = 'rgba(212,175,55,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#8b949e'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
          >
            ← Back
          </button>
          <h2 style={{ color: '#e6edf3', fontSize: '15px', fontWeight: 700 }}>
            {player?.name || 'Player'}
          </h2>
        </div>

        {/* Mode toggle + stats bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <StatsModeToggle value={statsMode} onChange={setStatsMode} />
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Hands', value: displayStats?.total_hands ?? 0 },
            { label: 'Win %', value: `${winPct}%` },
            { label: 'VPIP', value: `${displayStats?.vpip_percent ?? 0}%` },
            { label: 'PFR', value: `${displayStats?.pfr_percent ?? 0}%` },
            { label: 'Net Chips', value: `${net > 0 ? '+' : ''}${Number(net).toLocaleString()}`, color: net > 0 ? '#3fb950' : net < 0 ? '#f85149' : '#8b949e' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: '9px', color: '#6e7681', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: color || '#d4af37' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hand history table */}
      {loading && (
        <div style={{ color: '#6e7681', textAlign: 'center', padding: '40px 20px', fontSize: '13px' }}>
          Loading…
        </div>
      )}
      {error && (
        <div style={{ color: '#f85149', textAlign: 'center', padding: '40px 20px', fontSize: '13px' }}>
          Error: {error}
        </div>
      )}
      {!loading && !error && hands.length === 0 && (
        <div style={{ color: '#444', textAlign: 'center', padding: '60px 20px', fontSize: '13px', fontStyle: 'italic' }}>
          No hands played yet
        </div>
      )}
      {!loading && !error && hands.length > 0 && (
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {['Date', 'Hole Cards', 'Board', 'Result', 'Pot', 'Tags'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: '#8b949e', fontSize: '11px', fontWeight: 600, textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hands.map((h, i) => {
                const isWinner = h.is_winner === 1;
                const stackDelta = (h.stack_end ?? 0) - (h.stack_start ?? 0);
                const allTags = [...(h.auto_tags || []), ...(h.coach_tags || [])];
                return (
                  <tr
                    key={h.hand_id || i}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      background: isWinner ? 'rgba(63,185,80,0.04)' : stackDelta < 0 ? 'rgba(248,81,73,0.04)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = isWinner ? 'rgba(63,185,80,0.09)' : 'rgba(248,81,73,0.07)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isWinner ? 'rgba(63,185,80,0.04)' : stackDelta < 0 ? 'rgba(248,81,73,0.04)' : 'transparent'; }}
                  >
                    <td style={{ padding: '8px 10px', color: '#6e7681', whiteSpace: 'nowrap', fontSize: '11px' }}>
                      {formatDate(h.started_at)}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <CardList cards={h.hole_cards} />
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span className="flex items-center gap-1">
                        {(h.board || []).map((c, ci) => <CardCode key={ci} card={c} />)}
                        {(!h.board || h.board.length === 0) && <span style={{ color: '#444' }}>—</span>}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, fontFamily: 'monospace',
                        color: isWinner ? '#3fb950' : stackDelta < 0 ? '#f85149' : '#8b949e'
                      }}>
                        {isWinner ? 'WIN' : 'LOSS'}
                        {stackDelta !== 0 && (
                          <span style={{ fontSize: '10px', marginLeft: 4, fontWeight: 500 }}>
                            ({stackDelta > 0 ? '+' : ''}{Number(stackDelta).toLocaleString()})
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#e3b341', fontFamily: 'monospace', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      ${Number(h.final_pot || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {allTags.length > 0
                          ? allTags.map((t, ti) => <TagPill key={ti} tag={t} />)
                          : <span style={{ color: '#333', fontSize: '11px' }}>—</span>
                        }
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main StatsPanel component ────────────────────────────────────────────────

export default function StatsPanel({ isOpen, onClose, isCoach }) {
  const [view, setView] = useState('history'); // 'history' | 'player'
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  function handleSelectPlayer(player) {
    setSelectedPlayer(player);
    setView('player');
  }

  function handleBackToLeaderboard() {
    setView('history');
    setSelectedPlayer(null);
  }

  // Reset to hand history when panel is closed/reopened
  useEffect(() => {
    if (!isOpen) {
      setView('history');
      setSelectedPlayer(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const tabs = [
    { id: 'history', label: 'Hand History' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel container */}
      <div
        style={{
          margin: '24px auto',
          width: '100%',
          maxWidth: '1000px',
          height: 'calc(100vh - 48px)',
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.02)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: '#d4af37', fontSize: '13px', fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Stats Dashboard
            </span>

            {/* Tab bar — only show tabs when not in player detail */}
            {view !== 'player' && (
              <div style={{ display: 'flex', gap: 4 }}>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setView(tab.id)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: `1px solid ${view === tab.id ? 'rgba(212,175,55,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      background: view === tab.id ? 'rgba(212,175,55,0.12)' : 'transparent',
                      color: view === tab.id ? '#d4af37' : '#6e7681',
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                      letterSpacing: '0.04em',
                    }}
                    onMouseEnter={(e) => { if (view !== tab.id) { e.currentTarget.style.color = '#adbac7'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; } }}
                    onMouseLeave={(e) => { if (view !== tab.id) { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; } }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {view === 'player' && (
              <span style={{ color: '#6e7681', fontSize: '11px' }}>
                Player Detail
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '6px',
              cursor: 'pointer',
              padding: '4px 10px',
              color: '#6e7681',
              fontSize: '12px',
              transition: 'all 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = 'rgba(248,81,73,0.4)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            title="Close (Esc)"
          >
            ✕ Close
          </button>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'history' && (
            <HandHistoryView />
          )}
          {view === 'player' && selectedPlayer && (
            <PlayerDetailView player={selectedPlayer} onBack={handleBackToLeaderboard} />
          )}
        </div>
      </div>
    </div>
  );
}
