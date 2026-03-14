/**
 * GameManager — core state machine for one poker table.
 *
 * TableState schema:
 * {
 *   table_id, mode ('rng'|'manual'|'hybrid'), phase ('waiting'|'preflop'|'flop'|'turn'|'river'|'showdown'),
 *   paused, players[], board[], pot, current_bet, min_raise,
 *   current_turn (socketId), dealer_seat (index into non-coach players array),
 *   small_blind, big_blind, deck[], winner (socketId|null),
 *   history[], street_snapshots[],
 *   config_phase (boolean), config (HandConfiguration|null),
 *   _full_board (string[]|null) — internal: full 5-card resolved board when config used
 * }
 *
 * Player schema:
 * {
 *   id, name, seat, stack, hole_cards[], current_bet, total_bet_this_round,
 *   action ('waiting'|'folded'|'checked'|'called'|'raised'|'all-in'),
 *   is_active, is_dealer, is_small_blind, is_big_blind, is_all_in, is_coach
 * }
 */

const { createDeck, shuffleDeck, isValidCard, getUsedCards } = require('./Deck');
const { generateHand } = require('./HandGenerator');
const { evaluate, compareHands } = require('./HandEvaluator');
const { buildSidePots } = require('./SidePotCalculator');

class GameManager {
  constructor(tableId) {
    this.tableId = tableId;
    this._initState();
  }

  _initState() {
    this.state = {
      table_id: this.tableId,
      mode: 'rng',
      phase: 'waiting',
      paused: false,
      players: [],
      board: [],
      pot: 0,
      current_bet: 0,
      min_raise: 20,
      current_turn: null,
      dealer_seat: 0,
      small_blind: 10,
      big_blind: 20,
      deck: [],
      winner: null,
      winner_name: null,
      notifications: [],
      history: [],         // action-level snapshots (for general undo)
      street_snapshots: [], // street-level snapshots (for rollback-street)
      config_phase: false,
      config: null,
      _full_board: null,   // internal: stores all 5 resolved board cards when config is used
      showdown_result: null,
      side_pots: [],       // SidePot[] built at showdown when ≥1 player is all-in
      last_raise_was_full: true,  // false when last raise was an incomplete all-in (< min raise)
      last_aggressor: null,       // player id of the last player who raised
      playlist_mode: {
        active: false,
        playlistId: null,
        currentIndex: 0,
        hands: []   // array of { hand_id, display_order } loaded when playlist activated
      },
      is_scenario: false,
    };
  }

  // ─────────────────────────────────────────────
  //  Public state (hide opponents' cards)
  // ─────────────────────────────────────────────
  getPublicState(requesterId, isCoach) {
    const s = this.state;
    const players = s.players.map(p => {
      // Coach sees everything. Showdown reveals everything.
      if (isCoach || p.id === requesterId || s.phase === 'showdown') {
        return { ...p };
      }
      return {
        ...p,
        hole_cards: p.hole_cards.map(() => 'HIDDEN')
      };
    });

    // Determine how many board cards to expose based on phase (simpler alternative)
    const visibleCountMap = {
      waiting: 0,
      preflop: 0,
      flop: 3,
      turn: 4,
      river: 5,
      showdown: 5
    };
    const visibleCount = visibleCountMap[s.phase] !== undefined ? visibleCountMap[s.phase] : s.board.length;

    // When a full board is stored internally, expose only the street-appropriate slice
    let boardToExpose;
    if (s._full_board) {
      boardToExpose = s._full_board.slice(0, visibleCount);
    } else {
      boardToExpose = [...s.board];
    }

    // Sanitise config for non-coach requesters: hide other players' hole_cards
    let sanitisedConfig = null;
    if (s.config !== null) {
      if (isCoach) {
        sanitisedConfig = s.config;
      } else {
        sanitisedConfig = {
          ...s.config,
          hole_cards: {}
        };
      }
    }

    return {
      table_id: s.table_id,
      mode: s.mode,
      phase: s.phase,
      paused: s.paused,
      players,
      board: boardToExpose,
      pot: s.pot,
      current_bet: s.current_bet,
      min_raise: s.min_raise,
      current_turn: s.current_turn,
      dealer_seat: s.dealer_seat,
      small_blind: s.small_blind,
      big_blind: s.big_blind,
      winner: s.winner,
      winner_name: s.winner_name,
      can_undo: s.history.length > 0,
      can_rollback_street: s.street_snapshots.length > 0,
      config_phase: s.config_phase,
      config: sanitisedConfig,
      showdown_result: s.showdown_result,
      side_pots: s.side_pots,
      playlist_mode: {
        active: s.playlist_mode.active,
        playlistId: s.playlist_mode.playlistId,
        currentIndex: s.playlist_mode.currentIndex,
        totalHands: s.playlist_mode.hands.length
      },
      is_scenario: s.is_scenario,
    };
  }

