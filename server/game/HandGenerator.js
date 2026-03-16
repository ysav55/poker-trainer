/**
 * HandGenerator.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the "Fill-the-Gaps" algorithm for hybrid hand generation.
 *
 * HandConfiguration schema — accepts both snake_case (from the Socket API) and
 * camelCase (legacy internal form):
 *
 *   {
 *     hole_cards | holeCards: {
 *       [playerId]: [card | null, card | null]  // null = fill randomly
 *     },
 *     hole_cards_range: {
 *       [playerId]: string  // range notation e.g. "AA-KK, AQs+"
 *     },
 *     board: [card | null, card | null, card | null, card | null, card | null]
 *             // indices 0-2 = flop, 3 = turn, 4 = river; null = fill randomly
 *     board_texture: string[]  // e.g. ["flush_draw","paired"] — constraints on flop
 *   }
 *
 * generateHand(config, players, _deck?) returns one of:
 *   { hand: { playerCards, board, deck } }  — success
 *   { error: string }                       — validation failure
 *
 *   where:
 *     playerCards: { [playerId]: [card, card] }
 *     board:       string[]   — 5-card board
 *     deck:        string[]   — remaining shuffled cards after draw
 *
 * players may be an array of player objects ({ id, ... }) OR plain string IDs.
 * An optional third argument (_deck) is accepted for API compatibility but ignored.
 */

'use strict';

const { createDeck, shuffleDeck, isValidCard, RANKS } = require('./Deck');
const { pickFromRange, validateRange } = require('./RangeParser');

const RANK_INDEX = Object.fromEntries(RANKS.map((r, i) => [r, i]));

// ─────────────────────────────────────────────
//  Board Texture Helpers
// ─────────────────────────────────────────────

/**
 * Check if a 3-card flop satisfies all requested texture constraints.
 * textures: string[] from the plan's supported set.
 */
function flopSatisfiesTexture(flop, textures) {
  if (!textures || textures.length === 0) return true;

  const [c1, c2, c3] = flop;
  const suits = [c1[1], c2[1], c3[1]];
  const ranks = [c1[0], c2[0], c3[0]];
  const rankIdxs = ranks.map(r => RANK_INDEX[r]).sort((a, b) => a - b);

  for (const t of textures) {
    switch (t) {
      // ── Suit texture ──────────────────────────────────────────────────────
      case 'rainbow': {
        if (new Set(suits).size !== 3) return false;
        break;
      }
      case 'flush_draw': {
        // exactly 2 cards share a suit
        const suitCounts = suits.reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {});
        const maxSuit = Math.max(...Object.values(suitCounts));
        if (maxSuit !== 2) return false;
        break;
      }
      case 'monotone': {
        if (new Set(suits).size !== 1) return false;
        break;
      }

      // ── Pair texture ──────────────────────────────────────────────────────
      case 'unpaired': {
        if (new Set(ranks).size !== 3) return false;
        break;
      }
      case 'paired': {
        // exactly one pair (2 ranks the same, 3rd different)
        if (new Set(ranks).size !== 2) return false;
        const rankCounts = ranks.reduce((m, r) => { m[r] = (m[r] || 0) + 1; return m; }, {});
        if (!Object.values(rankCounts).includes(2)) return false;
        break;
      }
      case 'trips': {
        if (new Set(ranks).size !== 1) return false;
        break;
      }

      // ── Connectedness ─────────────────────────────────────────────────────
      case 'connected': {
        // at least 2 cards within 1 rank of each other
        const diffs = [
          rankIdxs[1] - rankIdxs[0],
          rankIdxs[2] - rankIdxs[1],
        ];
        if (!diffs.some(d => d <= 1)) return false;
        break;
      }
      case 'disconnected': {
        // no two cards within 1 rank
        const diffs2 = [
          rankIdxs[1] - rankIdxs[0],
          rankIdxs[2] - rankIdxs[1],
        ];
        if (diffs2.some(d => d <= 1)) return false;
        break;
      }

      // ── High card ─────────────────────────────────────────────────────────
      case 'broadway': {
        const broadwayRanks = new Set(['T', 'J', 'Q', 'K', 'A']);
        if (!ranks.some(r => broadwayRanks.has(r))) return false;
        break;
      }
      case 'low': {
        // all 3 cards rank 9 or lower (index ≤ 7, which is '9' at index 7)
        if (!ranks.every(r => RANK_INDEX[r] <= 7)) return false;
        break;
      }
      case 'ace_high': {
        if (!ranks.includes('A')) return false;
        break;
      }

      default:
        // Unknown texture constraint — ignore
        break;
    }
  }
  return true;
}

