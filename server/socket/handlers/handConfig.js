'use strict';

module.exports = function registerHandConfig(socket, ctx) {
  const { tables, broadcastState, sendError, sendSyncError,
          requireCoach, HandLogger, loadScenarioIntoConfig } = ctx;

  socket.on('open_config_phase', () => {
    if (requireCoach(socket, 'open the config phase')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase === 'replay') return sendSyncError(socket, 'Cannot open config phase during replay — exit replay first');
    const ocResult = gm.openConfigPhase();
    if (ocResult.error) return sendSyncError(socket, ocResult.error);
    broadcastState(socket.data.tableId, { type: 'config_phase', message: 'Coach opened hand configuration' });
  });

  socket.on('update_hand_config', ({ config } = {}) => {
    if (requireCoach(socket, 'update hand config')) return;
    const gm = tables.get(socket.data.tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    const result = gm.updateHandConfig(config);
    if (result.error) return sendError(socket, result.error);
    broadcastState(socket.data.tableId, { type: 'config_updated', message: 'Hand configuration updated' });
  });

  socket.on('load_hand_scenario', async ({ handId, stackMode = 'keep' } = {}) => {
    if (requireCoach(socket, 'load scenarios')) return;
    const tableId = socket.data.tableId;
    const gm = tables.get(tableId);
    if (!gm) return sendError(socket, 'Not in a room');
    if (gm.state.phase !== 'waiting') return sendError(socket, 'Can only load a scenario between hands');
    if (!['keep', 'historical'].includes(stackMode)) return sendError(socket, 'stackMode must be keep or historical');
    try {
      const handDetail = await HandLogger.getHandDetail(handId);
      if (!handDetail) return sendError(socket, `Hand ${handId} not found`);
      const result = loadScenarioIntoConfig(gm, handDetail, stackMode);
      if (result.error) return sendError(socket, result.error);
      if (result.countMismatch) {
        socket.emit('notification', {
          type: 'warning',
          message: `Scenario had ${result.histCount} players, table has ${result.activeCount}. Cards mapped by position (BTN→BTN, SB→SB…).`
        });
      }
      broadcastState(tableId, { type: 'scenario_loaded', message: `Loaded scenario from hand history (stack mode: ${stackMode})` });
    } catch (err) {
      sendError(socket, `Failed to load scenario: ${err.message}`);
    }
  });
};