  // ─────────────────────────────────────────────
  //  Player management
  // ─────────────────────────────────────────────
  addPlayer(socketId, name, isCoach = false, playAtTable = false) {
    if (this.state.players.find(p => p.id === socketId)) {
      return { error: 'Already in this table' };
    }
    // Coaches sit out by default (seat = -1, observer only).
    // Pass playAtTable=true to give the coach a real seat so they also play.
    const seat = (isCoach && !playAtTable) ? -1 : this._nextAvailableSeat();
    if (seat === null) return { error: 'Table is full (max 9 players)' };

    const player = {
      id: socketId,
      name,
      seat,
      stack: 1000,
      hole_cards: [],
      current_bet: 0,
      total_bet_this_round: 0,
      total_contributed: 0,
      action: 'waiting',
      is_active: true,
      is_dealer: false,
      is_small_blind: false,
      is_big_blind: false,
      is_all_in: false,
      is_coach: isCoach,
      acted_this_street: false
    };

    this.state.players.push(player);
    return { success: true, player };
  }

  removePlayer(socketId) {
    this.state.players = this.state.players.filter(p => p.id !== socketId);
  }

  _nextAvailableSeat() {
    const taken = new Set(this.state.players.filter(p => p.seat >= 0).map(p => p.seat));
    for (let i = 0; i < 9; i++) {
      if (!taken.has(i)) return i;
    }
    return null;
  }

  _gamePlayers() {
    return this.state.players.filter(p => p.seat >= 0);
  }

  // ─────────────────────────────────────────────
  //  History / Undo
  // ─────────────────────────────────────────────
  _saveSnapshot(type = 'action') {
    const snap = JSON.parse(JSON.stringify(this.state));
    // Don't nest histories inside snapshots
    snap.history = [];
    snap.street_snapshots = [];
    // Don't embed the hands array in snapshots (it can be large)
    if (snap.playlist_mode) snap.playlist_mode = { ...snap.playlist_mode, hands: [] };

    if (type === 'street') {
      this.state.street_snapshots.push(snap);
      if (this.state.street_snapshots.length > 5) this.state.street_snapshots.shift();
    } else {
      this.state.history.push(snap);
      if (this.state.history.length > 30) this.state.history.shift();
    }
  }

  undoAction() {
    if (this.state.history.length === 0) return { error: 'Nothing to undo' };
    const prev = this.state.history.pop();
    const history = this.state.history;
    const street_snapshots = this.state.street_snapshots;
    const playlistHands = this.state.playlist_mode?.hands ?? [];
    this.state = {
      ...prev,
      history,
      street_snapshots,
      playlist_mode: { ...prev.playlist_mode, hands: playlistHands }
    };
    return { success: true };
  }

