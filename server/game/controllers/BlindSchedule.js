'use strict';

class BlindSchedule {
  constructor(levels) {
    // levels: [{ level, sb, bb, ante, duration_minutes }, ...]
    this.levels = levels;
    this.currentIndex = 0;
    this.levelStartTime = null;
  }

  getCurrentLevel() {
    return this.levels[this.currentIndex] ?? null;
  }

  advance() {
    if (this.currentIndex < this.levels.length - 1) {
      this.currentIndex++;
      this.levelStartTime = Date.now();
      return this.levels[this.currentIndex];
    }
    return null; // at final level
  }

  getTimeRemainingMs() {
    if (!this.levelStartTime) return null;
    const level = this.getCurrentLevel();
    if (!level) return null;
    const elapsed = Date.now() - this.levelStartTime;
    return Math.max(0, level.duration_minutes * 60_000 - elapsed);
  }

  isAtFinalLevel() {
    return this.currentIndex === this.levels.length - 1;
  }
}
module.exports = { BlindSchedule };
