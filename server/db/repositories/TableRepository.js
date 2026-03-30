'use strict';

const supabase = require('../supabase');

const TableRepository = {
  async createTable({ id, name, mode = 'coached_cash', config = {}, createdBy, scheduledFor = null }) {
    // upsert so join_room can call this idempotently
    const { error } = await supabase.from('tables').upsert({
      id, name, mode, config,
      created_by: createdBy,
      scheduled_for: scheduledFor,
      status: scheduledFor ? 'scheduled' : 'waiting',
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
    // patch: { status, name, config, scheduledFor }
    const dbPatch = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.config !== undefined) dbPatch.config = patch.config;
    if (patch.scheduledFor !== undefined) dbPatch.scheduled_for = patch.scheduledFor;
    const { error } = await supabase.from('tables').update(dbPatch).eq('id', id);
    if (error) throw error;
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

module.exports = { TableRepository };
