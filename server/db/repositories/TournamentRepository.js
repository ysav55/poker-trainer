'use strict';

const supabase = require('../supabase');

const TournamentRepository = {
  /**
   * Create a tournament config row.
   * Returns the new config id (UUID string).
   */
  async createConfig({ tableId, blindSchedule, startingStack, rebuyAllowed = false, rebuyLevelCap = 0 }) {
    const { data, error } = await supabase
      .from('tournament_configs')
      .insert({
        table_id:        tableId,
        blind_schedule:  blindSchedule,
        starting_stack:  startingStack,
        rebuy_allowed:   rebuyAllowed,
        rebuy_level_cap: rebuyLevelCap,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /**
   * Fetch the tournament config for a table.
   * Returns the row or null if not found.
   */
  async getConfig(tableId) {
    const { data, error } = await supabase
      .from('tournament_configs')
      .select('*')
      .eq('table_id', tableId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  /**
   * Upsert an elimination / finish record.
   * Conflict target: (table_id, player_id) — idempotent for winner row update.
   */
  async recordElimination({ tableId, playerId, position, chipsAtElimination = 0 }) {
    const { error } = await supabase
      .from('tournament_standings')
      .upsert({
        table_id:             tableId,
        player_id:            playerId,
        finish_position:      position,
        chips_at_elimination: chipsAtElimination,
        eliminated_at:        new Date().toISOString(),
      }, { onConflict: 'table_id,player_id' });
    if (error) throw error;
  },

  /**
   * Return all standings for a table joined with player display names,
   * ordered by finish_position ascending (1st place first).
   */
  async getStandings(tableId) {
    const { data, error } = await supabase
      .from('tournament_standings')
      .select('*, player_profiles(display_name)')
      .eq('table_id', tableId)
      .order('finish_position', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },
};

module.exports = { TournamentRepository };
