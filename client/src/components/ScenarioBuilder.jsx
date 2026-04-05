import React, { useState, useMemo, useEffect } from 'react';
import CardPicker from './CardPicker';
import RangePicker from './RangePicker';
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

function computePositions(playerCount, btnSeat) {
  if (playerCount < 2) return [];
  const n = playerCount;
  const names = POSITION_NAMES[n] ?? POSITION_NAMES[9];
  const result = new Array(n);
  for (let offset = 0; offset < n; offset++) {
    result[(btnSeat + offset) % n] = names[offset] ?? `P${offset}`;
  }
  return result;
}

// ── Card rendering primitives ─────────────────────────────────────────────────

const SUIT_COLOR = { h: '#dc2626', d: '#dc2626', c: '#8b949e', s: '#8b949e' };

function cardLabel(card) {
  if (!card) return null;
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = { h: '♥', d: '♦', c: '♣', s: '♠' }[card[1]] ?? card[1];
  return { rank, suit, color: SUIT_COLOR[card[1]] ?? '#f0ece3' };
}

function CardSlot({ card, label, onClick, dimmed = false }) {
  const isEmpty = !card;
  const parsed = !isEmpty ? cardLabel(card) : null;
  return (
    <button
      onClick={onClick}
      disabled={dimmed}
      title={label}
      style={{
        width: 36, height: 50, borderRadius: 4, cursor: dimmed ? 'not-allowed' : 'pointer',
        background: dimmed ? 'rgba(255,255,255,0.01)' : isEmpty ? 'rgba(255,255,255,0.03)' : 'rgba(212,175,55,0.07)',
        border: dimmed ? '1.5px dashed #21262d' : isEmpty ? '1.5px dashed #30363d' : '1.5px solid rgba(212,175,55,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, padding: 0, opacity: dimmed ? 0.35 : 1, transition: 'all 0.1s',
      }}
      onMouseEnter={e => { if (!dimmed) { e.currentTarget.style.borderColor = '#d4af37'; e.currentTarget.style.background = 'rgba(212,175,55,0.12)'; } }}
      onMouseLeave={e => { if (!dimmed) { e.currentTarget.style.borderColor = isEmpty ? '#30363d' : 'rgba(212,175,55,0.35)'; e.currentTarget.style.borderStyle = isEmpty ? 'dashed' : 'solid'; e.currentTarget.style.background = isEmpty ? 'rgba(255,255,255,0.03)' : 'rgba(212,175,55,0.07)'; } }}
    >
      {parsed ? (
        <div className="flex flex-col items-center" style={{ lineHeight: 1.1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: parsed.color, fontFamily: 'monospace' }}>{parsed.rank}</span>
          <span style={{ fontSize: 13, color: parsed.color }}>{parsed.suit}</span>
        </div>
      ) : (
        <span style={{ color: dimmed ? '#333' : '#444', fontSize: 18, lineHeight: 1 }}>?</span>
      )}
    </button>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ text }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#6e7681', marginBottom: 8 }}>
      {text}
    </div>
  );
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="flex gap-1">
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.1s',
              background: active ? 'rgba(212,175,55,0.15)' : 'none',
              border: active ? '1px solid rgba(212,175,55,0.5)' : '1px solid #30363d',
              color: active ? '#d4af37' : '#6e7681',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Tag pill editor ───────────────────────────────────────────────────────────

function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('');

  function addTag(raw) {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '_');
    if (!tag || tags.includes(tag)) { setInput(''); return; }
    onChange([...tags, tag]);
    setInput('');
  }

  return (
    <div className="flex flex-wrap gap-1 items-center" style={{ minHeight: 28 }}>
      {tags.map(t => (
        <span
          key={t}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
            background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#d4af37',
          }}
        >
          {t}
          <button
            onClick={() => onChange(tags.filter(x => x !== t))}
            style={{ background: 'none', border: 'none', color: '#a07a20', cursor: 'pointer', padding: 0, fontSize: 11, lineHeight: 1 }}
          >×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(input); }
        }}
        onBlur={() => { if (input.trim()) addTag(input); }}
        placeholder="+ tag"
        style={{
          fontSize: 10, background: 'none', border: 'none', outline: 'none',
          color: '#f0ece3', width: 60, padding: '2px 0',
        }}
      />
    </div>
  );
}

