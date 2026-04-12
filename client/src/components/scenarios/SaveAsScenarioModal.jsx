import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { colors } from '../../lib/colors.js';
import { generatePlaylistColor } from './PLAYLIST_COLORS.js';
import CardPicker from '../CardPicker.jsx';
import { apiFetch as defaultApiFetch } from '../../lib/api.js';

// Board slot ordering: 3 flop slots + turn + river.
const BOARD_SLOTS = ['flop1', 'flop2', 'flop3', 'turn', 'river'];

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
function holeToShort(hole) {
  if (!Array.isArray(hole) || hole.length < 2 || !hole[0] || !hole[1]) return '';
  const r1 = hole[0][0];
  const r2 = hole[1][0];
  const s1 = hole[0][1];
  const s2 = hole[1][1];
  if (r1 === r2) return `${r1}${r2}`;
  const suited = s1 === s2 ? 's' : 'o';
  // Standard order: high rank first. Rough rank order.
  const order = '23456789TJQKA';
  const hi = order.indexOf(r1) >= order.indexOf(r2) ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  return `${hi}${lo}${suited}`;
}

// Auto-generated name: "AKo on K72r". Falls back to "Hand #abc123".
export function autoName({ hole, board, handId }) {
  const h = holeToShort(hole);
  const flop = [board?.flop1, board?.flop2, board?.flop3].filter(Boolean);
  if (h && flop.length === 3) {
    const ranks = flop.map((c) => c[0]).join('');
    const tex = flopTexture(flop);
    return `${h} on ${ranks}${tex}`;
  }
  if (h) return `${h} — Hand #${String(handId || '').slice(0, 6)}`;
  return `Hand #${String(handId || '').slice(0, 6)}`;
}

