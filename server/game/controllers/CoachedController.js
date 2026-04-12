'use strict';

const { TableController } = require('./TableController');

class CoachedController extends TableController {
  getMode() { return 'coached_cash'; }

  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);
  }
}
module.exports = { CoachedController };
