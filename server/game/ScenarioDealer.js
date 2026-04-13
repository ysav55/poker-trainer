'use strict';

const svc = require('../services/PlaylistExecutionService');
const { mapScenarioToTable } = require('./mapScenarioToTable');

const MAX_SKIP_ATTEMPTS = 64;

class ScenarioDealer {
  constructor(io) {
    this.io = io;
    this.snapshots = new Map();
    this.armedScenarios = new Map();
  }

  async armIfActive(tableId, gm) {
    const session = await svc.getStatus(tableId);
    if (!session || session.status !== 'active') return { armed: false };

    const activePlayers = gm.state.players.filter(p => !p.is_coach && p.seat >= 0 && !p.disconnected);
    const activeSeats   = activePlayers.map(p => p.seat);
    const activeCount   = activeSeats.length;

    const heroPlayer = this._pickHero(session, activePlayers);
    if (!heroPlayer) {
      this._emit(tableId, 'scenario:error', { code: 'hero_absent' });
      return { armed: false, error: 'hero_absent' };
    }

    for (let attempt = 0; attempt < MAX_SKIP_ATTEMPTS; attempt++) {
      const scenario = await svc.getNextScenario(tableId, activeCount);
      if (!scenario) {
        this._emit(tableId, 'scenario:exhausted', {});
        return { armed: false, exhausted: true };
      }
      const mapping = mapScenarioToTable(scenario, activeSeats, heroPlayer.seat);
      if (!mapping) {
        this._emit(tableId, 'scenario:skipped', { scenarioId: scenario.id, reason: 'count_mismatch' });
        await svc.advance(tableId);
        continue;
      }
      this._applyMapping(tableId, gm, scenario, mapping, heroPlayer.id);
      return { armed: true, scenarioId: scenario.id, mapping };
    }
    this._emit(tableId, 'scenario:exhausted', {});
    return { armed: false, exhausted: true };
  }

  async completeIfActive(tableId, gm) {
    const snapshot = this.snapshots.get(tableId);
    if (!snapshot) return { restored: false };
    for (const [playerId, stack] of snapshot.entries()) {
      gm.adjustStack(playerId, stack);
    }
    this.snapshots.delete(tableId);
    this.armedScenarios.delete(tableId);
    await svc.advance(tableId);
    this._emit(tableId, 'scenario:progress', {});
    return { restored: true };
  }

  _pickHero(session, activePlayers) {
    const outSet  = new Set(session.opted_out_players || []);
    const optedIn = activePlayers.filter(p => !outSet.has(p.id));
    if (optedIn.length === 0) return null;

    if (session.hero_mode === 'sticky') {
      return optedIn.find(p => p.id === session.hero_player_id) || null;
    }
    if (session.hero_mode === 'rotate') {
      const lastIdx = optedIn.findIndex(p => p.id === session.hero_player_id);
      return optedIn[(lastIdx + 1) % optedIn.length];
    }
    return optedIn.find(p => p.id === session.hero_player_id) || null;
  }

  _applyMapping(tableId, gm, scenario, mapping, heroPlayerId) {
    const snapshot = new Map(
      gm.state.players.filter(p => !p.is_coach).map(p => [p.id, p.stack]),
    );
    this.snapshots.set(tableId, snapshot);
    this.armedScenarios.set(tableId, scenario.id);

    const holeCards = {};
    for (const a of mapping.seatAssignments) {
      const player = gm.state.players.find(p => p.seat === a.realSeat);
      if (!player) continue;
      holeCards[player.id] = a.cards;
      if (a.stack != null) gm.adjustStack(player.id, a.stack);
    }

    const board = [
      ...(scenario.board_flop  || []),
      scenario.board_turn  || null,
      scenario.board_river || null,
    ];
    while (board.length < 5) board.push(null);

    gm.openConfigPhase();
    gm.updateHandConfig({ mode: 'hybrid', hole_cards: holeCards, board });
    gm.state.dealer_seat = mapping.dealerSeat;

    this._emit(tableId, 'scenario:armed', {
      scenarioId: scenario.id,
      seatAssignments: mapping.seatAssignments,
      dealerSeat: mapping.dealerSeat,
      heroPlayerId,
    });
  }

  _emit(tableId, event, payload) {
    this.io.to(tableId).emit(event, payload);
  }
}

module.exports = { ScenarioDealer };
