'use strict';

/**
 * ChipBankRepository — persistent player chip economy.
 *
 * All mutations go through the `apply_chip_transaction` Postgres function
 * which atomically updates player_chip_bank and appends to chip_transactions
 * in a single DB round-trip, preventing race conditions.
 *
 * Requires migration 015 (player_chip_bank + chip_transactions tables).
 */

const supabase = require('../supabase');

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Get the current chip bank balance for a player.
 * Returns 0 if no bank row exists yet.
 */
async function getBalance(playerId) {
  const { data, error } = await supabase
    .from('player_chip_bank')
    .select('balance')
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.balance ?? 0;
}

/**
 * Get paginated transaction history for a player.
 * @param {string} playerId
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Array} transaction rows (newest first)
 */
async function getTransactionHistory(playerId, { limit = 50, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from('chip_transactions')
    .select('id, amount, type, table_id, created_by, notes, created_at')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Apply a chip transaction via the DB's atomic helper function.
 * Returns the new balance.
 * Throws with message 'insufficient_funds' if the balance would go below 0.
 *
 * @param {{
 *   playerId:   string,
 *   amount:     number,   // positive = credit, negative = debit
 *   type:       string,   // chip_transaction_type enum value
 *   tableId?:   string | null,
 *   createdBy?: string | null,
 *   notes?:     string | null,
 * }} opts
 * @returns {number} new balance
 */
async function applyTransaction({ playerId, amount, type, tableId = null, createdBy = null, notes = null }) {
  const { data, error } = await supabase.rpc('apply_chip_transaction', {
    p_player_id:  playerId,
    p_amount:     amount,
    p_type:       type,
    p_table_id:   tableId,
    p_created_by: createdBy,
    p_notes:      notes,
  });
  if (error) {
    if (error.message?.includes('insufficient_funds')) throw new Error('insufficient_funds');
    throw new Error(error.message);
  }
  return data;
}

/**
 * Reload a player's chip bank (credit). Coach/admin only — caller must enforce.
 */
async function reload(playerId, amount, createdBy, notes = null) {
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error('Reload amount must be a positive integer.');
  return applyTransaction({ playerId, amount, type: 'reload', createdBy, notes });
}

/**
 * Deduct chips for a table buy-in.
 * Throws 'insufficient_funds' if balance is too low.
 */
async function buyIn(playerId, amount, tableId, notes = null) {
  if (!Number.isInteger(amount) || amount <= 0)
    throw new Error('Buy-in amount must be a positive integer.');
  return applyTransaction({ playerId, amount: -amount, type: 'buy_in', tableId, notes });
}

/**
 * Return chips to the bank when a player cashes out (table leave).
 * @param {number} stackAmount chips remaining in the player's stack
 */
async function cashOut(playerId, stackAmount, tableId, notes = null) {
  if (!Number.isInteger(stackAmount) || stackAmount < 0)
    throw new Error('Cash-out amount must be a non-negative integer.');
  if (stackAmount === 0) return await getBalance(playerId); // nothing to return
  return applyTransaction({ playerId, amount: stackAmount, type: 'cash_out', tableId, notes });
}

/**
 * Manual admin adjustment (positive = credit, negative = debit).
 */
async function adjustment(playerId, amount, createdBy, notes = null) {
  if (!Number.isInteger(amount) || amount === 0)
    throw new Error('Adjustment amount must be a non-zero integer.');
  return applyTransaction({ playerId, amount, type: 'adjustment', createdBy, notes });
}

module.exports = { getBalance, getTransactionHistory, applyTransaction, reload, buyIn, cashOut, adjustment };
