/* Shared demo data for all sidebar variants. */

window.SIDEBAR_DATA = {
  hand: {
    number: 142,
    phase: 'flop',
    board: ['Ks', '9d', '4c'],
    pot: 420,
    toCall: 80,
    myStack: 2860,
    bigBlind: 20,
    handsPlayed: 142,
    sessionMin: 87,
  },
  me: { id: 'me', name: 'Ariela' },
  equity: [
    { id: 'me',  name: 'Ariela',    pct: 42, color: '#f0d060', isMe: true },
    { id: 'p3',  name: 'Noa Levin', pct: 28, color: '#4ad991' },
    { id: 'p1',  name: 'Ido Amir',  pct: 18, color: '#6aa8ff' },
    { id: 'p2',  name: 'Guy Hirsch', pct: 12, color: '#9b7cff' },
  ],
  feed: [
    { phase: 'PRE',  who: 'Noa',    act: 'raises to', amt: '60'  },
    { phase: 'PRE',  who: 'Ariela', act: 'calls',      amt: '60'  },
    { phase: 'PRE',  who: 'Ido',    act: 'calls',      amt: '60'  },
    { phase: 'PRE',  who: 'Guy',    act: 'folds',      amt: ''    },
    { phase: 'FLOP', who: 'Noa',    act: 'bets',       amt: '160' },
    { phase: 'FLOP', who: 'Ariela', act: 'calls',      amt: '80', pending: true },
  ],
  drills: [
    { title: 'BTN vs BB — 3-bet defense', meta: '18 hands · 7 pending' },
    { title: 'SRP flops w/ overpair',      meta: '12 hands · 3 pending' },
    { title: 'Check-raise the turn',       meta: '9 hands · 0 pending' },
  ],
  // For Variant B (timeline)
  streets: [
    { label: 'Preflop', actions: [
      { who: 'Noa',    act: 'raise 60' },
      { who: 'Ariela', act: 'call 60'  },
      { who: 'Ido',    act: 'call 60'  },
      { who: 'Guy',    act: 'fold'     },
    ] },
    { label: 'Flop · K♠ 9♦ 4♣', actions: [
      { who: 'Noa',    act: 'bet 160'  },
      { who: 'Ariela', act: 'call 80 …', pending: true },
    ] },
  ],
  // For Variant C (stacked readouts)
  readouts: {
    potOdds: '16.7%',
    requiredEq: '16.7%',
    myEquity: '42%',
    ev: '+ 38',
    spr: '3.4',
    textureTag: 'Dry · K-high',
    preflopLineup: '3-bet pot, 4-way',
    position: 'MP vs BTN · OOP',
  },
};
