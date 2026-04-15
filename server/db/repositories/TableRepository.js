'use strict';

const supabase = require('../supabase');

const TableRepository = {
  async createTable({ id, name, mode = 'coached_cash', config = {}, createdBy, scheduledFor = null, privacy = 'open', controllerId = null, school_id = null }) {
    // upsert so join_room can call this idempotently
    const { error } = await supabase.from('tables').upsert({
      id, name, mode, config,
      created_by:    createdBy,
      scheduled_for: scheduledFor,
      status:        scheduledFor ? 'scheduled' : 'waiting',
      privacy,
      controller_id: controllerId,
      school_id:     school_id
    }, { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
  },

  async getTable(id) {
    const { data } = await supabase.from('tables').select('*').eq('id', id).single();
    return data;
  },

  async listTables() {
    // Returns all non-completed tables (waiting, active, paused, scheduled)
    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .neq('status', 'completed')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async closeTable(id) {
    const { error } = await supabase.from('tables')
      .update({ status: 'completed', closed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async updateTable(id, patch) {
    // patch: { status, name, config, scheduledFor, privacy, controllerId }
    const dbPatch = {};
    if (patch.status       !== undefined) dbPatch.status        = patch.status;
    if (patch.name         !== undefined) dbPatch.name          = patch.name;
    if (patch.config       !== undefined) dbPatch.config        = patch.config;
    if (patch.scheduledFor !== undefined) dbPatch.scheduled_for = patch.scheduledFor;
    if (patch.privacy      !== undefined) dbPatch.privacy       = patch.privacy;
    if (patch.controllerId !== undefined) dbPatch.controller_id = patch.controllerId;
    const { error } = await supabase.from('tables').update(dbPatch).eq('id', id);
    if (error) throw error;
  },

  async setController(tableId, controllerId) {
    const { error } = await supabase.from('tables')
      .update({ controller_id: controllerId })
      .eq('id', tableId);
    if (error) throw error;
  },

  async deleteTable(id) {
    const { error } = await supabase.from('tables').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Returns non-completed tables with no in-memory activity that were
   * created more than `olderThanMinutes` minutes ago. Used by tableCleanup
   * to close orphaned REST-created tables that were never socket-joined.
   */
  async listOrphanedTables(olderThanMinutes = 30) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('tables')
      .select('id, created_at')
      .in('status', ['waiting', 'active', 'paused'])
      .lt('created_at', cutoff);
    if (error) throw error;
    return data ?? [];
  },

  // Open any scheduled tables whose scheduled_for <= now
  async activateScheduledTables() {
    const { data, error } = await supabase
      .from('tables')
      .update({ status: 'waiting' })
      .eq('status', 'scheduled')
      .lte('scheduled_for', new Date().toISOString())
      .select('id, name');
    if (error) throw error;
    return data ?? [];
  },
};

// ─── Invited Players ──────────────────────────────────────────────────────────

const InvitedPlayersRepository = {
  async addInvite(tableId, playerId, addedBy = null) {
    const { error } = await supabase.from('invited_players').upsert(
      { table_id: tableId, player_id: playerId, added_by: addedBy },
      { onConflict: 'table_id,player_id', ignoreDuplicates: true }
    );
    if (error) throw error;
  },

  async removeInvite(tableId, playerId) {
    const { error } = await supabase.from('invited_players')
      .delete()
      .eq('table_id', tableId)
      .eq('player_id', playerId);
    if (error) throw error;
  },

  async listInvited(tableId) {
    const { data, error } = await supabase.from('invited_players')
      .select('player_id, added_by, added_at')
      .eq('table_id', tableId)
      .order('added_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async isInvited(tableId, playerId) {
    const { data, error } = await supabase.from('invited_players')
      .select('player_id')
      .eq('table_id', tableId)
      .eq('player_id', playerId)
      .single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data != null;
  },
};

// ─── Table Presets ────────────────────────────────────────────────────────────

const TablePresetsRepository = {
  async save({ coachId, name, config = {} }) {
    const { data, error } = await supabase.from('table_presets')
      .insert({ coach_id: coachId, name, config })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id };
  },

  async list(coachId) {
    const { data, error } = await supabase.from('table_presets')
      .select('id, name, config, created_at, updated_at')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async get(id) {
    const { data, error } = await supabase.from('table_presets')
      .select('id, coach_id, name, config, created_at, updated_at')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, coachId, patch) {
    const dbPatch = {};
    if (patch.name   !== undefined) dbPatch.name   = patch.name;
    if (patch.config !== undefined) dbPatch.config = patch.config;
    dbPatch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('table_presets')
      .update(dbPatch)
      .eq('id', id)
      .eq('coach_id', coachId); // ownership guard
    if (error) throw error;
  },

  async delete(id, coachId) {
    const { error } = await supabase.from('table_presets')
      .delete()
      .eq('id', id)
      .eq('coach_id', coachId); // ownership guard
    if (error) throw error;
  },

  async clone(id, coachId) {
    const preset = await TablePresetsRepository.get(id);
    if (!preset) throw new Error('Preset not found');
    return TablePresetsRepository.save({
      coachId,
      name: `${preset.name} (copy)`,
      config: preset.config,
    });
  },
};

module.exports = { TableRepository, InvitedPlayersRepository, TablePresetsRepository };
