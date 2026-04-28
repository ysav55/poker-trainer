'use strict';

const supabase = require('../supabase');
const { q } = require('../utils');

// ─── Scenario Configs ─────────────────────────────────────────────────────────

/**
 * Save a new scenario_config row.
 *
 * @param {object} opts
 * @param {string|null} opts.tableId
 * @param {string}      opts.name
 * @param {string|null} opts.createdBy   - UUID of the coach (player_profiles.id)
 * @param {number}      opts.playerCount - 2–9
 * @param {number}      opts.dealerPosition
 * @param {string}      opts.startingStreet - 'preflop'|'flop'|'turn'|'river'
 * @param {number}      opts.smallBlind
 * @param {number}      opts.bigBlind
 * @param {object}      opts.configJson  - full HandConfiguration object
 * @returns {Promise<{ id: string }>}
 */
async function saveScenarioConfig({
  tableId = null,
  name,
  createdBy = null,
  playerCount,
  dealerPosition = 0,
  startingStreet = 'preflop',
  smallBlind = 25,
  bigBlind = 50,
  configJson = {},
}) {
  const data = await q(
    supabase.from('scenario_configs').insert({
      table_id:        tableId,
      name:            name || null,
      created_by:      createdBy || null,
      player_count:    playerCount,
      dealer_position: dealerPosition,
      starting_street: startingStreet,
      small_blind:     smallBlind,
      big_blind:       bigBlind,
      config_json:     configJson,
    }).select('id').single()
  );
  return { id: data.id };
}

/**
 * Fetch all scenario_configs created by a given player.
 *
 * @param {string} createdBy - UUID
 * @returns {Promise<object[]>}
 */
async function getScenarioConfigs(createdBy) {
  const data = await q(
    supabase.from('scenario_configs')
      .select('id, table_id, name, player_count, dealer_position, starting_street, small_blind, big_blind, config_json, created_at')
      .eq('created_by', createdBy)
      .order('created_at', { ascending: false })
  );
  return data || [];
}

/**
 * Fetch a single scenario_config by its UUID.
 *
 * @param {string} scenarioId
 * @returns {Promise<object|null>}
 */
async function getScenarioConfig(scenarioId) {
  const data = await q(
    supabase.from('scenario_configs')
      .select('id, table_id, name, player_count, dealer_position, starting_street, small_blind, big_blind, config_json, created_at, created_by')
      .eq('id', scenarioId)
      .single()
  );
  return data || null;
}

module.exports = { saveScenarioConfig, getScenarioConfigs, getScenarioConfig };
