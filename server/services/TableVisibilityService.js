'use strict';

/**
 * TableVisibilityService — handles table visibility filtering based on privacy level.
 *
 * Privacy Levels:
 *   'open'    — visible to all players
 *   'school'  — visible only to players in the same school
 *   'private' — visible only to whitelisted players
 */

const supabase = require('../db/supabase');
const { q } = require('../db/utils');

const TableVisibilityService = {
  /**
   * Check if a player can see a table based on privacy level.
   *
   * @param {string} playerId — player UUID
   * @param {object} table — table object with id, privacy, school_id, created_by
   * @returns {Promise<boolean>}
   */
  async canPlayerSeeTable(playerId, table) {
    if (!table) return false;

    // Open tables are always visible
    if (table.privacy === 'open') return true;

    // Get player's school_id
    const { data: playerData } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', playerId)
      .single();

    const playerSchoolId = playerData?.school_id;

    // School-scoped visibility
    if (table.privacy === 'school') {
      if (!playerSchoolId || !table.school_id) return false;
      return playerSchoolId === table.school_id;
    }

    // Private table visibility
    if (table.privacy === 'private') {
      return await this.isPlayerWhitelisted(table.id, playerId);
    }

    return false;
  },

  /**
   * Get all tables visible to a player.
   * Filters out bot_cash and completed tables.
   *
   * @param {string} playerId — player UUID
   * @param {string} mode — optional mode filter (e.g., 'coached_cash', 'tournament')
   * @returns {Promise<Array>}
   */
  async getVisibleTables(playerId, mode = null) {
    // Get player's school_id
    const { data: playerData } = await supabase
      .from('player_profiles')
      .select('school_id')
      .eq('id', playerId)
      .single();

    const playerSchoolId = playerData?.school_id;

    // Fetch all non-completed, non-bot_cash tables
    let query = supabase
      .from('tables')
      .select('*')
      .neq('status', 'completed')
      .neq('mode', 'bot_cash')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    const { data: allTables, error } = await query;
    if (error) throw error;

    // Filter by visibility
    const visibleTables = [];
    for (const table of allTables || []) {
      // Open tables are always visible
      if (table.privacy === 'open') {
        if (mode && table.mode !== mode) continue;
        visibleTables.push(table);
        continue;
      }

      // School-scoped tables
      if (table.privacy === 'school') {
        if (!playerSchoolId || playerSchoolId !== table.school_id) continue;
        if (mode && table.mode !== mode) continue;
        visibleTables.push(table);
        continue;
      }

      // Private tables
      if (table.privacy === 'private') {
        const isWhitelisted = await this.isPlayerWhitelisted(table.id, playerId);
        if (!isWhitelisted) continue;
        if (mode && table.mode !== mode) continue;
        visibleTables.push(table);
      }
    }

    return visibleTables;
  },

  /**
   * Check if a player is whitelisted on a private table.
   *
   * @param {string} tableId — table ID
   * @param {string} playerId — player UUID
   * @returns {Promise<boolean>}
   */
  async isPlayerWhitelisted(tableId, playerId) {
    const { data, error } = await supabase
      .from('private_table_whitelist')
      .select('player_id')
      .eq('table_id', tableId)
      .eq('player_id', playerId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data != null;
  },

  /**
   * Add a player to a private table's whitelist.
   *
   * @param {string} tableId — table ID
   * @param {string} playerId — player UUID to invite
   * @param {string} invitedBy — player UUID who added them
   * @throws {Error} if already_whitelisted or other constraint error
   * @returns {Promise<void>}
   */
  async addToWhitelist(tableId, playerId, invitedBy) {
    // Check if player already exists on whitelist
    const { data: existing, error: checkError } = await supabase
      .from('private_table_whitelist')
      .select('id')
      .eq('table_id', tableId)
      .eq('player_id', playerId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError; // Real error, not "no rows"
    }

    if (existing) {
      // Player already whitelisted
      throw new Error('Player is already invited to this table');
    }

    // Insert new whitelist entry
    const { error: insertError } = await supabase
      .from('private_table_whitelist')
      .insert({ table_id: tableId, player_id: playerId, invited_by: invitedBy });

    if (insertError) throw insertError;
  },

  /**
   * Remove a player from a private table's whitelist.
   *
   * @param {string} tableId — table ID
   * @param {string} playerId — player UUID to remove
   * @returns {Promise<{removed: boolean, count: number}>}
   */
  async removeFromWhitelist(tableId, playerId) {
    const { data, error } = await supabase
      .from('private_table_whitelist')
      .delete()
      .eq('table_id', tableId)
      .eq('player_id', playerId)
      .select('id');

    if (error) throw error;

    // Return count of affected rows
    return { removed: data && data.length > 0, count: data ? data.length : 0 };
  },

  /**
   * Get the whitelist for a private table.
   * Returns: [{ playerId, displayName, invitedBy, invitedAt }, ...]
   *
   * @param {string} tableId — table ID
   * @returns {Promise<Array>}
   */
  async getWhitelist(tableId) {
    const { data, error } = await supabase
      .from('private_table_whitelist')
      .select(`
        player_id,
        invited_by,
        invited_at,
        player_profiles!player_id(display_name),
        player_profiles_by_invited_by:player_profiles!invited_by(display_name)
      `)
      .eq('table_id', tableId)
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
   * Add all members of a group to a private table's whitelist.
   * Skips duplicates (upsert with ignoreDuplicates).
   *
   * @param {string} tableId — table ID
   * @param {string} groupId — group UUID
   * @param {string} invitedBy — player UUID who added the group
   * @returns {Promise<{added: number, skipped: number}>}
   */
  async addGroupToWhitelist(tableId, groupId, invitedBy) {
    // Get all members of the group
    const { data: groupMembers, error: memberError } = await supabase
      .from('player_groups')
      .select('player_id')
      .eq('group_id', groupId);

    if (memberError) throw memberError;

    if (!groupMembers || groupMembers.length === 0) {
      return { added: 0, skipped: 0 };
    }

    // Prepare bulk insert rows
    const rows = groupMembers.map(gm => ({
      table_id: tableId,
      player_id: gm.player_id,
      invited_by: invitedBy,
    }));

    // Upsert with ignoreDuplicates to skip existing entries
    const { error: insertError, data: insertedData } = await supabase
      .from('private_table_whitelist')
      .upsert(rows, { onConflict: 'table_id,player_id', ignoreDuplicates: true })
      .select('player_id');

    if (insertError) throw insertError;

    // Count how many were actually added (the rest were duplicates)
    const addedCount = (insertedData ?? []).length;
    const skippedCount = groupMembers.length - addedCount;

    return { added: addedCount, skipped: skippedCount };
  },
};

module.exports = TableVisibilityService;
