import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { colors } from '../../lib/colors.js';
import { generatePlaylistColor } from './PLAYLIST_COLORS.js';
import CardPicker from '../CardPicker.jsx';
import { apiFetch as defaultApiFetch } from '../../lib/api.js';

// Board slot ordering: 3 flop slots + turn + river.
const BOARD_SLOTS = ['flop1', 'flop2', 'flop3', 'turn', 'river'];

// Human label for a board slot id (e.g. 'flop1' → 'Flop 1', 'turn' → 'Turn').
function slotLabel(slot) {
  if (slot === 'turn') return 'Turn';
  if (slot === 'river') return 'River';
  if (slot === 'flop1') return 'Flop 1';
  if (slot === 'flop2') return 'Flop 2';
  if (slot === 'flop3') return 'Flop 3';
  return String(slot ?? '');
}

// ── helpers ───────────────────────────────────────────────────────────────────

// Split hand.board (flat ['Kh','7s','2d','Ac','...']) into 5-slot representation.
function boardFromArray(arr) {
  const slots = { flop1: null, flop2: null, flop3: null, turn: null, river: null };
  if (!Array.isArray(arr)) return slots;
  if (arr[0]) slots.flop1 = arr[0];
  if (arr[1]) slots.flop2 = arr[1];
  if (arr[2]) slots.flop3 = arr[2];
  if (arr[3]) slots.turn  = arr[3];
  if (arr[4]) slots.river = arr[4];
  return slots;
}

// Build PATCH payload board fields from slot state.
function boardToPatch(slots) {
  const flop = [slots.flop1, slots.flop2, slots.flop3].filter(Boolean);
  return {
    board_flop:  flop.length === 3 ? flop.join('') : null,
    board_turn:  slots.turn  ?? null,
    board_river: slots.river ?? null,
  };
}

// Compute "rainbow / monotone / two-tone" texture tag from 3 flop cards.
function flopTexture(flop) {
  const valid = flop.filter(Boolean);
  if (valid.length !== 3) return '';
  const suits = new Set(valid.map((c) => c[1]));
  if (suits.size === 1) return 'm'; // monotone
  if (suits.size === 2) return 't'; // two-tone
  return 'r';                        // rainbow
}

// Reduce two hole cards to rank+suited/offsuit string (e.g. "AKo", "AA", "QJs").
// Returns '' if either card is missing.
function holeToShort(hole) {
  if (!Array.isArray(hole) || hole.length < 2 || !hole[0] || !hole[1]) return '';
  const r1 = hole[0][0];
  const r2 = hole[1][0];
  const s1 = hole[0][1];
  const s2 = hole[1][1];
  if (r1 === r2) return `${r1}${r2}`;
  const suited = s1 === s2 ? 's' : 'o';
  // Standard order: high rank first.
  const order = '23456789TJQKA';
  const hi = order.indexOf(r1) >= order.indexOf(r2) ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  return `${hi}${lo}${suited}`;
}

// Auto-generated scenario name.
// Heads-up:      "AKo vs QJs on K72r" (or "AKo vs ??…" / "Random vs QJs…")
// 3+ seats:      "AKo (6-max) on K72r" (or "Random (6-max) on K72r")
// No flop:       " on K72r" suffix omitted
// Empty/unknown: "Hand #abc123"
export function autoName({ seats = [], heroSeat = null, board, handId }) {
  const hero   = seats.find((s) => s.seat === heroSeat) || null;
  const others = seats.filter((s) => s.seat !== heroSeat);
  const heroShort = holeToShort(hero?.cards);
  const seatCount = seats.length;

  const flop = [board?.flop1, board?.flop2, board?.flop3].filter(Boolean);
  const flopPart = flop.length === 3
    ? ` on ${flop.map((c) => c[0]).join('')}${flopTexture(flop)}`
    : '';

  if (seatCount === 2) {
    const vilShort = holeToShort(others[0]?.cards);
    if (heroShort && vilShort) return `${heroShort} vs ${vilShort}${flopPart}`;
    if (heroShort)             return `${heroShort} vs ??${flopPart}`;
    if (vilShort)              return `Random vs ${vilShort}${flopPart}`;
  }
  if (seatCount >= 3) {
    if (heroShort) return `${heroShort} (${seatCount}-max)${flopPart}`;
    return `Random (${seatCount}-max)${flopPart}`;
  }
  if (heroShort && flopPart) return `${heroShort}${flopPart}`;
  if (heroShort) return `${heroShort} — Hand #${String(handId || '').slice(0, 6)}`;
  return `Hand #${String(handId || '').slice(0, 6)}`;
}

