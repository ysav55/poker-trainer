'use strict';

const { TableController } = require('./TableController');

const DEAL_DELAY_MS = 2000;

class AutoController extends TableController {
  getMode() { return 'uncoached_cash'; }

  async onHandComplete(handResult) {
    this.io.to(this.tableId).emit('hand_complete', handResult);
    setTimeout(async () => {
      if (!this.active) return;
      const seated = this.gm.getState?.()?.seated ?? [];
      if (seated.length >= 2) {
        await this.gm.startGame();
      }
    }, DEAL_DELAY_MS);
  }

  canPause()      { return false; }
  canUndo()       { return false; }
  canManualCard() { return false; }
  canReplay()     { return false; }
}
module.exports = { AutoController };
