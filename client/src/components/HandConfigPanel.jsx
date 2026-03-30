import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import Card from './Card';
import CardPicker from './CardPicker';
import { validateRange, parseRange } from '../utils/rangeParser';
import { RangeMatrix } from './RangeMatrix';
import { comboArrayToHandGroups, selectedHandGroupsToComboArray } from '../utils/comboUtils';

// ── Constants ──────────────────────────────────────────────────────────────────

const BOARD_LABELS = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
const BOARD_SHORT  = ['F1', 'F2', 'F3', 'TN', 'RV'];
const MODES = ['rng', 'manual', 'hybrid'];

const TEXTURE_GROUPS = [
  { label: 'SUIT',      tags: ['rainbow', 'flush_draw', 'monotone'] },
  { label: 'PAIR',      tags: ['unpaired', 'paired', 'trips'] },
  { label: 'CONNECT',   tags: ['connected', 'one_gap', 'disconnected'] },
  { label: 'HIGH',      tags: ['broadway', 'mid', 'low', 'ace_high'] },
  { label: 'FEEL',      tags: ['wet', 'dry'] },
];

const TEXTURE_LABELS = {
  rainbow: 'Rainbow', flush_draw: 'Flush Draw', monotone: 'Monotone',
  unpaired: 'Unpaired', paired: 'Paired', trips: 'Trips',
  connected: 'Connected', one_gap: 'One Gap', disconnected: 'Disconnected',
  broadway: 'Broadway', mid: 'Mid', low: 'Low', ace_high: 'Ace High',
  wet: 'Wet', dry: 'Dry',
};

// Map each tag to its group index (for radio-within-group behaviour)
const TEXTURE_GROUP_OF = {};
TEXTURE_GROUPS.forEach(({ tags }, idx) => tags.forEach(t => { TEXTURE_GROUP_OF[t] = idx; }));

// ── Preset Range Scenarios ──────────────────────────────────────────────────────

// Build "all suited" and "all offsuit" range strings programmatically
const _R = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const _suitedParts = [];
const _offsuitParts = [];
for (let i = _R.length - 1; i >= 1; i--) {
  for (let j = i - 1; j >= 0; j--) {
    _suitedParts.push(`${_R[i]}${_R[j]}s`);
    _offsuitParts.push(`${_R[i]}${_R[j]}o`);
  }
}

const PRESET_GROUPS = [
  { label: 'PAIRS',    tags: ['all_pairs', 'premium_pairs', 'medium_pairs', 'small_pairs'] },
  { label: 'SUIT',     tags: ['suited', 'offsuit'] },
  { label: 'TYPE',     tags: ['broadway', 'connectors', 'one_gappers', 'ace_high', 'king_high'] },
  { label: 'SHORTCUT', tags: ['ato_plus', 'kjo_plus', 'premium', 'strong'] },
];

