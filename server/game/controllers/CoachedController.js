'use strict';

const { TableController } = require('./TableController');
const { ScenarioDealer }  = require('../ScenarioDealer');

class CoachedController extends TableController {
  constructor(tableId, gameManager, io) {
    super(tableId, gameManager, io);
    this.dealer = new ScenarioDealer(io);
  }

  getMode() { return 'coached_cash'; }

  async onHandComplete(handResult) {
    await this.dealer.completeIfActive(this.tableId, this.gm);
    this.io.to(this.tableId).emit('hand_complete', handResult);
  }
}

module.exports = { CoachedController };