  rollbackStreet() {
    if (this.state.street_snapshots.length === 0) return { error: 'No previous street to roll back to' };
    const prev = this.state.street_snapshots.pop();
    const history = this.state.history;
    const street_snapshots = this.state.street_snapshots;
    const playlistHands = this.state.playlist_mode?.hands ?? [];
    this.state = {
      ...prev,
      history,
      street_snapshots,
      playlist_mode: { ...prev.playlist_mode, hands: playlistHands }
    };
    return { success: true };
  }

  // ─────────────────────────────────────────────
  //  CONFIG_PHASE methods
  // ─────────────────────────────────────────────

  /**
   * openConfigPhase — coach calls this to enter config mode before startGame.
   * Initialises a default hybrid HandConfiguration.
   */
  openConfigPhase() {
    this.state.config_phase = true;
    this.state.config = {
      mode: 'hybrid',
      hole_cards: {},
      board: [null, null, null, null, null]
    };
    return { success: true };
  }

  /**
   * updateHandConfig — coach updates the active hand configuration.
   * Validates mode; stores config in state.
   * @param {Object} config - HandConfiguration object
   */
  updateHandConfig(config) {
    const validModes = ['rng', 'manual', 'hybrid'];
    if (!config || !validModes.includes(config.mode)) {
      return { error: `config.mode must be one of: ${validModes.join(', ')}` };
    }
    // Store the config as-is. Duplicate card / invalid card validation is deferred
    // to startGame() → generateHand(), which returns a descriptive error without
    // mutating game state. This keeps updateHandConfig lightweight and lets the
    // coach fix card assignments without leaving the table in an error state.
    this.state.config = config;
    return { success: true };
  }

  /**
   * activatePlaylistMode({ playlistId, hands })
   * hands: array of { hand_id, display_order } from HandLogger.getPlaylistHands()
   */
  activatePlaylistMode({ playlistId, hands }) {
    if (!playlistId || !Array.isArray(hands) || hands.length === 0) {
      return { error: 'playlistId and a non-empty hands array are required' };
    }
    this.state.playlist_mode = {
      active: true,
      playlistId,
      currentIndex: 0,
      hands
    };
    return { success: true, totalHands: hands.length };
  }

  deactivatePlaylistMode() {
    this.state.playlist_mode = { active: false, playlistId: null, currentIndex: 0, hands: [] };
    return { success: true };
  }

  /**
   * advancePlaylist()
   * Increments the playlist index. Returns { done: true } when list exhausted.
   */
  advancePlaylist() {
    const pm = this.state.playlist_mode;
    if (!pm.active) return { error: 'Playlist mode is not active' };
    const nextIndex = pm.currentIndex + 1;
    if (nextIndex >= pm.hands.length) {
      // Auto-deactivate when playlist ends
      this.deactivatePlaylistMode();
      return { done: true };
    }
    pm.currentIndex = nextIndex;
    return { done: false, currentIndex: nextIndex, hand: pm.hands[nextIndex] };
  }