/**
 * Validate board_texture array for incompatible combinations.
 * Returns { valid: true } or { valid: false, error: string }.
 */
function validateBoardTexture(textures) {
  if (!textures || textures.length === 0) return { valid: true };

  const suitGroup = ['rainbow', 'flush_draw', 'monotone'];
  const pairGroup = ['unpaired', 'paired', 'trips'];
  const connGroup = ['connected', 'disconnected'];
  const highGroup = ['broadway', 'low', 'ace_high'];

  // At most one from each group (mutually exclusive within group)
  for (const group of [suitGroup, pairGroup, connGroup]) {
    const active = textures.filter(t => group.includes(t));
    if (active.length > 1) {
      return { valid: false, error: `Incompatible board textures: ${active.join(' + ')}` };
    }
  }

  // broadway and low are mutually exclusive (broadway requires T+; low requires ≤9)
  if (textures.includes('broadway') && textures.includes('low'))
    return { valid: false, error: 'broadway and low are incompatible (broadway requires T+ card; low requires all cards ≤9)' };
  // ace_high and low are mutually exclusive (ace is broadway)
  if (textures.includes('ace_high') && textures.includes('low'))
    return { valid: false, error: 'ace_high and low are incompatible' };
  // trips + unpaired, trips + paired are both covered by pairGroup mutual exclusion

  return { valid: true };
}

// ─────────────────────────────────────────────
//  generateHand
// ─────────────────────────────────────────────

/**
 * generateHand
 *
 * @param {Object|null} config   - HandConfiguration (see schema above).
 *                                 If null/undefined, treats every slot as null (full RNG).
 * @param {Array} players        - Player objects ({ id, … }) or plain string IDs.
 * @param {Array} [_deck]        - Ignored; accepted for API compatibility.
 * @returns {{ hand: { playerCards, board, deck } } | { error: string }}
 */
