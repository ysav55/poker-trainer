/* ── mockGame.jsx ───────────────────────────────────────────────────────────
   Realistic mock game-state that mirrors the real server's `game_state`
   shape exactly. Names, keys and formats match the source app:
     players[].{id,stableId,name,stack,seat,hole_cards,total_bet_this_round,
                action,is_dealer,is_small_blind,is_big_blind,is_all_in,
                in_hand,disconnected,is_bot,is_coach}
     board, phase, pot, side_pots, current_turn, current_bet, min_raise,
     winner, showdown_result, table_name, table_mode, is_scenario
─────────────────────────────────────────────────────────────────────────── */

const MOCK_HERO_ID = 'me';

function makeGameState(overrides = {}) {
  const base = {
    table_name: 'Stakehouse · No Limit Hold\'em',
    table_mode: 'coached_cash',
    phase: 'turn',
    pot: 1840,
    side_pots: [],
    current_turn: 'me',
    current_bet: 360,
    min_raise: 360,
    big_blind: 20,
    small_blind: 10,
    board: ['7c', '7d', '5h', '3s'],
    winner: null,
    showdown_result: null,
    is_scenario: false,
    paused: false,
    players: [
      {
        id: 'me', stableId: 'u_ariela', name: 'Ariela Simantov', seat: 0,
        stack: 2473, hole_cards: ['Ac', '9s'],
        total_bet_this_round: 180, action: null,
        is_dealer: true, is_small_blind: false, is_big_blind: false, is_all_in: false,
        in_hand: true, disconnected: false, is_bot: false, is_coach: false,
        avatar: '#9b7cff',
      },
      {
        id: 'p2', stableId: 'u_ido', name: 'Ido Amir', seat: 4,
        stack: 5358, hole_cards: ['HIDDEN', 'HIDDEN'],
        total_bet_this_round: 360, action: 'raise',
        is_dealer: false, is_small_blind: true, is_big_blind: false, is_all_in: false,
        in_hand: true, disconnected: false, is_bot: false, is_coach: false,
        avatar: '#4ad991',
      },
      {
        id: 'p3', stableId: 'u_guy', name: 'Guy Hirsch', seat: 2,
        stack: 1692, hole_cards: ['HIDDEN', 'HIDDEN'],
        total_bet_this_round: 0, action: 'fold',
        is_dealer: false, is_small_blind: false, is_big_blind: false, is_all_in: false,
        in_hand: false, disconnected: false, is_bot: false, is_coach: false,
        avatar: '#f5b25b',
      },
      {
        id: 'p4', stableId: 'u_idopoor', name: 'Idopoor', seat: 8,
        stack: 2398, hole_cards: ['HIDDEN', 'HIDDEN'],
        total_bet_this_round: 180, action: 'call',
        is_dealer: false, is_small_blind: false, is_big_blind: true, is_all_in: false,
        in_hand: true, disconnected: false, is_bot: false, is_coach: false,
        avatar: '#6aa8ff',
      },
      {
        id: 'p5', stableId: 'u_tal', name: 'Tal Ben-David', seat: 6,
        stack: 3120, hole_cards: ['HIDDEN', 'HIDDEN'],
        total_bet_this_round: 0, action: 'check',
        is_dealer: false, is_small_blind: false, is_big_blind: false, is_all_in: false,
        in_hand: true, disconnected: false, is_bot: true, is_coach: false,
        avatar: '#5ef0ff',
      },
      {
        id: 'p6', stableId: 'u_noa', name: 'Noa Levin', seat: 3,
        stack: 890, hole_cards: ['HIDDEN', 'HIDDEN'],
        total_bet_this_round: 890, action: 'all-in',
        is_dealer: false, is_small_blind: false, is_big_blind: false, is_all_in: true,
        in_hand: true, disconnected: false, is_bot: false, is_coach: false,
        avatar: '#ff5ec8',
      },
    ],
    // coach-overlay extras (from server)
    equities: [
      { playerId: 'u_ariela', equity: 58 },
      { playerId: 'u_ido',    equity: 24 },
      { playerId: 'u_idopoor', equity: 12 },
      { playerId: 'u_tal',    equity: 4 },
      { playerId: 'u_noa',    equity: 2 },
    ],
    // hand metadata (real app has these)
    hand_number: 142,
    hands_this_session: 142,
    session_duration_min: 87,
  };
  return { ...base, ...overrides };
}

window.MOCK_HERO_ID = MOCK_HERO_ID;
window.makeGameState = makeGameState;