  // ─────────────────────────────────────────────
  //  Game lifecycle
  // ─────────────────────────────────────────────
  startGame(mode = 'rng') {
    const players = this._gamePlayers();
    if (players.length < 2) return { error: 'Need at least 2 seated players to start' };

    // Validate config BEFORE mutating any state, so a bad config returns an error
    // without leaving the table in a broken phase.
    const hasConfig = this.state.config_phase && this.state.config !== null;
    const configMode = hasConfig ? this.state.config.mode : null;
    let handResult = null;

    if (hasConfig && configMode !== 'rng') {
      const config = this.state.config;
      const generatorConfig = {
        mode: config.mode,
        holeCards: config.hole_cards || {},
        board: Array.isArray(config.board) && config.board.length === 5
          ? config.board
          : [null, null, null, null, null]
      };
      // generateHand now returns { hand: {...} } on success or { error } on failure
      let genResult;
      try {
        genResult = generateHand(generatorConfig, players);
      } catch (err) {
        return { error: `Hand generation failed: ${err.message}` };
      }
      if (genResult.error) {
        return { error: `Hand generation failed: ${genResult.error}` };
      }
      handResult = genResult.hand;
    }

    this._saveSnapshot('action');

    this.state.mode = mode;
    this.state.phase = 'preflop';
    this.state.board = [];
    this.state._full_board = null;
    this.state.pot = 0;
    this.state.winner = null;
    this.state.winner_name = null;
    this.state.showdown_result = null;
    this.state.side_pots = [];
    this.state.paused = false;
    this.state.street_snapshots = [];

    // Reset all players
    players.forEach(p => {
      p.hole_cards = [];
      p.current_bet = 0;
      p.total_bet_this_round = 0;
      p.total_contributed = 0;
      p.action = 'waiting';
      p.is_active = true;
      p.is_all_in = false;
      p.is_dealer = false;
      p.is_small_blind = false;
      p.is_big_blind = false;
      p.acted_this_street = false;
    });

    this.state.last_raise_was_full = true;
    this.state.last_aggressor = null;

    // Assign positions
    const dealerIdx = this.state.dealer_seat % players.length;
    const sbIdx = (dealerIdx + 1) % players.length;
    const bbIdx = (dealerIdx + 2) % players.length;

    players[dealerIdx].is_dealer = true;
    players[sbIdx].is_small_blind = true;
    players[bbIdx].is_big_blind = true;

    this._postBlind(players[sbIdx], this.state.small_blind);
    this._postBlind(players[bbIdx], this.state.big_blind);

    this.state.current_bet = this.state.big_blind;
    this.state.min_raise = this.state.big_blind;

    // UTG acts first preflop
    const utgIdx = (bbIdx + 1) % players.length;
    this.state.current_turn = players[utgIdx].id;

    if (handResult) {
      // Config mode (manual or hybrid): handResult already validated above.
      players.forEach(p => {
        const cards = handResult.playerCards[p.id];
        p.hole_cards = cards || [handResult.deck.pop(), handResult.deck.pop()];
      });
      this.state._full_board = handResult.board;
      this.state.board = [];
      this.state.deck = handResult.deck;
      this.state.is_scenario = (this.state.config !== null);
      this.state.config_phase = false;
      this.state.config = null;
    } else {
      // RNG mode (or config with mode='rng'): deal randomly.
      this.state.deck = shuffleDeck(createDeck());
      players.forEach(p => {
        p.hole_cards = [this.state.deck.pop(), this.state.deck.pop()];
      });
      if (hasConfig) {
        this.state.is_scenario = (this.state.config !== null);
        this.state.config_phase = false;
        this.state.config = null;
      } else {
        this.state.is_scenario = false;
      }
    }

    return { success: true };
  }

  _postBlind(player, amount) {
    const paid = Math.min(amount, player.stack);
    player.stack -= paid;
    player.current_bet = paid;
    player.total_bet_this_round = paid;
    player.total_contributed += paid;
    this.state.pot += paid;
    if (player.stack === 0) {
      player.is_all_in = true;
      player.action = 'all-in';
    }
  }

