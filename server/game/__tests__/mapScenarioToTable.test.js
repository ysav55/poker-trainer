'use strict';
const { mapScenarioToTable } = require('../mapScenarioToTable');

function scenario({ seats, heroSeat = null, dealerSeat = null }) {
  return {
    hero_seat: heroSeat,
    dealer_seat: dealerSeat,
    seat_configs: seats.map(s => ({ seat: s.seat, cards: s.cards ?? ['As', 'Kd'], stack: s.stack ?? 100 })),
  };
}

describe('mapScenarioToTable', () => {
  it('returns null when scenario count does not match active count', () => {
    const s = scenario({ seats: [{ seat: 1 }, { seat: 2 }, { seat: 3 }] });
    const result = mapScenarioToTable(s, [4, 6], 4);
    expect(result).toBeNull();
  });

  it('anchors hero at chosen real seat (3-handed)', () => {
    const s = scenario({
      seats: [{ seat: 3, cards: ['2c', '2d'] }, { seat: 4, cards: ['As', 'Kd'] }, { seat: 5, cards: ['9h', '9s'] }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    const hero = result.seatAssignments.find(a => a.isHero);
    expect(hero.realSeat).toBe(5);
    expect(hero.cards).toEqual(['As', 'Kd']);
  });

  it('rotates remaining seats preserving circular order', () => {
    const s = scenario({
      seats: [{ seat: 3, cards: ['2c', '2d'] }, { seat: 4, cards: ['As', 'Kd'] }, { seat: 5, cards: ['9h', '9s'] }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    const bySeat = Object.fromEntries(result.seatAssignments.map(a => [a.realSeat, a.cards]));
    expect(bySeat[7]).toEqual(['9h', '9s']);
    expect(bySeat[1]).toEqual(['2c', '2d']);
  });

  it('places dealer button at the real seat derived from scenario.dealer_seat', () => {
    const s = scenario({
      seats: [{ seat: 3 }, { seat: 4 }, { seat: 5 }],
      heroSeat: 4,
      dealerSeat: 3,
    });
    const result = mapScenarioToTable(s, [1, 5, 7], 5);
    expect(result.dealerSeat).toBe(1);
  });

  it('falls back to first filled seat when hero_seat is null', () => {
    const s = scenario({
      seats: [
        { seat: 2, cards: [null, null] },
        { seat: 4, cards: ['As', 'Kd'] },
        { seat: 6, cards: ['9h', '9s'] },
      ],
      heroSeat: null,
      dealerSeat: 2,
    });
    const result = mapScenarioToTable(s, [0, 3, 8], 3);
    const hero = result.seatAssignments.find(a => a.isHero);
    expect(hero.cards).toEqual(['As', 'Kd']);
  });

  it('falls back dealer to seat right of hero when dealer_seat is null', () => {
    const s = scenario({
      seats: [{ seat: 1 }, { seat: 3 }, { seat: 5 }],
      heroSeat: 3,
      dealerSeat: null,
    });
    const result = mapScenarioToTable(s, [2, 4, 6], 4);
    expect(result.dealerSeat).toBe(6);
  });

  it.each([2, 3, 4, 5, 6, 7, 8, 9])('generalizes for %i-player tables', (n) => {
    const seats = Array.from({ length: n }, (_, i) => ({ seat: i, cards: [`${i}c`, `${i}d`], stack: 100 }));
    const real  = Array.from({ length: n }, (_, i) => i + 1);
    const s = scenario({ seats, heroSeat: 0, dealerSeat: 0 });
    const result = mapScenarioToTable(s, real, real[0]);
    expect(result.seatAssignments).toHaveLength(n);
    const heroes = result.seatAssignments.filter(a => a.isHero);
    expect(heroes).toHaveLength(1);
    expect(heroes[0].realSeat).toBe(real[0]);
  });
});