function generateHand(config, players, _deck) {
  // Normalise players: accept string IDs or player objects
  const normPlayers = (players || []).map(p =>
    typeof p === 'string' ? { id: p } : p
  );

  // Normalise config: accept both snake_case (hole_cards) and camelCase (holeCards)
  const normConfig = config ? {
    ...config,
    holeCards:        config.holeCards || config.hole_cards || {},
    holeCardsRange:   config.holeCardsRange || config.hole_cards_range || {},
    boardTexture:     config.boardTexture || config.board_texture || [],
  } : null;

  // ── Validate board_texture before doing any work ──────────────────────────
  if (normConfig?.boardTexture?.length > 0) {
    const tvResult = validateBoardTexture(normConfig.boardTexture);
    if (!tvResult.valid) return { error: tvResult.error };
  }

  // ── Step 0: Resolve player ranges into specific hole cards ────────────────
  //    Range entries are expanded before the Fill-the-Gaps algorithm runs.
  //    Specific hole_cards take precedence over hole_cards_range for a player.
  if (normConfig?.holeCardsRange) {
    // Validate all ranges first
    for (const [playerId, rangeStr] of Object.entries(normConfig.holeCardsRange)) {
      if (!rangeStr) continue;
      const vr = validateRange(rangeStr);
      if (!vr.valid) {
        return { error: `Invalid range for player ${playerId}: ${vr.error}` };
      }
    }

    // Build used-cards set from explicitly pinned hole cards + board
    const earlyUsed = new Set();
    for (const player of normPlayers) {
      const configKey = player.stableId || player.id;
      const slots = normConfig.holeCards[configKey] ?? normConfig.holeCards[player.id];
      if (Array.isArray(slots)) slots.forEach(c => { if (c) earlyUsed.add(c); });
    }
    if (Array.isArray(normConfig.board)) {
      normConfig.board.forEach(c => { if (c) earlyUsed.add(c); });
    }

    // Resolve ranges player-by-player, adding picked cards to usedSet
    for (const player of normPlayers) {
      const configKey = player.stableId || player.id;
      // Skip if player already has specific cards pinned
      const existingSlots = normConfig.holeCards[configKey] ?? normConfig.holeCards[player.id];
      const hasPinned = Array.isArray(existingSlots) &&
        existingSlots.some(c => c !== null && c !== undefined);
      if (hasPinned) continue;

      const rangeStr = normConfig.holeCardsRange[configKey] ?? normConfig.holeCardsRange[player.id];
      if (!rangeStr) continue;

      const picked = pickFromRange(rangeStr, earlyUsed);
      if (!picked) {
        return { error: `Could not find a valid combo from range "${rangeStr}" — all combos conflict with other assigned cards.` };
      }

      // Store as specific hole cards so the normal Fill-the-Gaps uses them
      normConfig.holeCards[configKey] = picked;
      picked.forEach(c => earlyUsed.add(c));
    }
  }

  // ── Step 1: Normalise slots ────────────────────────────────────────────────
  const normalised = _normaliseConfig(normConfig, normPlayers);

  // ── Step 2: Collect all explicitly specified (non-null) cards ─────────────
  const specifiedCards = _collectSpecifiedCards(normalised, normPlayers);

  // ── Step 3: Validate each specified card ──────────────────────────────────
  for (const card of specifiedCards) {
    if (!isValidCard(card)) {
      return {
        error:
          `"${card}" is not a valid card. ` +
          `Cards must be a rank (2-9, T, J, Q, K, A) followed by a suit (h, d, c, s).`
      };
    }
  }

  // ── Step 4: Check for duplicates among specified cards ────────────────────
  const seen = new Set();
  for (const card of specifiedCards) {
    if (seen.has(card)) {
      return {
        error:
          `Card "${card}" appears more than once in the hand configuration. ` +
          `Each card can only be assigned to one slot.`
      };
    }
    seen.add(card);
  }

  // ── Step 5: Build a shuffled deck excluding the specified cards ───────────
  const fullDeck = createDeck(); // 52 cards, deterministic order
  const remainingDeck = shuffleDeck(
    fullDeck.filter(card => !seen.has(card))
  );

  // ── Step 6: Assign hole cards (null slots → draw) ─────────────────────────
  const playerCards = {};
  for (const player of normPlayers) {
    const configKey = player.stableId || player.id;
    const slots = normalised.holeCards[configKey] ?? normalised.holeCards[player.id] ?? [null, null];
    playerCards[configKey] = [
      slots[0] !== null ? slots[0] : remainingDeck[_nextDraw()],
      slots[1] !== null ? slots[1] : remainingDeck[_nextDraw()],
    ];
  }

  // ── Step 7: Assign board cards with optional texture constraint ───────────
  //    If board_texture is requested, attempt up to 100 times to satisfy it.
  const textures = normConfig?.boardTexture ?? [];
  const pinnedBoard = normalised.board; // may have nulls for flop slots

  // Count how many flop slots are pinned
  const flopPinned = [pinnedBoard[0], pinnedBoard[1], pinnedBoard[2]].filter(c => c !== null);
  const needTexture = textures.length > 0 && flopPinned.length < 3; // can only shuffle non-pinned slots

  let board;
  let drawIdx = _drawCount; // track where we are in remainingDeck

  if (needTexture) {
    // Save deck state before board draw so we can retry
    const deckForBoard = remainingDeck.slice(drawIdx);
    let found = false;

    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffled = shuffleDeck(deckForBoard);
      let si = 0;

      const candidate = pinnedBoard.map(slot => slot !== null ? slot : shuffled[si++]);

      // Extract flop (first 3 cards)
      const flop = [candidate[0], candidate[1], candidate[2]];
      if (flop.some(c => c === undefined)) continue; // deck too small? shouldn't happen

      if (flopSatisfiesTexture(flop, textures)) {
        board = candidate;
        // Advance draw index by however many cards we actually drew from deckForBoard
        _drawCount += si;
        found = true;
        break;
      }
    }

    if (!found) {
      return { error: `Cannot satisfy board texture constraints [${textures.join(', ')}] with the remaining deck after ${flopPinned.length} pinned flop card(s).` };
    }
  } else {
    board = pinnedBoard.map(slot => slot !== null ? slot : remainingDeck[_nextDraw()]);
  }

  // Guard: deck exhaustion (should not happen with a valid 52-card scenario)
  const allDealt = Object.values(playerCards).flat().concat(board);
  if (allDealt.includes(null) || allDealt.includes(undefined)) {
    return { error: 'Ran out of cards — check that specified cards are correct.' };
  }

  // ── Step 8: Return result ─────────────────────────────────────────────────
  const deck = remainingDeck.slice(_drawCount); // cards not drawn

  // Return flat properties for backward compatibility with existing callers
  // AND a nested `hand` property for the qa_checklist / new-style API.
  return { playerCards, board, deck, hand: { playerCards, board, deck } };
}

