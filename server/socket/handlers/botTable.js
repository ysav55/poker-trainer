'use strict';

/**
 * botTable — socket handlers for dynamic bot management in bot_cash tables.
 *
 * Events:
 *   bot:add    — spawn one additional bot in the caller's current bot_cash table
 *   bot:remove — disconnect a specific bot by stableId
 */

const { getController } = require('../../state/SharedState');

module.exports = function registerBotTable(socket, ctx) {
  // ── bot:add — any seated human in a bot_cash table can add a bot ─────────
  socket.on('bot:add', () => {
    const tableId = socket.data.tableId;
    if (!tableId) return;

    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'bot_cash') return;

    ctrl.addBot();
  });

  // ── bot:remove — remove a specific bot by stableId ───────────────────────
  socket.on('bot:remove', ({ stableId } = {}) => {
    if (!stableId || typeof stableId !== 'string') return;

    const tableId = socket.data.tableId;
    if (!tableId) return;

    const ctrl = getController(tableId);
    if (!ctrl || ctrl.getMode?.() !== 'bot_cash') return;

    ctrl.removeBot(stableId);
  });
};
