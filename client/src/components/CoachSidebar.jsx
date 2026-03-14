import React, { useState, useCallback, useEffect, useRef } from 'react';
import Card from './Card';
import HandConfigPanel from './HandConfigPanel';
import { useHistory } from '../hooks/useHistory';

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_COLORS = {
  WAITING:   { bg: '#21262d', text: '#6e7681' },
  PREFLOP:   { bg: '#1c2d3f', text: '#58a6ff' },
  FLOP:      { bg: '#1e3a2a', text: '#3fb950' },
  TURN:      { bg: '#2d2516', text: '#e3b341' },
  RIVER:     { bg: '#2d1a1a', text: '#f85149' },
  SHOWDOWN:  { bg: '#2b1f3a', text: '#bc8cff' },
};

const ACTION_COLORS = {
  fold:   { bg: '#2d1a1a', text: '#f85149' },
  call:   { bg: '#1e3a2a', text: '#3fb950' },
  raise:  { bg: '#2d2516', text: '#e3b341' },
  check:  { bg: '#1c2d3f', text: '#58a6ff' },
  bet:    { bg: '#2d2516', text: '#e3b341' },
  allin:  { bg: '#2b1f3a', text: '#bc8cff' },
};

const BOARD_POSITION_LABELS = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <div
      className="label-sm mb-2"
      style={{ color: '#d4af37', letterSpacing: '0.12em' }}
    >
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      className="my-3"
      style={{ height: '1px', background: '#21262d' }}
    />
  );
}

function PhaseBadge({ phase }) {
  const colors = PHASE_COLORS[phase?.toUpperCase()] || PHASE_COLORS.WAITING;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wider"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.text}22` }}
    >
      {phase || 'WAITING'}
    </span>
  );
}

function ActionBadge({ action }) {
  if (!action) return null;
  const key = String(action).toLowerCase();
  const colors = ACTION_COLORS[key] || { bg: '#21262d', text: '#8b949e' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium tracking-wide"
      style={{ background: colors.bg, color: colors.text }}
    >
      {String(action).toUpperCase()}
    </span>
  );
}

function CardSlot({ card, label, onClick, disabled = false }) {
  const isEmpty = !card;

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={label}
      className="flex items-center justify-center rounded transition-all duration-150"
      style={{
        width: '2.25rem',
        height: '3.25rem',
        background: isEmpty ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: isEmpty
          ? '1px dashed #30363d'
          : '1px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = '#d4af37';
          e.currentTarget.style.background = 'rgba(212,175,55,0.06)';
          e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,175,55,0.25)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isEmpty ? 'transparent' : 'transparent';
        e.currentTarget.style.background = isEmpty ? 'rgba(255,255,255,0.03)' : 'transparent';
        e.currentTarget.style.borderStyle = isEmpty ? 'dashed' : 'solid';
        e.currentTarget.style.borderColor = isEmpty ? '#30363d' : 'transparent';
        e.currentTarget.style.boxShadow = 'none';
      }}
      aria-label={label}
    >
      {isEmpty ? (
        <span style={{ color: '#444', fontSize: '18px', lineHeight: 1, fontWeight: 300 }}>+</span>
      ) : (
        <Card card={card} small />
      )}
    </button>
  );
}

// ─── History Helpers ──────────────────────────────────────────────────────────

function parseBoardCards(boardStr) {
  if (!boardStr) return [];
  if (Array.isArray(boardStr)) return boardStr;
  try {
    return JSON.parse(boardStr);
  } catch {
    return [];
  }
}

const SUIT_SYMBOLS = { s: '♠', h: '♥', d: '♦', c: '♣' };

function CardCode({ card }) {
  if (!card) return null;
  const rank = card.slice(0, -1);
  const suit = card.slice(-1).toLowerCase();
  const suitChar = SUIT_SYMBOLS[suit] || suit;
  const isRed = suit === 'h' || suit === 'd';
  return (
    <span
      style={{
        fontSize: '10px',
        fontFamily: 'monospace',
        color: isRed ? '#f85149' : '#58a6ff',
        letterSpacing: '-0.02em',
      }}
    >
      {rank}{suitChar}
    </span>
  );
}

