'use strict';

class TableController {
  constructor(tableId, gameManager, io) {
    this.tableId = tableId;
    this.gm = gameManager;
    this.io = io;
    this.active = true;
  }

  async onHandComplete(handResult) {
    throw new Error(`${this.constructor.name}.onHandComplete not implemented`);
  }

  async onPlayerJoin(playerId) {}
  async onPlayerLeave(playerId) {}

  getMode() {
    throw new Error(`${this.constructor.name}.getMode not implemented`);
  }

  destroy() {
    this.active = false;
  }
}
module.exports = { TableController };