// ─── Draw index (module-scoped per call; reset at start of each generateHand invocation) ───

// We use a closure approach: rewrite generateHand to use a local counter
// (the _nextDraw / _drawCount above are placeholders — see corrected impl below)

// ─── Corrected implementation (replaces the placeholder above) ───────────────

// Actually, let's refactor generateHand to use a proper local draw counter
// instead of module-level state. The version above had _nextDraw references.
// Below is the clean version:

// (The export below points to a corrected closure-based version.)

function generateHandClean(config, players, _deck) {
  const normPlayers = (players || []).map(p =>
    typeof p === 'string' ? { id: p } : p
  );

  const normConfig = config ? {
    ...config,
    holeCards:       config.holeCards || config.hole_cards || {},
    holeCardsRange:  config.holeCardsRange || config.hole_cards_range || {},
    holeCardsCombos: config.holeCardsCombos || config.hole_cards_combos || {},
    boardTexture:    config.boardTexture || config.board_texture || [],
  } : null;

  // Validate board_texture
  if (normConfig?.boardTexture?.length > 0) {
    const tvResult = validateBoardTexture(normConfig.boardTexture);
    if (!tvResult.valid) return { error: tvResult.error };
  }

  // Step 0: resolve ranges / preset combo lists → specific hole cards
  const hasRange  = normConfig?.holeCardsRange  && Object.keys(normConfig.holeCardsRange).length  > 0;
  const hasCombos = normConfig?.holeCardsCombos && Object.keys(normConfig.holeCardsCombos).length > 0;
  if (hasRange || hasCombos) {
    if (hasRange) {
      for (const [pid, rangeStr] of Object.entries(normConfig.holeCardsRange)) {
        if (!rangeStr) continue;
        const vr = validateRange(rangeStr);
        if (!vr.valid) return { error: `Invalid range for player ${pid}: ${vr.error}` };
      }
    }

    const earlyUsed = new Set();
    for (const p of normPlayers) {
      const key = p.stableId || p.id;
      const slots = normConfig.holeCards[key] ?? normConfig.holeCards[p.id];
      if (Array.isArray(slots)) slots.forEach(c => { if (c) earlyUsed.add(c); });
    }
    if (Array.isArray(normConfig.board)) {
      normConfig.board.forEach(c => { if (c) earlyUsed.add(c); });
    }

    for (const p of normPlayers) {
      const key = p.stableId || p.id;
      const existingSlots = normConfig.holeCards[key] ?? normConfig.holeCards[p.id];
      const hasPinned = Array.isArray(existingSlots) && existingSlots.some(c => c !== null && c !== undefined);
      if (hasPinned) continue;

      // Range string takes priority over pre-resolved combo list
      const rangeStr = normConfig.holeCardsRange[key] ?? normConfig.holeCardsRange[p.id];
      if (rangeStr) {
        const picked = pickFromRange(rangeStr, earlyUsed);
        if (!picked) {
          return { error: `Could not find a valid combo from range "${rangeStr}" — all combos conflict with other assigned cards.` };
        }
        normConfig.holeCards[key] = picked;
        picked.forEach(c => earlyUsed.add(c));
        continue;
      }

      // Pre-resolved combo list (from preset tag picker)
      const combosList = normConfig.holeCardsCombos[key] ?? normConfig.holeCardsCombos[p.id];
      if (Array.isArray(combosList) && combosList.length > 0) {
        const available = combosList.filter(([c1, c2]) => !earlyUsed.has(c1) && !earlyUsed.has(c2));
        if (!available.length) {
          return { error: `No available combos for player ${p.name ?? key} — all conflict with other assigned cards.` };
        }
        const picked = available[Math.floor(Math.random() * available.length)];
        normConfig.holeCards[key] = picked;
        picked.forEach(c => earlyUsed.add(c));
      }
    }
  }

  // Step 1: normalise slots
  const normalised = _normaliseConfig(normConfig, normPlayers);

  // Step 2: collect specified cards
  const specifiedCards = _collectSpecifiedCards(normalised, normPlayers);

  // Step 3: validate cards
  for (const card of specifiedCards) {
    if (!isValidCard(card)) {
      return { error: `"${card}" is not a valid card. Cards must be a rank (2-9, T, J, Q, K, A) followed by a suit (h, d, c, s).` };
    }
  }

  // Step 4: check duplicates
  const seen = new Set();
  for (const card of specifiedCards) {
    if (seen.has(card)) {
      return { error: `Card "${card}" appears more than once in the hand configuration. Each card can only be assigned to one slot.` };
    }
    seen.add(card);
  }

  // Step 5: build shuffled remaining deck
  const fullDeck = createDeck();
  const remainingDeck = shuffleDeck(fullDeck.filter(c => !seen.has(c)));
  let drawIdx = 0;
  const drawCard = () => drawIdx < remainingDeck.length ? remainingDeck[drawIdx++] : null;

  // Step 6: assign hole cards
  const playerCards = {};
  for (const p of normPlayers) {
    const key = p.stableId || p.id;
    const slots = normalised.holeCards[key] ?? normalised.holeCards[p.id] ?? [null, null];
    playerCards[key] = [
      slots[0] !== null ? slots[0] : drawCard(),
      slots[1] !== null ? slots[1] : drawCard(),
    ];
  }

  // Step 7: assign board with optional texture
  const textures = normConfig?.boardTexture ?? [];
  const pinnedBoard = normalised.board;
  const flopPinCount = [pinnedBoard[0], pinnedBoard[1], pinnedBoard[2]].filter(c => c !== null).length;
  const needTexture = textures.length > 0 && flopPinCount < 3;

  let board;

  if (needTexture) {
    // Build pool of remaining cards after holes are dealt
    const poolStart = drawIdx;
    const pool = remainingDeck.slice(poolStart);
    let found = false;

    for (let attempt = 0; attempt < 100; attempt++) {
      const shuffledPool = shuffleDeck(pool);
      let si = 0;
      const candidate = pinnedBoard.map(slot => slot !== null ? slot : shuffledPool[si++]);

      if (candidate.some(c => c === undefined || c === null)) continue;

      const flop = [candidate[0], candidate[1], candidate[2]];
      if (flopSatisfiesTexture(flop, textures)) {
        board = candidate;
        // Figure out how many cards were actually drawn from pool
        drawIdx = poolStart + si;
        found = true;
        break;
      }
    }

    if (!found) {
      return { error: `Cannot satisfy board texture [${textures.join(', ')}] with remaining deck after pinned cards.` };
    }
  } else {
    board = pinnedBoard.map(slot => slot !== null ? slot : drawCard());
  }

  // Guard exhaustion
  const allDealt = Object.values(playerCards).flat().concat(board);
  if (allDealt.includes(null) || allDealt.includes(undefined)) {
    return { error: 'Ran out of cards — check that specified cards are correct.' };
  }

  const deck = remainingDeck.slice(drawIdx);
  return { playerCards, board, deck, hand: { playerCards, board, deck } };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _normaliseConfig(config, players) {
  const holeCards = {};

  for (const player of players) {
    const configKey = player.stableId || player.id;
    const raw = config && config.holeCards && (config.holeCards[configKey] ?? config.holeCards[player.id]);
    if (Array.isArray(raw) && raw.length === 2) {
      holeCards[configKey] = [
        raw[0] !== undefined ? raw[0] : null,
        raw[1] !== undefined ? raw[1] : null,
      ];
    } else {
      holeCards[configKey] = [null, null];
    }
  }

  let board;
  if (config && Array.isArray(config.board) && config.board.length === 5) {
    board = config.board.map(slot => (slot !== undefined ? slot : null));
  } else {
    board = [null, null, null, null, null];
  }

  return { holeCards, board };
}

function _collectSpecifiedCards(normalised, players) {
  const cards = [];

  for (const player of players) {
    const configKey = player.stableId || player.id;
    const slots = normalised.holeCards[configKey] ?? normalised.holeCards[player.id];
    for (const slot of (slots ?? [])) {
      if (slot !== null) cards.push(slot);
    }
  }

  for (const slot of normalised.board) {
    if (slot !== null) cards.push(slot);
  }

  return cards;
}

module.exports = { generateHand: generateHandClean, flopSatisfiesTexture, validateBoardTexture };
