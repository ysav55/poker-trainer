'use strict';
const GameManager = require('../GameManager');

// Helper: build a minimal handDetail object
function makeHandDetail(opts = {}) {
  return {
    hand_id: opts.hand_id || 1,
    dealer_seat: opts.dealer_seat || 0,
    board: opts.board || ['Ah', 'Kd', '7c', '2s', 'Jh'],
    players: opts.players || [
      { player_id: 'p1', player_name: 'Alice', seat: 0, stack_start: 1000, hole_cards: ['As', 'Ks'] },
      { player_id: 'p2', player_name: 'Bob',   seat: 1, stack_start: 1000, hole_cards: ['Qh', 'Jd'] },
    ],
    actions: opts.actions || [
      { id: 1, player_id: 'p1', player_name: 'Alice', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
      { id: 2, player_id: 'p2', player_name: 'Bob',   street: 'preflop', action: 'call',  amount: 40, is_reverted: 0 },
      { id: 3, player_id: 'p1', player_name: 'Alice', street: 'flop',    action: 'bet',   amount: 60, is_reverted: 0 },
      { id: 4, player_id: 'p2', player_name: 'Bob',   street: 'flop',    action: 'fold',  amount: 0,  is_reverted: 0 },
    ],
  };
}

function makeGM() {
  const gm = new GameManager('test-table');
  // Add two players with stableId set
  gm.state.players = [
    { id: 'sock1', stableId: 'p1', name: 'Alice', seat: 0, stack: 1000, hole_cards: [], current_bet: 0, is_active: true, action: 'waiting', is_all_in: false },
    { id: 'sock2', stableId: 'p2', name: 'Bob',   seat: 1, stack: 1000, hole_cards: [], current_bet: 0, is_active: true, action: 'waiting', is_all_in: false },
  ];
  return gm;
}

describe('loadReplay()', () => {
  test('sets phase=replay, active=true, cursor=-1', () => {
    const gm = makeGM();
    const result = gm.loadReplay(makeHandDetail());
    expect(result.success).toBe(true);
    expect(gm.state.phase).toBe('replay');
    expect(gm.state.replay_mode.active).toBe(true);
    expect(gm.state.replay_mode.cursor).toBe(-1);
  });

  test('populates original_stacks and original_hole_cards from handDetail.players', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    expect(gm.state.replay_mode.original_stacks['p1']).toBe(1000);
    expect(gm.state.replay_mode.original_hole_cards['p1']).toEqual(['As', 'Ks']);
    expect(gm.state.replay_mode.original_hole_cards['p2']).toEqual(['Qh', 'Jd']);
  });

  test('filters is_reverted=1 actions out', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p1', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
        { id: 2, player_id: 'p2', street: 'preflop', action: 'call',  amount: 40, is_reverted: 1 }, // reverted
      ],
    });
    gm.loadReplay(detail);
    expect(gm.state.replay_mode.actions).toHaveLength(1);
    expect(gm.state.replay_mode.actions[0].id).toBe(1);
  });

  test('rejects when phase !== waiting', () => {
    const gm = makeGM();
    gm.state.phase = 'preflop';
    const result = gm.loadReplay(makeHandDetail());
    expect(result.error).toBeTruthy();
  });

  test('rejects null handDetail', () => {
    const gm = makeGM();
    const result = gm.loadReplay(null);
    expect(result.error).toBeTruthy();
  });

  test('stores source_hand_id', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail({ hand_id: 42 }));
    expect(gm.state.replay_mode.source_hand_id).toBe(42);
  });
});

describe('replayStepForward()', () => {
  test('increments cursor', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward();
    expect(gm.state.replay_mode.cursor).toBe(0);
  });

  test('fold action sets player.is_active = false', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p2', street: 'preflop', action: 'fold', amount: 0, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward();
    const p2 = gm.state.players.find(p => p.stableId === 'p2');
    expect(p2.is_active).toBe(false);
    expect(p2.action).toBe('folded');
  });

  test('raise action decrements player stack and increments pot', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p1', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward();
    const p1 = gm.state.players.find(p => p.stableId === 'p1');
    expect(p1.stack).toBe(960);
    expect(gm.state.pot).toBe(40);
  });

  test('call action decrements player stack and increments pot', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p2', street: 'preflop', action: 'call', amount: 20, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward();
    const p2 = gm.state.players.find(p => p.stableId === 'p2');
    expect(p2.stack).toBe(980);
    expect(gm.state.pot).toBe(20);
  });

  test('reveals flop cards when first flop action', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      board: ['Ah', 'Kd', '7c', '2s', 'Jh'],
      actions: [
        { id: 1, player_id: 'p1', street: 'flop', action: 'check', amount: 0, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    expect(gm.state.board).toHaveLength(0);
    gm.replayStepForward();
    expect(gm.state.board).toHaveLength(3);
    expect(gm.state.board[0]).toBe('Ah');
  });

  test('reveals turn card when first turn action', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      board: ['Ah', 'Kd', '7c', '2s', 'Jh'],
      actions: [
        { id: 1, player_id: 'p1', street: 'flop',  action: 'check', amount: 0, is_reverted: 0 },
        { id: 2, player_id: 'p1', street: 'turn',  action: 'check', amount: 0, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward(); // flop
    gm.replayStepForward(); // turn
    expect(gm.state.board).toHaveLength(4);
  });

  test('returns error already_at_end at last action', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p1', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward();
    const result = gm.replayStepForward();
    expect(result.error).toBe('already_at_end');
  });

  test('rejects when phase !== replay', () => {
    const gm = makeGM();
    const result = gm.replayStepForward();
    expect(result.error).toBeTruthy();
  });

  test('check action sets player.action = checked', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p1', street: 'preflop', action: 'check', amount: 0, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward();
    const p1 = gm.state.players.find(p => p.stableId === 'p1');
    expect(p1.action).toBe('checked');
  });
});