// Crude stem: drop a trailing 's' so "pot"/"pots" compare equal. Only strips
// if the stemmed form is still ≥ 2 chars so "a"/"as" don't collapse to "a".
function stem(tok) {
  if (tok.length > 2 && tok.endsWith('s')) return tok.slice(0, -1);
  return tok;
}

// Tokenize a string: split on non-alphanumeric AND on digit↔letter transitions,
// lowercase, drop empties. This lets tags like "3BET_POT" tokenize to
// ["3","bet","pot"] so they align with hyphenated playlist names like "3-Bet Pots".
function tokenize(str) {
  return String(str ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .flatMap((part) => part.match(/[a-z]+|[0-9]+/g) ?? [])
    .filter(Boolean);
}

// Match existing hand tags against playlist names to pick a default playlist.
export function guessPlaylistId(playlists, tags) {
  if (!Array.isArray(playlists) || playlists.length === 0) return null;
  if (!Array.isArray(tags) || tags.length === 0) return null;

  const tagTokenSets = tags
    .map((t) => tokenize(t))
    .filter((toks) => toks.length > 0 && toks.some((tok) => tok.length >= 2))
    .map((toks) => toks.map(stem));

  if (tagTokenSets.length === 0) return null;

  for (const pl of playlists) {
    const nameTokens = new Set(tokenize(pl.name).map(stem));
    if (nameTokens.size === 0) continue;
    for (const tagTokens of tagTokenSets) {
      if (tagTokens.every((tok) => nameTokens.has(tok))) {
        return pl.playlist_id;
      }
    }
  }
  return null;
}

// Build initial per-seat state from hand.players.
function seatsFromHand(hand) {
  if (!hand?.players || !Array.isArray(hand.players)) return [];
  return hand.players
    .filter((p) => p.seat !== undefined && p.seat !== null)
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map((p) => ({
      player_id: p.player_id ?? null,
      seat:      p.seat,
      cards: [
        Array.isArray(p.hole_cards) ? (p.hole_cards[0] || null) : null,
        Array.isArray(p.hole_cards) ? (p.hole_cards[1] || null) : null,
      ],
    }));
}

// Default hero seat: explicit heroPlayerId match, else first seat with a
// filled pair, else first seat, else null.
function defaultHeroSeat(seats, heroPlayerId) {
  if (seats.length === 0) return null;
  if (heroPlayerId) {
    const match = seats.find((s) => s.player_id === heroPlayerId);
    if (match) return match.seat;
  }
  const filled = seats.find((s) => s.cards[0] && s.cards[1]);
  return (filled ?? seats[0]).seat;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SaveAsScenarioModal({
  hand,            // { hand_id, board: [...], players: [{seat, hole_cards, player_id}], hand_tags?, tags? }
  heroPlayerId,    // optional — default hero; falls through to first filled seat
  onClose,
  onSaved,
  apiFetch = defaultApiFetch,
}) {
  // ── Seats (editable) ───────────────────────────────────────────────────────
  const initialSeats = useMemo(() => seatsFromHand(hand), [hand]);
  const [seats, setSeats] = useState(initialSeats);
  const [heroSeat, setHeroSeat] = useState(() => defaultHeroSeat(initialSeats, heroPlayerId));

  // ── Board (editable) ───────────────────────────────────────────────────────
  const [board, setBoard] = useState(() => boardFromArray(hand?.board));

  // Tags for name + playlist heuristics
  const tags = useMemo(() => {
    if (Array.isArray(hand?.tags)) return hand.tags;
    if (Array.isArray(hand?.auto_tags)) return hand.auto_tags;
    if (Array.isArray(hand?.hand_tags)) return hand.hand_tags.map((t) => t.tag ?? t);
    return [];
  }, [hand]);

  // ── Name ───────────────────────────────────────────────────────────────────
  const [name, setName] = useState(() =>
    autoName({
      seats: initialSeats,
      heroSeat: defaultHeroSeat(initialSeats, heroPlayerId),
      board: boardFromArray(hand?.board),
      handId: hand?.hand_id,
    })
  );

  // ── Playlists ──────────────────────────────────────────────────────────────
  const [playlists, setPlaylists]   = useState([]);
  const [playlistId, setPlaylistId] = useState(null);
  const [loadingPls, setLoadingPls] = useState(true);

  const tagsRef = useRef(tags);
  useEffect(() => { tagsRef.current = tags; }, [tags]);

  const defaultAppliedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/playlists')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.playlists ?? []);
        setPlaylists(list);
        if (!defaultAppliedRef.current) {
          const guessed = guessPlaylistId(list, tagsRef.current);
          const fallback = list[0]?.playlist_id ?? null;
          setPlaylistId(guessed ?? fallback);
          defaultAppliedRef.current = true;
        }
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPls(false);
      });
    return () => { cancelled = true; };
  }, [apiFetch]);

  const colorMap = useMemo(() => {
    const m = {};
    playlists.forEach((pl, i) => { m[pl.playlist_id] = generatePlaylistColor(i); });
    return m;
  }, [playlists]);

  // ── Unified card picker for board OR seat slots ────────────────────────────
  // pickerTarget: null | { kind: 'board', slot } | { kind: 'seat', seat, index }
  const [pickerTarget, setPickerTarget] = useState(null);

  const usedCards = useMemo(() => {
    const used = new Set();
    seats.forEach((s) => {
      s.cards.forEach((c, i) => {
        if (!c) return;
        if (pickerTarget?.kind === 'seat' && pickerTarget.seat === s.seat && pickerTarget.index === i) return;
        used.add(c);
      });
    });
    BOARD_SLOTS.forEach((slot) => {
      if (!board[slot]) return;
      if (pickerTarget?.kind === 'board' && pickerTarget.slot === slot) return;
      used.add(board[slot]);
    });
    return used;
  }, [seats, board, pickerTarget]);

  const handlePick = useCallback((card) => {
    if (!pickerTarget) return;
    if (pickerTarget.kind === 'board') {
      setBoard((prev) => ({ ...prev, [pickerTarget.slot]: card }));
    } else if (pickerTarget.kind === 'seat') {
      setSeats((prev) => prev.map((s) =>
        s.seat !== pickerTarget.seat ? s : {
          ...s,
          cards: s.cards.map((c, i) => (i === pickerTarget.index ? card : c)),
        }
      ));
    }
  }, [pickerTarget]);

  const updateSeatCard = useCallback((seatIdx, cardIdx, card) => {
    setSeats((prev) => prev.map((s) =>
      s.seat !== seatIdx ? s : {
        ...s,
        cards: s.cards.map((c, i) => (i === cardIdx ? card : c)),
      }
    ));
  }, []);

  const pickerTitle = useMemo(() => {
    if (!pickerTarget) return '';
    if (pickerTarget.kind === 'board') return `Pick card for ${slotLabel(pickerTarget.slot)}`;
    const isHero = pickerTarget.seat === heroSeat;
    const who = isHero ? 'Hero' : `Seat ${pickerTarget.seat}`;
    return `Pick card for ${who} (card ${pickerTarget.index + 1})`;
  }, [pickerTarget, heroSeat]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSave = useCallback(async () => {
    if (!hand?.hand_id) return;
    setSaving(true);
    setSaveError(null);
    try {
      // 1. Create scenario (server builds seat_configs from hand_players).
      const scenario = await apiFetch('/api/scenarios/from-hand', {
        method: 'POST',
        body: JSON.stringify({
          hand_id: hand.hand_id,
          include_board: true,
          hero_player_id: seats.find((s) => s.seat === heroSeat)?.player_id ?? null,
        }),
      });

      // 2. PATCH with coach edits: name, board, seat_configs (with any card
      //    changes / clears), hero_seat, primary playlist.
      const seatConfigs = seats.map((s) => ({
        seat:  s.seat,
        cards: s.cards.filter(Boolean),
      }));
      const patchBody = {
        name: name.trim() || scenario.name,
        ...boardToPatch(board),
        seat_configs: seatConfigs,
        hero_seat: heroSeat,
        primary_playlist_id: playlistId ?? null,
      };
      const updated = await apiFetch(`/api/scenarios/${encodeURIComponent(scenario.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });

      // 3. Link to playlist.
      if (playlistId) {
        await apiFetch(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
          method: 'POST',
          body: JSON.stringify({ scenario_id: scenario.id }),
        });
      }
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      setSaveError(err?.message || 'Failed to save scenario');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, hand, name, board, seats, heroSeat, playlistId, onClose, onSaved]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const selectedPlaylist = playlists.find((pl) => pl.playlist_id === playlistId);
  const showSeats = seats.length > 0;

  return (
    <div
      data-testid="save-as-scenario-modal"
      role="dialog"
      aria-label="Save hand as scenario"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.78)',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560,
          maxHeight: '92vh',
          background: colors.bgSurface,
          border: `1px solid ${colors.borderStrong}`,
          borderRadius: 8,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: `1px solid ${colors.borderDefault}`,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary, letterSpacing: '0.02em' }}>
            Save as Scenario
          </div>
          <button
            data-testid="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 4, background: 'transparent',
              border: '1px solid transparent', color: colors.textMuted, cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Seats (editable hole cards + hero radio) */}
          {showSeats && (
            <div data-testid="modal-seats">
              <Label>Seats · pick hero</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {seats.map((seat) => {
                  const isHero = seat.seat === heroSeat;
                  return (
                    <div
                      key={seat.seat}
                      data-testid={`seat-row-${seat.seat}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '6px 8px', borderRadius: 4,
                        background: isHero ? colors.goldSubtle : 'transparent',
                        border: `1px solid ${isHero ? colors.goldBorder : colors.borderDefault}`,
                      }}
                    >
                      <input
                        type="radio"
                        name="hero-seat"
                        data-testid={`hero-radio-seat-${seat.seat}`}
                        checked={isHero}
                        onChange={() => setHeroSeat(seat.seat)}
                        aria-label={`Hero is seat ${seat.seat}`}
                        style={{ cursor: 'pointer' }}
                      />
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                        color: isHero ? colors.gold : colors.textMuted,
                        minWidth: 52,
                      }}>
                        {isHero ? 'HERO' : `SEAT ${seat.seat}`}
                      </span>
                      <SeatSlot
                        seat={seat.seat}
                        index={0}
                        card={seat.cards[0]}
                        onClick={() => setPickerTarget({ kind: 'seat', seat: seat.seat, index: 0 })}
                        onClear={() => updateSeatCard(seat.seat, 0, null)}
                      />
                      <SeatSlot
                        seat={seat.seat}
                        index={1}
                        card={seat.cards[1]}
                        onClick={() => setPickerTarget({ kind: 'seat', seat: seat.seat, index: 1 })}
                        onClear={() => updateSeatCard(seat.seat, 1, null)}
                      />
                      {!seat.cards[0] && !seat.cards[1] && (
                        <span style={{ fontSize: 10, color: colors.textMuted, fontStyle: 'italic' }}>
                          random
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Board (editable) */}
          <div>
            <Label>Board</Label>
            <div data-testid="modal-board" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BOARD_SLOTS.map((slot) => (
                <BoardSlot
                  key={slot}
                  slot={slot}
                  card={board[slot]}
                  label={slotLabel(slot)}
                  onClick={() => setPickerTarget({ kind: 'board', slot })}
                  onClear={() => setBoard((p) => ({ ...p, [slot]: null }))}
                />
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <Label htmlFor="modal-name-input">Name</Label>
            <input
              id="modal-name-input"
              data-testid="modal-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 4,
                background: colors.bgSurfaceRaised,
                border: `1px solid ${colors.borderStrong}`,
                color: colors.textPrimary,
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {/* Playlist */}
          <div>
            <Label>Playlist</Label>
            {loadingPls ? (
              <div style={{ fontSize: 12, color: colors.textMuted }}>Loading playlists…</div>
            ) : playlists.length === 0 ? (
              <div data-testid="modal-no-playlists" style={{ fontSize: 12, color: colors.textMuted }}>
                No playlists yet. Create one from the Scenarios page first.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {playlists.map((pl) => {
                  const active = pl.playlist_id === playlistId;
                  return (
                    <button
                      key={pl.playlist_id}
                      data-testid={`playlist-picker-${pl.playlist_id}`}
                      onClick={() => setPlaylistId(pl.playlist_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px', borderRadius: 4,
                        background: active ? colors.goldSubtle : 'transparent',
                        border: `1px solid ${active ? colors.goldBorder : colors.borderDefault}`,
                        color: colors.textPrimary, cursor: 'pointer',
                        fontSize: 12, textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: colorMap[pl.playlist_id] || colors.textMuted,
                        flexShrink: 0,
                      }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pl.name}
                      </span>
                      {active && (
                        <span style={{ fontSize: 10, color: colors.gold, fontWeight: 700, letterSpacing: '0.08em' }}>
                          SELECTED
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {saveError && (
            <div
              data-testid="modal-save-error"
              style={{
                fontSize: 12, color: colors.error,
                background: colors.errorTint,
                border: `1px solid ${colors.errorBorder}`,
                padding: '8px 10px', borderRadius: 4,
              }}
            >
              {saveError}
            </div>
          )}

          {selectedPlaylist && (
            <div data-testid="modal-selected-playlist-label" style={{ fontSize: 11, color: colors.textMuted }}>
              Will be saved to <strong style={{ color: colors.textSecondary }}>{selectedPlaylist.name}</strong>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 18px', borderTop: `1px solid ${colors.borderDefault}`,
          background: colors.bgSurface, flexShrink: 0,
        }}>
          <button
            data-testid="modal-cancel-btn"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '8px 16px', borderRadius: 4,
              background: 'transparent',
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textSecondary,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em',
              cursor: saving ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="modal-save-btn"
            onClick={handleSave}
            disabled={saving || !hand?.hand_id || (playlists.length > 0 && !playlistId)}
            style={{
              padding: '8px 18px', borderRadius: 4,
              background: colors.gold,
              color: '#000',
              border: 'none',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              cursor: saving ? 'wait' : 'pointer',
              textTransform: 'uppercase',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Card picker overlay */}
      {pickerTarget && (
        <CardPicker
          usedCards={usedCards}
          onSelect={handlePick}
          onClose={() => setPickerTarget(null)}
          title={pickerTitle}
        />
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function Label({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block', marginBottom: 6,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: colors.textMuted,
      }}
    >
      {children}
    </label>
  );
}

function BoardSlot({ slot, card, label, onClick, onClear }) {
  const red = card && (card[1] === 'h' || card[1] === 'd');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <button
        data-testid={`board-slot-${slot}`}
        onClick={onClick}
        style={{
          width: 42, height: 54, borderRadius: 4,
          background: card ? colors.bgSurfaceRaised : colors.bgSurface,
          border: `1px dashed ${card ? colors.borderStrong : colors.borderDefault}`,
          color: card ? (red ? colors.error : colors.textPrimary) : colors.textMuted,
          fontSize: card ? 15 : 10, fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {card ? formatCardLabel(card) : '+'}
      </button>
      <div style={{ fontSize: 9, color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}>
        {label}
        {card && (
          <button
            data-testid={`board-slot-${slot}-clear`}
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            aria-label={`Clear ${label}`}
            style={{
              background: 'transparent', border: 'none', padding: 0,
              color: colors.textMuted, cursor: 'pointer', fontSize: 10, lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

function SeatSlot({ seat, index, card, onClick, onClear }) {
  const red = card && (card[1] === 'h' || card[1] === 'd');
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        data-testid={`seat-${seat}-card-${index}`}
        onClick={onClick}
        aria-label={card ? `Change seat ${seat} card ${index + 1}` : `Pick seat ${seat} card ${index + 1}`}
        style={{
          width: 38, height: 48, borderRadius: 4,
          background: card ? colors.bgSurfaceRaised : colors.bgSurface,
          border: `1px dashed ${card ? colors.borderStrong : colors.borderDefault}`,
          color: card ? (red ? colors.error : colors.textPrimary) : colors.textMuted,
          fontSize: card ? 13 : 10, fontWeight: 700,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {card ? formatCardLabel(card) : '+'}
      </button>
      {card && (
        <button
          data-testid={`seat-${seat}-card-${index}-clear`}
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          aria-label={`Clear seat ${seat} card ${index + 1}`}
          style={{
            position: 'absolute', top: -6, right: -6,
            width: 16, height: 16, borderRadius: '50%',
            background: colors.bgSurface,
            border: `1px solid ${colors.borderStrong}`,
            color: colors.textMuted, cursor: 'pointer',
            padding: 0, lineHeight: 1, fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function formatCardLabel(card) {
  if (!card || card.length < 2) return '';
  const rank = card[0] === 'T' ? '10' : card[0];
  const suitMap = { h: '♥', d: '♦', s: '♠', c: '♣' };
  return `${rank}${suitMap[card[1]] ?? card[1]}`;
}
