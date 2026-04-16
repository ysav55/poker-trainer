'use strict';

const supabase = require('../supabase');

const TournamentRepository = {
  /**
   * Create a tournament config row.
   * Returns the new config id (UUID string).
   */
  async createConfig({
    tableId,
    blindSchedule,
    startingStack,
    rebuyAllowed      = false,
    rebuyLevelCap     = 0,
    payoutStructure   = null,
    payoutMethod      = 'flat',
    showIcmOverlay    = false,
    dealThreshold     = 0,
    addonAllowed      = false,
    addonStack        = null,
    addonDeadlineLevel = 0,
    lateRegMinutes    = 0,
    reentryAllowed    = false,
    reentryLimit      = 0,
    reentryStack      = null,
    minPlayers        = 6,
    scheduledStartAt  = null,
  }) {
    const { data, error } = await supabase
      .from('tournament_configs')
      .insert({
        table_id:            tableId,
        blind_schedule:      blindSchedule,
        starting_stack:      startingStack,
        rebuy_allowed:       rebuyAllowed,
        rebuy_level_cap:     rebuyLevelCap,
        payout_structure:    payoutStructure,
        payout_method:       payoutMethod,
        show_icm_overlay:    showIcmOverlay,
        deal_threshold:      dealThreshold,
        addon_allowed:       addonAllowed,
        addon_stack:         addonStack,
        addon_deadline_level: addonDeadlineLevel,
        late_reg_minutes:    lateRegMinutes,
        reentry_allowed:     reentryAllowed,
        reentry_limit:       reentryLimit,
        reentry_stack:       reentryStack,
        min_players:         minPlayers,
        scheduled_start_at:  scheduledStartAt,
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

  // ── Standalone tournament management (POK-95) ─────────────────────────────

  /**
   * Create a tournaments registry row linked to an existing System A table.
   * Called after createTable + createConfig so all three rows exist atomically
   * from the caller's perspective (admin/tournaments POST).
   * Returns the new tournament UUID.
   */
  async createLinkedTournament({
    tableId,
    name,
    blindStructure = [],
    startingStack  = 10000,
    rebuyAllowed   = false,
    addonAllowed   = false,
    minPlayers     = 6,
    scheduledStartAt = null,
    createdBy      = null,
  }) {
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        table_id:           tableId,
        name,
        blind_structure:    blindStructure,
        starting_stack:     startingStack,
        rebuy_allowed:      rebuyAllowed,
        addon_allowed:      addonAllowed,
        min_players:        minPlayers,
        scheduled_start_at: scheduledStartAt,
        created_by:         createdBy,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /**
   * Create a standalone tournament (not tied to a table).
   * Returns the new tournament UUID.
   */
  async createTournament({ name, blindStructure = [], startingStack = 10000, rebuyAllowed = false, addonAllowed = false, createdBy = null, schoolId = null, privacy = 'open' }) {
    const { data, error } = await supabase
      .from('tournaments')
      .insert({
        name,
        blind_structure:  blindStructure,
        starting_stack:   startingStack,
        rebuy_allowed:    rebuyAllowed,
        addon_allowed:    addonAllowed,
        created_by:       createdBy,
        school_id:        schoolId,
        privacy:          privacy,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  },

  /** List all tournaments, newest first. */
  async listTournaments() {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Get a tournament by ID, including registered players and current blind level.
   * Returns null if not found.
   */
  async getTournamentById(id) {
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!tournament) return null;

    const { data: players, error: pErr } = await supabase
      .from('tournament_players')
      .select('*, player_profiles(display_name)')
      .eq('tournament_id', id)
      .order('registered_at', { ascending: true });
    if (pErr) throw pErr;

    const levels = Array.isArray(tournament.blind_structure) ? tournament.blind_structure : [];
    const currentLevel = levels[tournament.current_level_index] ?? null;

    return { ...tournament, players: players ?? [], currentLevel };
  },

  /**
   * Register a player to a tournament.
   * Idempotent — returns the existing row if already registered.
   */
  async registerPlayer(tournamentId, playerId, startingStack) {
    const { data: existing } = await supabase
      .from('tournament_players')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (existing) return existing;

    const { data, error } = await supabase
      .from('tournament_players')
      .insert({ tournament_id: tournamentId, player_id: playerId, chip_count: startingStack })
      .select('id')
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Update tournament status. Automatically sets started_at / finished_at timestamps.
   */
  async updateTournamentStatus(id, status) {
    const patch = { status };
    if (status === 'running') patch.started_at  = new Date().toISOString();
    if (status === 'finished') patch.finished_at = new Date().toISOString();
    const { error } = await supabase.from('tournaments').update(patch).eq('id', id);
    if (error) throw error;
  },

  /**
   * Get standings for a standalone tournament, sorted by chip_count desc (active players first),
   * then by finish_position asc for eliminated players.
   */
  async getTournamentStandings(id) {
    const { data, error } = await supabase
      .from('tournament_players')
      .select('*, player_profiles(display_name)')
      .eq('tournament_id', id)
      .order('is_eliminated', { ascending: true })
      .order('chip_count', { ascending: false })
      .order('finish_position', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  },

  /** Update chip count and/or elimination status for a player in a standalone tournament. */
  async updatePlayerStanding(tournamentId, playerId, { chipCount, isEliminated, finishPosition }) {
    const patch = {};
    if (chipCount      !== undefined) patch.chip_count      = chipCount;
    if (isEliminated   !== undefined) patch.is_eliminated   = isEliminated;
    if (finishPosition !== undefined) patch.finish_position = finishPosition;
    const { error } = await supabase
      .from('tournament_players')
      .update(patch)
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  /** Advance the blind level index by 1. No-op if already at max level. */
  async advanceLevel(id) {
    const { data: tournament, error } = await supabase
      .from('tournaments')
      .select('current_level_index, blind_structure')
      .eq('id', id)
      .single();
    if (error) throw error;
    const levels = Array.isArray(tournament.blind_structure) ? tournament.blind_structure : [];
    const next = Math.min(tournament.current_level_index + 1, Math.max(levels.length - 1, 0));
    const { error: uErr } = await supabase
      .from('tournaments')
      .update({ current_level_index: next })
      .eq('id', id);
    if (uErr) throw uErr;
    return next;
  },

  /**
   * Check if a player can see a tournament based on privacy level.
   * @param {string} playerId — player UUID
   * @param {object} tournament — tournament object with id, privacy, school_id
   * @returns {Promise<boolean>}
   */
  async canPlayerSeeTournament(playerId, tournament) {
    if (!tournament) return false;

    // Open tournaments are always visible
    if (tournament.privacy === 'open') return true;

    // Get player's school_id
    const { data: playerData } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', playerId)
      .single();

    const playerSchoolId = playerData?.school_id;

    // School-scoped visibility
    if (tournament.privacy === 'school') {
      if (!playerSchoolId || !tournament.school_id) return false;
      return playerSchoolId === tournament.school_id;
    }

    // Private tournament visibility
    if (tournament.privacy === 'private') {
      return await this.isPlayerWhitelisted(tournament.id, playerId);
    }

    return false;
  },

  /**
   * Check if a player is whitelisted on a private tournament.
   * @param {string} tournamentId — tournament ID
   * @param {string} playerId — player UUID
   * @returns {Promise<boolean>}
   */
  async isPlayerWhitelisted(tournamentId, playerId) {
    const { data, error } = await supabase
      .from('tournament_whitelist')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data != null;
  },

  /**
   * Add a player to a tournament's whitelist.
   * @param {string} tournamentId — tournament ID
   * @param {string} playerId — player UUID to invite
   * @param {string} invitedBy — player UUID who added them
   * @returns {Promise<void>}
   */
  async addToWhitelist(tournamentId, playerId, invitedBy) {
    const { data: existing, error: checkError } = await supabase
      .from('tournament_whitelist')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError; // Real error, not "no rows"
    }

    if (existing) {
      throw new Error('Player is already invited to this tournament');
    }

    const { error: insertError } = await supabase
      .from('tournament_whitelist')
      .insert({ tournament_id: tournamentId, player_id: playerId, invited_by: invitedBy });

    if (insertError) throw insertError;
  },

  /**
   * Remove a player from a tournament's whitelist.
   * @param {string} tournamentId — tournament ID
   * @param {string} playerId — player UUID to remove
   * @returns {Promise<{removed: boolean, count: number}>}
   */
  async removeFromWhitelist(tournamentId, playerId) {
    const { data, error } = await supabase
      .from('tournament_whitelist')
      .delete()
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId)
      .select('id');

    if (error) throw error;

    return { removed: data && data.length > 0, count: data ? data.length : 0 };
  },

  /**
   * Get the whitelist for a private tournament.
   * Returns: [{ playerId, displayName, invitedBy, invitedByName, invitedAt }, ...]
   * @param {string} tournamentId — tournament ID
   * @returns {Promise<Array>}
   */
  async getWhitelist(tournamentId) {
    const { data, error } = await supabase
      .from('tournament_whitelist')
      .select(`
        player_id,
        invited_by,
        invited_at,
        player_profiles!player_id(display_name),
        player_profiles_by_invited_by:player_profiles!invited_by(display_name)
      `)
      .eq('tournament_id', tournamentId)
      .order('invited_at', { ascending: true });

    if (error) throw error;

    return (data ?? []).map(row => ({
      playerId: row.player_id,
      displayName: row.player_profiles?.display_name || 'Unknown',
      invitedBy: row.invited_by,
      invitedByName: row.player_profiles_by_invited_by?.display_name || 'System',
      invitedAt: row.invited_at,
    }));
  },

  /**
   * Update tournament privacy and school_id.
   * @param {string} id — tournament ID
   * @param {string} privacy — 'open', 'school', or 'private'
   * @param {string} schoolId — school UUID (required if privacy is 'school')
   * @returns {Promise<object>} — updated tournament
   */
  async updatePrivacy(id, privacy, schoolId) {
    const update = { privacy };
    if (schoolId !== undefined) update.school_id = schoolId;

    const { data, error } = await supabase
      .from('tournaments')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Add all members of a group to a private tournament's whitelist.
   * @param {string} tournamentId — tournament ID
   * @param {string} groupId — group ID
   * @param {string} invitedBy — player UUID who is inviting them
   * @returns {Promise<number>} — number of players added
   */
  async addGroupToWhitelist(tournamentId, groupId, invitedBy) {
    // Fetch all members of the group from player_groups table
    const { data: groupMembers, error } = await supabase
      .from('player_groups')
      .select('player_id')
      .eq('group_id', groupId)
      .order('added_at', { ascending: true });

    if (error) throw error;

    // Add each member to the whitelist
    let count = 0;
    for (const member of groupMembers ?? []) {
      try {
        await this.addToWhitelist(tournamentId, member.player_id, invitedBy);
        count++;
      } catch (err) {
        // Skip if player already whitelisted (UNIQUE constraint); continue with others
        if (!err.message.includes('already invited')) {
          throw err;
        }
      }
    }

    return count;
  },
};

module.exports = { TournamentRepository };
