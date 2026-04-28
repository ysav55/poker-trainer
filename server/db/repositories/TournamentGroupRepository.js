'use strict';

const supabase = require('../supabase');

const TournamentGroupRepository = {
  async createGroup({ schoolId = null, name, sharedConfig = {}, maxPlayersPerTable = 9, minPlayersPerTable = 3, createdBy = null,
                      buyIn = 0, privacy = 'public', scheduledAt = null, payoutStructure = [], lateRegEnabled = false, lateRegMinutes = 20 }) {
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
        buy_in:                 buyIn,
        privacy,
        scheduled_at:           scheduledAt ?? null,
        payout_structure:       payoutStructure,
        late_reg_enabled:       lateRegEnabled,
        late_reg_minutes:       lateRegMinutes,
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

  async listGroups({ schoolId = null, status = null, privacy = null } = {}) {
    let q = supabase.from('tournament_groups').select('*').order('created_at', { ascending: false });
    if (schoolId) q = q.eq('school_id', schoolId);
    if (status)   q = q.eq('status', status);
    if (privacy)  q = q.eq('privacy', privacy);
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

  // ── Registration ─────────────────────────────────────────────────────────

  async createRegistration(groupId, playerId, buyInAmount = 0) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .insert({ group_id: groupId, player_id: playerId, buy_in_amount: buyInAmount, status: 'registered' })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  async cancelRegistration(groupId, playerId) {
    const { error } = await supabase
      .from('tournament_group_registrations')
      .update({ status: 'cancelled' })
      .eq('group_id', groupId)
      .eq('player_id', playerId)
      .eq('status', 'registered');
    if (error) throw error;
  },

  async updateRegistrationStatus(groupId, playerId, status) {
    const { error } = await supabase
      .from('tournament_group_registrations')
      .update({ status })
      .eq('group_id', groupId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  async getRegistrations(groupId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('*, player_profiles(display_name)')
      .eq('group_id', groupId)
      .neq('status', 'cancelled')
      .order('registered_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getRegistration(groupId, playerId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('id, status, buy_in_amount')
      .eq('group_id', groupId)
      .eq('player_id', playerId)
      .neq('status', 'cancelled')
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async getTotalPrizePool(groupId) {
    const { data, error } = await supabase
      .from('tournament_group_registrations')
      .select('buy_in_amount')
      .eq('group_id', groupId)
      .neq('status', 'cancelled');
    if (error) throw error;
    return (data ?? []).reduce((sum, r) => sum + (r.buy_in_amount ?? 0), 0);
  },
};

module.exports = { TournamentGroupRepository };
