import React, { useState, useMemo, useCallback, useEffect } from 'react';
import CardPicker from './CardPicker';
import Card from './Card';
import { apiFetch } from '../lib/api';

// ── Position calculation (mirrors server/game/positions.js) ──────────────────

const POSITION_NAMES = {
  2: ['BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'MP', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'UTG+2', 'MP', 'HJ', 'CO'],
};

/**
 * Compute position labels for N players given the dealer slot (0-indexed into players array).
 * Returns array of position strings indexed by player slot.
 */
function computePositions(playerCount, dealerSlot) {
  if (playerCount < 2) return [];
  const n = playerCount;
  const names = POSITION_NAMES[n] ?? POSITION_NAMES[9];
  const result = new Array(n);
  for (let offset = 0; offset < n; offset++) {
    const slotIdx = (dealerSlot + offset) % n;
    result[slotIdx] = names[offset] ?? `P${offset}`;
  }
  return result;
}

// ── Auto-name generation ─────────────────────────────────────────────────────

const STREET_LABELS = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

function generateName(players, board, startingStreet) {
  const n = players.length;
  const streetLabel = STREET_LABELS[startingStreet] ?? 'Preflop';
  const boardCards = board.filter(Boolean);
  const boardStr = boardCards.length > 0 ? ` ${boardCards.slice(0, 3).join('')}` : '';
  const date = new Date().toISOString().slice(0, 10);
  return `${n}-player ${streetLabel}${boardStr} ${date}`;
}

// ── Card slot UI (replicates HandConfigPanel's ConfigCardSlot, wider variant) ─

const SUIT_COLOR = { h: '#dc2626', d: '#dc2626', c: '#8b949e', s: '#8b949e' };

function cardLabel(card) {
  if (!card) return null;
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = { h: '♥', d: '♦', c: '♣', s: '♠' }[card[1]] ?? card[1];
  return { rank, suit, color: SUIT_COLOR[card[1]] ?? '#f0ece3' };
}

function ScenarioCardSlot({ card, label, onClick, wide = false, dimmed = false }) {
  const isEmpty = card === null || card === undefined;
  const parsed = !isEmpty ? cardLabel(card) : null;
  const w = wide ? '44px' : '32px';
  const h = wide ? '60px' : '44px';
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      title={label}
      aria-label={isEmpty ? `${label} — click to assign` : `${label} — ${card}`}
      className="flex items-center justify-center rounded transition-all duration-150 relative"
      style={{
        width: w, height: h,
        background: dimmed ? 'rgba(255,255,255,0.01)' : isEmpty ? 'rgba(255,255,255,0.03)' : 'rgba(212,175,55,0.06)',
        border: dimmed ? '1.5px dashed #21262d' : isEmpty ? '1.5px dashed #30363d' : '1.5px solid rgba(212,175,55,0.35)',
        cursor: dimmed ? 'not-allowed' : 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: dimmed ? 0.35 : 1,
      }}
      onMouseEnter={(e) => {
        if (dimmed) return;
        e.currentTarget.style.borderColor = '#d4af37';
        e.currentTarget.style.background = 'rgba(212,175,55,0.1)';
        e.currentTarget.style.boxShadow = '0 0 0 1px rgba(212,175,55,0.22)';
      }}
      onMouseLeave={(e) => {
        if (dimmed) return;
        e.currentTarget.style.borderColor = isEmpty ? '#30363d' : 'rgba(212,175,55,0.35)';
        e.currentTarget.style.borderStyle = isEmpty ? 'dashed' : 'solid';
        e.currentTarget.style.background = isEmpty ? 'rgba(255,255,255,0.03)' : 'rgba(212,175,55,0.06)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {parsed ? (
        <div className="flex flex-col items-center" style={{ lineHeight: 1.1 }}>
          <span style={{ fontSize: wide ? '13px' : '11px', fontWeight: 700, color: parsed.color, fontFamily: 'monospace' }}>
            {parsed.rank}
          </span>
          <span style={{ fontSize: wide ? '15px' : '12px', color: parsed.color }}>
            {parsed.suit}
          </span>
        </div>
      ) : (
        <span style={{ color: dimmed ? '#333' : '#444', fontSize: wide ? '22px' : '18px', fontWeight: 300, lineHeight: 1, userSelect: 'none' }}>?</span>
      )}
    </button>
  );
}

