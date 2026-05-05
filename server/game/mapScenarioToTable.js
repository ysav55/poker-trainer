'use strict';

function mapScenarioToTable(scenario, activeSeats, chosenHeroRealSeat) {
  const configs = scenario.seat_configs || [];
  if (configs.length !== activeSeats.length) return null;

  const templateSeats = configs.map(c => c.seat).slice().sort((a, b) => a - b);
  const realSeats     = activeSeats.slice().sort((a, b) => a - b);
  const n = realSeats.length;

  const firstFilled = configs.find(c => Array.isArray(c.cards) && c.cards[0] && c.cards[1]);
  const heroTemplateSeat =
    scenario.hero_seat != null
      ? scenario.hero_seat
      : (firstFilled ? firstFilled.seat : templateSeats[0]);

  const heroTemplateIndex = templateSeats.indexOf(heroTemplateSeat);
  const heroRealIndex     = realSeats.indexOf(chosenHeroRealSeat);

  const seatAssignments = templateSeats.map((tSeat, i) => {
    const cfg = configs.find(c => c.seat === tSeat);
    const realSeat = realSeats[(heroRealIndex + (i - heroTemplateIndex) + n) % n];
    return {
      realSeat,
      cards: cfg.cards,
      stack: cfg.stack,
      isHero: tSeat === heroTemplateSeat,
    };
  });

  const dealerTemplateSeat =
    scenario.dealer_seat != null
      ? scenario.dealer_seat
      : templateSeats[(heroTemplateIndex + 1) % n];
  const dealerIndex = templateSeats.indexOf(dealerTemplateSeat);
  const dealerSeat  = realSeats[(heroRealIndex + (dealerIndex - heroTemplateIndex) + n) % n];

  return { seatAssignments, dealerSeat };
}

module.exports = { mapScenarioToTable };
