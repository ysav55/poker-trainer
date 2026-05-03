import { SIDEBAR_V3_DATA } from './data.js';

const SUITS = ['s','h','d','c'];
const COLORS = ['#f0d060','#6aa8ff','#9b7cff','#4ad991','#e06868','#f5b25b','#84cc16','#ec4899','#06b6d4'];

function colorForPlayer(stableId, idx) {
  if (!stableId) return COLORS[idx % COLORS.length];
  let h = 0;
  for (let i = 0; i < stableId.length; i++) h = (h * 31 + stableId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

export function buildLiveData({ hookState, user, playlist, fallback = SIDEBAR_V3_DATA }) {
  const gs = hookState?.gameState ?? null;
  const at = hookState?.actionTimer ?? null;
  const eq = hookState?.equityData ?? null;
  // usePlaylistManager always initialises playlists to []; when caller is in
  // dev-fixture mode (no playlist arg), default to empty so the v3 mapping
  // below produces an empty list rather than leaking mock playlist names.
  const livePlaylists = Array.isArray(playlist?.playlists) ? playlist.playlists : [];

  if (!gs || !Array.isArray(gs.players)) return fallback;

  const myStableId =
    user?.stable_id ?? user?.stableId ?? user?.id ?? null;

  const liveActionTimer = at
    ? {
        playerId: at.playerId ?? null,
        duration: at.duration ?? 0,
        remaining: at.startedAt
          ? Math.max(0, (at.duration ?? 0) - (Date.now() - at.startedAt))
          : at.duration ?? 0,
      }
    : { playerId: null, duration: 0, remaining: 0 };

  const colorMap = {};
  gs.players.forEach((p, i) => {
    const sid = p.stableId ?? p.stable_id ?? p.id;
    if (sid) colorMap[sid] = colorForPlayer(sid, i);
  });

  // Server's EquityService.computeEquity returns equity 0–100 (verified via EquityBadge
  // thresholds at client/src/components/EquityBadge.jsx:16-18). Trust the contract; do not
  // rescale.
  const liveEquity = eq
    ? {
        showToPlayers: !!eq.showToPlayers,
        equities: Array.isArray(eq.equities)
          ? eq.equities.map((e) => ({
              playerId: e.playerId ?? e.stableId,
              equity: typeof e.equity === 'number' ? Math.round(e.equity) : 0,
            }))
          : [],
        colors: { ...colorMap, ...(eq.colors || {}) },
      }
    : { showToPlayers: false, equities: [], colors: colorMap };

  const livePlayers = gs.players.map((p) => ({
    id: p.id,
    stableId: p.stableId ?? p.id,
    name: p.name ?? 'Player',
    stack: p.stack ?? 0,
    seat: typeof p.seat === 'number' ? p.seat : 0,
    total_bet_this_round: p.current_bet ?? p.total_bet_this_round ?? 0,
    hole_cards: Array.isArray(p.hole_cards) && p.hole_cards.length
      ? p.hole_cards
      : ['HIDDEN','HIDDEN'],
    is_dealer: !!p.is_dealer,
    is_small_blind: !!p.is_small_blind,
    is_big_blind: !!p.is_big_blind,
    in_hand: p.in_hand !== false,
    is_bot: p.is_bot === true,
    is_coach: p.is_coach === true,
    action: p.action ?? null,
  }));

  // Seat indices match the server's table seat (0-8), not array position. The
  // adapter previously renumbered to array index — that produced labels like
  // "Seat 4" for a coach actually at seat 8. Now we keep the server seat so
  // the v3 sidebar's seat numbers match PokerTable's seat layout.
  const occupiedBySeat = new Map();
  livePlayers.forEach((p) => { occupiedBySeat.set(p.seat, p); });
  const liveSeats = [];
  const maxSeats = 9;
  for (let i = 0; i < maxSeats; i++) {
    const p = occupiedBySeat.get(i);
    if (p) {
      liveSeats.push({
        seat: i,
        playerId: p.id,
        stableId: p.stableId,
        player: p.name,
        isHero: p.stableId === myStableId,
        isBot: p.is_bot,
        stack: p.stack,
        status: p.in_hand ? 'active' : 'sitout',
      });
    } else {
      liveSeats.push({ seat: i, player: null });
    }
  }

  return {
    ...fallback,
    gameState: {
      // Server's getPublicState() does not emit hand_number; null here means
      // "hide the badge" (TabLive renders nothing instead of #0).
      hand_number: gs.hand_number ?? null,
      phase: gs.phase ?? 'waiting',
      pot: gs.pot ?? 0,
      side_pots: gs.side_pots ?? [],
      current_turn: gs.current_turn ?? null,
      current_bet: gs.current_bet ?? 0,
      min_raise: gs.min_raise ?? 0,
      big_blind: gs.big_blind ?? 0,
      small_blind: gs.small_blind ?? 0,
      board: Array.isArray(gs.board) ? gs.board : [],
      paused: !!(gs.is_paused ?? gs.paused),
      is_scenario: !!gs.is_scenario,
      players: livePlayers,
      // Server's getPublicState() does not emit hand_history. Empty signals to
      // the Action Feed card to show a "wired in Phase 2" placeholder.
      hand_history: Array.isArray(gs.hand_history) ? gs.hand_history : [],
      pending_hand_config: !!gs.pending_hand_config,
    },
    actionTimer: liveActionTimer,
    equityData: liveEquity,
    myId: hookState?.myId ?? null,
    myStableId,
    seatConfig: { maxSeats: 9, seats: liveSeats.slice(0, 9) },
    players: livePlayers
      .filter((p) => p.name)
      .map((p) => ({
        seat: p.seat,
        playerId: p.id,
        stableId: p.stableId,
        name: p.name,
        stack: p.stack,
        isHero: p.stableId === myStableId,
        isBot: p.is_bot,
        status: p.in_hand ? 'active' : 'sitout',
        hands: 0,
      })),
    blindLevels: {
      ...fallback.blindLevels,
      current: {
        sb: gs.small_blind ?? fallback.blindLevels.current.sb,
        bb: gs.big_blind ?? fallback.blindLevels.current.bb,
        ante: 0,
      },
    },
    // Surface the live replay state so TabReview can drive its UI. When
    // replay_mode.active is true, the GameManager has loaded a hand via
    // load_replay and the cursor advances through actions[]. The v3 review
    // pane renders streets from that cursor; full action-by-action rendering
    // also needs handDetail (fetched separately by TabReview via useHistory).
    review: gs.replay_mode?.active
      ? {
          loaded: true,
          handId: gs.replay_mode.source_hand_id ?? null,
          cursor: gs.replay_mode.cursor ?? -1,
          totalActions: gs.replay_mode.total_actions ?? 0,
          branched: !!gs.replay_mode.branched,
          board: Array.isArray(gs.board) ? gs.board : [],
        }
      : { loaded: false, handId: null, cursor: -1, totalActions: 0, branched: false, board: [] },
    // Server playlist shape: { playlist_id, name, description, hand_count }
    // v3 shape:              { id, name, count, scenarios }
    // We don't track scenarios as a separate entity server-side, so scenarios
    // is left empty — the v3 Drill Library card handles a 0-scenario playlist.
    playlists: livePlaylists.map((p) => ({
      id: p.playlist_id,
      name: p.name,
      description: p.description ?? '',
      count: p.hand_count ?? 0,
      scenarios: [],
    })),
    // Map server's gameState.playlist_mode → v3 drillSession shape so the
    // Drills/Session card renders live progress.
    drillSession: gs.playlist_mode?.active
      ? {
          active: true,
          playlistId: gs.playlist_mode.playlistId,
          scenarioName: livePlaylists.find((p) => p.playlist_id === gs.playlist_mode.playlistId)?.name ?? 'Active drill',
          handsDone: gs.playlist_mode.currentIndex ?? 0,
          handsTotal: gs.playlist_mode.totalHands ?? 0,
          currentSpot: phaseLabelFor(gs),
          // Per-hand correct/mistake/uncertain counters require a results store
          // (not yet on server state). Show zeros until that lands; keeps UI
          // honest instead of fabricating.
          results: { correct: 0, mistake: 0, uncertain: 0 },
        }
      : { active: false, scenarioId: null, scenarioName: '', handsDone: 0, handsTotal: 0, currentSpot: '', results: { correct: 0, mistake: 0, uncertain: 0 } },
    // Status priority chain: review > drill > scenario > paused > live.
    // Spec section 3.3 / 5.3.
    status: (() => {
      const replayActive = !!gs.replay_mode?.active;
      const drillActive = !!gs.playlist_mode?.active;
      const scenarioOn = !!gs.is_scenario;
      const isPaused = !!gs.paused;
      if (replayActive) return 'review';
      if (drillActive) return 'drill';
      if (scenarioOn) return 'scenario';
      if (isPaused) return 'paused';
      return 'live';
    })(),
    // actions_log: newest action first; powers live.action_log_card.
    // Spec section 4.1, 7.5.
    actions_log: (() => {
      const rawActions = Array.isArray(gs.actions) ? gs.actions : [];
      return [...rawActions].reverse().map((a) => ({
        street:  a.street ?? 'preflop',
        who:     a.player ?? a.player_name ?? (a.player_id ? String(a.player_id).slice(0, 6) : '—'),
        act:     a.action ?? a.act ?? '—',
        amt:     a.amount ?? null,
        pending: !!a.pending,
      }));
    })(),
  };
}

function phaseLabelFor(gs) {
  const phase = gs.phase ?? 'waiting';
  const board = (gs.board ?? []).join(' ');
  if (phase === 'waiting') return 'between hands';
  return board ? `${phase} · ${board}` : phase;
}