function PhasedEndedTag({ phase }) {
  if (!phase) return null;
  const normalized = String(phase).toLowerCase();
  let label, color;
  if (normalized === 'showdown') {
    label = 'SHOWDOWN';
    color = '#bc8cff';
  } else if (normalized.startsWith('fold')) {
    label = 'FOLD';
    color = '#3fb950';
  } else {
    label = 'INCOMPLETE';
    color = '#f85149';
  }
  return (
    <span
      style={{
        fontSize: '8px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        color,
        background: `${color}18`,
        border: `1px solid ${color}44`,
        borderRadius: '3px',
        padding: '1px 4px',
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function HandHistoryRow({ hand, index, onExpand }) {
  const isComplete = hand.completed_normally === 1;
  const winnerDisplay = isComplete ? (hand.winner_name || '—') : 'Incomplete';
  const board = parseBoardCards(hand.board);

  return (
    <div
      className="rounded px-2 py-1.5 flex flex-col gap-1"
      style={{
        background: '#0d1117',
        border: '1px solid #21262d',
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#0d1117'; }}
    >
      {/* Top row: index, phase tag, pot, expand button */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontSize: '9px',
            color: '#6e7681',
            fontFamily: 'monospace',
            flexShrink: 0,
            minWidth: '16px',
          }}
        >
          #{index}
        </span>
        <span
          className="truncate flex-1 text-xs"
          style={{ color: '#f0ece3', fontSize: '10px' }}
        >
          {winnerDisplay}
        </span>
        <PhasedEndedTag phase={isComplete ? hand.phase_ended : null} />
        <span
          style={{
            fontSize: '10px',
            color: '#e3b341',
            fontFamily: 'monospace',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          ${Number(hand.final_pot || 0).toLocaleString()}
        </span>
        <button
          onClick={onExpand}
          title="View detail"
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '1px 5px',
            color: '#6e7681',
            fontSize: '10px',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; e.currentTarget.style.borderColor = '#d4af37'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
        >
          &gt;
        </button>
      </div>

      {/* Board row */}
      {board.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {board.map((c, i) => (
            <CardCode key={i} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function HandDetailPanel({ detail, onClose }) {
  const board = parseBoardCards(detail.board);
  const players = detail.players || [];
  const actions = detail.actions || [];

  return (
    <div
      className="rounded p-2 mb-2"
      style={{ background: '#0d1117', border: '1px solid #30363d' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold" style={{ color: '#d4af37', letterSpacing: '0.1em' }}>
          HAND DETAIL
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #30363d',
            borderRadius: '3px',
            cursor: 'pointer',
            padding: '1px 7px',
            color: '#6e7681',
            fontSize: '10px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = '#f85149'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; e.currentTarget.style.borderColor = '#30363d'; }}
        >
          Close
        </button>
      </div>

      {/* Board */}
      {board.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>BOARD</div>
          <div className="flex gap-1.5 flex-wrap">
            {board.map((c, i) => (
              <CardCode key={i} card={c} />
            ))}
          </div>
        </div>
      )}

      {/* Players table */}
      {players.length > 0 && (
        <div className="mb-2">
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>PLAYERS</div>
          <div
            style={{
              overflowX: 'auto',
              borderRadius: '4px',
              border: '1px solid #21262d',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #21262d' }}>
                  {['Name', 'Cards', 'Start', 'End', 'W/L'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '3px 5px',
                        color: '#6e7681',
                        fontWeight: 600,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const holeCards = parseBoardCards(p.hole_cards);
                  const net = (p.stack_end || 0) - (p.stack_start || 0);
                  const isWinner = net > 0;
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #21262d' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '3px 5px', color: '#f0ece3', whiteSpace: 'nowrap', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.player_name || p.name || '—'}
                      </td>
                      <td style={{ padding: '3px 5px', whiteSpace: 'nowrap' }}>
                        {holeCards.length > 0
                          ? holeCards.map((c, ci) => <CardCode key={ci} card={c} />)
                          : <span style={{ color: '#444' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '3px 5px', color: '#8b949e', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        ${Number(p.stack_start || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '3px 5px', color: '#8b949e', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        ${Number(p.stack_end || 0).toLocaleString()}
                      </td>
                      <td style={{ padding: '3px 5px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: isWinner ? '#3fb950' : net < 0 ? '#f85149' : '#6e7681', fontFamily: 'monospace', fontWeight: 600 }}>
                          {net > 0 ? '+' : ''}{net}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action log */}
      {actions.length > 0 && (
        <div>
          <div className="text-xs mb-1" style={{ color: '#6e7681', fontSize: '9px', letterSpacing: '0.1em' }}>ACTIONS</div>
          <div
            style={{
              maxHeight: '140px',
              overflowY: 'auto',
              borderRadius: '4px',
              border: '1px solid #21262d',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #21262d' }}>
                  {['Street', 'Player', 'Action', 'Amt'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '3px 5px',
                        color: '#6e7681',
                        fontWeight: 600,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                        position: 'sticky',
                        top: 0,
                        background: '#0d1117',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => {
                  const actionKey = String(a.action || '').toLowerCase();
                  const actionColors = ACTION_COLORS[actionKey] || { bg: '#21262d', text: '#8b949e' };
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #21262d' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '3px 5px', color: '#6e7681', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '8px' }}>
                        {a.street || '—'}
                      </td>
                      <td style={{ padding: '3px 5px', color: '#f0ece3', whiteSpace: 'nowrap', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {a.player_name || a.player || '—'}
                      </td>
                      <td style={{ padding: '3px 5px' }}>
                        <span
                          style={{
                            fontSize: '8px',
                            fontWeight: 700,
                            color: actionColors.text,
                            background: actionColors.bg,
                            borderRadius: '2px',
                            padding: '1px 3px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {a.action || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '3px 5px', color: '#e3b341', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {a.amount ? `$${Number(a.amount).toLocaleString()}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CoachSidebar({
  gameState = {},
  emit = {},
  onOpenCardPicker,
  isOpen,
  onToggle,
  sessionStats = null,
  playlists = [],
  actionTimer = null,
  activeHandId = null,
  handTagsSaved = null,
}) {
  // Local state
  const [mode, setMode] = useState('rng'); // 'rng' | 'manual'
  const [awardPotTarget, setAwardPotTarget] = useState('');
  const [stackAdjustTarget, setStackAdjustTarget] = useState('');
  const [stackAdjustValue, setStackAdjustValue] = useState('');

  // History hook
  const { hands, loading: historyLoading, handDetail, fetchHands, fetchHandDetail, clearDetail } = useHistory();
  const [historyOpen, setHistoryOpen] = useState(false);

  // Section 8: Live Hand Tags
  const [currentHandTags, setCurrentHandTags] = useState([]);
  const tagDebounceRef = useRef(null)

  // Section 9: Playlist Manager
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [activePlaylistId, setActivePlaylistId] = useState(null);

  // Section 10: Scenario Loader
  const [scenarioSearch, setScenarioSearch] = useState('');
  const [selectedPlaylistForAdd, setSelectedPlaylistForAdd] = useState('');
  const [scenarioHands, setScenarioHands] = useState([]);
  const [scenarioStackMode, setScenarioStackMode] = useState('keep')

  // Destructure game state with safe defaults
  const {
    phase = 'WAITING',
    pot = 0,
    paused: is_paused = false,
    can_undo = false,
    can_rollback_street = false,
    players = [],
    board = [],
    config_phase = false,
  } = gameState;

  // Auto-fetch hands when history panel opens
  useEffect(() => {
    if (historyOpen) {
      fetchHands();
    }
  }, [historyOpen, fetchHands]);

  // Auto-fetch hands when phase transitions to 'waiting' (after a hand ends)
  const prevPhaseRef = React.useRef(phase);
  useEffect(() => {
    if (prevPhaseRef.current !== 'WAITING' && phase === 'WAITING') {
      fetchHands();
    }
    prevPhaseRef.current = phase;
  }, [phase, fetchHands]);

  // Reset hand tags when a new hand starts (phase returns to waiting)
  useEffect(() => {
    if (phase === 'WAITING') {
      setCurrentHandTags([]);
    }
  }, [phase]);

  // Debounced persistent tag save — fires 500ms after last tag change while a hand is active
  useEffect(() => {
    if (!activeHandId || !emit.updateHandTags) return
    clearTimeout(tagDebounceRef.current)
    tagDebounceRef.current = setTimeout(() => {
      emit.updateHandTags(activeHandId, currentHandTags)
    }, 500)
    return () => clearTimeout(tagDebounceRef.current)
  }, [currentHandTags, activeHandId])

  // Fetch playlists on mount
  useEffect(() => { emit.getPlaylists?.(); }, []);

  // Fetch scenario hands on mount
  useEffect(() => {
    fetch('/api/hands?limit=50')
      .then(r => r.json())
      .then(data => setScenarioHands(data.hands ?? []))
      .catch(() => {});
  }, []);

  const seatedPlayers = players.filter((p) => p && p.seat !== undefined && p.seat !== null);
  const activePlayers = seatedPlayers.filter((p) => p.is_active !== false && p.stack !== undefined);

  // ── Helpers ──

  function formatPot(n) {
    if (!n) return '0';
    return Number(n).toLocaleString('en-US');
  }

  // ── Handlers ──

  const handleModeToggle = useCallback(
    (newMode) => {
      setMode(newMode);
      if (emit.setMode) emit.setMode(newMode);
    },
    [emit]
  );

  const handleStartGame = useCallback(() => {
    if (emit.startGame) emit.startGame(mode);
  }, [emit, mode]);

  const handleResetHand = useCallback(() => {
    if (emit.resetHand) emit.resetHand();
  }, [emit]);

  const handleTogglePause = useCallback(() => {
    if (emit.togglePause) emit.togglePause();
  }, [emit]);

  const handleUndoAction = useCallback(() => {
    if (emit.undoAction && can_undo) emit.undoAction();
  }, [emit, can_undo]);

  const handleRollbackStreet = useCallback(() => {
    if (emit.rollbackStreet && can_rollback_street) emit.rollbackStreet();
  }, [emit, can_rollback_street]);

  const handleForceNextStreet = useCallback(() => {
    if (emit.forceNextStreet) emit.forceNextStreet();
  }, [emit]);

  const handleAwardPot = useCallback(() => {
    if (emit.awardPot && awardPotTarget) {
      emit.awardPot(awardPotTarget);
      setAwardPotTarget('');
    }
  }, [emit, awardPotTarget]);

  const handleSetStack = useCallback(() => {
    const val = parseFloat(stackAdjustValue);
    if (emit.adjustStack && stackAdjustTarget && !isNaN(val) && val >= 0) {
      emit.adjustStack(stackAdjustTarget, val);
      setStackAdjustValue('');
    }
  }, [emit, stackAdjustTarget, stackAdjustValue]);

  function handleCreatePlaylist() {
    if (!newPlaylistName.trim()) return;
    emit.createPlaylist?.(newPlaylistName.trim());
    setNewPlaylistName('');
  }

  const handlePlayerCardSlot = useCallback(
    (playerId, position) => {
      if (onOpenCardPicker) {
        onOpenCardPicker({ type: 'player', playerId, position });
      }
    },
    [onOpenCardPicker]
  );

  const handleBoardCardSlot = useCallback(
    (position) => {
      if (onOpenCardPicker) {
        onOpenCardPicker({ type: 'board', position });
      }
    },
    [onOpenCardPicker]
  );

  // ─── Collapsed tab ────────────────────────────────────────────────────────

  if (!isOpen) {
    return (
      <div
        className="fixed right-0 top-0 h-full z-40 flex items-center"
        style={{ pointerEvents: 'none' }}
      >
        <button
          onClick={onToggle}
          className="flex flex-col items-center justify-center gap-1.5 rounded-l-lg transition-all duration-200"
          style={{
            width: '28px',
            height: '100px',
            background: '#161b22',
            border: '1px solid #30363d',
            borderRight: 'none',
            cursor: 'pointer',
            pointerEvents: 'all',
            color: '#d4af37',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#1c2330';
            e.currentTarget.style.borderColor = '#d4af37';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#161b22';
            e.currentTarget.style.borderColor = '#30363d';
          }}
          title="Open Coach Panel"
          aria-label="Open Coach Panel"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M8 2L4 6l4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              transform: 'rotate(180deg)',
              fontSize: '9px',
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#d4af37',
              userSelect: 'none',
            }}
          >
            COACH
          </span>
        </button>
      </div>
    );
  }

  // ─── Open sidebar ─────────────────────────────────────────────────────────

  return (
    <div
      className="fixed right-0 top-0 h-full z-40 flex"
      style={{ width: '18rem' }}
    >
      {/* Collapse tab on left edge of open sidebar */}
      <button
        onClick={onToggle}
        className="flex flex-col items-center justify-center gap-1.5 self-center rounded-l-lg transition-all duration-200 flex-shrink-0"
        style={{
          width: '24px',
          height: '80px',
          background: '#161b22',
          border: '1px solid #30363d',
          borderRight: 'none',
          cursor: 'pointer',
          color: '#6e7681',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#d4af37';
          e.currentTarget.style.borderColor = '#d4af37';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#6e7681';
          e.currentTarget.style.borderColor = '#30363d';
        }}
        title="Close Coach Panel"
        aria-label="Close Coach Panel"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M4 2l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Main panel */}
      <div
        className="flex flex-col flex-1 overflow-hidden"
        style={{
          background: '#0d1117',
          borderLeft: '1px solid #30363d',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.7)',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '1px solid #30363d' }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-bold tracking-[0.2em]"
              style={{ color: '#d4af37' }}
            >
              COACH
            </span>
            <span
              className="text-xs tracking-[0.1em]"
              style={{ color: '#30363d' }}
            >
              /
            </span>
            <PhaseBadge phase={phase} />
          </div>
          <div
            className="text-xs font-mono"
            style={{ color: '#444' }}
          >
            {is_paused ? (
              <span style={{ color: '#e3b341' }}>⏸ PAUSED</span>
            ) : phase !== 'WAITING' ? (
              <span style={{ color: '#3fb950' }}>● LIVE</span>
            ) : null}
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '12px 12px 20px' }}>

          {/* ── SECTION 1: Game Controls ───────────────────────────────────── */}
          <div className="coach-panel mb-3">
            <SectionHeader>GAME CONTROLS</SectionHeader>

            {/* CONFIG PHASE: replace waiting controls with HandConfigPanel */}
            {phase === 'WAITING' && config_phase ? (
              <HandConfigPanel gameState={gameState} emit={emit} />
            ) : (
              <>
                {/* Configure Hand button — only shown in waiting phase, before config is open */}
                {phase === 'WAITING' && (
                  <button
                    onClick={() => { if (emit.openConfigPhase) emit.openConfigPhase(); }}
                    className="btn-gold w-full mb-3"
                    style={{ padding: '7px 12px' }}
                  >
                    Configure Hand
                  </button>
                )}

                {/* Mode toggle */}
                <div className="flex mb-3">
                  <button
                    onClick={() => handleModeToggle('rng')}
                    className="flex-1 py-1.5 text-xs font-semibold tracking-wider transition-all duration-150 rounded-l"
                    style={{
                      background: mode === 'rng' ? '#d4af37' : '#161b22',
                      color: mode === 'rng' ? '#000' : '#6e7681',
                      border: `1px solid ${mode === 'rng' ? '#d4af37' : '#30363d'}`,
                      borderRight: 'none',
                    }}
                  >
                    RNG MODE
                  </button>
                  <button
                    onClick={() => handleModeToggle('manual')}
                    className="flex-1 py-1.5 text-xs font-semibold tracking-wider transition-all duration-150 rounded-r"
                    style={{
                      background: mode === 'manual' ? '#d4af37' : '#161b22',
                      color: mode === 'manual' ? '#000' : '#6e7681',
                      border: `1px solid ${mode === 'manual' ? '#d4af37' : '#30363d'}`,
                      borderLeft: '1px solid #21262d',
                    }}
                  >
                    MANUAL MODE
                  </button>
                </div>

                {/* Start + Reset */}
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleStartGame}
                    className="btn-gold flex-1"
                    style={{ padding: '7px 12px' }}
                  >
                    Start Hand
                  </button>
                  <button
                    onClick={handleResetHand}
                    className="btn-ghost"
                    style={{ padding: '7px 12px' }}
                  >
                    Reset
                  </button>
                </div>

                {/* Pause/Resume */}
                <button
                  onClick={handleTogglePause}
                  className="w-full flex items-center justify-center gap-2 py-1.5 rounded text-sm transition-all duration-150"
                  style={{
                    background: is_paused ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${is_paused ? '#1d4ed8' : '#30363d'}`,
                    color: is_paused ? '#93c5fd' : '#8b949e',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = is_paused
                      ? 'rgba(59,130,246,0.2)'
                      : 'rgba(255,255,255,0.07)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = is_paused
                      ? 'rgba(59,130,246,0.12)'
                      : 'rgba(255,255,255,0.04)';
                  }}
                >
                  {is_paused ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 2l7 4-7 4V2z" fill="currentColor" />
                      </svg>
                      Resume Game
                    </>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <rect x="2.5" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
                        <rect x="6.5" y="2" width="3" height="8" rx="0.5" fill="currentColor" />
                      </svg>
                      Pause Game
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* ── SECTION 2: Undo Controls ───────────────────────────────────── */}
          <div className="coach-panel mb-3">
            <SectionHeader>UNDO CONTROLS</SectionHeader>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleUndoAction}
                disabled={!can_undo}
                className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1.5 4.5h5a3 3 0 0 1 0 6h-2M1.5 4.5L4 2M1.5 4.5L4 7"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Undo Last Action
              </button>
              <button
                onClick={handleRollbackStreet}
                disabled={!can_rollback_street}
                className="btn-ghost w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1.5 6h5a2 2 0 1 1 0 4H5M1.5 6L4 3.5M1.5 6L4 8.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Rollback Street
              </button>
              <button
                onClick={handleForceNextStreet}
                className="btn-ghost w-full flex items-center justify-center gap-2"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M2 6h6M5.5 3l3 3-3 3M9.5 3v6"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Force Next Street
              </button>
            </div>
          </div>

          {/* ── SECTION 3: Manual Card Injection (manual mode only) ────────── */}
          {mode === 'manual' && (
            <div className="coach-panel mb-3">
              <SectionHeader>CARD INJECTION</SectionHeader>

              {/* Player hole cards */}
              {seatedPlayers.length === 0 ? (
                <div
                  className="text-xs text-center py-2"
                  style={{ color: '#444' }}
                >
                  No players seated
                </div>
              ) : (
                <div className="flex flex-col gap-2 mb-3">
                  {seatedPlayers.map((player) => {
                    const holeCards = player.hole_cards || [null, null];
                    return (
                      <div
                        key={player.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded"
                        style={{ background: '#0d1117', border: '1px solid #21262d' }}
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs font-medium truncate"
                            style={{ color: '#f0ece3' }}
                          >
                            {player.name || `Seat ${player.seat}`}
                          </div>
                          <div
                            className="text-xs font-mono"
                            style={{ color: '#6e7681' }}
                          >
                            ${(player.stack || 0).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <CardSlot
                            card={holeCards[0] || null}
                            label={`${player.name || 'Player'} — Card 1`}
                            onClick={() => handlePlayerCardSlot(player.id, 0)}
                          />
                          <CardSlot
                            card={holeCards[1] || null}
                            label={`${player.name || 'Player'} — Card 2`}
                            onClick={() => handlePlayerCardSlot(player.id, 1)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Board cards */}
              <div
                className="pt-2"
                style={{ borderTop: '1px solid #21262d' }}
              >
                <div
                  className="text-xs font-medium mb-2 tracking-wider"
                  style={{ color: '#6e7681' }}
                >
                  BOARD
                </div>
                <div className="flex gap-1.5">
                  {BOARD_POSITION_LABELS.map((label, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <CardSlot
                        card={board[idx] || null}
                        label={label}
                        onClick={() => handleBoardCardSlot(idx)}
                      />
                      <span
                        className="text-center"
                        style={{
                          fontSize: '8px',
                          color: '#444',
                          lineHeight: 1,
                          letterSpacing: '0.05em',
                        }}
                      >
                        {idx < 3 ? `F${idx + 1}` : idx === 3 ? 'TN' : 'RV'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 4: Pot & Stack Management ─────────────────────────── */}
          <div className="coach-panel mb-3">
            <SectionHeader>POT & STACKS</SectionHeader>

            {/* Pot display */}
            <div
              className="flex items-center justify-between mb-3 px-3 py-2 rounded"
              style={{ background: '#0d1117', border: '1px solid #21262d' }}
            >
              <span className="label-sm">Current Pot</span>
              <span
                className="text-sm font-bold font-mono"
                style={{ color: '#d4af37' }}
              >
                ${Number(pot || 0).toLocaleString()}
              </span>
            </div>

            {/* Award Pot */}
            <div className="mb-3">
              <div className="label-sm mb-1.5">Award Pot To</div>
              <div className="flex gap-2">
                <select
                  value={awardPotTarget}
                  onChange={(e) => setAwardPotTarget(e.target.value)}
                  className="flex-1 rounded text-xs py-1.5 px-2 min-w-0"
                  style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    color: awardPotTarget ? '#f0ece3' : '#6e7681',
                    outline: 'none',
                  }}
                >
                  <option value="" disabled>Select player…</option>
                  {activePlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || `Seat ${p.seat}`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleAwardPot}
                  disabled={!awardPotTarget}
                  className="btn-gold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  Award Pot
                </button>
              </div>
            </div>

            <Divider />

            {/* Stack adjuster */}
            <div>
              <div className="label-sm mb-1.5">Adjust Stack</div>
              <select
                value={stackAdjustTarget}
                onChange={(e) => setStackAdjustTarget(e.target.value)}
                className="w-full rounded text-xs py-1.5 px-2 mb-2"
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: stackAdjustTarget ? '#f0ece3' : '#6e7681',
                  outline: 'none',
                }}
              >
                <option value="" disabled>Select player…</option>
                {seatedPlayers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || `Seat ${p.seat}`}
                    {p.stack !== undefined ? ` — $${Number(p.stack).toLocaleString()}` : ''}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="50"
                  placeholder="New stack…"
                  value={stackAdjustValue}
                  onChange={(e) => setStackAdjustValue(e.target.value)}
                  className="flex-1 rounded text-xs py-1.5 px-2 min-w-0 font-mono"
                  style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    color: '#f0ece3',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#d4af37')}
                  onBlur={(e) => (e.target.style.borderColor = '#30363d')}
                />
                <button
                  onClick={handleSetStack}
                  disabled={!stackAdjustTarget || stackAdjustValue === ''}
                  className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  Set Stack
                </button>
              </div>
            </div>
          </div>

          {/* ── SECTION 5: Players List ────────────────────────────────────── */}
          <div className="coach-panel">
            <SectionHeader>PLAYERS</SectionHeader>

            {seatedPlayers.length === 0 ? (
              <div
                className="text-xs text-center py-3"
                style={{ color: '#444' }}
              >
                No players seated
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {seatedPlayers.map((player, idx) => {
                  const holeCards = player.hole_cards || [];
                  const isActive = player.is_active;
                  const hasFolded = player.is_active === false;

                  return (
                    <div
                      key={player.id ?? idx}
                      className="rounded p-2"
                      style={{
                        background: isActive
                          ? 'rgba(212,175,55,0.05)'
                          : '#0d1117',
                        border: `1px solid ${isActive ? 'rgba(212,175,55,0.3)' : '#21262d'}`,
                        opacity: hasFolded ? 0.5 : 1,
                        transition: 'opacity 0.2s, border-color 0.2s',
                      }}
                    >
                      {/* Name row */}
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {/* Seat indicator */}
                          <span
                            className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              width: '18px',
                              height: '18px',
                              background: isActive ? '#d4af37' : '#21262d',
                              color: isActive ? '#000' : '#6e7681',
                              fontSize: '9px',
                            }}
                          >
                            {player.seat ?? idx + 1}
                          </span>
                          <span
                            className="text-xs font-medium truncate"
                            style={{
                              color: hasFolded ? '#6e7681' : '#f0ece3',
                              textDecoration: hasFolded ? 'line-through' : 'none',
                            }}
                          >
                            {player.name || `Seat ${player.seat}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
                          {player.action && (
                            <ActionBadge action={player.action} />
                          )}
                          {player.is_dealer && (
                            <span
                              className="inline-flex items-center justify-center rounded-full text-xs font-bold"
                              style={{
                                width: '16px',
                                height: '16px',
                                background: '#d4af37',
                                color: '#000',
                                fontSize: '8px',
                              }}
                              title="Dealer"
                            >
                              D
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stack + hole cards */}
                      <div className="flex items-center justify-between">
                        <span
                          className="text-xs font-mono"
                          style={{ color: '#6e7681' }}
                        >
                          ${Number(player.stack || 0).toLocaleString()}
                          {player.current_bet > 0 && (
                            <span style={{ color: '#e3b341', marginLeft: '4px' }}>
                              +${Number(player.current_bet).toLocaleString()}
                            </span>
                          )}
                        </span>

                        {/* Hole cards */}
                        {holeCards.length > 0 && (
                          <div className="flex gap-1">
                            {holeCards.map((c, i) => (
                              <Card
                                key={i}
                                card={c === 'HIDDEN' ? undefined : c}
                                hidden={c === 'HIDDEN' || !c}
                                small
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── SECTION 6: Session Stats ───────────────────────────────── */}
          {sessionStats && sessionStats.players && sessionStats.players.length > 0 && (
            <div className="coach-panel mt-3">
              <SectionHeader>SESSION STATS</SectionHeader>

              {/* Hands dealt subtitle */}
              <div
                className="text-xs mb-3"
                style={{ color: '#6e7681' }}
              >
                Hands dealt: {sessionStats.handsDealt ?? 0}
              </div>

              {/* Per-player stat cards */}
              <div className="flex flex-col gap-2">
                {sessionStats.players.map((player) => {
                  const netChips = player.netChips ?? 0;
                  const netPositive = netChips >= 0;
                  return (
                    <div
                      key={player.playerId}
                      className="rounded p-2"
                      style={{
                        background: '#0d1117',
                        border: '1px solid #21262d',
                      }}
                    >
                      {/* Player name + net chips */}
                      <div className="flex items-center justify-between mb-1.5">
                        <span
                          className="text-xs font-medium truncate"
                          style={{ color: '#f0ece3' }}
                        >
                          {player.playerName}
                        </span>
                        <span
                          className="text-xs font-mono font-semibold flex-shrink-0 ml-2"
                          style={{ color: netPositive ? '#3fb950' : '#f85149' }}
                        >
                          {netPositive ? '+' : ''}{netChips}
                        </span>
                      </div>

                      {/* Hands played / won */}
                      <div
                        className="text-xs mb-1.5"
                        style={{ color: '#6e7681' }}
                      >
                        Hands:{' '}
                        <span style={{ color: '#f0ece3' }}>
                          {player.handsPlayed ?? 0} played / {player.handsWon ?? 0} won
                        </span>
                      </div>

                      {/* Stat grid: VPIP / PFR / WTSD / WSD */}
                      <div
                        className="grid gap-1"
                        style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}
                      >
                        {[
                          { label: 'VPIP', value: player.vpip },
                          { label: 'PFR',  value: player.pfr  },
                          { label: 'WTSD', value: player.wtsd },
                          { label: 'WSD',  value: player.wsd  },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex flex-col items-center rounded py-1"
                            style={{ background: 'rgba(255,255,255,0.03)' }}
                          >
                            <span
                              style={{
                                fontSize: '8px',
                                color: '#6e7681',
                                letterSpacing: '0.08em',
                                lineHeight: 1,
                              }}
                            >
                              {label}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#f0ece3',
                                fontWeight: 600,
                                lineHeight: 1.4,
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {((value ?? 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── Section 8: Live Hand Tags ─────────────────────────── */}
          <div className="coach-panel mt-3">
            <SectionHeader>LIVE HAND TAGS</SectionHeader>
            <div className="px-3 pb-3">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['Review', 'Bluff', 'Hero Call', 'Mistake', 'Key Hand', '3-Bet Pot'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setCurrentHandTags(prev =>
                        prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                      )
                    }}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border transition-all duration-100 ${
                      currentHandTags.includes(tag)
                        ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                    style={currentHandTags.includes(tag) ? {
                      background: 'rgba(212,175,55,0.2)',
                      borderColor: 'rgba(212,175,55,0.6)',
                      color: '#d4b896',
                    } : {
                      background: 'rgba(255,255,255,0.05)',
                      borderColor: 'rgba(255,255,255,0.1)',
                      color: '#6e7681',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {currentHandTags.length > 0 && (
                <div className="flex items-center justify-between">
                  <span
                    style={{ fontSize: '10px', color: '#6e7681' }}
                  >
                    {currentHandTags.length} tag{currentHandTags.length > 1 ? 's' : ''} applied
                  </span>
                  {handTagsSaved && (
                    <span style={{ fontSize: '9px', color: '#3fb950', letterSpacing: '0.06em' }}>
                      ✓ Saved
                    </span>
                  )}
                  <button
                    onClick={() => setCurrentHandTags([])}
                    style={{ fontSize: '10px', color: 'rgba(248,81,73,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(248,81,73,0.7)'; }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>
          <Divider />

          {/* ─── Section 9: Playlist Manager ──────────────────────── */}
          <div className="coach-panel mt-3">
            <SectionHeader>PLAYLISTS</SectionHeader>
            <div className="px-3 pb-3 space-y-2">
              {/* Create new playlist */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="New playlist name..."
                  value={newPlaylistName}
                  onChange={e => setNewPlaylistName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
                  className="flex-1 rounded px-2 py-1 text-xs text-white placeholder-gray-600 outline-none"
                  style={{
                    background: '#161b22',
                    border: '1px solid #30363d',
                    color: '#f0ece3',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
                />
                <button
                  onClick={handleCreatePlaylist}
                  disabled={!newPlaylistName.trim()}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(212,175,55,0.4)',
                    color: '#d4af37',
                    background: 'none',
                    cursor: newPlaylistName.trim() ? 'pointer' : 'not-allowed',
                    opacity: newPlaylistName.trim() ? 1 : 0.4,
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={(e) => { if (newPlaylistName.trim()) e.currentTarget.style.background = 'rgba(212,175,55,0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  + Create
                </button>
              </div>

              {/* Playlist list */}
              {playlists.length === 0 ? (
                <p style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>No playlists yet</p>
              ) : (
                <div style={{ maxHeight: '12rem', overflowY: 'auto' }} className="space-y-1">
                  {playlists.map(pl => (
                    <div
                      key={pl.playlist_id}
                      className="flex items-center justify-between px-2 rounded"
                      style={{
                        padding: '6px 8px',
                        border: activePlaylistId === pl.playlist_id
                          ? '1px solid rgba(212,175,55,0.5)'
                          : '1px solid rgba(255,255,255,0.08)',
                        background: activePlaylistId === pl.playlist_id
                          ? 'rgba(212,175,55,0.1)'
                          : 'rgba(255,255,255,0.03)',
                        borderRadius: '4px',
                        transition: 'all 0.1s',
                      }}
                    >
                      <div className="flex flex-col min-w-0">
                        <span style={{ fontSize: '11px', fontWeight: 500, color: '#e0ddd6' }} className="truncate">{pl.name}</span>
                        <span style={{ fontSize: '9px', color: '#6e7681' }}>{pl.hand_count ?? 0} hands</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {activePlaylistId === pl.playlist_id ? (
                          <button
                            onClick={() => { emit.deactivatePlaylist?.(); setActivePlaylistId(null); }}
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              borderRadius: '3px',
                              border: '1px solid rgba(202,138,4,0.5)',
                              color: '#facc15',
                              background: 'none',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(234,179,8,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                          >
                            Stop
                          </button>
                        ) : (
                          <button
                            onClick={() => { emit.activatePlaylist?.(pl.playlist_id); setActivePlaylistId(pl.playlist_id); }}
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              borderRadius: '3px',
                              border: '1px solid rgba(22,163,74,0.5)',
                              color: '#4ade80',
                              background: 'none',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                          >
                            Play
                          </button>
                        )}
                        <button
                          onClick={() => { emit.deletePlaylist?.(pl.playlist_id); if (activePlaylistId === pl.playlist_id) setActivePlaylistId(null); }}
                          style={{
                            padding: '2px 6px',
                            fontSize: '9px',
                            borderRadius: '3px',
                            border: '1px solid rgba(153,27,27,0.4)',
                            color: 'rgba(239,68,68,0.7)',
                            background: 'none',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.5)'; e.currentTarget.style.color = '#f87171'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(153,27,27,0.4)'; e.currentTarget.style.color = 'rgba(239,68,68,0.7)'; }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <Divider />

          {/* ─── Section 10: Scenario Loader ──────────────────────── */}
          <div className="coach-panel mt-3">
            <SectionHeader>SCENARIO LOADER</SectionHeader>
            <div className="px-3 pb-3 space-y-2">
              {/* Stack mode toggle */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {['keep', 'historical'].map(m => (
                  <button
                    key={m}
                    onClick={() => setScenarioStackMode(m)}
                    style={{
                      flex: 1, padding: '3px 0', fontSize: '9px', fontWeight: 600,
                      borderRadius: 3, cursor: 'pointer', letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      border: `1px solid ${scenarioStackMode === m ? 'rgba(212,175,55,0.5)' : '#30363d'}`,
                      background: scenarioStackMode === m ? 'rgba(212,175,55,0.12)' : 'transparent',
                      color: scenarioStackMode === m ? '#d4af37' : '#6e7681',
                    }}
                  >
                    {m === 'keep' ? 'Keep Stacks' : 'Hist. Stacks'}
                  </button>
                ))}
              </div>
              {/* Search filter */}
              <input
                type="text"
                placeholder="Search hands..."
                value={scenarioSearch}
                onChange={e => setScenarioSearch(e.target.value)}
                className="w-full rounded px-2 py-1 text-xs text-white outline-none"
                style={{
                  background: '#161b22',
                  border: '1px solid #30363d',
                  color: '#f0ece3',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#30363d'; }}
              />

              {/* Hand list */}
              <div style={{ maxHeight: '14rem', overflowY: 'auto' }} className="space-y-1">
                {scenarioHands.length === 0 ? (
                  <p style={{ fontSize: '10px', color: '#444', fontStyle: 'italic' }}>No completed hands yet</p>
                ) : (
                  scenarioHands
                    .filter(h => {
                      if (!scenarioSearch.trim()) return true;
                      const q = scenarioSearch.toLowerCase();
                      return (
                        (h.winner_name ?? '').toLowerCase().includes(q) ||
                        (h.phase_ended ?? '').toLowerCase().includes(q) ||
                        (h.hand_id ?? '').toLowerCase().includes(q) ||
                        (h.auto_tags ? JSON.stringify(h.auto_tags).toLowerCase().includes(q) : false)
                      );
                    })
                    .slice(0, 20)
                    .map(h => (
                      <div
                        key={h.hand_id}
                        className="flex items-center justify-between"
                        style={{
                          padding: '6px 8px',
                          borderRadius: '4px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          transition: 'border-color 0.1s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                      >
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1">
                            <span style={{ fontSize: '10px', fontWeight: 500, color: '#c9c3b8' }} className="truncate">
                              {h.winner_name ?? 'No winner'} — ${formatPot(h.final_pot)}
                            </span>
                          </div>
                          <div className="flex gap-1 mt-0.5 flex-wrap items-center">
                            {h.auto_tags && JSON.parse(h.auto_tags || '[]').map(tag => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: '8px',
                                  padding: '1px 4px',
                                  borderRadius: '2px',
                                  background: 'rgba(212,175,55,0.15)',
                                  color: '#d4af37',
                                  border: '1px solid rgba(212,175,55,0.2)',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                            {(() => {
                              const tags = Array.isArray(h.coach_tags) ? h.coach_tags
                                : (h.coach_tags ? JSON.parse(h.coach_tags) : []);
                              return tags.map(tag => (
                                <span key={`ctag-${tag}`} style={{
                                  fontSize: '8px', padding: '1px 4px', borderRadius: 2,
                                  background: 'rgba(99,102,241,0.15)', color: '#a5b4fc',
                                  border: '1px solid rgba(99,102,241,0.2)', marginRight: 2,
                                }}>{tag}</span>
                              ));
                            })()}
                            <span style={{ fontSize: '8px', color: '#444' }}>
                              {new Date(h.started_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => emit.loadHandScenario?.(h.hand_id, scenarioStackMode)}
                            title="Load cards from this hand, keep current stacks"
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              borderRadius: '3px',
                              border: '1px solid rgba(29,78,216,0.5)',
                              color: '#60a5fa',
                              background: 'none',
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                          >
                            Load
                          </button>
                          <button
                            onClick={() => emit.addToPlaylist?.(selectedPlaylistForAdd, h.hand_id)}
                            disabled={!selectedPlaylistForAdd}
                            title={selectedPlaylistForAdd ? 'Add to selected playlist' : 'Select a playlist first'}
                            style={{
                              padding: '2px 6px',
                              fontSize: '9px',
                              borderRadius: '3px',
                              border: '1px solid rgba(109,40,217,0.4)',
                              color: selectedPlaylistForAdd ? 'rgba(192,132,252,1)' : 'rgba(192,132,252,0.4)',
                              background: 'none',
                              cursor: selectedPlaylistForAdd ? 'pointer' : 'not-allowed',
                              whiteSpace: 'nowrap',
                              opacity: selectedPlaylistForAdd ? 1 : 0.4,
                            }}
                            onMouseEnter={(e) => { if (selectedPlaylistForAdd) { e.currentTarget.style.borderColor = 'rgba(124,58,237,0.6)'; e.currentTarget.style.color = '#c084fc'; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(109,40,217,0.4)'; e.currentTarget.style.color = selectedPlaylistForAdd ? 'rgba(192,132,252,1)' : 'rgba(192,132,252,0.4)'; }}
                          >
                            + Playlist
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* Playlist target selector for adding hands */}
              {playlists.length > 0 && (
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: '9px', color: '#6e7681', flexShrink: 0 }}>Add to:</span>
                  <select
                    value={selectedPlaylistForAdd}
                    onChange={e => setSelectedPlaylistForAdd(e.target.value)}
                    className="flex-1 rounded outline-none"
                    style={{
                      background: '#161b22',
                      border: '1px solid #30363d',
                      padding: '2px 6px',
                      fontSize: '10px',
                      color: '#c9c3b8',
                    }}
                  >
                    <option value="">— select playlist —</option>
                    {playlists.map(pl => (
                      <option key={pl.playlist_id} value={pl.playlist_id}>{pl.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
          <Divider />

          {/* ── SECTION 7: History ────────────────────────────────────── */}
          {isOpen && (
            <div className="coach-panel mt-3">
              {/* Header row */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex items-center gap-1.5 flex-1 min-w-0"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  <span
                    className="label-sm"
                    style={{ color: '#d4af37', letterSpacing: '0.12em' }}
                  >
                    HISTORY
                  </span>
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    style={{
                      color: '#6e7681',
                      transform: historyOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                      flexShrink: 0,
                    }}
                  >
                    <path
                      d="M3 2l4 3-4 3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => fetchHands()}
                  title="Refresh history"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    color: '#6e7681',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#d4af37'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#6e7681'; }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M1.5 6a4.5 4.5 0 1 1 1.3 3.2M1.5 9.5V6.5h3"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              {historyOpen && (
                <>
                  {/* Detail panel */}
                  {handDetail && (
                    <HandDetailPanel detail={handDetail} onClose={clearDetail} />
                  )}

                  {!handDetail && (
                    <>
                      {historyLoading && (
                        <div className="text-xs text-center py-3" style={{ color: '#6e7681' }}>
                          Loading…
                        </div>
                      )}

                      {!historyLoading && hands.length === 0 && (
                        <div className="text-xs text-center py-3" style={{ color: '#444' }}>
                          No completed hands yet
                        </div>
                      )}

                      {!historyLoading && hands.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {hands.map((hand, idx) => (
                            <HandHistoryRow
                              key={hand.hand_id}
                              hand={hand}
                              index={idx + 1}
                              onExpand={() => fetchHandDetail(hand.hand_id)}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Bottom spacer */}
          <div style={{ height: '8px' }} />
        </div>
      </div>
    </div>
  );
}