describe('replayStepBack()', () => {
  test('decrements cursor and rebuilds state', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward();
    gm.replayStepForward();
    expect(gm.state.replay_mode.cursor).toBe(1);
    gm.replayStepBack();
    expect(gm.state.replay_mode.cursor).toBe(0);
  });

  test('stack after stepBack matches fresh calculation', () => {
    const gm = makeGM();
    const detail = makeHandDetail({
      actions: [
        { id: 1, player_id: 'p1', street: 'preflop', action: 'raise', amount: 40, is_reverted: 0 },
        { id: 2, player_id: 'p1', street: 'preflop', action: 'raise', amount: 60, is_reverted: 0 },
      ],
    });
    gm.loadReplay(detail);
    gm.replayStepForward(); // stack = 960
    gm.replayStepForward(); // stack = 900
    gm.replayStepBack();    // back to after action 0 → stack should be 960
    const p1 = gm.state.players.find(p => p.stableId === 'p1');
    expect(p1.stack).toBe(960);
  });

  test('returns error already_at_start at cursor -1', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    const result = gm.replayStepBack();
    expect(result.error).toBe('already_at_start');
  });
});

describe('replayJumpTo()', () => {
  test('sets cursor to target and rebuilds', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayJumpTo(2);
    expect(gm.state.replay_mode.cursor).toBe(2);
  });

  test('returns error for out-of-range cursor', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    expect(gm.replayJumpTo(100).error).toBeTruthy();
    expect(gm.replayJumpTo(-2).error).toBeTruthy();
  });

  test('jump to -1 restores original stacks', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayJumpTo(3);
    gm.replayJumpTo(-1);
    const p1 = gm.state.players.find(p => p.stableId === 'p1');
    expect(p1.stack).toBe(1000);
    expect(gm.state.pot).toBe(0);
  });
});

describe('branchFromReplay()', () => {
  test('saves pre_branch_snapshot (non-null)', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.branchFromReplay();
    expect(gm.state.replay_mode.pre_branch_snapshot).not.toBeNull();
  });

  test('sets phase=waiting, branched=true', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.branchFromReplay();
    expect(gm.state.phase).toBe('waiting');
    expect(gm.state.replay_mode.branched).toBe(true);
  });

  test('clears history and street_snapshots', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.state.history = [{}];
    gm.state.street_snapshots = [{}];
    gm.branchFromReplay();
    expect(gm.state.history).toHaveLength(0);
    expect(gm.state.street_snapshots).toHaveLength(0);
  });

  test('rejects if already branched', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.branchFromReplay();
    const result = gm.branchFromReplay();
    expect(result.error).toBeTruthy();
  });

  test('rejects when phase !== replay', () => {
    const gm = makeGM();
    const result = gm.branchFromReplay();
    expect(result.error).toBeTruthy();
  });
});

describe('unBranchToReplay()', () => {
  test('restores phase=replay, branched=false', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward();
    gm.branchFromReplay();
    gm.unBranchToReplay();
    expect(gm.state.phase).toBe('replay');
    expect(gm.state.replay_mode.branched).toBe(false);
  });

  test('cursor is same value as when branch was taken', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward();
    gm.replayStepForward();
    expect(gm.state.replay_mode.cursor).toBe(1);
    gm.branchFromReplay();
    gm.unBranchToReplay();
    expect(gm.state.replay_mode.cursor).toBe(1);
  });

  test('rejects when not branched', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    const result = gm.unBranchToReplay();
    expect(result.error).toBeTruthy();
  });
});

describe('exitReplay()', () => {
  test('resets replay_mode.active to false, phase=waiting', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.exitReplay();
    expect(gm.state.phase).toBe('waiting');
    expect(gm.state.replay_mode.active).toBe(false);
  });

  test('restores player stacks to original_stacks values', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward(); // p1 stack goes to 960
    gm.exitReplay();
    const p1 = gm.state.players.find(p => p.stableId === 'p1');
    expect(p1.stack).toBe(1000);
  });

  test('works from branched state', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.branchFromReplay();
    const result = gm.exitReplay();
    expect(result.success).toBe(true);
    expect(gm.state.phase).toBe('waiting');
    expect(gm.state.replay_mode.active).toBe(false);
  });
});

describe('getPublicState() in replay', () => {
  test('includes replay_mode field with active, cursor, total_actions', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    const pub = gm.getPublicState('sock1', false);
    expect(pub.replay_mode).toBeDefined();
    expect(pub.replay_mode.active).toBe(true);
    expect(pub.replay_mode.cursor).toBe(-1);
    expect(pub.replay_mode.total_actions).toBe(4);
  });

  test('exposes original hole_cards for all players when replay active', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    const pub = gm.getPublicState('sock2', false); // NOT the owner of p1's cards
    const alice = pub.players.find(p => p.stableId === 'p1');
    // In replay mode all cards should be visible
    expect(alice.hole_cards).toEqual(['As', 'Ks']);
  });

  test('current_action is null at cursor -1', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    const pub = gm.getPublicState('sock1', false);
    expect(pub.replay_mode.current_action).toBeNull();
  });

  test('current_action reflects actions[cursor] after stepping', () => {
    const gm = makeGM();
    gm.loadReplay(makeHandDetail());
    gm.replayStepForward();
    const pub = gm.getPublicState('sock1', false);
    expect(pub.replay_mode.current_action).not.toBeNull();
    expect(pub.replay_mode.current_action.action).toBe('raise');
  });
});