  // ─────────────────────────────────────────────
  //  Betting
  // ─────────────────────────────────────────────
  placeBet(playerId, action, amount = 0) {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.state.phase)) {
      return { error: 'No active betting round' };
    }
    if (this.state.paused) return { error: 'Game is paused' };
    if (this.state.current_turn !== playerId) return { error: 'Not your turn' };

    const player = this.state.players.find(p => p.id === playerId);
    if (!player || !player.is_active) return { error: 'Invalid player state' };

    this._saveSnapshot('action');

    const toCall = this.state.current_bet - player.total_bet_this_round;

    switch (action) {
      case 'fold':
        player.action = 'folded';
        player.is_active = false;
        break;

      case 'check':
        if (toCall > 0) return { error: `Must call ${toCall} or raise (cannot check)` };
        player.action = 'checked';
        break;

      case 'call': {
        const callAmt = Math.min(toCall, player.stack);
        player.stack -= callAmt;
        player.total_bet_this_round += callAmt;
        player.total_contributed += callAmt;
        player.current_bet = player.total_bet_this_round;
        this.state.pot += callAmt;
        player.action = player.stack === 0 ? 'all-in' : 'called';
        if (player.stack === 0) player.is_all_in = true;
        break;
      }

      case 'raise': {
        // Block re-raise if last aggression was an incomplete all-in
        if (!this.state.last_raise_was_full && player.acted_this_street && player.id !== this.state.last_aggressor) {
          return { error: 'Raise not allowed: last aggression was an incomplete all-in. You may call or fold.' };
        }
        const minTotal = this.state.current_bet + this.state.min_raise;
        if (amount < minTotal && amount < player.stack + player.total_bet_this_round) {
          return { error: `Minimum raise to ${minTotal}` };
        }
        const totalToPay = amount - player.total_bet_this_round;
        if (totalToPay > player.stack) return { error: 'Not enough chips' };
        const raiseIncrement = amount - this.state.current_bet;
        const minRaiseIncrement = this.state.min_raise || this.state.big_blind;
        // Only advance min_raise on a full raise — incomplete all-in must not shrink it
        this.state.last_raise_was_full = raiseIncrement >= minRaiseIncrement;
        if (this.state.last_raise_was_full) {
          this.state.min_raise = raiseIncrement;
        }
        this.state.current_bet = amount;
        player.stack -= totalToPay;
        player.total_bet_this_round = amount;
        player.total_contributed += totalToPay;
        player.current_bet = amount;
        this.state.pot += totalToPay;
        player.action = player.stack === 0 ? 'all-in' : 'raised';
        if (player.stack === 0) player.is_all_in = true;
        this.state.last_aggressor = player.id;
        // Re-open action only if this was a full raise
        if (this.state.last_raise_was_full) {
          this._gamePlayers().forEach(p => {
            if (p.id !== playerId && p.is_active && !p.is_all_in && p.total_bet_this_round < amount) {
              p.action = 'waiting';
            }
          });
        }
        break;
      }

      default:
        return { error: 'Unknown action' };
    }

    // Mark player as having acted this street (used for under-raise all-in re-raise blocking)
    player.acted_this_street = true;

    const activePlayers = this._gamePlayers().filter(p => p.is_active);
    if (activePlayers.length === 1) {
      this.state.winner = activePlayers[0].id;
      this.state.winner_name = activePlayers[0].name;
      activePlayers[0].stack += this.state.pot;
      this.state.pot = 0;
      this.state.phase = 'showdown';
      this.state.current_turn = null;
      return { success: true };
    }

    if (this._isBettingRoundOver()) {
      this._advanceStreet();
    } else {
      this._nextTurn(playerId);
    }

    return { success: true };
  }

  _isBettingRoundOver() {
    const active = this._gamePlayers().filter(p => p.is_active && !p.is_all_in);
    if (active.length === 0) return true;
    return active.every(
      p => p.action !== 'waiting' && p.total_bet_this_round >= this.state.current_bet
    );
  }

  _nextTurn(fromId) {
    const players = this._gamePlayers();
    const currentIdx = players.findIndex(p => p.id === fromId);
    const n = players.length;
    for (let i = 1; i <= n; i++) {
      const p = players[(currentIdx + i) % n];
      if (p.is_active && !p.is_all_in) {
        this.state.current_turn = p.id;
        return;
      }
    }
    // Everyone all-in or folded — advance street
    this._advanceStreet();
  }

  _resolveShowdown() {
    const activePlayers = this._gamePlayers().filter(p => p.is_active);
    const allPlayers = this._gamePlayers();

    // Use the full board if available (config mode), otherwise use state.board
    const board = (this.state._full_board && this.state._full_board.length === 5)
      ? this.state._full_board
      : this.state.board;

    // Evaluate each active player's hand once
    const handMap = {};
    activePlayers.forEach(p => {
      handMap[p.id] = evaluate(p.hole_cards, board);
    });

    // Build all-hands list (sorted best → worst) for ShowdownResult
    const evaluatedAll = activePlayers
      .map(p => ({ player: p, handResult: handMap[p.id] }))
      .sort((a, b) => compareHands(b.handResult, a.handResult));

    const sidePots = buildSidePots(allPlayers);

    if (sidePots.length > 0) {
      // ── Multi-pot path ───────────────────────────────────────────────────────
      const sidePotResults = [];
      let totalAwarded = 0;

      for (const pot of sidePots) {
        const eligible = activePlayers.filter(p => pot.eligiblePlayerIds.includes(p.id));
        if (eligible.length === 0) continue;

        const ranked = eligible
          .map(p => ({ player: p, handResult: handMap[p.id] }))
          .sort((a, b) => compareHands(b.handResult, a.handResult));

        const best = ranked[0].handResult;
        const potWinners = ranked.filter(e => compareHands(e.handResult, best) === 0);

        const share = Math.floor(pot.amount / potWinners.length);
        const remainder = pot.amount - share * potWinners.length;
        const sortedPotWinners = this._sortWinnersBySBProximity(potWinners);
        sortedPotWinners.forEach((e, idx) => {
          e.player.stack += share + (idx === 0 ? remainder : 0);
        });
        totalAwarded += pot.amount;

        sidePotResults.push({
          potAmount: pot.amount,
          eligiblePlayerIds: pot.eligiblePlayerIds,
          winners: sortedPotWinners.map((e, idx) => ({
            playerId: e.player.id,
            playerName: e.player.name,
            handResult: e.handResult,
            potAwarded: share + (idx === 0 ? remainder : 0)
          }))
        });
      }

      this.state.pot = 0;
      this.state.side_pots = sidePots;

      // Top-level winners = winners of the last (main) pot
      const mainPotWinners = sidePotResults[sidePotResults.length - 1]?.winners ?? [];

      this.state.showdown_result = {
        winners: mainPotWinners.map(w => ({
          playerId: w.playerId,
          playerName: w.playerName,
          handResult: w.handResult
        })),
        allHands: evaluatedAll.map(e => ({
          playerId: e.player.id,
          playerName: e.player.name,
          handResult: e.handResult
        })),
        potAwarded: totalAwarded,
        splitPot: mainPotWinners.length > 1,
        sidePotResults
      };

      // Backwards-compat
      this.state.winner = mainPotWinners[0]?.playerId ?? null;
      this.state.winner_name = mainPotWinners[0]?.playerName ?? null;

    } else {
      // ── Single-pot path (no all-in players) ─────────────────────────────────
      const totalPot = this.state.pot;

      const best = evaluatedAll[0].handResult;
      const winnerEntries = evaluatedAll.filter(e => compareHands(e.handResult, best) === 0);

      const share = Math.floor(totalPot / winnerEntries.length);
      const remainder = totalPot - share * winnerEntries.length;
      const sortedWinners = this._sortWinnersBySBProximity(winnerEntries);
      sortedWinners.forEach((e, idx) => {
        e.player.stack += share + (idx === 0 ? remainder : 0);
      });
      this.state.pot = 0;

      this.state.showdown_result = {
        winners: winnerEntries.map(e => ({
          playerId: e.player.id,
          playerName: e.player.name,
          handResult: e.handResult
        })),
        allHands: evaluatedAll.map(e => ({
          playerId: e.player.id,
          playerName: e.player.name,
          handResult: e.handResult
        })),
        potAwarded: totalPot,
        splitPot: winnerEntries.length > 1
      };

      this.state.winner = sortedWinners[0].player.id;
      this.state.winner_name = sortedWinners[0].player.name;
    }
  }

  _advanceStreet() {
    this._saveSnapshot('street');

    const activePlayers = this._gamePlayers().filter(p => p.is_active);
    if (activePlayers.length === 1) {
      this.state.winner = activePlayers[0].id;
      this.state.winner_name = activePlayers[0].name;
      activePlayers[0].stack += this.state.pot;
      this.state.pot = 0;
      this.state.phase = 'showdown';
      this.state.current_turn = null;
      return;
    }

    // Reset per-street betting state
    this.state.current_bet = 0;
    this.state.min_raise = this.state.big_blind;
    this.state.last_raise_was_full = true;
    this.state.last_aggressor = null;
    this._gamePlayers().forEach(p => {
      if (p.is_active) {
        p.action = 'waiting';
        p.current_bet = 0;
        p.total_bet_this_round = 0;
        p.acted_this_street = false;
      }
    });

    const phaseOrder = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const nextPhase = phaseOrder[phaseOrder.indexOf(this.state.phase) + 1];

    if (nextPhase === 'showdown') {
      // Save the action-level snapshot BEFORE transitioning phase, so the snapshot
      // captures the end-of-river state (phase=river, pot intact, stacks pre-award).
      // undoAction() can then fully revert showdown resolution back to that state.
      this._saveSnapshot('action');
      this.state.phase = nextPhase;
      this.state.current_turn = null;
      this._resolveShowdown();
      return;
    }

    this.state.phase = nextPhase;

    // Deal board cards
    if (this.state._full_board) {
      // Config mode: reveal cards from the pre-resolved full board street by street.
      // board array is built up incrementally as streets advance.
      if (nextPhase === 'flop') {
        this.state.board = [
          this.state._full_board[0],
          this.state._full_board[1],
          this.state._full_board[2]
        ];
      } else if (nextPhase === 'turn') {
        this.state.board = [
          this.state._full_board[0],
          this.state._full_board[1],
          this.state._full_board[2],
          this.state._full_board[3]
        ];
      } else if (nextPhase === 'river') {
        this.state.board = [
          this.state._full_board[0],
          this.state._full_board[1],
          this.state._full_board[2],
          this.state._full_board[3],
          this.state._full_board[4]
        ];
      }
    } else if (this.state.mode === 'rng') {
      // RNG mode: draw from deck as before
      if (nextPhase === 'flop') {
        this.state.board = [this.state.deck.pop(), this.state.deck.pop(), this.state.deck.pop()];
      } else if (nextPhase === 'turn' || nextPhase === 'river') {
        this.state.board.push(this.state.deck.pop());
      }
    }

    // First to act: first active player left of dealer
    const players = this._gamePlayers();
    const dealerIdx = players.findIndex(p => p.is_dealer);
    for (let i = 1; i <= players.length; i++) {
      const p = players[(dealerIdx + i) % players.length];
      if (p.is_active && !p.is_all_in) {
        this.state.current_turn = p.id;
        return;
      }
    }
  }

  // Coach: force advance to next street without completing betting
  forceNextStreet() {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.state.phase)) {
      return { error: 'Not in a betting phase' };
    }
    this._saveSnapshot('street');
    this._advanceStreet();
    return { success: true };
  }

  // ─────────────────────────────────────────────
  //  Manual card injection (Coach)
  // ─────────────────────────────────────────────
  manualDealCard(targetType, targetId, position, card) {
    if (!isValidCard(card)) return { error: `"${card}" is not a valid card (e.g. Ah, Kd, Ts)` };

    const used = getUsedCards(this.state);

    // Remove the card that currently occupies this slot so we allow replacing it
    if (targetType === 'player') {
      const player = this.state.players.find(p => p.id === targetId);
      if (!player) return { error: 'Player not found' };
      const existing = player.hole_cards[position];
      if (existing === card) return { success: true }; // idempotent — same card already in slot
      if (existing && existing !== 'HIDDEN') used.delete(existing);
    } else if (targetType === 'board') {
      const existing = this.state.board[position];
      if (existing === card) return { success: true }; // idempotent
      if (existing) used.delete(existing);
    }

    if (used.has(card)) return { error: `${card} is already dealt — duplicate card` };

    this._saveSnapshot('action');

    if (targetType === 'player') {
      const player = this.state.players.find(p => p.id === targetId);
      while (player.hole_cards.length <= position) player.hole_cards.push(null);
      player.hole_cards[position] = card;
    } else if (targetType === 'board') {
      while (this.state.board.length <= position) this.state.board.push(null);
      this.state.board[position] = card;
    }

    return { success: true };
  }

  // ─────────────────────────────────────────────
  //  Coach controls
  // ─────────────────────────────────────────────
  togglePause() {
    this.state.paused = !this.state.paused;
    return { success: true, paused: this.state.paused };
  }

  setMode(mode) {
    if (!['rng', 'manual'].includes(mode)) return { error: 'Invalid mode' };
    this._saveSnapshot('action');
    this.state.mode = mode;
    return { success: true };
  }

  setBlindLevels(sb, bb) {
    if (sb <= 0 || bb <= 0 || bb < sb * 2) return { error: 'Invalid blind levels' };
    this.state.small_blind = sb;
    this.state.big_blind = bb;
    return { success: true };
  }

  awardPot(winnerId) {
    const player = this.state.players.find(p => p.id === winnerId);
    if (!player) return { error: 'Player not found' };
    this._saveSnapshot('action');
    player.stack += this.state.pot;
    this.state.pot = 0;
    this.state.winner = winnerId;
    this.state.winner_name = player.name;
    this.state.phase = 'showdown';
    this.state.current_turn = null;
    return { success: true };
  }

  resetForNextHand() {
    this._saveSnapshot('action');
    this.state.dealer_seat =
      (this.state.dealer_seat + 1) % Math.max(1, this._gamePlayers().length);
    const players = this._gamePlayers();
    players.forEach(p => {
      p.hole_cards = [];
      p.current_bet = 0;
      p.total_bet_this_round = 0;
      p.total_contributed = 0;
      p.action = 'waiting';
      p.is_active = true;
      p.is_all_in = false;
      p.is_dealer = false;
      p.is_small_blind = false;
      p.is_big_blind = false;
      p.acted_this_street = false;
    });
    this.state.board = [];
    this.state._full_board = null;
    this.state.pot = 0;
    this.state.current_bet = 0;
    this.state.winner = null;
    this.state.winner_name = null;
    this.state.showdown_result = null;
    this.state.side_pots = [];
    this.state.phase = 'waiting';
    this.state.current_turn = null;
    this.state.street_snapshots = [];
    this.state.config_phase = false;
    this.state.config = null;
    this.state.is_scenario = false;
    return { success: true };
  }

  adjustStack(playerId, amount) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
      return { error: 'Stack amount must be a non-negative number' };
    }
    // During an active betting street, new stack cannot be set below what the player
    // has already committed — that would create a phantom chip deficit.
    const activeBettingPhases = ['preflop', 'flop', 'turn', 'river'];
    if (activeBettingPhases.includes(this.state.phase)) {
      const committed = player.total_bet_this_round || 0;
      if (Math.floor(amount) < committed) {
        return { error: `Stack cannot be set below ${committed} — player has already committed ${committed} chips this street` };
      }
    }
    this._saveSnapshot('action');
    player.stack = Math.floor(amount); // Ensure integer chips
    return { success: true };
  }

  _sortWinnersBySBProximity(winners) {
    const sbPlayer = this._gamePlayers().find(p => p.is_small_blind);
    const sbSeat = sbPlayer ? sbPlayer.seat : 0;
    const allSeats = this._gamePlayers().map(p => p.seat);
    const numSeats = Math.max(...allSeats) + 1;
    return [...winners].sort((a, b) => {
      const distA = (a.player.seat - sbSeat + numSeats) % numSeats;
      const distB = (b.player.seat - sbSeat + numSeats) % numSeats;
      return distA - distB;
    });
  }
}

module.exports = GameManager;
