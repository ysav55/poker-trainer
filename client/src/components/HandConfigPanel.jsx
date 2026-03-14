import React, { useState, useMemo, useCallback } from 'react';
import Card from './Card';
import CardPicker from './CardPicker';

// ── Constants ──────────────────────────────────────────────────────────────────

const BOARD_LABELS = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
const BOARD_SHORT  = ['F1', 'F2', 'F3', 'TN', 'RV'];
const MODES = ['rng', 'manual', 'hybrid'];

// ── Sub-components ─────────────────────────────────────────────────────────────

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

/**
 * A single card slot in the config panel.
 * Shows a face-up card if assigned, or a "?" placeholder if null.
 */
function ConfigCardSlot({ card, label, onClick }) {
  const isEmpty = card === null || card === undefined;

  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={isEmpty ? `${label} — click to assign card` : `${label} — ${card} (click to change)`}
      className="flex items-center justify-center rounded transition-all duration-150 relative group"
      style={{
        width: '2.75rem',
        height: '3.75rem',
        background: isEmpty ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: isEmpty ? '1.5px dashed #30363d' : '1.5px solid transparent',
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#d4af37';
        e.currentTarget.style.background = 'rgba(212,175,55,0.07)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,175,55,0.22)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isEmpty ? '#30363d' : 'transparent';
        e.currentTarget.style.borderStyle = isEmpty ? 'dashed' : 'solid';
        e.currentTarget.style.background = isEmpty ? 'rgba(255,255,255,0.03)' : 'transparent';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {isEmpty ? (
        <span
          style={{
            color: '#555',
            fontSize: '20px',
            fontWeight: 300,
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          ?
        </span>
      ) : (
        <Card card={card} small />
      )}
    </button>
  );
}

/**
 * Mode selector — three segments: rng | manual | hybrid
 */
function ModeSelector({ value, onChange }) {
  return (
    <div className="flex rounded overflow-hidden" style={{ border: '1px solid #30363d' }}>
      {MODES.map((m, idx) => {
        const isActive = value === m;
        const isFirst = idx === 0;
        const isLast = idx === MODES.length - 1;
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className="flex-1 py-1.5 text-xs font-semibold tracking-wider transition-all duration-150"
            style={{
              background: isActive ? '#d4af37' : '#161b22',
              color: isActive ? '#000' : '#6e7681',
              border: 'none',
              borderRight: !isLast ? '1px solid #30363d' : 'none',
              borderRadius: isFirst ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * HandConfigPanel — pre-game hand configuration UI for the coach.
 *
 * Props:
 *   gameState  {object}  — full TableState from server
 *   emit       {object}  — emit helpers object from useSocket (needs updateHandConfig,
 *                          startConfiguredHand, openConfigPhase)
 *   onOpenCardPicker  — unused; CardPicker is managed internally
 */
export default function HandConfigPanel({ gameState = {}, emit = {} }) {
  // ── Local state ──────────────────────────────────────────────────────────────

  const [config, setConfig] = useState({
    mode: 'hybrid',
    hole_cards: {},                     // { [playerId]: [card|null, card|null] }
    board: [null, null, null, null, null],
  });

  // pickerTarget: null | { type: 'player'|'board', playerId?, position }
  const [pickerTarget, setPickerTarget] = useState(null);

  // Disable Start Hand button while a start request is in-flight
  const [starting, setStarting] = useState(false);

  // ── Derived values ───────────────────────────────────────────────────────────

  const { players = [] } = gameState;

  // Non-coach seated players only
  const seatedPlayers = useMemo(
    () => players.filter((p) => p && !p.is_coach && p.seat !== undefined && p.seat !== null),
    [players]
  );

  // All non-null cards currently in config — passed to CardPicker as usedCards
  const usedCards = useMemo(() => {
    const set = new Set();
    // Board
    config.board.forEach((c) => { if (c) set.add(c); });
    // Hole cards
    Object.values(config.hole_cards).forEach((pair) => {
      if (Array.isArray(pair)) pair.forEach((c) => { if (c) set.add(c); });
    });
    return set;
  }, [config]);

  // usedCards for the picker — same set minus the card in the target slot so it
  // can be replaced without being blocked
  const pickerUsedCards = useMemo(() => {
    if (!pickerTarget) return usedCards;
    const set = new Set(usedCards);
    if (pickerTarget.type === 'board') {
      const existing = config.board[pickerTarget.position];
      if (existing) set.delete(existing);
    } else {
      const pair = config.hole_cards[pickerTarget.playerId] ?? [null, null];
      const existing = pair[pickerTarget.position];
      if (existing) set.delete(existing);
    }
    return set;
  }, [pickerTarget, usedCards, config]);

  // Human-readable title for the CardPicker modal
  const pickerTitle = useMemo(() => {
    if (!pickerTarget) return 'Select a card';
    if (pickerTarget.type === 'board') {
      return `Board — ${BOARD_LABELS[pickerTarget.position] ?? `Slot ${pickerTarget.position}`}`;
    }
    const player = players.find((p) => p.id === pickerTarget.playerId);
    return `${player?.name ?? 'Player'} — Card ${pickerTarget.position + 1}`;
  }, [pickerTarget, players]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /** Emit the current config to the server. */
  const emitConfig = useCallback(
    (nextConfig) => {
      if (emit.updateHandConfig) {
        emit.updateHandConfig(nextConfig);
      }
    },
    [emit]
  );

  // ── Slot click handlers ───────────────────────────────────────────────────────

  const handleBoardSlotClick = useCallback((position) => {
    setPickerTarget({ type: 'board', position });
  }, []);

  const handlePlayerSlotClick = useCallback((playerId, position) => {
    setPickerTarget({ type: 'player', playerId, position });
  }, []);

  // ── CardPicker callbacks ──────────────────────────────────────────────────────

  const handlePickerSelect = useCallback(
    (card) => {
      if (!pickerTarget) return;

      setConfig((prev) => {
        let nextConfig;
        if (pickerTarget.type === 'board') {
          const nextBoard = [...prev.board];
          nextBoard[pickerTarget.position] = card;
          nextConfig = { ...prev, board: nextBoard };
        } else {
          const prevPair = prev.hole_cards[pickerTarget.playerId] ?? [null, null];
          const nextPair = [...prevPair];
          nextPair[pickerTarget.position] = card;
          nextConfig = {
            ...prev,
            hole_cards: { ...prev.hole_cards, [pickerTarget.playerId]: nextPair },
          };
        }
        emitConfig(nextConfig);
        return nextConfig;
      });

      setPickerTarget(null);
    },
    [pickerTarget, emitConfig]
  );

  const handlePickerClose = useCallback(() => {
    setPickerTarget(null);
  }, []);

  // ── Mode change ───────────────────────────────────────────────────────────────

  const handleModeChange = useCallback(
    (newMode) => {
      setConfig((prev) => {
        const nextConfig = { ...prev, mode: newMode };
        emitConfig(nextConfig);
        return nextConfig;
      });
    },
    [emitConfig]
  );

  // ── Clear config ──────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    const resetConfig = {
      mode: config.mode,
      hole_cards: {},
      board: [null, null, null, null, null],
    };
    setConfig(resetConfig);
    emitConfig(resetConfig);
  }, [config.mode, emitConfig]);

  // ── Start Hand ────────────────────────────────────────────────────────────────

  const handleStartHand = useCallback(() => {
    if (starting) return;
    setStarting(true);
    if (emit.startConfiguredHand) {
      emit.startConfiguredHand();
    }
    // Re-enable after a short delay in case the server doesn't respond immediately
    setTimeout(() => setStarting(false), 3000);
  }, [starting, emit]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Main panel ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col gap-0"
        style={{ color: '#f0ece3' }}
      >
        {/* ── Section: Mode ─────────────────────────────────────────────────── */}
        <div className="coach-panel mb-3">
          <SectionHeader>DEAL MODE</SectionHeader>
          <ModeSelector value={config.mode} onChange={handleModeChange} />
          <div
            className="mt-2 text-xs leading-snug"
            style={{ color: '#6e7681' }}
          >
            {config.mode === 'rng' && 'All cards dealt randomly. Config slots are ignored.'}
            {config.mode === 'manual' && 'Pinned cards used as-is. Empty slots filled randomly.'}
            {config.mode === 'hybrid' && 'Pinned cards are fixed. Empty slots filled randomly.'}
          </div>
        </div>

        {/* ── Section: Player Hole Cards ────────────────────────────────────── */}
        <div className="coach-panel mb-3">
          <SectionHeader>HOLE CARDS</SectionHeader>

          {seatedPlayers.length === 0 ? (
            <div
              className="text-xs text-center py-3"
              style={{ color: '#444' }}
            >
              No players seated yet
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {seatedPlayers.map((player) => {
                const pair = config.hole_cards[player.id] ?? [null, null];
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded"
                    style={{ background: '#0d1117', border: '1px solid #21262d' }}
                  >
                    {/* Seat badge */}
                    <span
                      className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        width: '18px',
                        height: '18px',
                        background: '#21262d',
                        color: '#6e7681',
                        fontSize: '9px',
                      }}
                    >
                      {player.seat}
                    </span>

                    {/* Player name + stack */}
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
                        ${Number(player.stack || 0).toLocaleString()}
                      </div>
                    </div>

                    {/* Card slots */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      <ConfigCardSlot
                        card={pair[0]}
                        label={`${player.name || `Seat ${player.seat}`} — Card 1`}
                        onClick={() => handlePlayerSlotClick(player.id, 0)}
                      />
                      <ConfigCardSlot
                        card={pair[1]}
                        label={`${player.name || `Seat ${player.seat}`} — Card 2`}
                        onClick={() => handlePlayerSlotClick(player.id, 1)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section: Board ────────────────────────────────────────────────── */}
        <div className="coach-panel mb-3">
          <SectionHeader>BOARD CARDS</SectionHeader>

          <div className="flex gap-2 justify-between">
            {config.board.map((card, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1">
                <ConfigCardSlot
                  card={card}
                  label={BOARD_LABELS[idx]}
                  onClick={() => handleBoardSlotClick(idx)}
                />
                <span
                  className="text-center"
                  style={{
                    fontSize: '8px',
                    color: '#555',
                    lineHeight: 1,
                    letterSpacing: '0.04em',
                    userSelect: 'none',
                  }}
                >
                  {BOARD_SHORT[idx]}
                </span>
              </div>
            ))}
          </div>

          {/* Flop / Turn / River group labels */}
          <div
            className="flex mt-2 text-center"
            style={{ fontSize: '8px', color: '#444', letterSpacing: '0.08em' }}
          >
            <span className="flex-1">FLOP</span>
            <span className="flex-1">FLOP</span>
            <span className="flex-1">FLOP</span>
            <span className="flex-1">TURN</span>
            <span className="flex-1">RIVER</span>
          </div>
        </div>

        <Divider />

        {/* ── Action buttons ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleStartHand}
            disabled={starting}
            className="btn-gold w-full disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: '9px 12px' }}
          >
            {starting ? 'Starting…' : 'Start Hand'}
          </button>
          <button
            onClick={handleClear}
            className="btn-danger w-full"
            style={{ padding: '7px 12px' }}
          >
            Clear Config
          </button>
        </div>

        {/* Config summary pill */}
        <div
          className="mt-3 px-2 py-1.5 rounded text-xs leading-snug"
          style={{
            background: 'rgba(212,175,55,0.05)',
            border: '1px solid rgba(212,175,55,0.12)',
            color: '#8b949e',
          }}
        >
          <span style={{ color: '#d4af37', fontWeight: 600 }}>
            {usedCards.size}
          </span>
          {' '}card{usedCards.size !== 1 ? 's' : ''} pinned ·{' '}
          <span style={{ color: '#d4af37', fontWeight: 600 }}>
            {config.mode.toUpperCase()}
          </span>
          {' '}mode
        </div>
      </div>

      {/* ── CardPicker modal (portal rendered inline) ─────────────────────────── */}
      {pickerTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handlePickerClose();
          }}
        >
          <CardPicker
            usedCards={pickerUsedCards}
            title={pickerTitle}
            onSelect={handlePickerSelect}
            onClose={handlePickerClose}
          />
        </div>
      )}
    </>
  );
}