const PRESET_META = {
  all_pairs:     { label: 'All Pairs',  rangeStr: 'AA-22' },
  premium_pairs: { label: 'QQ+',        rangeStr: 'QQ+' },
  medium_pairs:  { label: '77-JJ',      rangeStr: 'JJ-77' },
  small_pairs:   { label: '22-66',      rangeStr: '66-22' },
  suited:        { label: 'Suited',     rangeStr: _suitedParts.join(',') },
  offsuit:       { label: 'Offsuit',    rangeStr: _offsuitParts.join(',') },
  broadway:      { label: 'Broadway',   rangeStr: 'AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,KQs,KQo,KJs,KJo,KTs,KTo,QJs,QJo,QTs,QTo,JTs,JTo' },
  connectors:    { label: 'Connectors', rangeStr: 'AKs,AKo,KQs,KQo,QJs,QJo,JTs,JTo,T9s,T9o,98s,98o,87s,87o,76s,76o,65s,65o,54s,54o,43s,43o,32s,32o' },
  one_gappers:   { label: '1-Gap',      rangeStr: 'AQs,AQo,KJs,KJo,QTs,QTo,J9s,J9o,T8s,T8o,97s,97o,86s,86o,75s,75o,64s,64o,53s,53o,42s,42o' },
  ace_high:      { label: 'Ace-high',   rangeStr: 'AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,A9s,A9o,A8s,A8o,A7s,A7o,A6s,A6o,A5s,A5o,A4s,A4o,A3s,A3o,A2s,A2o' },
  king_high:     { label: 'King-high',  rangeStr: 'KQs,KQo,KJs,KJo,KTs,KTo,K9s,K9o,K8s,K8o,K7s,K7o,K6s,K6o,K5s,K5o,K4s,K4o,K3s,K3o,K2s,K2o' },
  ato_plus:      { label: 'ATo+',       rangeStr: 'ATs,ATo,AJs,AJo,AQs,AQo,AKs,AKo' },
  kjo_plus:      { label: 'KJo+',       rangeStr: 'KJs,KJo,KQs,KQo' },
  premium:       { label: 'Premium',    rangeStr: 'AA,KK,QQ,JJ,TT,AKs,AKo' },
  strong:        { label: 'Strong',     rangeStr: 'AA,KK,QQ,JJ,TT,99,88,77,AKs,AKo,AQs,AQo,AJs,AJo,ATs,ATo,KQs,KQo' },
};

// Map each preset tag to its group label (for radio-within-group behaviour)
const PRESET_GROUP_OF = {};
PRESET_GROUPS.forEach(({ label, tags }) => tags.forEach(t => { PRESET_GROUP_OF[t] = label; }));

// Expand preset IDs → intersected combo list [[card, card], ...]
function computePresetCombos(presetIds) {
  if (!presetIds.length) return [];
  const sets = presetIds.map(id => {
    const meta = PRESET_META[id];
    if (!meta) return new Set();
    const combos = parseRange(meta.rangeStr);
    return new Set(combos.map(([c1, c2]) => [c1, c2].sort().join(',')));
  });
  const [first, ...rest] = sets;
  const intersection = new Set([...first].filter(k => rest.every(s => s.has(k))));
  return [...intersection].map(k => k.split(','));
}

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

function ConfigCardSlot({ card, label, onClick, compact = false }) {
  const isEmpty = card === null || card === undefined;
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={isEmpty ? `${label} — click to assign card` : `${label} — ${card} (click to change)`}
      className="flex items-center justify-center rounded transition-all duration-150 relative group w-full"
      style={{
        width: compact ? '100%' : '2.75rem', height: compact ? '3.25rem' : '3.75rem',
        background: isEmpty ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: isEmpty ? '1.5px dashed #30363d' : '1.5px solid transparent',
        cursor: 'pointer', padding: 0, flexShrink: 0,
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
        <span style={{ color: '#555', fontSize: '20px', fontWeight: 300, lineHeight: 1, userSelect: 'none' }}>?</span>
      ) : (
        <Card card={card} small />
      )}
    </button>
  );
}

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
              cursor: 'pointer', textTransform: 'uppercase',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

