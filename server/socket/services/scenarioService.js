'use strict';

/**
 * loadScenarioIntoConfig
 * Maps a historical hand onto current active seats by RELATIVE POSITION from the dealer button.
 * BTN→BTN, SB→SB, BB→BB regardless of physical seat numbers or player count differences.
 *
 * stackMode: 'keep'       — preserves current stacks
 *            'historical' — sets stacks to historical stack_start values
 *
 * @param {object} gm         — SessionManager instance
 * @param {object} handDetail — hand detail object from HandLogger.getHandDetail
 * @param {string} stackMode  — 'keep' | 'historical'
 * @returns {{ error?: string, countMismatch?: boolean, activeCount?: number, histCount?: number }}
 */
function loadScenarioIntoConfig(gm, handDetail, stackMode = 'keep') {
  const activePlayers = gm.state.players
    .filter(p => !p.is_coach)
    .sort((a, b) => a.seat - b.seat);

  const histPlayers = (handDetail.players || [])
    .sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));

  const activeCount = activePlayers.length;
  const histCount   = histPlayers.length;

  const histDealerIdx = Math.max(0, (handDetail.dealer_seat ?? 0) % Math.max(histCount, 1));

  const histRelMap = new Map();
  for (let i = 0; i < histCount; i++) {
    const rel = (i - histDealerIdx + histCount) % histCount;
    histRelMap.set(rel, histPlayers[i]);
  }

  const liveDealerIdx = activeCount > 0
    ? gm.state.dealer_seat % activeCount
    : 0;

  const holeCards = {};
  activePlayers.forEach((player, i) => {
    const rel  = (i - liveDealerIdx + activeCount) % activeCount;
    const hist = histRelMap.get(rel % Math.max(histCount, 1));
    holeCards[player.id] = (hist?.hole_cards?.length === 2) ? hist.hole_cards : [null, null];
  });

  const board = (handDetail.board?.length === 5)
    ? handDetail.board
    : [null, null, null, null, null];

  if (stackMode === 'historical') {
    activePlayers.forEach((player, i) => {
      const rel  = (i - liveDealerIdx + activeCount) % activeCount;
      const hist = histRelMap.get(rel % Math.max(histCount, 1));
      if (hist?.stack_start != null) gm.adjustStack(player.id, hist.stack_start);
    });
  }

  const openResult = gm.openConfigPhase();
  if (openResult && openResult.error) return { error: openResult.error };
  const updateResult = gm.updateHandConfig({ mode: 'hybrid', hole_cards: holeCards, board });
  if (updateResult && updateResult.error) return { error: updateResult.error };

  return { countMismatch: activeCount !== histCount, activeCount, histCount };
}

module.exports = { loadScenarioIntoConfig };