// ── Board texture options ─────────────────────────────────────────────────────

const TEXTURES = [
  { value: 'monotone',  label: 'Monotone'  },
  { value: 'two_tone',  label: 'Two-tone'  },
  { value: 'rainbow',   label: 'Rainbow'   },
  { value: 'paired',    label: 'Paired'    },
  { value: 'connected', label: 'Connected' },
  { value: 'dry',       label: 'Dry'       },
  { value: 'wet',       label: 'Wet'       },
];

// ── Parse board_flop string to array and back ─────────────────────────────────

function flopToCards(flop) {
  if (!flop || flop.length < 6) return [null, null, null];
  return [flop.slice(0, 2), flop.slice(2, 4), flop.slice(4, 6)];
}

function cardsToFlop(cards) {
  if (!cards || cards.some(c => !c)) return null;
  return cards.join('');
}

// ── Build default seat/stack configs for N seats ─────────────────────────────

function buildDefaultSeats(n) {
  return Array.from({ length: n }, (_, i) => ({
    seat: i, seatMode: 'fixed', cards: [null, null], range: '',
  }));
}

function buildDefaultStacks(n) {
  return Array.from({ length: n }, (_, i) => ({ seat: i, stack_bb: 100 }));
}

// Hydrate from existing scenario for editing
function hydrateSeats(seatConfigs, playerCount) {
  const base = buildDefaultSeats(playerCount);
  (seatConfigs || []).forEach((sc, i) => {
    if (base[i]) {
      if (sc.range) {
        base[i].seatMode = 'range';
        base[i].range = sc.range;
      } else {
        base[i].seatMode = 'fixed';
        base[i].cards = sc.cards ?? [null, null];
      }
    }
  });
  return base;
}

function hydrateStacks(stackConfigs, playerCount) {
  const base = buildDefaultStacks(playerCount);
  (stackConfigs || []).forEach((sc, i) => {
    if (base[i]) base[i].stack_bb = sc.stack_bb ?? 100;
  });
  return base;
}

// ── Mini preview table ─────────────────────────────────────────────────────────

