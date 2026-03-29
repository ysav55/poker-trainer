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
const { isBettingRoundOver, findNextActingPlayer } = require('./bettingRound');
const { resolve: resolveShowdown, sortBySBProximity } = require('./ShowdownResolver');
const ReplayEngine = require('./ReplayEngine');

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
      min_raise: 10,
      current_turn: null,
      dealer_seat: 0,
      small_blind: 5,
      big_blind: 10,
      deck: [],
      winner: null,
      winner_name: null,
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
      replay_mode: {
        active: false,
        source_hand_id: null,
        actions: [],
        cursor: -1,
        original_hole_cards: {},
        original_board: [],
        original_stacks: {},
        player_meta: {},
        dealer_seat: 0,
        branched: false,
        pre_branch_snapshot: null,
      },
    };
  }

  // ─────────────────────────────────────────────
  //  Public state (hide opponents' cards)
  // ─────────────────────────────────────────────
  getPublicState(requesterId, isCoach) {
    const s = this.state;
    // Coach sees all cards only in non-branched replay (for review) or at showdown.
    // During live play the coach is a regular player and must not see opponents' cards.
    const coachInReview = isCoach && s.replay_mode.active && !s.replay_mode.branched;
    const players = s.players.map(p => {
      if (p.id === requesterId || s.phase === 'showdown' || coachInReview) {
        return { ...p };
      }
      return {
        ...p,
        hole_cards: p.hole_cards.map(() => 'HIDDEN')
      };
    });

    // In non-branched replay restore original hole cards so all clients see the full hand.
    // Skip this in branched mode — shadow players already have their dealt cards.
    // Fix: create a new player object to avoid mutating the mapped array's source.
    if (s.replay_mode.active && !s.replay_mode.branched) {
      players.forEach((p, i) => {
        const cards = s.replay_mode.original_hole_cards[p.stableId];
        if (cards && cards.length > 0) players[i] = { ...p, hole_cards: [...cards] };
      });
    }

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
      replay_mode: {
        active: s.replay_mode.active,
        cursor: s.replay_mode.cursor,
        total_actions: s.replay_mode.actions.length,
        branched: s.replay_mode.branched,
        source_hand_id: s.replay_mode.source_hand_id,
        current_action: s.replay_mode.actions[s.replay_mode.cursor] ?? null,
        // Ghost seat data — exposed during replay so client can render shadow players
        // independently of who is currently seated at the table
        player_meta: s.replay_mode.active ? s.replay_mode.player_meta : {},
        original_hole_cards: s.replay_mode.active ? s.replay_mode.original_hole_cards : {},
      },
      is_replay_branch: s.replay_mode.branched ?? false,
    };
  }

  // ─────────────────────────────────────────────
  //  Player management
  // ─────────────────────────────────────────────
  addPlayer(socketId, name, isCoach = false, stableId = null, stack = null) {
    if (this.state.players.find(p => p.id === socketId)) {
      return { error: 'Already in this table' };
    }
    // Default stack = 100 big blinds (scales with whatever blinds the coach has set)
    const actualStack = stack ?? (this.state.big_blind * 100);
    // Coach always gets a real seat; coach sits at the highest available seat so
    // they appear last and don't occupy the primary player positions.
    const seat = isCoach ? this._nextAvailableSeatForCoach() : this._nextAvailableSeat();
    if (seat === null) return { error: 'Table is full (max 9 players)' };

    const player = {
      id: socketId,
      stableId: stableId || socketId,
      name,
      seat,
      stack: actualStack,
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
      acted_this_street: false,
      in_hand: true,
      disconnected: false,
    };

    this.state.players.push(player);
    return { success: true, player };
  }

  /** Coach-only: exclude or re-include a player from the next hand's hole card deal. */
  setPlayerInHand(playerId, inHand) {
    const player = this.state.players.find(p => p.id === playerId);
    if (!player) return { error: 'Player not found' };
    player.in_hand = inHand;
    return { success: true };
  }

  /** Mark a player as disconnected/reconnected; triggers visual indicator on clients. */
  setPlayerDisconnected(socketId, disconnected) {
    const player = this.state.players.find(p => p.id === socketId);
    if (!player) return { error: 'Player not found' };
    player.disconnected = disconnected;
    return { success: true };
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

  _nextAvailableSeatForCoach() {
    const taken = new Set(this.state.players.filter(p => p.seat >= 0).map(p => p.seat));
    for (let i = 8; i >= 0; i--) {
      if (!taken.has(i)) return i;
    }
    return null;
  }

  _gamePlayers() {
    // In branched replay, only shadow players participate — observers sit out of game logic
    if (this.state.replay_mode?.branched) {
      return this.state.players.filter(p => p.seat >= 0 && p.is_shadow);
    }
    return this.state.players.filter(p => p.seat >= 0);
  }

  // ─────────────────────────────────────────────
  //  Replay helpers — thin wrappers kept for test compatibility
  // ─────────────────────────────────────────────
  _applyReplayAction(action) { ReplayEngine._applyAction(this.state, action); }
  _buildReplayStateAtCursor(cursor) { ReplayEngine._buildStateAtCursor(this.state, cursor); }

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
    // Don't nest the pre_branch_snapshot inside history snapshots (prevents exponential memory growth)
    if (snap.replay_mode) snap.replay_mode = { ...snap.replay_mode, pre_branch_snapshot: null };

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
    const activePhases = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    if (activePhases.includes(this.state.phase)) {
      return { error: 'Cannot open config phase during an active hand' };
    }
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

  /**
   * seekPlaylist(targetIdx)
   * Jump directly to a specific playlist index without iterating through intermediate entries.
   * Used by the server to skip hands with mismatched player counts.
   */
  seekPlaylist(targetIdx) {
    const pm = this.state.playlist_mode;
    if (!pm.active) return { error: 'Playlist mode is not active' };
    const idx = Math.max(0, Math.min(targetIdx, pm.hands.length - 1));
    pm.currentIndex = idx;
    return { done: false, currentIndex: idx, hand: pm.hands[idx] };
  }

  // ─────────────────────────────────────────────
  //  Game lifecycle
  // ─────────────────────────────────────────────
  startGame(mode = 'rng') {
    if (this.state.phase !== 'waiting') {
      return { error: 'Can only start a new hand when waiting between hands' };
    }
    // Clear active non-branched replay state before starting a fresh hand.
    // When branched, keep the replay_mode (pre_branch_snapshot needed for unbranching).
    if (this.state.replay_mode.active && !this.state.replay_mode.branched) {
      this.state.replay_mode = {
        active: false, source_hand_id: null, actions: [], cursor: -1,
        original_hole_cards: {}, original_board: [], original_stacks: {},
        player_meta: {}, dealer_seat: 0, branched: false, pre_branch_snapshot: null,
        playlist_was_active: false,
      };
    }
    // replay_mode.branched already tracks this — no separate flag needed
    const players = this._gamePlayers();
    if (players.length < 2) return { error: 'Need at least 2 seated players to start' };

    const broke = players.filter(p => !p.is_coach && p.stack <= 0);
    if (broke.length > 0) {
      const names = broke.map(p => p.name).join(', ');
      return { error: `Cannot start: ${names} ${broke.length === 1 ? 'has' : 'have'} 0 chips. Use Adjust Stacks to top up.` };
    }

    // Validate config BEFORE mutating any state, so a bad config returns an error
    // without leaving the table in a broken phase.
    const hasConfig = this.state.config_phase && this.state.config !== null;
    const configMode = hasConfig ? this.state.config.mode : null;
    let handResult = null;

    if (hasConfig && configMode !== 'rng') {
      const config = this.state.config;
      const generatorConfig = {
        mode:             config.mode,
        holeCards:        config.hole_cards        || {},
        holeCardsRange:   config.hole_cards_range  || {},
        holeCardsCombos:  config.hole_cards_combos || {},
        boardTexture:     config.board_texture      || [],
        board: Array.isArray(config.board) && config.board.length === 5
          ? config.board
          : [null, null, null, null, null],
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

    // Mark sitting-out players as inactive for this hand
    players.forEach(p => {
      if (p.in_hand === false) {
        p.is_active = false;
        p.action = 'sitting-out';
      }
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

    // UTG acts first preflop — skip any sitting-out players
    let current_turn = null;
    for (let i = 1; i <= players.length; i++) {
      const p = players[(bbIdx + i) % players.length];
      if (p.is_active && !p.is_all_in) { current_turn = p.id; break; }
    }
    this.state.current_turn = current_turn;

    if (handResult) {
      // Config mode (manual or hybrid): handResult already validated above.
      players.forEach(p => {
        if (p.in_hand === false) {
          p.hole_cards = [];
        } else {
          const cards = handResult.playerCards[p.stableId] || handResult.playerCards[p.id];
          p.hole_cards = cards || [handResult.deck.pop(), handResult.deck.pop()];
        }
      });
      this.state._full_board = handResult.board;
      this.state.board = [];
      this.state.deck = handResult.deck;
      this.state.is_scenario = (this.state.config !== null);
      this.state.config_phase = false;
      this.state.config = null;
    } else {
      // RNG mode (or config with mode='rng'): deal randomly.
      // Shadow players in a branched replay receive their original recorded hole cards.
      this.state.deck = shuffleDeck(createDeck());
      players.forEach(p => {
        if (p.in_hand === false) {
          p.hole_cards = [];
        } else if (p.is_shadow && p._original_hole_cards?.length) {
          p.hole_cards = [...p._original_hole_cards];
        } else {
          p.hole_cards = [this.state.deck.pop(), this.state.deck.pop()];
        }
      });
      if (hasConfig) {
        this.state.is_scenario = (this.state.config !== null);
        this.state.config_phase = false;
        this.state.config = null;
      } else {
        this.state.is_scenario = false;
      }
    }

    // Reset in_hand flag for all players after dealing (each hand is a fresh choice)
    players.forEach(p => { p.in_hand = true; });

    // If everyone went all-in just posting blinds, no one has a turn — run the board out now.
    if (this.state.current_turn === null) {
      this._advanceStreet();
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

    const toCall = this.state.current_bet - player.total_bet_this_round;

    switch (action) {
      case 'fold':
        this._saveSnapshot('action'); // before mutations — undo restores pre-fold state
        player.action = 'folded';
        player.is_active = false;
        break;

      case 'check':
        if (toCall > 0) return { error: `Must call ${toCall} or raise (cannot check)` };
        this._saveSnapshot('action'); // after validation, before mutation
        player.action = 'checked';
        break;

      case 'call': {
        this._saveSnapshot('action'); // before mutations
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
        // Validate all raise conditions before touching state
        if (!this.state.last_raise_was_full && player.acted_this_street && player.id !== this.state.last_aggressor) {
          return { error: 'Raise not allowed: last aggression was an incomplete all-in. You may call or fold.' };
        }
        const minTotal = this.state.current_bet + this.state.min_raise;
        if (amount < minTotal && amount < player.stack + player.total_bet_this_round) {
          return { error: `Minimum raise to ${minTotal}` };
        }
        const totalToPay = amount - player.total_bet_this_round;
        if (totalToPay > player.stack) return { error: 'Not enough chips' };
        this._saveSnapshot('action'); // all validation passed — snapshot before mutations
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
    return isBettingRoundOver(active, this.state.current_bet);
  }

  _nextTurn(fromId) {
    const nextId = findNextActingPlayer(this._gamePlayers(), fromId);
    if (nextId) {
      this.state.current_turn = nextId;
    } else {
      // Everyone all-in or folded — advance street
      this._advanceStreet();
    }
  }

  _resolveShowdown() {
    const activePlayers = this._gamePlayers().filter(p => p.is_active);
    const allPlayers    = this._gamePlayers();
    const board = (this.state._full_board && this.state._full_board.length === 5)
      ? this.state._full_board
      : this.state.board;

    const result = resolveShowdown(activePlayers, allPlayers, board, this.state.pot);

    // Apply stack deltas to in-memory player objects
    result.stackDeltas.forEach((delta, playerId) => {
      const p = allPlayers.find(pl => pl.id === playerId);
      if (p) p.stack += delta;
    });

    this.state.pot           = result.pot;
    this.state.side_pots     = result.side_pots;
    this.state.showdown_result = result.showdown_result;
    this.state.winner        = result.winner;
    this.state.winner_name   = result.winner_name;
  }

  _advanceStreet() {
    this._saveSnapshot('street');

    const activePlayers = this._gamePlayers().filter(p => p.is_active);
    if (activePlayers.length === 1) {
      const foldWinner = activePlayers[0];
      this.state.winner = foldWinner.id;
      this.state.winner_name = foldWinner.name;
      this.state.showdown_result = {
        winners: [{ playerId: foldWinner.id, playerName: foldWinner.name, handResult: null }],
        potAwarded: this.state.pot,
        splitPot: false,
        foldWin: true,
      };
      foldWinner.stack += this.state.pot;
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
    } else {
      // Manual mode: coach injects cards via manualDealCard; board stays as-is.
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
    // All remaining active players are all-in — run the board out automatically.
    this.state.current_turn = null;
    this._advanceStreet();
  }

  // Coach: force advance to next street without completing betting
  forceNextStreet() {
    if (!['preflop', 'flop', 'turn', 'river'].includes(this.state.phase)) {
      return { error: 'Not in a betting phase' };
    }
    this._advanceStreet();
    return { success: true };
  }

  // ─────────────────────────────────────────────
  //  Manual card injection (Coach)
  // ─────────────────────────────────────────────
  manualDealCard(targetType, targetId, position, card) {
    if (this.state.mode === 'rng') {
      return { error: 'Manual card injection is only allowed in manual or hybrid mode' };
    }
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
    if (this.state.phase !== 'waiting') {
      return { error: 'Cannot change blind levels during an active hand' };
    }
    if (sb <= 0 || bb <= 0 || bb <= sb) return { error: 'Invalid blind levels' };
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
    // Rotate dealer button by player object (not seat index) so removals don't cause jumps.
    const eligible = this.state.players
      .filter(p => !p.is_coach && !p.disconnected && p.seat >= 0)
      .sort((a, b) => a.seat - b.seat);
    if (eligible.length > 0) {
      const dealerIdx = eligible.findIndex(p => p.seat === this.state.dealer_seat);
      const nextDealer = eligible[(dealerIdx + 1) % eligible.length];
      this.state.dealer_seat = nextDealer.seat;
    }
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
    // Always reset replay state on hand reset so stale replay metadata cannot persist
    this.state.replay_mode = {
      active: false, source_hand_id: null, actions: [], cursor: -1,
      original_hole_cards: {}, original_board: [], original_stacks: {},
      player_meta: {}, dealer_seat: 0, branched: false, pre_branch_snapshot: null,
      playlist_was_active: false,
    };
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

  // ─────────────────────────────────────────────
  //  Replay mode public API — delegates to ReplayEngine
  // ─────────────────────────────────────────────
  loadReplay(handDetail) { return ReplayEngine.load(this.state, handDetail); }
  replayStepForward() { return ReplayEngine.stepForward(this.state); }
  replayStepBack() { return ReplayEngine.stepBack(this.state); }
  replayJumpTo(target) { return ReplayEngine.jumpTo(this.state, target); }
  branchFromReplay() { return ReplayEngine.branch(this.state); }
  unBranchToReplay() { return ReplayEngine.unbranch(this.state); }
  exitReplay() { return ReplayEngine.exit(this.state); }

  // Thin wrapper kept for backwards compatibility with existing tests.
  _sortWinnersBySBProximity(winners) {
    return sortBySBProximity(winners, this._gamePlayers());
  }

  /**
   * Returns a summary of the completed hand for SessionManager.endHand().
   * Avoids SessionManager reading gm.state directly.
   */
  getHandSummary() {
    return {
      winner: this.state.winner,
      showdown_result: this.state.showdown_result,
      players: this._gamePlayers().map(p => ({
        id: p.id,
        name: p.name,
        stack: p.stack,
        hole_cards: p.hole_cards,
      })),
    };
  }

  /**
   * Public replacement for _gamePlayers() — returns all seated non-removed players.
   */
  getSeatedPlayers() {
    return this._gamePlayers();
  }
}

module.exports = GameManager;
