'use strict';

/**
 * SchoolSettingsService — Manages school-level settings for identity, table defaults,
 * staking defaults, leaderboard config, platforms, appearance, and auto-pause timeout.
 *
 * All settings stored in the `settings` table with scope='school', scope_id=schoolId.
 * Keys follow the pattern 'category:type' (e.g., 'identity:profile', 'table:defaults').
 */

class SchoolSettingsService {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // ─── Identity ──────────────────────────────────────────────────────────────

  /**
   * Get school identity (name, description).
   */
  async getIdentity(schoolId) {
    const value = await this._getSetting(schoolId, 'identity:profile');
    return value || { name: '', description: '' };
  }

  /**
   * Set school identity. Validates name (required, 1–100 chars) and description (≤500 chars).
   */
  async setIdentity(schoolId, payload, updatedBy) {
    this._validateIdentity(payload);
    await this._setSetting(schoolId, 'identity:profile', payload, updatedBy);
    return payload;
  }

  /**
   * Validates identity payload: name is required and 1–100 chars; description is optional and ≤500 chars.
   */
  _validateIdentity({ name, description }) {
    if (!name) throw new Error('name is required');
    if (typeof name !== 'string' || name.trim() === '') throw new Error('name cannot be empty');
    if (name.length > 100) throw new Error('name must be 1–100 chars');
    if (description && typeof description === 'string' && description.length > 500) {
      throw new Error('description must be 0–500 chars');
    }
  }

  // ─── Table Defaults ────────────────────────────────────────────────────────

  /**
   * Get table defaults (min/max blinds and starting stacks).
   */
  async getTableDefaults(schoolId) {
    const value = await this._getSetting(schoolId, 'table:defaults');
    return value || {
      min_sb: 5,
      max_sb: 50,
      min_bb: 10,
      max_bb: 100,
      min_starting_stack: 1000,
      max_starting_stack: 50000,
    };
  }

  /**
   * Set table defaults. Validates ordering: min_sb < max_sb, min_bb < max_bb, min_starting_stack < max_starting_stack.
   */
  async setTableDefaults(schoolId, payload, updatedBy) {
    this._validateTableDefaults(payload);
    await this._setSetting(schoolId, 'table:defaults', payload, updatedBy);
    return payload;
  }

  /**
   * Validates table defaults: min_sb < max_sb, min_bb < max_bb, min_starting_stack < max_starting_stack, min_bb > min_sb.
   */
  _validateTableDefaults({ min_sb, max_sb, min_bb, max_bb, min_starting_stack, max_starting_stack }) {
    if (min_sb >= max_sb) throw new Error('min_sb must be < max_sb');
    if (min_bb >= max_bb) throw new Error('min_bb must be < max_bb');
    if (min_starting_stack >= max_starting_stack) throw new Error('min_starting_stack must be < max_starting_stack');
    if (min_bb <= min_sb) throw new Error('min_bb must be > min_sb');
  }

  // ─── Staking Defaults ──────────────────────────────────────────────────────

  /**
   * Get staking defaults (coach split %, makeup policy, bankroll cap, contract duration).
   */
  async getStakingDefaults(schoolId) {
    const value = await this._getSetting(schoolId, 'staking:defaults');
    return value || {
      coach_split_pct: 50,
      makeup_policy: 'carries',
      bankroll_cap: 25000,
      contract_duration_months: 6,
    };
  }

  /**
   * Set staking defaults. Validates coach_split_pct (0–100), makeup_policy enum, bankroll_cap (≥100), contract_duration_months (1–36).
   */
  async setStakingDefaults(schoolId, payload, updatedBy) {
    this._validateStakingDefaults(payload);
    await this._setSetting(schoolId, 'staking:defaults', payload, updatedBy);
    return payload;
  }

  /**
   * Validates staking defaults: coach_split_pct 0–100, makeup_policy one of ['carries', 'resets_monthly', 'resets_on_settle'],
   * bankroll_cap ≥100, contract_duration_months 1–36.
   */
  _validateStakingDefaults({ coach_split_pct, makeup_policy, bankroll_cap, contract_duration_months }) {
    if (coach_split_pct < 0 || coach_split_pct > 100) throw new Error('coach_split_pct must be 0–100');
    const validPolicies = ['carries', 'resets_monthly', 'resets_on_settle'];
    if (!validPolicies.includes(makeup_policy)) {
      throw new Error('makeup_policy must be one of: carries, resets_monthly, resets_on_settle');
    }
    if (bankroll_cap < 100) throw new Error('bankroll_cap must be ≥100');
    if (contract_duration_months < 1 || contract_duration_months > 36) {
      throw new Error('contract_duration_months must be 1–36');
    }
  }

  // ─── Leaderboard Config ────────────────────────────────────────────────────

  /**
   * Get leaderboard config (primary/secondary metrics, update frequency).
   */
  async getLeaderboardConfig(schoolId) {
    const value = await this._getSetting(schoolId, 'leaderboard:config');
    return value || {
      primary_metric: 'net_chips',
      secondary_metric: 'win_rate',
      update_frequency: 'after_session',
    };
  }