function Preview({ seats, stacks, positions, btnSeat, boardFlop, boardTurn, boardRiver, boardMode }) {
  const flopCards = flopToCards(boardFlop);
  const showBoard = boardMode !== 'none';

  return (
    <div
      style={{
        background: 'rgba(13,17,23,0.8)', border: '1px solid #21262d', borderRadius: 8,
        padding: '12px', minHeight: 120,
      }}
    >
      {/* Seats row */}
      <div className="flex flex-wrap gap-3 justify-center mb-3">
        {seats.map((s, i) => {
          const pos = positions[i] ?? `S${i}`;
          const stack = stacks[i]?.stack_bb ?? 100;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <span style={{
                fontSize: 8, fontWeight: 700, letterSpacing: '0.1em',
                padding: '1px 5px', borderRadius: 3,
                background: i === btnSeat ? 'rgba(212,175,55,0.15)' : 'rgba(88,166,255,0.08)',
                border: i === btnSeat ? '1px solid rgba(212,175,55,0.4)' : '1px solid rgba(88,166,255,0.2)',
                color: i === btnSeat ? '#d4af37' : '#58a6ff',
              }}>{pos}</span>
              <div className="flex gap-1">
                {s.seatMode === 'range' ? (
                  <span style={{ fontSize: 9, color: '#8b949e', padding: '2px 4px', border: '1px dashed #30363d', borderRadius: 3 }}>Range</span>
                ) : (
                  <>
                    {[0, 1].map(ci => {
                      const parsed = s.cards[ci] ? cardLabel(s.cards[ci]) : null;
                      return (
                        <span key={ci} style={{
                          width: 18, height: 24, fontSize: 8, fontWeight: 700,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid #30363d', borderRadius: 2,
                          color: parsed?.color ?? '#444',
                          background: parsed ? 'rgba(212,175,55,0.06)' : 'transparent',
                        }}>
                          {parsed ? `${parsed.rank}${parsed.suit}` : '?'}
                        </span>
                      );
                    })}
                  </>
                )}
              </div>
              <span style={{ fontSize: 8, color: '#6e7681' }}>{stack}bb</span>
            </div>
          );
        })}
      </div>
      {/* Board */}
      {showBoard && (
        <div className="flex justify-center gap-1">
          {flopCards.map((c, i) => {
            const parsed = c ? cardLabel(c) : null;
            return (
              <span key={`f${i}`} style={{
                width: 22, height: 30, fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid #30363d', borderRadius: 3,
                color: parsed?.color ?? '#444',
                background: parsed ? 'rgba(255,255,255,0.04)' : 'transparent',
              }}>
                {parsed ? `${parsed.rank}${parsed.suit}` : '?'}
              </span>
            );
          })}
          {boardTurn && (() => { const p = cardLabel(boardTurn); return (
            <span style={{ width: 22, height: 30, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #30363d', borderRadius: 3, color: p?.color ?? '#444', background: 'rgba(255,255,255,0.04)' }}>
              {p ? `${p.rank}${p.suit}` : '?'}
            </span>
          ); })()}
          {boardRiver && (() => { const p = cardLabel(boardRiver); return (
            <span style={{ width: 22, height: 30, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #30363d', borderRadius: 3, color: p?.color ?? '#444', background: 'rgba(255,255,255,0.04)' }}>
              {p ? `${p.rank}${p.suit}` : '?'}
            </span>
          ); })()}
          {boardMode === 'texture' && !boardTurn && (
            <span style={{ width: 22, height: 30, fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #30363d', borderRadius: 3, color: '#444' }}>T?</span>
          )}
          {boardMode === 'texture' && !boardRiver && (
            <span style={{ width: 22, height: 30, fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #30363d', borderRadius: 3, color: '#444' }}>R?</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

/**
 * ScenarioBuilder
 *
 * Props:
 *   scenario        — existing scenario object (null for new)
 *   onSaved(sc)     — called after successful save with the saved scenario
 *   onDelete()      — called after delete
 *   onDuplicate(sc) — called after duplicate
 *   onClose()       — cancel / close without saving
 *   folders         — array of folder tree nodes for the folder dropdown
 */
export default function ScenarioBuilder({
  scenario = null,
  onSaved,
  onDelete,
  onDuplicate,
  onClose,
  folders = [],
  // Legacy props accepted but ignored (old HandBuilder passes these)
  // eslint-disable-next-line no-unused-vars
  playlists, initialScenario, inline, socket,
}) {
  const isNew = !scenario?.id;

  // ── Form state ────────────────────────────────────────────────────────────

  const [name, setName]               = useState(scenario?.name ?? '');
  const [description, setDescription] = useState(scenario?.description ?? '');
  const [tags, setTags]               = useState(scenario?.tags ?? []);
  const [folderId, setFolderId]       = useState(scenario?.folder_id ?? null);
  const [playerCount, setPlayerCount] = useState(scenario?.player_count ?? 6);
  const [btnSeat, setBtnSeat]         = useState(scenario?.btn_seat ?? 0);
  const [blindMode, setBlindMode]     = useState(scenario?.blind_mode ?? false);

  const [seats, setSeats] = useState(() =>
    isNew
      ? buildDefaultSeats(scenario?.player_count ?? 6)
      : hydrateSeats(scenario?.seat_configs, scenario?.player_count ?? 6)
  );

  const [stacks, setStacks] = useState(() =>
    isNew
      ? buildDefaultStacks(scenario?.player_count ?? 6)
      : hydrateStacks(scenario?.stack_configs, scenario?.player_count ?? 6)
  );

  const [boardMode, setBoardMode]     = useState(scenario?.board_mode ?? 'none');
  const [boardFlop, setBoardFlop]     = useState(flopToCards(scenario?.board_flop));  // [c1,c2,c3]|[null,null,null]
  const [boardTurn, setBoardTurn]     = useState(scenario?.board_turn ?? null);
  const [boardRiver, setBoardRiver]   = useState(scenario?.board_river ?? null);
  const [boardTexture, setBoardTexture] = useState(scenario?.board_texture ?? 'monotone');
  const [textureTurn, setTextureTurn]  = useState(scenario?.texture_turn ?? null);
  const [textureRiver, setTextureRiver] = useState(scenario?.texture_river ?? null);

  // ── UI state ──────────────────────────────────────────────────────────────

  const [pickerTarget, setPickerTarget]       = useState(null);
  // { type: 'seat', seatIdx, cardIdx } | { type: 'board', idx } | { type: 'texture_turn' } | { type: 'texture_river' }
  const [rangePickerSeat, setRangePickerSeat] = useState(null);  // seat index with open range picker
  const [saving, setSaving]                   = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [error, setError]                     = useState(null);
  const [success, setSuccess]                 = useState(null);

  // ── Sync seat/stack arrays when playerCount changes ───────────────────────

  useEffect(() => {
    setSeats(prev => {
      if (prev.length === playerCount) return prev;
      if (prev.length < playerCount) {
        return [...prev, ...buildDefaultSeats(playerCount - prev.length).map((s, i) => ({ ...s, seat: prev.length + i }))];
      }
      return prev.slice(0, playerCount).map((s, i) => ({ ...s, seat: i }));
    });
    setStacks(prev => {
      if (prev.length === playerCount) return prev;
      if (prev.length < playerCount) {
        return [...prev, ...buildDefaultStacks(playerCount - prev.length).map((s, i) => ({ ...s, seat: prev.length + i }))];
      }
      return prev.slice(0, playerCount).map((s, i) => ({ ...s, seat: i }));
    });
    if (btnSeat >= playerCount) setBtnSeat(0);
  }, [playerCount]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const positions = useMemo(() => computePositions(playerCount, btnSeat), [playerCount, btnSeat]);

  // Set of all cards currently assigned (for CardPicker exclusions)
  const allUsedCards = useMemo(() => {
    const s = new Set();
    seats.forEach(seat => {
      if (seat.seatMode === 'fixed') seat.cards.forEach(c => { if (c) s.add(c); });
    });
    if (boardMode === 'specific') {
      boardFlop.forEach(c => { if (c) s.add(c); });
      if (boardTurn) s.add(boardTurn);
      if (boardRiver) s.add(boardRiver);
    } else if (boardMode === 'texture') {
      if (textureTurn) s.add(textureTurn);
      if (textureRiver) s.add(textureRiver);
    }
    return s;
  }, [seats, boardMode, boardFlop, boardTurn, boardRiver, textureTurn, textureRiver]);

  // Exclude the currently-targeted card slot so re-picking same card is allowed
  const pickerUsedCards = useMemo(() => {
    if (!pickerTarget) return allUsedCards;
    const s = new Set(allUsedCards);
    if (pickerTarget.type === 'seat') {
      const existing = seats[pickerTarget.seatIdx]?.cards[pickerTarget.cardIdx];
      if (existing) s.delete(existing);
    } else if (pickerTarget.type === 'board') {
      const existing = boardFlop[pickerTarget.idx];
      if (existing) s.delete(existing);
    } else if (pickerTarget.type === 'board_turn') {
      if (boardTurn) s.delete(boardTurn);
    } else if (pickerTarget.type === 'board_river') {
      if (boardRiver) s.delete(boardRiver);
    } else if (pickerTarget.type === 'texture_turn') {
      if (textureTurn) s.delete(textureTurn);
    } else if (pickerTarget.type === 'texture_river') {
      if (textureRiver) s.delete(textureRiver);
    }
    return s;
  }, [pickerTarget, allUsedCards, seats, boardFlop, boardTurn, boardRiver, textureTurn, textureRiver]);

  // ── Card picker dispatch ───────────────────────────────────────────────────

  function handleCardPicked(card) {
    if (!pickerTarget) return;
    const t = pickerTarget;
    if (t.type === 'seat') {
      setSeats(prev => prev.map((s, i) => {
        if (i !== t.seatIdx) return s;
        const cards = [...s.cards];
        cards[t.cardIdx] = card;
        return { ...s, cards };
      }));
    } else if (t.type === 'board') {
      setBoardFlop(prev => { const next = [...prev]; next[t.idx] = card; return next; });
    } else if (t.type === 'board_turn') {
      setBoardTurn(card);
    } else if (t.type === 'board_river') {
      setBoardRiver(card);
    } else if (t.type === 'texture_turn') {
      setTextureTurn(card);
    } else if (t.type === 'texture_river') {
      setTextureRiver(card);
    }
    setPickerTarget(null);
  }

  // ── Range apply ───────────────────────────────────────────────────────────

  function handleRangeApply(seatIdx, rangeStr) {
    setSeats(prev => prev.map((s, i) => i === seatIdx ? { ...s, range: rangeStr } : s));
    setRangePickerSeat(null);
  }

  // ── Seat mode toggle ──────────────────────────────────────────────────────

  function toggleSeatMode(seatIdx) {
    setSeats(prev => prev.map((s, i) => {
      if (i !== seatIdx) return s;
      const next = s.seatMode === 'fixed' ? 'range' : 'fixed';
      return { ...s, seatMode: next, cards: [null, null], range: '' };
    }));
    if (rangePickerSeat === seatIdx) setRangePickerSeat(null);
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Build seat_configs + stack_configs
    const seatConfigs = seats.map(s => ({
      seat: s.seat,
      ...(s.seatMode === 'range' ? { range: s.range } : { cards: s.cards }),
    }));
    const stackConfigs = stacks.map(s => ({ seat: s.seat, stack_bb: s.stack_bb }));

    // Determine effective card_mode: 'range' if any seat is range, else 'fixed'
    const effectiveCardMode = seats.some(s => s.seatMode === 'range') ? 'range' : 'fixed';

    const payload = {
      name:         trimmedName,
      description:  description || null,
      tags,
      folder_id:    folderId,
      player_count: playerCount,
      btn_seat:     btnSeat,
      card_mode:    effectiveCardMode,
      seat_configs: seatConfigs,
      stack_configs: stackConfigs,
      board_mode:   boardMode,
      board_flop:   boardMode === 'specific' ? cardsToFlop(boardFlop) : null,
      board_turn:   boardMode === 'specific' ? boardTurn : null,
      board_river:  boardMode === 'specific' ? boardRiver : null,
      board_texture: boardMode === 'texture' ? boardTexture : null,
      texture_turn:  boardMode === 'texture' ? textureTurn : null,
      texture_river: boardMode === 'texture' ? textureRiver : null,
      blind_mode:   blindMode,
    };

    try {
      const result = isNew
        ? await apiFetch('/api/scenarios', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/scenarios/${scenario.id}`, { method: 'PATCH', body: JSON.stringify(payload) });

      const versionMsg = result.version > 1 ? ` (saved as v${result.version})` : '';
      setSuccess(`Saved${versionMsg}`);
      setTimeout(() => onSaved?.(result), 700);
    } catch (err) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!scenario?.id) return;
    if (!window.confirm(`Delete "${scenario.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/scenarios/${scenario.id}`, { method: 'DELETE' });
      onDelete?.();
    } catch (err) {
      setError(err.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    if (!scenario?.id) return;
    try {
      const copy = await apiFetch(`/api/scenarios/${scenario.id}/duplicate`, { method: 'POST' });
      onDuplicate?.(copy);
    } catch (err) {
      setError(err.message ?? 'Duplicate failed');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #21262d' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#d4af37' }}>
          {isNew ? 'New Scenario' : 'Edit Scenario'}
        </span>
        <div className="flex items-center gap-2">
          {!isNew && (
            <span style={{ fontSize: 10, color: '#6e7681' }}>
              v{scenario.version} · played {scenario.play_count}×
            </span>
          )}
          {onClose && (
            <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 4, border: '1px solid #30363d', background: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>

        {/* Identity */}
        <div className="mb-5">
          <SectionLabel text="Identity" />
          <div className="mb-3">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Scenario name…"
              style={{ width: '100%', padding: '7px 10px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
              onBlur={e => { e.target.style.borderColor = '#30363d'; }}
            />
          </div>
          <div className="mb-3">
            <TagEditor tags={tags} onChange={setTags} />
          </div>
          {folders.length > 0 && (
            <div className="mb-3">
              <select
                value={folderId ?? ''}
                onChange={e => setFolderId(e.target.value || null)}
                style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', fontSize: 11, outline: 'none' }}
              >
                <option value="">No folder</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={2}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', fontSize: 11, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.5)'; }}
            onBlur={e => { e.target.style.borderColor = '#30363d'; }}
          />
        </div>

        {/* Hand Configuration */}
        <div className="mb-5">
          <SectionLabel text="Hand Configuration" />
          <div className="flex flex-wrap gap-4 mb-3">
            <div>
              <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Players</div>
              <div className="flex gap-1">
                {[2,3,4,5,6,7,8,9].map(n => (
                  <button
                    key={n}
                    onClick={() => setPlayerCount(n)}
                    style={{
                      width: 26, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.1s',
                      background: playerCount === n ? 'rgba(212,175,55,0.15)' : 'none',
                      border: playerCount === n ? '1px solid rgba(212,175,55,0.5)' : '1px solid #30363d',
                      color: playerCount === n ? '#d4af37' : '#6e7681',
                    }}
                  >{n}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Blind Mode</div>
              <ToggleGroup
                options={[{ value: false, label: 'Visible' }, { value: true, label: 'Hidden' }]}
                value={blindMode}
                onChange={setBlindMode}
              />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>BTN Seat</div>
            <div className="flex gap-1">
              {Array.from({ length: playerCount }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setBtnSeat(i)}
                  style={{
                    width: 28, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    background: btnSeat === i ? 'rgba(212,175,55,0.15)' : 'none',
                    border: btnSeat === i ? '1px solid rgba(212,175,55,0.5)' : '1px solid #30363d',
                    color: btnSeat === i ? '#d4af37' : '#6e7681',
                  }}
                >{i + 1}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Seat Assignments */}
        <div className="mb-5">
          <SectionLabel text="Seat Assignments" />
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Seat', 'Pos', 'Mode', 'Cards / Range', 'Stack (BB)'].map(h => (
                  <th key={h} style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#6e7681', padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid #21262d' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seats.map((seat, i) => (
                <React.Fragment key={i}>
                  <tr style={{ borderBottom: rangePickerSeat === i ? 'none' : '1px solid #21262d' }}>
                    {/* Seat # */}
                    <td style={{ padding: '6px' }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: '50%', fontSize: 10, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: i === btnSeat ? 'rgba(212,175,55,0.15)' : '#161b22',
                        border: i === btnSeat ? '1px solid #d4af37' : '1px solid #30363d',
                        color: i === btnSeat ? '#d4af37' : '#8b949e',
                      }}>{i + 1}</span>
                    </td>
                    {/* Position */}
                    <td style={{ padding: '6px' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', color: '#58a6ff' }}>
                        {positions[i] ?? '—'}
                      </span>
                    </td>
                    {/* Mode toggle */}
                    <td style={{ padding: '6px' }}>
                      <button
                        onClick={() => toggleSeatMode(i)}
                        style={{
                          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 3,
                          cursor: 'pointer',
                          background: seat.seatMode === 'range' ? 'rgba(88,166,255,0.08)' : 'rgba(212,175,55,0.08)',
                          border: seat.seatMode === 'range' ? '1px solid rgba(88,166,255,0.3)' : '1px solid rgba(212,175,55,0.3)',
                          color: seat.seatMode === 'range' ? '#58a6ff' : '#d4af37',
                        }}
                      >
                        {seat.seatMode === 'range' ? 'Range' : 'Fixed'}
                      </button>
                    </td>
                    {/* Cards / Range */}
                    <td style={{ padding: '6px' }}>
                      {seat.seatMode === 'fixed' ? (
                        <div className="flex gap-1">
                          <CardSlot card={seat.cards[0]} label={`Seat ${i+1} C1`} onClick={() => setPickerTarget({ type: 'seat', seatIdx: i, cardIdx: 0 })} />
                          <CardSlot card={seat.cards[1]} label={`Seat ${i+1} C2`} onClick={() => setPickerTarget({ type: 'seat', seatIdx: i, cardIdx: 1 })} />
                        </div>
                      ) : (
                        <button
                          onClick={() => setRangePickerSeat(rangePickerSeat === i ? null : i)}
                          style={{
                            fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 4,
                            cursor: 'pointer',
                            background: rangePickerSeat === i ? 'rgba(88,166,255,0.12)' : 'none',
                            border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff',
                          }}
                        >
                          {seat.range ? `${seat.range.split(',').length} groups` : '+ Set Range'}
                        </button>
                      )}
                    </td>
                    {/* Stack */}
                    <td style={{ padding: '6px' }}>
                      <input
                        type="number"
                        min={1}
                        value={stacks[i]?.stack_bb ?? 100}
                        onChange={e => setStacks(prev => prev.map((s, si) => si === i ? { ...s, stack_bb: Math.max(1, parseInt(e.target.value, 10) || 1) } : s))}
                        style={{ width: 64, padding: '3px 6px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', fontSize: 11, textAlign: 'right', outline: 'none' }}
                        onFocus={e => { e.target.style.borderColor = 'rgba(212,175,55,0.4)'; }}
                        onBlur={e => { e.target.style.borderColor = '#30363d'; }}
                      />
                    </td>
                  </tr>
                  {/* Inline range picker row */}
                  {rangePickerSeat === i && (
                    <tr style={{ borderBottom: '1px solid #21262d' }}>
                      <td colSpan={5} style={{ padding: '8px 6px' }}>
                        <RangePicker
                          seatLabel={`Seat ${i + 1} (${positions[i] ?? '—'}) — Range`}
                          initialRange={seat.range}
                          onApply={(rangeStr) => handleRangeApply(i, rangeStr)}
                          onCancel={() => setRangePickerSeat(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Board Configuration */}
        <div className="mb-5">
          <SectionLabel text="Board Configuration" />
          <div className="mb-3">
            <ToggleGroup
              options={[{ value: 'none', label: 'None' }, { value: 'specific', label: 'Specific' }, { value: 'texture', label: 'Texture' }]}
              value={boardMode}
              onChange={setBoardMode}
            />
          </div>

          {boardMode === 'specific' && (
            <div className="space-y-3">
              <div>
                <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Flop</div>
                <div className="flex gap-2">
                  {[0, 1, 2].map(idx => (
                    <CardSlot
                      key={idx}
                      card={boardFlop[idx]}
                      label={`Flop ${idx + 1}`}
                      onClick={() => setPickerTarget({ type: 'board', idx })}
                    />
                  ))}
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Turn <span style={{ color: '#444' }}>(optional)</span></div>
                  <CardSlot card={boardTurn} label="Turn" onClick={() => setPickerTarget({ type: 'board_turn' })} />
                  {boardTurn && <button onClick={() => setBoardTurn(null)} style={{ fontSize: 9, color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3 }}>clear</button>}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>River <span style={{ color: '#444' }}>(optional)</span></div>
                  <CardSlot card={boardRiver} label="River" onClick={() => setPickerTarget({ type: 'board_river' })} />
                  {boardRiver && <button onClick={() => setBoardRiver(null)} style={{ fontSize: 9, color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3 }}>clear</button>}
                </div>
              </div>
            </div>
          )}

          {boardMode === 'texture' && (
            <div className="space-y-3">
              <div>
                <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Flop Texture</div>
                <select
                  value={boardTexture}
                  onChange={e => setBoardTexture(e.target.value)}
                  style={{ padding: '5px 8px', borderRadius: 4, border: '1px solid #30363d', background: '#0d1117', color: '#f0ece3', fontSize: 11, outline: 'none' }}
                >
                  {TEXTURES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex gap-6">
                <div>
                  <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>Turn <span style={{ color: '#444' }}>(pin, optional)</span></div>
                  <CardSlot card={textureTurn} label="Pinned Turn" onClick={() => setPickerTarget({ type: 'texture_turn' })} />
                  {textureTurn && <button onClick={() => setTextureTurn(null)} style={{ fontSize: 9, color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3 }}>clear</button>}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#6e7681', marginBottom: 5, fontWeight: 600, textTransform: 'uppercase' }}>River <span style={{ color: '#444' }}>(pin, optional)</span></div>
                  <CardSlot card={textureRiver} label="Pinned River" onClick={() => setPickerTarget({ type: 'texture_river' })} />
                  {textureRiver && <button onClick={() => setTextureRiver(null)} style={{ fontSize: 9, color: '#6e7681', background: 'none', border: 'none', cursor: 'pointer', marginTop: 3 }}>clear</button>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="mb-5">
          <SectionLabel text="Preview" />
          <Preview
            seats={seats}
            stacks={stacks}
            positions={positions}
            btnSeat={btnSeat}
            boardFlop={cardsToFlop(boardFlop)}
            boardTurn={boardMode === 'specific' ? boardTurn : (boardMode === 'texture' ? textureTurn : null)}
            boardRiver={boardMode === 'specific' ? boardRiver : (boardMode === 'texture' ? textureRiver : null)}
            boardMode={boardMode}
          />
        </div>

        {/* Source hand link */}
        {scenario?.source_hand_id && (
          <div style={{ fontSize: 10, color: '#6e7681', marginBottom: 12 }}>
            Source: Hand #{scenario.source_hand_id.slice(0, 8)}
          </div>
        )}

        {/* Error / success */}
        {error && (
          <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4, background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', fontSize: 11, color: '#f85149' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ marginBottom: 10, padding: '7px 10px', borderRadius: 4, background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.25)', fontSize: 11, color: '#3fb950' }}>
            {success}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid #21262d' }}>
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid rgba(248,81,73,0.3)', background: 'none', color: '#f85149', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
        {!isNew && (
          <button
            onClick={handleDuplicate}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #30363d', background: 'none', color: '#8b949e', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Duplicate
          </button>
        )}
        <div style={{ flex: 1 }} />
        {onClose && (
          <button
            onClick={onClose}
            style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid #30363d', background: 'none', color: '#6e7681', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '6px 18px', borderRadius: 4, background: saving ? '#a07a20' : '#d4af37', color: '#000', border: 'none', fontSize: 11, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', letterSpacing: '0.06em' }}
        >
          {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </button>
      </div>

      {/* ── Card picker overlay ─────────────────────────────────────────── */}
      {pickerTarget && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPickerTarget(null)}
        >
          <div onClick={e => e.stopPropagation()}>
            <CardPicker
              usedCards={pickerUsedCards}
              onSelect={handleCardPicked}
              onClose={() => setPickerTarget(null)}
              title={
                pickerTarget.type === 'seat'
                  ? `Seat ${pickerTarget.seatIdx + 1} — Card ${pickerTarget.cardIdx + 1}`
                  : pickerTarget.type === 'board'
                  ? `Flop ${pickerTarget.idx + 1}`
                  : pickerTarget.type === 'board_turn' ? 'Turn'
                  : pickerTarget.type === 'board_river' ? 'River'
                  : pickerTarget.type === 'texture_turn' ? 'Pinned Turn'
                  : 'Pinned River'
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