// ── ScenarioPlayerRow ────────────────────────────────────────────────────────

function ScenarioPlayerRow({ player, positionLabel, onStackChange, onCardSlotClick, onRemove, isDealer }) {
  return (
    <tr style={{ borderBottom: '1px solid #21262d' }}>
      {/* SEAT */}
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <span
          className="inline-flex items-center justify-center rounded-full"
          style={{
            width: 26, height: 26, fontSize: 11, fontWeight: 700,
            background: isDealer ? 'rgba(212,175,55,0.18)' : '#161b22',
            border: isDealer ? '1px solid #d4af37' : '1px solid #30363d',
            color: isDealer ? '#d4af37' : '#8b949e',
            flexShrink: 0,
          }}
          title={isDealer ? 'Dealer' : undefined}
        >
          {player.slot + 1}
        </span>
      </td>

      {/* STACK */}
      <td style={{ padding: '6px 8px' }}>
        <input
          type="number"
          min={1}
          value={player.stack}
          onChange={e => onStackChange(player.slot, Math.max(1, parseInt(e.target.value, 10) || 1))}
          style={{
            width: 70, padding: '3px 6px', borderRadius: 4, border: '1px solid #30363d',
            background: '#0d1117', color: '#f0ece3', fontSize: 11, outline: 'none',
            textAlign: 'right',
          }}
          onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
          onBlur={e => { e.target.style.borderColor = '#30363d'; }}
        />
      </td>

      {/* CARDS */}
      <td style={{ padding: '6px 8px' }}>
        <div className="flex gap-1">
          <ScenarioCardSlot
            card={player.holeCards[0]}
            label={`Seat ${player.slot + 1} Card 1`}
            onClick={() => onCardSlotClick(player.slot, 0)}
          />
          <ScenarioCardSlot
            card={player.holeCards[1]}
            label={`Seat ${player.slot + 1} Card 2`}
            onClick={() => onCardSlotClick(player.slot, 1)}
          />
        </div>
      </td>

      {/* POSITION */}
      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
        <span
          className="inline-flex items-center justify-center rounded px-1.5 py-0.5"
          style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            background: 'rgba(88,166,255,0.1)',
            border: '1px solid rgba(88,166,255,0.25)',
            color: '#58a6ff',
            whiteSpace: 'nowrap',
          }}
        >
          {positionLabel ?? '—'}
        </span>
      </td>

      {/* REMOVE */}
      <td style={{ padding: '6px 4px', textAlign: 'center' }}>
        <button
          onClick={() => onRemove(player.slot)}
          style={{
            width: 20, height: 20, borderRadius: 3, border: '1px solid rgba(153,27,27,0.4)',
            background: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.6)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(153,27,27,0.4)'; e.currentTarget.style.color = 'rgba(239,68,68,0.6)'; }}
          title="Remove seat"
        >
          ×
        </button>
      </td>
    </tr>
  );
}

// ── ScenarioPreview strip ─────────────────────────────────────────────────────

function ScenarioPreview({ players, board, startingStreet, positions }) {
  const filledCards = board.filter(Boolean);
  const boardStr = filledCards.length > 0 ? filledCards.join(' ') : '—';
  const btnPlayer = positions.findIndex(p => p === 'BTN');
  const btnDesc = btnPlayer >= 0 ? `Seat ${btnPlayer + 1} BTN` : '';

  return (
    <div
      style={{
        padding: '8px 12px', borderRadius: 6,
        background: 'rgba(212,175,55,0.04)',
        border: '1px solid rgba(212,175,55,0.12)',
        fontSize: 10, color: '#8b949e', lineHeight: 1.6,
      }}
    >
      <span style={{ color: '#d4af37', fontWeight: 600 }}>{players.length}</span>
      {' '}players · {btnDesc}{btnDesc ? ' · ' : ''}
      <span style={{ color: '#d4af37', fontWeight: 600 }}>{STREET_LABELS[startingStreet]}</span>
      {' '}· Board: {boardStr}
    </div>
  );
}

// ── Pill selector (PREFLOP / FLOP / TURN / RIVER) ────────────────────────────

const STREETS = ['preflop', 'flop', 'turn', 'river'];