  /**
   * Set leaderboard config. Validates metrics and update_frequency enums.
   */
  async setLeaderboardConfig(schoolId, payload, updatedBy) {
    this._validateLeaderboardConfig(payload);
    await this._setSetting(schoolId, 'leaderboard:config', payload, updatedBy);
    return payload;
  }

  /**
   * Validates leaderboard config: primary_metric and secondary_metric are one of ['net_chips', 'bb_per_100', 'win_rate', 'hands_played'],
   * update_frequency one of ['after_session', 'hourly', 'daily'].
   */
  _validateLeaderboardConfig({ primary_metric, secondary_metric, update_frequency }) {
    const validMetrics = ['net_chips', 'bb_per_100', 'win_rate', 'hands_played'];
    if (!validMetrics.includes(primary_metric)) {
      throw new Error('primary_metric must be one of: net_chips, bb_per_100, win_rate, hands_played');
    }
    if (!validMetrics.includes(secondary_metric)) {
      throw new Error('secondary_metric must be one of: net_chips, bb_per_100, win_rate, hands_played');
    }
    const validFreqs = ['after_session', 'hourly', 'daily'];
    if (!validFreqs.includes(update_frequency)) {
      throw new Error('update_frequency must be one of: after_session, hourly, daily');
    }
  }

  // ─── Platforms ────────────────────────────────────────────────────────────

  /**
   * Get platforms list.
   */
  async getPlatforms(schoolId) {
    const value = await this._getSetting(schoolId, 'platforms:list');
    return value || { platforms: [] };
  }

  /**
   * Set platforms. Validates array with max 20 items, each ≤50 chars, non-empty.
   */
  async setPlatforms(schoolId, payload, updatedBy) {
    this._validatePlatforms(payload);
    await this._setSetting(schoolId, 'platforms:list', payload, updatedBy);
    return payload;
  }

  /**
   * Validates platforms: must be an array, max 20 items, each item string ≤50 chars, non-empty.
   */
  _validatePlatforms({ platforms }) {
    if (!Array.isArray(platforms)) throw new Error('platforms must be an array');
    if (platforms.length > 20) throw new Error('platforms array cannot exceed 20 items');
    for (const p of platforms) {
      if (typeof p !== 'string' || p.trim() === '') throw new Error('platform names cannot be empty');
      if (p.length > 50) throw new Error('each platform name must be ≤50 chars');
    }
  }

  // ─── Appearance (Theme) ────────────────────────────────────────────────────

  /**
   * Get appearance (felt color, primary color, logo URL).
   */
  async getAppearance(schoolId) {
    const value = await this._getSetting(schoolId, 'theme:appearance');
    return value || {
      felt_color: '#1e5235',
      primary_color: '#d4af37',
      logo_url: null,
    };
  }

  /**
   * Set appearance. Validates hex colors (#RRGGBB) and optional logo URL.
   */
  async setAppearance(schoolId, payload, updatedBy) {
    this._validateAppearance(payload);
    await this._setSetting(schoolId, 'theme:appearance', payload, updatedBy);
    return payload;
  }

  /**
   * Validates appearance: felt_color and primary_color are valid hex (#RRGGBB), logo_url is valid URL or null.
   */
  _validateAppearance({ felt_color, primary_color, logo_url }) {
    const hexRegex = /^#[0-9a-fA-F]{6}$/;
    if (!hexRegex.test(felt_color)) throw new Error('felt_color must be a valid hex color (#RRGGBB)');
    if (!hexRegex.test(primary_color)) throw new Error('primary_color must be a valid hex color (#RRGGBB)');
    if (logo_url !== null) {
      try {
        new URL(logo_url);
      } catch {
        throw new Error('logo_url must be a valid URL or null');
      }
    }
  }

  // ─── Auto-Pause Timeout ────────────────────────────────────────────────────

  /**
   * Get auto-pause timeout (idle minutes before pausing table).
   */
  async getAutoPauseTimeout(schoolId) {
    const value = await this._getSetting(schoolId, 'table:auto_pause_timeout');
    return value || { idle_minutes: 15 };
  }

  /**
   * Set auto-pause timeout. Validates idle_minutes (5–120).
   */
  async setAutoPauseTimeout(schoolId, payload, updatedBy) {
    this._validateAutoPauseTimeout(payload);
    await this._setSetting(schoolId, 'table:auto_pause_timeout', payload, updatedBy);
    return payload;
  }

  /**
   * Validates auto-pause timeout: idle_minutes 5–120.
   */
  _validateAutoPauseTimeout({ idle_minutes }) {
    if (idle_minutes < 5 || idle_minutes > 120) {
      throw new Error('idle_minutes must be 5–120');
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Fetch a single setting from the settings table.
   * Returns null if not found (caller applies own default).
   */
  async _getSetting(schoolId, key) {
    const { data, error } = await this.supabase
      .from('settings')
      .select('value')
      .eq('scope', 'school')
      .eq('scope_id', schoolId)
      .eq('key', key)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data?.value || null;
  }

  /**
   * Upsert a single setting into the settings table.
   */
  async _setSetting(schoolId, key, value, updatedBy) {
    const { error } = await this.supabase
      .from('settings')
      .upsert(
        {
          scope: 'school',
          scope_id: schoolId,
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'scope,scope_id,key' }
      );

    if (error) throw new Error(error.message);
  }
}

module.exports = SchoolSettingsService;