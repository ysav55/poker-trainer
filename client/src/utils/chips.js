/**
 * Format a chip amount as either a raw chip count or big-blind units.
 *
 * @param {number} amount   - Chip value to display
 * @param {number} bigBlind - Current table big blind
 * @param {boolean} bbView  - If true, show in BB units (e.g. "100bb")
 * @returns {string}
 */
export function fmtChips(amount, bigBlind, bbView) {
  if (bbView && bigBlind > 0) {
    const bb = amount / bigBlind
    const formatted = Number.isInteger(bb) ? bb : parseFloat(bb.toFixed(1))
    return `${formatted}bb`
  }
  return amount.toLocaleString()
}
