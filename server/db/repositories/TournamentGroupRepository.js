'use strict';

const supabase = require('../supabase');

const TournamentGroupRepository = {
  async createGroup({ schoolId = null, name, sharedConfig = {}, maxPlayersPerTable = 9, minPlayersPerTable = 3, createdBy = null }) {
    const { data, error } = await supabase
      .from('tournament_groups')
      .insert({
        school_id:              schoolId,
        name,
        shared_config:          sharedConfig,
        max_players_per_table:  maxPlayersPerTable,
        min_players_per_table:  minPlayersPerTable,
        created_by:             createdBy,
        status:                 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  async getGroup(groupId) {
    const { data, error } = await supabase
      .from('tournament_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async listGroups({ schoolId = null } = {}) {
    let q = supabase.from('tournament_groups').select('*').order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    const { data, error } = await q;
    if (error) throw error;
    return data ?? [];
  },

  async updateStatus(groupId, status) {
    const patch = { status };
    if (status === 'running')  patch.started_at  = new Date().toISOString();
    if (status === 'finished') patch.finished_at = new Date().toISOString();
    const { error } = await supabase.from('tournament_groups').update(patch).eq('id', groupId);
    if (error) throw error;
  },

  async getTableIds(groupId) {
    const { data, error } = await supabase
      .from('tables')
      .select('id')
      .eq('tournament_group_id', groupId);
    if (error) throw error;
    return (data ?? []).map(r => r.id);
  },

  async countActivePlayers(groupId) {
    // Count players with stack > 0 across all tables in the group
    // We approximate by summing from tournament_group_standings (not yet eliminated)
    const { count, error } = await supabase
      .from('tournament_group_standings')
      .select('*', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .is('eliminated_at', null);
    if (error) throw error;
    return count ?? 0;
  },

  async recordElimination({ groupId, playerId, position, chipsAtElim }) {
    const { error } = await supabase
      .from('tournament_group_standings')
      .upsert({
        group_id:        groupId,
        player_id:       playerId,
        finish_position: position,
        chips_at_elim:   chipsAtElim,
        eliminated_at:   new Date().toISOString(),
      }, { onConflict: 'group_id,player_id' });
    if (error) throw error;
  },

  async getStandings(groupId) {
    const { data, error } = await supabase
      .from('tournament_group_standings')
      .select('*, player_profiles(display_name)')
      .eq('group_id', groupId)
      .order('finish_position', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  },
};

module.exports = { TournamentGroupRepository };
