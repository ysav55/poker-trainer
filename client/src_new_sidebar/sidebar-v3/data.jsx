/* ──────────────────────────────────────────────────────────────
   FeltSide · Coach Sidebar v2 · demo state
   Mirrors the real gameState / context shape. All keys match the
   server contract: gameState.players[].{id, stableId, name, stack,
   hole_cards, total_bet_this_round, action, is_dealer, ...},
   gameState.{phase, pot, current_turn, current_bet, min_raise,
   big_blind, board, side_pots, showdown_result, paused, is_scenario},
   actionTimer, equityData.equities[], hand_history[]
   ────────────────────────────────────────────────────────────── */

window.SIDEBAR_V2_DATA = {
  // ── Live game state ────────────────────────────────────────
  gameState: {
    hand_number: 142,
    phase: 'flop',
    pot: 420,
    side_pots: [],
    current_turn: 'me',
    current_bet: 160,
    min_raise: 160,
    big_blind: 20,
    small_blind: 10,
    board: ['Ks', '9d', '4c'],
    paused: false,
    is_scenario: false,
    players: [
      { id: 'me', stableId: 'u_me', name: 'Ariela',    stack: 2860, total_bet_this_round: 80,  hole_cards: ['As','Qs'], is_dealer: false, is_small_blind: false, is_big_blind: false, in_hand: true },
      { id: 'p1', stableId: 'u_p1', name: 'Ido Amir',  stack: 3120, total_bet_this_round: 80,  hole_cards: ['HIDDEN','HIDDEN'], is_small_blind: true, in_hand: true },
      { id: 'p2', stableId: 'u_p2', name: 'Guy Hirsch', stack: 4400, total_bet_this_round: 0,   hole_cards: ['HIDDEN','HIDDEN'], is_dealer: true, in_hand: false },
      { id: 'p3', stableId: 'u_p3', name: 'Noa Levin',  stack: 1980, total_bet_this_round: 160, hole_cards: ['HIDDEN','HIDDEN'], is_big_blind: true, in_hand: true, action: 'raise' },
    ],
    hand_history: [
      // { street, who, act, amt }
      { street: 'preflop', who: 'Noa Levin',  act: 'raises to', amt: 60 },
      { street: 'preflop', who: 'Ariela',     act: 'calls',     amt: 60 },
      { street: 'preflop', who: 'Ido Amir',   act: 'calls',     amt: 60 },
      { street: 'preflop', who: 'Guy Hirsch', act: 'folds',     amt: null },
      { street: 'flop',    who: 'Noa Levin',  act: 'bets',      amt: 160 },
      { street: 'flop',    who: 'Ariela',     act: 'calls',     amt: 80, pending: true },
    ],
  },

  actionTimer: {
    playerId: 'me',
    duration: 25000,        // ms
    remaining: 18700,       // ms — shown live
  },

  equityData: {
    showToPlayers: true,
    equities: [
      { playerId: 'u_me', equity: 42 },
      { playerId: 'u_p1', equity: 18 },
      { playerId: 'u_p3', equity: 28 },
      // Guy folded — equity omitted; real server behavior
    ],
    // Color lookup the sidebar uses for display (derived from seat avatar hue in real app)
    colors: {
      u_me: '#f0d060',
      u_p1: '#6aa8ff',
      u_p2: '#9b7cff',
      u_p3: '#4ad991',
    },
  },

  myId: 'me',
  myStableId: 'u_me',

  // ── Scenarios / playlists (Tab 2) ──────────────────────────
  scenarios: [
    { id: 's1', name: 'BTN vs BB · 3-bet pot', detail: 'Hero AQs · Villain range · K-high flop', hands: 18, lastRun: '2d' },
    { id: 's2', name: 'SRP overpair OOP',       detail: 'Hero QQ · Villain wide · Low flop',     hands: 12, lastRun: '5d' },
    { id: 's3', name: 'Check-raise turn',       detail: 'Hero check-call flop · turn brick',     hands: 9,  lastRun: '1w' },
    { id: 's4', name: 'SB 4-bet bluff defense', detail: 'Hero vs 4-bet · 100bb deep',            hands: 24, lastRun: '3h' },
  ],
  playlists: [
    { id: 'pl1', name: 'Ariela · Mistake Spots', count: 12, scenarios: ['s1','s3'] },
    { id: 'pl2', name: 'Weekly Homework',        count: 8,  scenarios: ['s2','s4'] },
  ],

  // Current in-flight drill session (if any)
  drillSession: {
    active: true,
    scenarioId: 's1',
    scenarioName: 'BTN vs BB · 3-bet pot',
    handsDone: 7,
    handsTotal: 18,
    currentSpot: 'Flop · K♠ 9♦ 4♣ · villain bets 1/2 pot',
    // Progress by result:
    results: { correct: 5, mistake: 1, uncertain: 1 },
  },

  // ── History (Tab 3) — this session's 20 hands ──────────────
  history: [
    // Each card: board + hero hand + hero action summary + pot won/lost
    { n: 142, phase: 'flop',     board: ['Ks','9d','4c'], heroHand: ['As','Qs'], action: 'call flop 80',   pot: 420, net: null, live: true },
    { n: 141, phase: 'showdown', board: ['Jd','9s','4c','2h','Tc'], heroHand: ['Ac','Kc'], action: 'river fold',   pot: 760, net: -220 },
    { n: 140, phase: 'showdown', board: ['7s','7d','2c','5h','Qd'], heroHand: ['Ts','Th'], action: 'river bet',    pot: 1840, net: +920 },
    { n: 139, phase: 'preflop',  board: [], heroHand: ['5d','3c'], action: 'fold preflop', pot: 30,  net: -10 },
    { n: 138, phase: 'flop',     board: ['Ah','Kh','2d'], heroHand: ['Qc','Qd'], action: 'c/f flop',     pot: 120, net: -40 },
    { n: 137, phase: 'showdown', board: ['Qs','8c','4h','Jd','3s'], heroHand: ['Js','Jh'], action: 'check-raise turn', pot: 1200, net: +600 },
    { n: 136, phase: 'turn',     board: ['9h','8d','6s','2c'], heroHand: ['Ad','5d'], action: 'semi-bluff',  pot: 380, net: -190 },
    { n: 135, phase: 'showdown', board: ['Tc','9d','4h','4s','9c'], heroHand: ['Th','Ts'], action: 'value bet river', pot: 640, net: +320 },
    { n: 134, phase: 'preflop',  board: [], heroHand: ['7s','2h'], action: 'fold BB',      pot: 20,  net: -10 },
    { n: 133, phase: 'showdown', board: ['Kd','Ts','4c','6h','2s'], heroHand: ['As','Kc'], action: '3-bet + c-bet', pot: 520, net: +260 },
    { n: 132, phase: 'flop',     board: ['6c','6d','2s'], heroHand: ['Jh','Th'], action: 'fold to flop bet', pot: 90,  net: -30 },
    { n: 131, phase: 'showdown', board: ['Ac','Jh','8d','4s','4h'], heroHand: ['Qd','Qc'], action: 'bet-call-call',   pot: 880, net: -320 },
    { n: 130, phase: 'preflop',  board: [], heroHand: ['9s','8s'], action: 'fold to 3-bet', pot: 60,  net: -20 },
    { n: 129, phase: 'showdown', board: ['5d','5c','9h','Qs','Jc'], heroHand: ['9c','9d'], action: 'full house win',  pot: 1420, net: +710 },
    { n: 128, phase: 'showdown', board: ['Ts','4s','2c','Ks','8h'], heroHand: ['Ah','7s'], action: 'flush river',     pot: 520, net: +260 },
    { n: 127, phase: 'flop',     board: ['Js','Jd','6c'], heroHand: ['8h','8c'], action: 'check-fold',  pot: 120, net: -40 },
    { n: 126, phase: 'showdown', board: ['Ad','Qs','7h','3d','Kc'], heroHand: ['Kh','Jd'], action: 'two pair win',   pot: 980, net: +490 },
    { n: 125, phase: 'preflop',  board: [], heroHand: ['Qh','3d'], action: 'fold BB',      pot: 20,  net: -10 },
    { n: 124, phase: 'turn',     board: ['7c','6s','5d','2h'], heroHand: ['Ts','9s'], action: 'open-ended fold', pot: 240, net: -80 },
    { n: 123, phase: 'showdown', board: ['9d','5c','3s','Ks','Qd'], heroHand: ['Ad','Kd'], action: 'pair + flush draw', pot: 680, net: +340 },
  ],

  // ── Review (Tab 4) — decision tree for a loaded hand ───────
  review: {
    loaded: true,
    handNumber: 140,
    board: ['7s','7d','2c','5h','Qd'],
    heroHand: ['Ts','Th'],
    streets: [
      {
        name: 'Preflop',
        nodes: [
          { id: 'p1', who: 'Noa',    act: 'raise 60' },
          { id: 'p2', who: 'Hero',   act: 'call 60', isHero: true, branchable: true, branches: ['fold','call','3-bet'] },
          { id: 'p3', who: 'Ido',    act: 'call 60' },
          { id: 'p4', who: 'Guy',    act: 'fold' },
        ],
      },
      {
        name: 'Flop · 7♠ 7♦ 2♣',
        nodes: [
          { id: 'f1', who: 'Noa',    act: 'bet 120' },
          { id: 'f2', who: 'Hero',   act: 'raise 360', isHero: true, branchable: true, branches: ['fold','call','raise'] },
          { id: 'f3', who: 'Ido',    act: 'fold' },
          { id: 'f4', who: 'Noa',    act: 'call 240' },
        ],
      },
      {
        name: 'Turn · 5♥',
        nodes: [
          { id: 't1', who: 'Noa',    act: 'check' },
          { id: 't2', who: 'Hero',   act: 'bet 640', isHero: true, branchable: true, branches: ['check','bet 1/3','bet 1/2','bet pot'] },
          { id: 't3', who: 'Noa',    act: 'call 640' },
        ],
      },
      {
        name: 'River · Q♦',
        nodes: [
          { id: 'r1', who: 'Noa',    act: 'check' },
          { id: 'r2', who: 'Hero',   act: 'bet 920', isHero: true, branchable: true, branches: ['check','bet 1/2','bet 3/4','all-in'] },
          { id: 'r3', who: 'Noa',    act: 'fold' },
        ],
      },
    ],
    result: { heroWon: true, net: +920, heroShowed: null },
  },

  // ── Settings (Tab 5) ──────────────────────────────────────
  blindLevels: {
    current: { sb: 10, bb: 20, ante: 0 },
    timer:   { enabled: false, minutesRemaining: 12, levelMinutes: 15 },
    presets: [
      { sb: 10,  bb: 20,  ante: 0 },
      { sb: 15,  bb: 30,  ante: 0 },
      { sb: 25,  bb: 50,  ante: 5 },
      { sb: 50,  bb: 100, ante: 10 },
      { sb: 100, bb: 200, ante: 25 },
    ],
  },

  seatConfig: {
    maxSeats: 9,
    seats: [
      { seat: 0, player: 'Ariela',    isHero: true, stack: 2860, status: 'active' },
      { seat: 1, player: 'Ido Amir',                stack: 3120, status: 'active' },
      { seat: 2, player: 'Guy Hirsch',              stack: 4400, status: 'active' },
      { seat: 3, player: 'Noa Levin',               stack: 1980, status: 'active' },
      { seat: 4, player: null },
      { seat: 5, player: null },
      { seat: 6, player: 'Tal (bot)',  isBot: true, stack: 2000, status: 'active' },
      { seat: 7, player: null },
      { seat: 8, player: null },
    ],
  },

  players: [
    { seat: 0, name: 'Ariela',     stack: 2860, isHero: true,  status: 'active',   hands: 142 },
    { seat: 1, name: 'Ido Amir',   stack: 3120,                status: 'active',   hands: 142 },
    { seat: 2, name: 'Guy Hirsch', stack: 4400,                status: 'sitout',   hands: 138 },
    { seat: 3, name: 'Noa Levin',  stack: 1980,                status: 'active',   hands: 142 },
    { seat: 6, name: 'Tal',        stack: 2000, isBot: true,   status: 'active',   hands: 142 },
  ],

  session: { hands: 142, minutes: 87 },

  // ── Table aggregate stats (History tab) ────────────────────
  tableAggregate: {
    hands: 142,
    minutes: 87,
    biggestPot: 1840,
    avgPot: 312,
    showdownRate: 28,   // %
    bb100: null,         // table-wide nonsense; keep null
  },

  // ── Per-player session histories (History tab) ─────────────
  // Indexed by stableId. Includes their hands in this session +
  // session-level stats. Real server returns this from
  // `getPlayerSessionStats(stableId)` and `getPlayerHands(stableId)`.
  playerHistory: {
    u_me: {
      stableId: 'u_me', name: 'Ariela', isHero: true,
      stats: { hands: 142, vpip: 24, pfr: 19, bb100: 12.4, wonAtSd: 58, net: +2860 },
      handIds: [142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123],
    },
    u_p1: {
      stableId: 'u_p1', name: 'Ido Amir',
      stats: { hands: 142, vpip: 31, pfr: 14, bb100: -4.2, wonAtSd: 44, net: -780 },
      handIds: [142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123],
    },
    u_p2: {
      stableId: 'u_p2', name: 'Guy Hirsch',
      stats: { hands: 138, vpip: 18, pfr: 16, bb100: +6.1, wonAtSd: 62, net: +1240 },
      handIds: [141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123],
    },
    u_p3: {
      stableId: 'u_p3', name: 'Noa Levin',
      stats: { hands: 142, vpip: 38, pfr: 28, bb100: -8.0, wonAtSd: 39, net: -1640 },
      handIds: [142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123],
    },
    u_p4: {
      stableId: 'u_p4', name: 'Tal', isBot: true,
      stats: { hands: 142, vpip: 22, pfr: 17, bb100: +1.2, wonAtSd: 50, net: +320 },
      handIds: [142,141,140,139,138,137,136,135,134,133,132,131,130,129,128,127,126,125,124,123],
    },
  },
};