/** Cards / Range / Matrix toggle for a single player row */
function PlayerModeToggle({ mode, rangeOpen, onChange }) {
  const TABS = ['cards', 'range', 'matrix'];
  return (
    <div className="flex rounded overflow-hidden" style={{ border: '1px solid #30363d', flexShrink: 0 }}>
      {TABS.map((m, idx) => {
        const isActive = mode === m;
        const isLast = idx === TABS.length - 1;
        let label = m.toUpperCase();
        if (m === 'range' && isActive) label = rangeOpen ? 'RANGE ▲' : 'RANGE ▼';
        return (
          <button
            key={m}
            onClick={() => onChange(m)}
            className="px-2 py-0.5 transition-all duration-150"
            style={{
              background: isActive ? '#d4af37' : '#161b22',
              color: isActive ? '#000' : '#6e7681',
              border: 'none',
              borderRight: !isLast ? '1px solid #30363d' : 'none',
              borderRadius: idx === 0 ? '3px 0 0 3px' : isLast ? '0 3px 3px 0' : '0',
              cursor: 'pointer', fontSize: '9px', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function HandConfigPanel({ gameState = {}, emit = {} }) {
  // ── Local state ──────────────────────────────────────────────────────────────

  const [config, setConfig] = useState({
    mode: 'hybrid',
    hole_cards: {},
    hole_cards_range: {},
    hole_cards_combos: {},
    board: [null, null, null, null, null],
    board_texture: [],
  });

  // Per-player input mode: 'cards' (default) or 'range'
  const [playerInputMode, setPlayerInputMode] = useState({});

  // Per-player selected preset tag IDs (array of tag IDs per configKey)
  const [playerPresets, setPlayerPresets] = useState({});

  // Per-player range picker open/collapsed state (true = open, false = collapsed summary)
  const [rangeOpen, setRangeOpen] = useState({});

  // Per-player matrix selected hand groups: configKey → Set<string>
  const [playerMatrixGroups, setPlayerMatrixGroups] = useState({});

  // pickerTarget: null | { type: 'player'|'board', playerId?, position }
  const [pickerTarget, setPickerTarget] = useState(null);

  // Whether the texture picker section is expanded
  const [textureOpen, setTextureOpen] = useState(false);

  // Disable Start Hand button while a start request is in-flight
  const [starting, setStarting] = useState(false);

  // ISS-30: reset the "starting" lock whenever the server sends a new game state
  // (hand actually started, or server rejected the request — either way, unblock the button)
  useEffect(() => { setStarting(false); }, [gameState]);

  // Debounce timers for per-player range inputs
  const rangeDebounceRefs = useRef({});

  // ISS-68: clear any pending debounce timers when the component unmounts
  useEffect(() => {
    const refs = rangeDebounceRefs.current;
    return () => { Object.values(refs).forEach(clearTimeout); };
  }, []);

  // ── Derived values ───────────────────────────────────────────────────────────

  const { players = [] } = gameState;
  const seatedPlayers = useMemo(
    () => players.filter((p) => p && p.seat !== undefined && p.seat !== null),
    [players]
  );

  const usedCards = useMemo(() => {
    const set = new Set();
    config.board.forEach((c) => { if (c) set.add(c); });
    Object.values(config.hole_cards).forEach((pair) => {
      if (Array.isArray(pair)) pair.forEach((c) => { if (c) set.add(c); });
    });
    return set;
  }, [config]);

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

  const pickerTitle = useMemo(() => {
    if (!pickerTarget) return 'Select a card';
    if (pickerTarget.type === 'board')
      return `Board — ${BOARD_LABELS[pickerTarget.position] ?? `Slot ${pickerTarget.position}`}`;
    const player = players.find((p) => p.id === pickerTarget.playerId);
    return `${player?.name ?? 'Player'} — Card ${pickerTarget.position + 1}`;
  }, [pickerTarget, players]);

  // ── Emit helper ──────────────────────────────────────────────────────────────

  const emitConfig = useCallback((nextConfig) => {
    if (emit.updateHandConfig) emit.updateHandConfig(nextConfig);
  }, [emit]);

  // ── Board slot handlers ───────────────────────────────────────────────────────

  const handleBoardSlotClick = useCallback((position) => {
    setPickerTarget({ type: 'board', position });
  }, []);

  const handlePlayerSlotClick = useCallback((stableId, position) => {
    setPickerTarget({ type: 'player', playerId: stableId, position });
  }, []);

  // ── CardPicker callbacks ──────────────────────────────────────────────────────

  const handlePickerSelect = useCallback((card) => {
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
  }, [pickerTarget, emitConfig]);

  const handlePickerClose = useCallback(() => setPickerTarget(null), []);

  // ── Mode change ───────────────────────────────────────────────────────────────

  const handleModeChange = useCallback((newMode) => {
    setConfig((prev) => {
      const nextConfig = { ...prev, mode: newMode };
      emitConfig(nextConfig);
      return nextConfig;
    });
  }, [emitConfig]);

  // ── Player input mode toggle (cards ↔ range ↔ matrix) ───────────────────────

  const handlePlayerModeToggle = useCallback((configKey, newMode) => {
    setPlayerInputMode((prev) => ({ ...prev, [configKey]: newMode }));
    setConfig((prev) => {
      let nextConfig;
      if (newMode === 'range' || newMode === 'matrix') {
        // Clear specific hole cards; combo-based mode takes over
        const nextHoleCards = { ...prev.hole_cards };
        delete nextHoleCards[configKey];
        nextConfig = { ...prev, hole_cards: nextHoleCards };
      } else {
        // 'cards' — clear range + combos for this player
        const nextRanges = { ...prev.hole_cards_range };
        delete nextRanges[configKey];
        const nextCombos = { ...(prev.hole_cards_combos ?? {}) };
        delete nextCombos[configKey];
        nextConfig = { ...prev, hole_cards_range: nextRanges, hole_cards_combos: nextCombos };
      }
      emitConfig(nextConfig);
      return nextConfig;
    });
    if (newMode === 'cards') {
      setPlayerPresets((prev) => { const n = { ...prev }; delete n[configKey]; return n; });
      setPlayerMatrixGroups((prev) => { const n = { ...prev }; delete n[configKey]; return n; });
    } else if (newMode === 'matrix') {
      // Initialize matrix from existing combos if any (e.g. switching back from cards→range→matrix)
      setPlayerMatrixGroups((prev) => {
        if (prev[configKey]) return prev; // already has state, preserve it
        return { ...prev, [configKey]: new Set() };
      });
      // Clear range presets since matrix owns combos now
      setPlayerPresets((prev) => { const n = { ...prev }; delete n[configKey]; return n; });
    } else if (newMode === 'range') {
      // Clear matrix groups since range presets own combos now
      setPlayerMatrixGroups((prev) => { const n = { ...prev }; delete n[configKey]; return n; });
    }
  }, [emitConfig]);

  // ── Range input handler (debounced 400ms) ────────────────────────────────────

  const handleRangeInput = useCallback((configKey, value) => {
    // Update config immediately so the input stays controlled
    setConfig((prev) => {
      const nextConfig = {
        ...prev,
        hole_cards_range: { ...prev.hole_cards_range, [configKey]: value },
      };
      // Debounce the emit
      if (rangeDebounceRefs.current[configKey]) {
        clearTimeout(rangeDebounceRefs.current[configKey]);
      }
      rangeDebounceRefs.current[configKey] = setTimeout(() => {
        emitConfig(nextConfig);
      }, 400);
      return nextConfig;
    });
  }, [emitConfig]);

  // ── Texture toggle ────────────────────────────────────────────────────────────

  const handleTextureToggle = useCallback((tag) => {
    setConfig((prev) => {
      let next;
      if (prev.board_texture.includes(tag)) {
        // Deselect
        next = prev.board_texture.filter(t => t !== tag);
      } else {
        // Select — remove any other tag in the same group first (radio within group)
        const groupIdx = TEXTURE_GROUP_OF[tag];
        next = prev.board_texture.filter(t => TEXTURE_GROUP_OF[t] !== groupIdx);
        next = [...next, tag];
      }
      const nextConfig = { ...prev, board_texture: next };
      emitConfig(nextConfig);
      return nextConfig;
    });
  }, [emitConfig]);

  // ── Preset tag toggle (per player) ───────────────────────────────────────────

  const handlePresetToggle = useCallback((configKey, tagId) => {
    const current = playerPresets[configKey] ?? [];
    const groupLabel = PRESET_GROUP_OF[tagId];

    let next;
    if (current.includes(tagId)) {
      next = current.filter(t => t !== tagId);
    } else {
      next = current.filter(t => PRESET_GROUP_OF[t] !== groupLabel);
      next = [...next, tagId];
    }

    setPlayerPresets((prev) => ({ ...prev, [configKey]: next }));

    const combos = computePresetCombos(next);
    setConfig((prev) => {
      const nextConfig = {
        ...prev,
        hole_cards_combos: { ...(prev.hole_cards_combos ?? {}), [configKey]: combos },
      };
      emitConfig(nextConfig);
      return nextConfig;
    });
  }, [playerPresets, emitConfig]);

  // ── Matrix cell toggle (per player) ──────────────────────────────────────────

  const handleMatrixToggle = useCallback((configKey, handGroup) => {
    setPlayerMatrixGroups((prev) => {
      const current = prev[configKey] ?? new Set();
      const next = new Set(current);
      if (next.has(handGroup)) {
        next.delete(handGroup);
      } else {
        next.add(handGroup);
      }
      const combos = selectedHandGroupsToComboArray(next);
      setConfig((prevConfig) => {
        const nextConfig = {
          ...prevConfig,
          hole_cards_combos: { ...(prevConfig.hole_cards_combos ?? {}), [configKey]: combos },
        };
        emitConfig(nextConfig);
        return nextConfig;
      });
      return { ...prev, [configKey]: next };
    });
  }, [emitConfig]);

  // ── Clear config ──────────────────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    const resetConfig = {
      mode: config.mode,
      hole_cards: {},
      hole_cards_range: {},
      hole_cards_combos: {},
      board: [null, null, null, null, null],
      board_texture: [],
    };
    setConfig(resetConfig);
    setPlayerInputMode({});
    setPlayerPresets({});
    setPlayerMatrixGroups({});
    emitConfig(resetConfig);
  }, [config.mode, emitConfig]);

  // ── Start Hand ────────────────────────────────────────────────────────────────

  const handleStartHand = useCallback(() => {
    if (starting) return;
    setStarting(true);
    if (emit.startConfiguredHand) emit.startConfiguredHand();
  }, [starting, emit]);

  // ── Summary counts ────────────────────────────────────────────────────────────

  const rangeCount = Object.values(config.hole_cards_range).filter(Boolean).length
    + Object.values(config.hole_cards_combos ?? {}).filter(v => Array.isArray(v) && v.length > 0).length;
  const textureCount = config.board_texture.length;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex flex-col gap-0" style={{ color: '#f0ece3' }}>

        {/* ── Section: Player Hole Cards ────────────────────────────────────── */}
        <div className="coach-panel mb-3">
          <SectionHeader>HOLE CARDS</SectionHeader>

          {seatedPlayers.length === 0 ? (
            <div className="text-xs text-center py-3" style={{ color: '#444' }}>
              No players seated yet
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {seatedPlayers.map((player) => {
                const configKey = player.stableId || player.id;
                const inputMode = playerInputMode[configKey] ?? 'cards';
                const pair = config.hole_cards[configKey] ?? [null, null];
                const rangeStr = config.hole_cards_range[configKey] ?? '';
                const rangeValidation = rangeStr ? validateRange(rangeStr) : null;

                return (
                  <div
                    key={player.id}
                    className="flex flex-col gap-1.5 py-1.5 px-2 rounded"
                    style={{ background: '#0d1117', border: '1px solid #21262d' }}
                  >
                    {/* Top row: seat badge + name/stack + mode toggle */}
                    <div className="flex items-center gap-2">
                      <span
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-full text-xs font-bold"
                        style={{
                          width: '18px', height: '18px',
                          background: '#21262d', color: '#6e7681', fontSize: '9px',
                        }}
                      >
                        {player.seat}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: '#f0ece3' }}>
                          {player.name || `Seat ${player.seat}`}
                          {player.is_coach && (
                            <span className="ml-1 text-[9px] text-amber-500">(coach)</span>
                          )}
                        </div>
                        <div className="text-xs font-mono" style={{ color: '#6e7681' }}>
                          ${Number(player.stack || 0).toLocaleString()}
                        </div>
                      </div>

                      <PlayerModeToggle
                        mode={inputMode}
                        rangeOpen={rangeOpen[configKey] ?? true}
                        onChange={(m) => {
                          if (m === 'range' && inputMode === 'range') {
                            // Already in range mode — toggle collapse
                            setRangeOpen(prev => ({ ...prev, [configKey]: !(prev[configKey] ?? true) }));
                          } else {
                            handlePlayerModeToggle(configKey, m);
                            if (m === 'range') setRangeOpen(prev => ({ ...prev, [configKey]: true }));
                          }
                        }}
                      />
                    </div>

                    {/* Bottom row: card slots OR range presets OR matrix */}
                    {inputMode === 'cards' ? (
                      <div className="flex gap-1.5 justify-end">
                        <ConfigCardSlot
                          card={pair[0]}
                          label={`${player.name || `Seat ${player.seat}`} — Card 1`}
                          onClick={() => handlePlayerSlotClick(configKey, 0)}
                        />
                        <ConfigCardSlot
                          card={pair[1]}
                          label={`${player.name || `Seat ${player.seat}`} — Card 2`}
                          onClick={() => handlePlayerSlotClick(configKey, 1)}
                        />
                      </div>
                    ) : inputMode === 'matrix' ? (
                      // MATRIX PICKER: 13×13 visual hand grid
                      <div className="mt-1">
                        <RangeMatrix
                          selected={playerMatrixGroups[configKey] ?? new Set()}
                          onToggle={(handGroup) => handleMatrixToggle(configKey, handGroup)}
                          colorMode="selected"
                        />
                        {(() => {
                          const groups = playerMatrixGroups[configKey];
                          const count = groups?.size ? selectedHandGroupsToComboArray(groups).length : 0;
                          return count > 0 ? (
                            <div style={{ fontSize: '9px', color: '#3fb950', marginTop: '4px', textAlign: 'center' }}>
                              ✓ {count} combo{count !== 1 ? 's' : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: '9px', color: '#444', marginTop: '4px', textAlign: 'center' }}>
                              Click cells to select hands
                            </div>
                          );
                        })()}
                      </div>
                    ) : (rangeOpen[configKey] ?? true) ? (
                      // RANGE PICKER: expanded full chip grid
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        {PRESET_GROUPS.map(({ label: groupLabel, tags }) => (
                          <div key={groupLabel}>
                            <div style={{ fontSize: '8px', color: '#444', letterSpacing: '0.08em', marginBottom: '3px' }}>
                              {groupLabel}
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {tags.map(tagId => {
                                const isActive = (playerPresets[configKey] ?? []).includes(tagId);
                                return (
                                  <button
                                    key={tagId}
                                    onClick={() => handlePresetToggle(configKey, tagId)}
                                    className="rounded px-2 py-0.5 transition-all duration-150"
                                    style={{
                                      background: isActive ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.03)',
                                      border: `1px solid ${isActive ? '#d4af37' : '#30363d'}`,
                                      color: isActive ? '#d4af37' : '#6e7681',
                                      cursor: 'pointer', fontSize: '10px',
                                    }}
                                  >
                                    {PRESET_META[tagId].label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {/* Combo count / status */}
                        {(() => {
                          const active = playerPresets[configKey] ?? [];
                          if (!active.length) return (
                            <div style={{ fontSize: '9px', color: '#444', marginTop: '1px' }}>Select tags above</div>
                          );
                          const combos = computePresetCombos(active);
                          return combos.length > 0 ? (
                            <div style={{ fontSize: '9px', color: '#3fb950', marginTop: '1px' }}>
                              ✓ {combos.length} combo{combos.length !== 1 ? 's' : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: '9px', color: '#f85149', marginTop: '1px' }}>
                              ✗ No combos — incompatible selection
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      // RANGE PICKER: collapsed — show active picks as compact chips
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(playerPresets[configKey] ?? []).length === 0 ? (
                          <div style={{ fontSize: '9px', color: '#444' }}>No range selected</div>
                        ) : (
                          (playerPresets[configKey] ?? []).map(tagId => (
                            <span
                              key={tagId}
                              className="rounded px-2 py-0.5"
                              style={{
                                background: 'rgba(212,175,55,0.18)',
                                border: '1px solid #d4af37',
                                color: '#d4af37',
                                fontSize: '10px',
                              }}
                            >
                              {PRESET_META[tagId]?.label ?? tagId}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Section: Board ────────────────────────────────────────────────── */}
        <div className="coach-panel mb-3">
          <SectionHeader>BOARD CARDS</SectionHeader>

          <div className="flex gap-1 justify-between">
            {config.board.map((card, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1" style={{ flex: '1 1 0', minWidth: 0 }}>
                <ConfigCardSlot
                  card={card}
                  label={BOARD_LABELS[idx]}
                  onClick={() => handleBoardSlotClick(idx)}
                  compact
                />
                <span
                  className="text-center"
                  style={{ fontSize: '8px', color: '#555', lineHeight: 1, letterSpacing: '0.04em', userSelect: 'none' }}
                >
                  {BOARD_SHORT[idx]}
                </span>
              </div>
            ))}
          </div>

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

          {/* ── Board Texture Picker ─────────────────────────────────────────── */}
          <div className="mt-3">
            <button
              onClick={() => setTextureOpen(o => !o)}
              className="flex items-center gap-1.5 w-full text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span style={{ color: textureOpen ? '#d4af37' : '#6e7681', fontSize: '9px' }}>
                {textureOpen ? '▾' : '▸'}
              </span>
              <span
                className="text-xs font-semibold tracking-wider"
                style={{ color: textureOpen ? '#d4af37' : '#6e7681', letterSpacing: '0.1em' }}
              >
                BOARD TEXTURE
              </span>
              {textureCount > 0 && (
                <span
                  className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold"
                  style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', fontSize: '9px' }}
                >
                  {textureCount}
                </span>
              )}
            </button>

            {textureOpen && (
              <div className="mt-2 flex flex-col gap-2">
                {TEXTURE_GROUPS.map(({ label, tags }) => (
                  <div key={label}>
                    <div
                      className="mb-1"
                      style={{ fontSize: '8px', color: '#555', letterSpacing: '0.08em' }}
                    >
                      {label}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag) => {
                        const isActive = config.board_texture.includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => handleTextureToggle(tag)}
                            className="rounded px-2 py-0.5 text-xs transition-all duration-150"
                            style={{
                              background: isActive ? 'rgba(212,175,55,0.18)' : 'rgba(255,255,255,0.03)',
                              border: `1px solid ${isActive ? '#d4af37' : '#30363d'}`,
                              color: isActive ? '#d4af37' : '#6e7681',
                              cursor: 'pointer', fontSize: '10px',
                            }}
                          >
                            {TEXTURE_LABELS[tag]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="text-xs" style={{ color: '#555', fontSize: '9px', marginTop: '2px' }}>
                  Applied to flop only. One per group. FEEL shortcuts imply suit+connect.
                </div>
              </div>
            )}
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
          <span style={{ color: '#d4af37', fontWeight: 600 }}>{usedCards.size}</span>
          {' '}card{usedCards.size !== 1 ? 's' : ''} pinned ·{' '}
          <span style={{ color: '#d4af37', fontWeight: 600 }}>{config.mode.toUpperCase()}</span>
          {' '}mode
          {rangeCount > 0 && (
            <> · <span style={{ color: '#d4af37', fontWeight: 600 }}>{rangeCount}</span> range{rangeCount !== 1 ? 's' : ''}</>
          )}
          {textureCount > 0 && (
            <> · <span style={{ color: '#d4af37', fontWeight: 600 }}>{textureCount}</span> texture{textureCount !== 1 ? 's' : ''}</>
          )}
        </div>
      </div>

      {/* ── CardPicker modal ─────────────────────────────────────────────────────── */}
      {pickerTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.82)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) handlePickerClose(); }}
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