function StreetPills({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {STREETS.map(s => {
        const active = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              padding: '3px 10px', borderRadius: 4,
              background: active ? '#d4af37' : '#161b22',
              color: active ? '#000' : '#6e7681',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
              textTransform: 'uppercase', cursor: 'pointer',
              border: active ? 'none' : '1px solid #30363d',
              transition: 'all 0.12s',
            }}
          >
            {s === 'preflop' ? 'PRE' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sectionLabel(text) {
  return (
    <div style={{ fontSize: 9, color: '#6e7681', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>
      {text}
    </div>
  );
}

function buildInitialPlayers() {
  return [
    { slot: 0, stack: 1000, holeCards: [null, null] },
    { slot: 1, stack: 1000, holeCards: [null, null] },
  ];
}

// Active board slot count by street
const ACTIVE_SLOTS = { preflop: 0, flop: 3, turn: 4, river: 5 };

// ── Validation ────────────────────────────────────────────────────────────────

function validateScenario(players, board, startingStreet) {
  const errors = [];
  if (players.length < 2) errors.push('At least 2 players required.');
  const activeCount = ACTIVE_SLOTS[startingStreet];
  if (activeCount > 0) {
    const filled = board.slice(0, activeCount).filter(Boolean).length;
    if (filled < activeCount) {
      errors.push(`${STREET_LABELS[startingStreet]} requires ${activeCount} board card${activeCount > 1 ? 's' : ''}.`);
    }
  }
  return errors;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ScenarioBuilder({
  onClose,
  socket = null,
  playlists = [],
  initialScenario = null,
  inline = false,
}) {
  // ── Local state ──────────────────────────────────────────────────────────────

  const [players, setPlayers] = useState(() =>
    initialScenario
      ? (initialScenario.config_json?.player_setup ?? []).map((p, i) => ({
          slot: i,
          stack: p.stack ?? 1000,
          holeCards: initialScenario.config_json?.hole_cards?.[String(i)] ?? [null, null],
        }))
      : buildInitialPlayers()
  );

  const [dealerSlot, setDealerSlot] = useState(
    initialScenario?.dealer_position ?? 0
  );

  const [board, setBoard] = useState(
    initialScenario?.config_json?.board ?? [null, null, null, null, null]
  );

  const [startingStreet, setStartingStreet] = useState(
    initialScenario?.starting_street ?? 'preflop'
  );

  const [pickerTarget, setPickerTarget] = useState(null);
  // pickerTarget: null | { type: 'player', slot, position } | { type: 'board', position }

  const [scenarioName, setScenarioName] = useState(
    initialScenario?.name ?? ''
  );

  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    playlists[0]?.playlist_id ?? 'new'
  );

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const positions = useMemo(
    () => computePositions(players.length, dealerSlot),
    [players.length, dealerSlot]
  );

  const usedCards = useMemo(() => {
    const s = new Set();
    board.forEach(c => { if (c) s.add(c); });
    players.forEach(p => p.holeCards.forEach(c => { if (c) s.add(c); }));
    return s;
  }, [board, players]);

  const pickerUsedCards = useMemo(() => {
    if (!pickerTarget) return usedCards;
    const s = new Set(usedCards);
    if (pickerTarget.type === 'board') {
      const existing = board[pickerTarget.position];
      if (existing) s.delete(existing);
    } else {
      const existing = players[pickerTarget.slot]?.holeCards[pickerTarget.position];
      if (existing) s.delete(existing);
    }
    return s;
  }, [pickerTarget, usedCards, board, players]);

  const pickerTitle = useMemo(() => {
    if (!pickerTarget) return 'Select a card';
    if (pickerTarget.type === 'board') {
      const labels = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
      return `Board — ${labels[pickerTarget.position] ?? `Slot ${pickerTarget.position}`}`;
    }
    return `Seat ${pickerTarget.slot + 1} — Card ${pickerTarget.position + 1}`;
  }, [pickerTarget]);

  const autoName = useMemo(
    () => generateName(players, board, startingStreet),
    [players, board, startingStreet]
  );

  const effectiveName = scenarioName.trim() || autoName;

  const canSave = players.length >= 2 && !saving;
  const validationErrors = validateScenario(players, board, startingStreet);

  const activeSlotCount = ACTIVE_SLOTS[startingStreet];

  // ── Keyboard shortcut: Ctrl+Enter → save ─────────────────────────────────────

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (canSave && validationErrors.length === 0) handleSave();
      }
      if (e.key === 'Escape' && !pickerTarget && !inline) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canSave, validationErrors.length, pickerTarget]);

  // ── Player manipulation ───────────────────────────────────────────────────────

  const addPlayer = useCallback(() => {
    setPlayers(prev => {
      if (prev.length >= 9) return prev;
      return [...prev, { slot: prev.length, stack: 1000, holeCards: [null, null] }];
    });
  }, []);

  const removePlayer = useCallback((slotToRemove) => {
    setPlayers(prev => {
      if (prev.length <= 2) return prev;
      const filtered = prev.filter(p => p.slot !== slotToRemove);
      // Re-index slots
      return filtered.map((p, i) => ({ ...p, slot: i }));
    });
    // If dealer slot was removed or beyond new length, clamp it
    setDealerSlot(prev => {
      const newLen = players.length - 1;
      return prev >= newLen ? Math.max(0, newLen - 1) : prev;
    });
  }, [players.length]);

  const updateStack = useCallback((slot, stack) => {
    setPlayers(prev => prev.map(p => p.slot === slot ? { ...p, stack } : p));
  }, []);

  // ── Card picker handlers ──────────────────────────────────────────────────────

  const handlePlayerCardClick = useCallback((slot, position) => {
    setPickerTarget({ type: 'player', slot, position });
  }, []);

  const handleBoardSlotClick = useCallback((position) => {
    setPickerTarget({ type: 'board', position });
  }, []);

  const handlePickerSelect = useCallback((card) => {
    if (!pickerTarget) return;
    if (pickerTarget.type === 'board') {
      setBoard(prev => {
        const next = [...prev];
        next[pickerTarget.position] = card;
        return next;
      });
    } else {
      setPlayers(prev => prev.map(p => {
        if (p.slot !== pickerTarget.slot) return p;
        const nextCards = [...p.holeCards];
        nextCards[pickerTarget.position] = card;
        return { ...p, holeCards: nextCards };
      }));
    }
    setPickerTarget(null);
  }, [pickerTarget]);

  const handlePickerClose = useCallback(() => setPickerTarget(null), []);

  // ── Dealer navigation ─────────────────────────────────────────────────────────

  const shiftDealer = useCallback((dir) => {
    setDealerSlot(prev => (prev + dir + players.length) % players.length);
  }, [players.length]);

  // ── Street change ─────────────────────────────────────────────────────────────

  const handleStreetChange = useCallback((street) => {
    setStartingStreet(street);
    // Clear board slots beyond the active count
    const needed = ACTIVE_SLOTS[street];
    setBoard(prev => prev.map((c, i) => (i < needed ? c : null)));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!canSave || validationErrors.length > 0) return;
    setSaving(true);
    setSaveError(null);

    const holeCards = {};
    players.forEach(p => {
      if (p.holeCards.some(Boolean)) {
        holeCards[String(p.slot)] = p.holeCards;
      }
    });

    const payload = {
      name: effectiveName,
      playlistId: selectedPlaylistId,
      newPlaylistName: selectedPlaylistId === 'new' ? newPlaylistName.trim() : undefined,
      playerCount: players.length,
      dealerPosition: dealerSlot,
      startingStreet,
      smallBlind: 5,
      bigBlind: 10,
      config: {
        mode: 'hybrid',
        hole_cards: holeCards,
        hole_cards_range: {},
        hole_cards_combos: {},
        board,
        board_texture: [],
        player_setup: players.map(p => ({ slot: p.slot, stack: p.stack })),
        dealer_position: dealerSlot,
        starting_street: startingStreet,
      },
    };

    try {
      if (socket) {
        socket.emit('save_scenario_to_playlist', payload);
        // Success handled by socket event; just close
        setSaveSuccess(true);
        setTimeout(() => { onClose(); }, 800);
      } else {
        await apiFetch('/api/admin/scenarios', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setSaveSuccess(true);
        setTimeout(() => { onClose(); }, 800);
      }
    } catch (err) {
      setSaveError(err.message ?? 'Save failed');
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const innerContent = (
      <div
        className="flex flex-col"
        style={{
          width: '100%',
          maxWidth: inline ? undefined : '42rem',
          height: inline ? '100%' : '90vh',
          background: '#0d1117',
          border: inline ? 'none' : '1px solid #30363d',
          borderRadius: inline ? 0 : 10,
          boxShadow: inline ? 'none' : '0 24px 80px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* ── Sticky header ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            background: '#0d1117',
            borderBottom: '1px solid #30363d',
            position: 'sticky', top: 0, zIndex: 10,
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: '#d4af37', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              Build Scenario
            </span>
            <span
              style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: 4,
                background: socket ? 'rgba(63,185,80,0.12)' : 'rgba(110,118,129,0.12)',
                border: `1px solid ${socket ? 'rgba(63,185,80,0.35)' : 'rgba(110,118,129,0.3)'}`,
                color: socket ? '#3fb950' : '#6e7681',
              }}
            >
              {socket ? 'LIVE TABLE' : 'STANDALONE'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 4, border: '1px solid #30363d',
              background: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#6e7681'; }}
            title="Close (Esc)"
            aria-label="Close builder"
          >
            ×
          </button>
        </div>

        {/* ── Scrollable body ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '16px 16px 0' }}>

          {/* ── Section 1: Players ─────────────────────────────────────────── */}
          <div className="mb-5">
            {sectionLabel('Players')}

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #30363d' }}>
                    {['SEAT', 'STACK', 'CARDS', 'POSITION', ''].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '4px 8px', fontSize: 9, fontWeight: 700,
                          letterSpacing: '0.1em', color: '#6e7681', textAlign: h === 'STACK' ? 'right' : 'center',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <ScenarioPlayerRow
                      key={player.slot}
                      player={player}
                      positionLabel={positions[player.slot]}
                      isDealer={player.slot === dealerSlot}
                      onStackChange={updateStack}
                      onCardSlotClick={handlePlayerCardClick}
                      onRemove={removePlayer}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Dealer controls */}
            <div className="flex items-center gap-2 mt-3">
              <span style={{ fontSize: 10, color: '#6e7681', letterSpacing: '0.08em' }}>Dealer at seat:</span>
              <button
                onClick={() => shiftDealer(-1)}
                style={{
                  width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
                  background: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
                aria-label="Previous dealer"
              >
                ‹
              </button>
              <span
                style={{
                  minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: 700,
                  color: '#d4af37', fontFamily: 'monospace',
                }}
              >
                {dealerSlot + 1}
              </span>
              <button
                onClick={() => shiftDealer(1)}
                style={{
                  width: 22, height: 22, borderRadius: 3, border: '1px solid #30363d',
                  background: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.color = '#d4af37'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
                aria-label="Next dealer"
              >
                ›
              </button>
            </div>

            {/* Add / remove seat */}
            {players.length < 9 && (
              <button
                onClick={addPlayer}
                style={{
                  marginTop: 8, padding: '4px 12px', borderRadius: 4,
                  border: '1px solid rgba(63,185,80,0.3)', background: 'none',
                  color: '#3fb950', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.06em', cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(63,185,80,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                + Add Seat
              </button>
            )}
          </div>

          {/* ── Section 2: Board ────────────────────────────────────────────── */}
          <div
            className="mb-5"
            style={{ paddingTop: 14, borderTop: '1px solid #21262d' }}
          >
            {sectionLabel('Board')}

            <div className="flex gap-2 items-end mb-3">
              {board.map((card, idx) => {
                const dimmed = idx >= activeSlotCount;
                const labels = ['Flop 1', 'Flop 2', 'Flop 3', 'Turn', 'River'];
                return (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <ScenarioCardSlot
                      card={card}
                      label={labels[idx]}
                      onClick={() => handleBoardSlotClick(idx)}
                      wide
                      dimmed={dimmed}
                    />
                    <span
                      style={{
                        fontSize: 8, color: dimmed ? '#333' : '#555',
                        letterSpacing: '0.05em', userSelect: 'none',
                      }}
                    >
                      {['F1', 'F2', 'F3', 'TN', 'RV'][idx]}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <span style={{ fontSize: 9, color: '#6e7681', letterSpacing: '0.08em' }}>Starting from:</span>
              <StreetPills value={startingStreet} onChange={handleStreetChange} />
            </div>
          </div>

          {/* ── Section 3: Preview ──────────────────────────────────────────── */}
          <div className="mb-4" style={{ paddingTop: 14, borderTop: '1px solid #21262d' }}>
            {sectionLabel('Preview')}
            <ScenarioPreview
              players={players}
              board={board}
              startingStreet={startingStreet}
              positions={positions}
            />
          </div>

        </div>

        {/* ── Sticky save bar ────────────────────────────────────────────────── */}
        <div
          className="flex-shrink-0"
          style={{
            position: 'sticky',
            bottom: 0,
            background: '#161b22',
            borderTop: '1px solid #30363d',
            padding: '12px 16px',
            zIndex: 10,
          }}
        >
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div
              style={{
                marginBottom: 10, padding: '6px 10px', borderRadius: 4,
                background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)',
                fontSize: 10, color: '#f85149',
              }}
            >
              {validationErrors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          {saveError && (
            <div
              style={{
                marginBottom: 10, padding: '6px 10px', borderRadius: 4,
                background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)',
                fontSize: 10, color: '#f85149',
              }}
            >
              {saveError}
            </div>
          )}

          {saveSuccess && (
            <div
              style={{
                marginBottom: 10, padding: '6px 10px', borderRadius: 4,
                background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.25)',
                fontSize: 10, color: '#3fb950',
              }}
            >
              Saved successfully!
            </div>
          )}

          {/* Name + playlist row */}
          <div className="flex gap-2 mb-2">
            {/* Scenario name */}
            <input
              type="text"
              placeholder={autoName}
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              style={{
                flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 4,
                border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3',
                fontSize: 11, outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
              onBlur={e => { e.target.style.borderColor = '#30363d'; }}
            />

            {/* Playlist select */}
            <select
              value={selectedPlaylistId}
              onChange={e => setSelectedPlaylistId(e.target.value)}
              style={{
                padding: '5px 8px', borderRadius: 4, border: '1px solid #30363d',
                background: '#0d1117', color: '#f0ece3', fontSize: 11,
                cursor: 'pointer', outline: 'none', flexShrink: 0,
              }}
            >
              {playlists.length === 0 && (
                <option value="new">— Create new —</option>
              )}
              {playlists.map(pl => (
                <option key={pl.playlist_id} value={pl.playlist_id}>{pl.name}</option>
              ))}
              {playlists.length > 0 && <option value="new">— Create new —</option>}
            </select>
          </div>

          {/* New playlist name input (conditional) */}
          {selectedPlaylistId === 'new' && (
            <input
              type="text"
              placeholder="New playlist name..."
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              style={{
                width: '100%', padding: '5px 8px', borderRadius: 4,
                border: '1px solid rgba(212,175,55,0.3)', background: '#0d1117',
                color: '#f0ece3', fontSize: 11, outline: 'none', marginBottom: 8,
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.6)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(212,175,55,0.3)'; }}
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!canSave || validationErrors.length > 0 || saving}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 4,
                background: (canSave && validationErrors.length === 0 && !saving) ? '#d4af37' : '#2a2a1a',
                color: (canSave && validationErrors.length === 0 && !saving) ? '#000' : '#555',
                border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: (canSave && validationErrors.length === 0 && !saving) ? 'pointer' : 'not-allowed',
                transition: 'all 0.12s',
              }}
              title="Ctrl+Enter"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '7px 14px', borderRadius: 4,
                background: 'none', border: '1px solid #30363d',
                color: '#6e7681', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.06em', cursor: 'pointer',
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#8b949e'; e.currentTarget.style.color = '#8b949e'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#6e7681'; }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* ── CardPicker modal ────────────────────────────────────────────────────── */}
      {pickerTarget && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) handlePickerClose(); }}
        >
          <CardPicker
            usedCards={pickerUsedCards}
            title={pickerTitle}
            onSelect={handlePickerSelect}
            onClose={handlePickerClose}
          />
        </div>
      )}
    </div>
  );

  if (inline) return innerContent;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(3px)' }}
      onClick={e => { if (e.target === e.currentTarget && !pickerTarget) onClose(); }}
    >
      {innerContent}
    </div>
  );
}