// Match existing hand tags against playlist names to pick a default playlist.
function guessPlaylistId(playlists, tags) {
  if (!Array.isArray(playlists) || playlists.length === 0) return null;
  if (!Array.isArray(tags) || tags.length === 0) return playlists[0]?.playlist_id ?? null;
  const lowerTags = tags.map((t) => String(t).toLowerCase());
  for (const pl of playlists) {
    const name = String(pl.name || '').toLowerCase();
    if (lowerTags.some((tag) => name.includes(tag.replace(/_/g, ' ')) || name.includes(tag))) {
      return pl.playlist_id;
    }
  }
  return playlists[0]?.playlist_id ?? null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SaveAsScenarioModal({
  hand,            // { hand_id, board: [...], players: [{hole_cards, player_id}], hand_tags?, tags? }
  heroPlayerId,    // optional — which seat's hole cards to use; defaults to first non-empty
  onClose,
  onSaved,         // called with saved scenario after success
  apiFetch = defaultApiFetch,
}) {
  // ── Extract hole cards (read-only) ─────────────────────────────────────────
  const hole = useMemo(() => {
    if (!hand?.players) return [];
    const filled = hand.players.filter(
      (p) => Array.isArray(p.hole_cards) && p.hole_cards.length === 2 && p.hole_cards[0] && p.hole_cards[1]
    );
    if (filled.length === 0) return [];
    if (heroPlayerId) {
      const match = filled.find((p) => p.player_id === heroPlayerId);
      if (match) return match.hole_cards;
    }
    return filled[0].hole_cards;
  }, [hand, heroPlayerId]);

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
    autoName({ hole, board: boardFromArray(hand?.board), handId: hand?.hand_id })
  );

  // ── Playlists ──────────────────────────────────────────────────────────────
  const [playlists, setPlaylists]         = useState([]);
  const [playlistId, setPlaylistId]       = useState(null);
  const [loadingPls, setLoadingPls]       = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/playlists')
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res?.playlists ?? []);
        setPlaylists(list);
        setPlaylistId(guessPlaylistId(list, tags));
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPls(false);
      });
    return () => { cancelled = true; };
  }, [apiFetch, tags]);

  const colorMap = useMemo(() => {
    const m = {};
    playlists.forEach((pl, i) => { m[pl.playlist_id] = generatePlaylistColor(i); });
    return m;
  }, [playlists]);

  // ── Card picker for board edits ────────────────────────────────────────────
  const [pickerSlot, setPickerSlot] = useState(null);

  const usedCards = useMemo(() => {
    const used = new Set();
    if (Array.isArray(hole)) hole.forEach((c) => c && used.add(c));
    BOARD_SLOTS.forEach((s) => {
      if (s !== pickerSlot && board[s]) used.add(board[s]);
    });
    return used;
  }, [hole, board, pickerSlot]);

  const handleSlotPick = useCallback((card) => {
    setBoard((prev) => ({ ...prev, [pickerSlot]: card }));
  }, [pickerSlot]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const handleSave = useCallback(async () => {
    if (!hand?.hand_id) return;
    setSaving(true);
    setSaveError(null);
    try {
      // 1. Create scenario from the hand (server handles seat_configs extraction).
      const scenario = await apiFetch('/api/scenarios/from-hand', {
        method: 'POST',
        body: JSON.stringify({ hand_id: hand.hand_id, include_board: true }),
      });
      // 2. PATCH to apply name / board / playlist edits.
      const patchBody = {
        name: name.trim() || scenario.name,
        ...boardToPatch(board),
        primary_playlist_id: playlistId ?? null,
      };
      const updated = await apiFetch(`/api/scenarios/${encodeURIComponent(scenario.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody),
      });
      // 3. Link the scenario to the selected playlist (explicit playlist_items row).
      if (playlistId) {
        await apiFetch(`/api/playlists/${encodeURIComponent(playlistId)}/items`, {
          method: 'POST',
          body: JSON.stringify({ scenario_id: updated.id }),
        });
      }
      onSaved?.(updated);
      onClose?.();
    } catch (err) {
      setSaveError(err?.message || 'Failed to save scenario');
    } finally {
      setSaving(false);
    }
  }, [apiFetch, hand, name, board, playlistId, onClose, onSaved]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const selectedPlaylist = playlists.find((pl) => pl.playlist_id === playlistId);

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
          width: '100%', maxWidth: 520,
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
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hole cards (read-only) */}
          <div>
            <Label>Hole Cards</Label>
            <div data-testid="modal-hole-cards" style={{ display: 'flex', gap: 6 }}>
              {hole.length === 2 ? (
                hole.map((c, i) => <CardChip key={`${c}-${i}`} card={c} />)
              ) : (
                <span style={{ fontSize: 12, color: colors.textMuted }}>No hole cards available</span>
              )}
            </div>
          </div>

          {/* Board (editable) */}
          <div>
            <Label>Board</Label>
            <div data-testid="modal-board" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {BOARD_SLOTS.map((slot, i) => (
                <BoardSlot
                  key={slot}
                  slot={slot}
                  card={board[slot]}
                  label={i < 3 ? `Flop ${i + 1}` : i === 3 ? 'Turn' : 'River'}
                  onClick={() => setPickerSlot(slot)}
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
          background: colors.bgSurface,
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
      {pickerSlot && (
        <CardPicker
          usedCards={usedCards}
          onSelect={handleSlotPick}
          onClose={() => setPickerSlot(null)}
          title={`Pick card for ${pickerSlot}`}
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

function CardChip({ card }) {
  const red = card && (card[1] === 'h' || card[1] === 'd');
  return (
    <div
      style={{
        width: 42, height: 54, borderRadius: 4,
        background: colors.bgSurfaceRaised,
        border: `1px solid ${colors.borderStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 15, fontWeight: 700,
        color: red ? colors.error : colors.textPrimary,
      }}
    >
      {formatCardLabel(card)}
    </div>
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

function formatCardLabel(card) {
  if (!card || card.length < 2) return '';
  const rank = card[0] === 'T' ? '10' : card[0];
  const suitMap = { h: '♥', d: '♦', s: '♠', c: '♣' };
  return `${rank}${suitMap[card[1]] ?? card[1]}`;
}
