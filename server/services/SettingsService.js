'use strict';

/**
 * SettingsService — cascading key/value settings backed by the `settings` table.
 *
 * Resolution chain for TABLE DEFAULTS (coach caller):
 *   1. scope='school', scope_id=coach.school_id  → school override
 *   2. scope='org',    scope_id=ORG_SCOPE_ID     → platform default
 *   3. Hardcoded app default
 *
 * Resolution chain for admins (no school):
 *   1. scope='org',    scope_id=ORG_SCOPE_ID     → platform default
 *   2. Hardcoded app default
 *
 * Org-level scope_id uses the Default School UUID (migration 014 sentinel)
 * because Postgres UNIQUE btree indexes treat NULL ≠ NULL, making upserts
 * unreliable when scope_id is NULL.
 */

const supabase = require('../db/supabase');

// Sentinel UUID for org-level settings (matches Default School seed in migration 014)
const ORG_SCOPE_ID = '00000000-0000-0000-0000-000000000001';

// ─── Hardcoded app defaults ───────────────────────────────────────────────────

const TABLE_DEFAULTS_APP = {
  'table.default_game_type':           'cash',
  'table.default_max_players':         9,
  'table.default_privacy':             'school',
  'table.default_sb':                  25,
  'table.default_bb':                  50,
  'table.default_ante':                0,
  'table.buy_in_min_bb':               20,
  'table.buy_in_max_bb':               100,
  'table.default_starting_stack':      2500,
  'table.rebuy_allowed':               true,
  'table.rebuy_max':                   3,
  'table.time_bank_per_decision':      30,
  'table.time_bank_per_session':       120,
  'table.show_at_showdown':            true,
  'table.allow_muck_river':            true,
  'table.coach_disconnect':            'pause',
  'table.student_disconnect_timeout':  5,
};

const TABLE_DEFAULTS_KEYS = Object.keys(TABLE_DEFAULTS_APP);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _fetchRows(scope, scopeId, keyPrefix) {
  const q = supabase
    .from('settings')
    .select('key, value')
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .like('key', `${keyPrefix}%`);
  const { data, error } = await q;
  if (error) throw error;
  return new Map((data ?? []).map(r => [r.key, r.value]));
}

async function _upsertRow(scope, scopeId, key, value) {
  const { error } = await supabase
    .from('settings')
    .upsert(
      { scope, scope_id: scopeId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'scope,scope_id,key' }
    );
  if (error) throw error;
}

async function _deleteRows(scope, scopeId, keyPrefix) {
  const { error } = await supabase
    .from('settings')
    .delete()
    .eq('scope', scope)
    .eq('scope_id', scopeId)
    .like('key', `${keyPrefix}%`);
  if (error) throw error;
}

// ─── Table Defaults ───────────────────────────────────────────────────────────

/**
 * Resolve all 17 table default keys for a given caller.
 * @param {string|null} schoolId  - caller's school_id (null for admins)
 * @returns {Array<{ key, value, source_scope }>}
 */
async function resolveTableDefaults(schoolId) {
  const [schoolMap, orgMap] = await Promise.all([
    schoolId ? _fetchRows('school', schoolId, 'table.') : Promise.resolve(new Map()),
    _fetchRows('org', ORG_SCOPE_ID, 'table.'),
  ]);

  return TABLE_DEFAULTS_KEYS.map(key => {
    if (schoolMap.has(key)) return { key, value: schoolMap.get(key), source_scope: 'school' };
    if (orgMap.has(key))    return { key, value: orgMap.get(key),    source_scope: 'org' };
    return { key, value: TABLE_DEFAULTS_APP[key], source_scope: 'hardcoded' };
  });
}

/**
 * Save table defaults. Validates keys; unknown keys are silently ignored.
 * @param {'school'|'org'} scope
 * @param {string}         scopeId - school_id or ORG_SCOPE_ID
 * @param {object}         patch   - { 'table.key': value, … }
 */
async function saveTableDefaults(scope, scopeId, patch) {
  const writes = Object.entries(patch)
    .filter(([key]) => TABLE_DEFAULTS_KEYS.includes(key))
    .map(([key, value]) => _upsertRow(scope, scopeId, key, value));
  await Promise.all(writes);
}

/**
 * Reset all table defaults at the given scope (removes overrides).
 */
async function resetTableDefaults(scope, scopeId) {
  await _deleteRows(scope, scopeId, 'table.');
}

// ─── Leaderboard config cascade ───────────────────────────────────────────────

const LEADERBOARD_HARDCODED = {
  primary_metric:   'net_chips',
  secondary_metric: 'win_rate',
  update_frequency: 'after_session',
};

/**
 * Resolve leaderboard config for a school caller.
 * Returns { value: {...}, source: 'school' | 'org' | 'hardcoded' }
 * @param {string|null} schoolId
 */
async function resolveLeaderboardConfig(schoolId) {
  const [schoolVal, orgVal] = await Promise.all([
    schoolId ? getSchoolSetting(schoolId, 'school.leaderboard') : Promise.resolve(null),
    getOrgSetting('org.leaderboard'),
  ]);
  if (schoolVal) return { value: { ...LEADERBOARD_HARDCODED, ...schoolVal }, source: 'school' };
  if (orgVal)    return { value: { ...LEADERBOARD_HARDCODED, ...orgVal },    source: 'org' };
  return { value: LEADERBOARD_HARDCODED, source: 'hardcoded' };
}

/**
 * Resolve blind structures: school structures first (full CRUD), then org (read-only).
 * Each entry is tagged with source: 'school' | 'org'.
 * @param {string|null} schoolId
 */
async function resolveBlindStructures(schoolId) {
  const [schoolVal, orgVal] = await Promise.all([
    schoolId ? getSchoolSetting(schoolId, 'school.blind_structures') : Promise.resolve(null),
    getOrgSetting('org.blind_structures'),
  ]);
  const school = Array.isArray(schoolVal) ? schoolVal : [];
  const org    = Array.isArray(orgVal)    ? orgVal    : [];
  return [
    ...school.map(s => ({ ...s, source: 'school' })),
    ...org.map(s => ({ ...s, source: 'org' })),
  ];
}

/**
 * Delete a school-scope setting row entirely (used for "Reset to platform default").
 */
async function deleteSchoolSetting(schoolId, key) {
  const { error } = await supabase
    .from('settings')
    .delete()
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .eq('key', key);
  if (error) throw error;
}

// ─── Generic org/school key access ───────────────────────────────────────────
// Used by Phase C (org settings) and Phase D (school settings).

/**
 * Get a single setting value for org scope.
 * Returns null if not set (caller applies own default).
 */
async function getOrgSetting(key) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('scope', 'org')
    .eq('scope_id', ORG_SCOPE_ID)
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/**
 * Set a single setting value for org scope.
 */
async function setOrgSetting(key, value) {
  await _upsertRow('org', ORG_SCOPE_ID, key, value);
}

/**
 * Get a single setting value for school scope.
 */
async function getSchoolSetting(schoolId, key) {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

/**
 * Set a single setting value for school scope.
 */
async function setSchoolSetting(schoolId, key, value) {
  await _upsertRow('school', schoolId, key, value);
}

module.exports = {
  ORG_SCOPE_ID,
  TABLE_DEFAULTS_APP,
  TABLE_DEFAULTS_KEYS,
  resolveTableDefaults,
  saveTableDefaults,
  resetTableDefaults,
  resolveLeaderboardConfig,
  resolveBlindStructures,
  deleteSchoolSetting,
  getOrgSetting,
  setOrgSetting,
  getSchoolSetting,
  setSchoolSetting,
};
