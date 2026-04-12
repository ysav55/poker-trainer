'use strict';

const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const { q } = require('../utils');

// ─── PayoutPresetRepository ───────────────────────────────────────────────────

const PayoutPresetRepository = {
  /**
   * List all presets accessible to a school:
   * - is_system = true (visible to everyone)
   * - school_id = the given schoolId AND is_system = false (school-specific)
   * Returns { system: [...], school: [...] }
   */
  async list(schoolId) {
    const systemQuery = supabase
      .from('payout_presets')
      .select('id, school_id, name, tiers, is_system, created_by, created_at')
      .eq('is_system', true)
      .order('name', { ascending: true });

    const schoolQuery = schoolId
      ? supabase
          .from('payout_presets')
          .select('id, school_id, name, tiers, is_system, created_by, created_at')
          .eq('school_id', schoolId)
          .eq('is_system', false)
          .order('name', { ascending: true })
      : Promise.resolve({ data: [], error: null });

    const [systemPresets, schoolPresets] = await Promise.all([
      q(systemQuery),
      schoolId ? q(schoolQuery) : Promise.resolve([]),
    ]);

    return {
      system: systemPresets || [],
      school: schoolPresets || [],
    };
  },

  /**
   * Get a single preset by id.
   * Returns null if not found.
   */
  async getById(id) {
    const data = await q(
      supabase
        .from('payout_presets')
        .select('id, school_id, name, tiers, is_system, created_by, created_at')
        .eq('id', id)
        .maybeSingle()
    );
    return data || null;
  },

  /**
   * Create a school-scoped preset.
   * Returns the new row.
   */
  async create({ name, tiers, schoolId, createdBy }) {
    const data = await q(
      supabase
        .from('payout_presets')
        .insert({
          id: uuidv4(),
          school_id: schoolId || null,
          name,
          tiers,
          is_system: false,
          created_by: createdBy || null,
          created_at: new Date().toISOString(),
        })
        .select('id, school_id, name, tiers, is_system, created_by, created_at')
        .single()
    );
    return data;
  },

  /**
   * Delete a preset by id, scoped to a school (cannot delete system presets).
   * Throws Error('NOT_FOUND') if missing.
   * Throws Error('SYSTEM_PRESET') if is_system = true.
   */
  async delete(id, schoolId) {
    const preset = await q(
      supabase
        .from('payout_presets')
        .select('id, school_id, is_system')
        .eq('id', id)
        .maybeSingle()
    );

    if (!preset) throw new Error('NOT_FOUND');
    if (preset.is_system) throw new Error('SYSTEM_PRESET');

    await q(
      supabase
        .from('payout_presets')
        .delete()
        .eq('id', id)
        .eq('school_id', schoolId)
    );
  },
};

module.exports = { PayoutPresetRepository };
