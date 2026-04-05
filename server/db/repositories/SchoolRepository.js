'use strict';

const supabase = require('../supabase');

const SCHOOL_COLUMNS = 'id, name, description, logo_url, primary_color, theme, status, max_coaches, max_students, created_at, updated_at, created_by, updated_by';
const PROFILE_COLUMNS = 'id, display_name, email, status, avatar_url, school_id, player_roles(roles(name))';

// ─── School CRUD ──────────────────────────────────────────────────────────────

async function findAll() {
  const { data, error } = await supabase
    .from('schools')
    .select(`${SCHOOL_COLUMNS}`)
    .order('name');
  if (error) throw new Error(error.message);

  // Attach member counts
  const counts = await Promise.all((data || []).map(s => getMemberCounts(s.id)));
  return (data || []).map((s, i) => ({ ...s, ...counts[i] }));
}

async function findById(id) {
  const { data, error } = await supabase
    .from('schools')
    .select(SCHOOL_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const counts = await getMemberCounts(id);
  return { ...data, ...counts };
}

async function create({ name, logoUrl, primaryColor, theme, maxCoaches, maxStudents, createdBy }) {
  const insert = {
    name,
    logo_url:     logoUrl     ?? null,
    primary_color: primaryColor ?? null,
    theme:        theme        ?? {},
    max_coaches:  maxCoaches   ?? null,
    max_students: maxStudents  ?? null,
    created_by:   createdBy    ?? null,
    updated_by:   createdBy    ?? null,
  };
  const { data, error } = await supabase
    .from('schools')
    .insert(insert)
    .select(SCHOOL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function update(id, fields, updatedBy) {
  const patch = { updated_at: new Date().toISOString(), updated_by: updatedBy ?? null };
  if (fields.name         !== undefined) patch.name          = fields.name;
  if (fields.description  !== undefined) patch.description   = fields.description;
  if (fields.logoUrl      !== undefined) patch.logo_url      = fields.logoUrl;
  if (fields.primaryColor !== undefined) patch.primary_color = fields.primaryColor;
  if (fields.theme        !== undefined) patch.theme         = fields.theme;
  if (fields.maxCoaches   !== undefined) patch.max_coaches   = fields.maxCoaches;
  if (fields.maxStudents  !== undefined) patch.max_students  = fields.maxStudents;
  if (fields.status       !== undefined) patch.status        = fields.status;

  const { data, error } = await supabase
    .from('schools')
    .update(patch)
    .eq('id', id)
    .select(SCHOOL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function archive(id) {
  const { error } = await supabase
    .from('schools')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── Members ─────────────────────────────────────────────────────────────────

async function getMembers(schoolId, { role } = {}) {
  let query = supabase
    .from('player_profiles')
    .select(PROFILE_COLUMNS)
    .eq('school_id', schoolId)
    .order('display_name');

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let members = data || [];

  if (role) {
    members = members.filter(p =>
      p.player_roles?.some(pr => pr.roles?.name === role)
    );
  }

  return members;
}

async function getMemberCounts(schoolId) {
  const members = await getMembers(schoolId);
  const coaches  = members.filter(p => p.player_roles?.some(pr =>
    ['coach', 'admin', 'superadmin'].includes(pr.roles?.name)
  )).length;
  const students = members.filter(p => p.player_roles?.some(pr =>
    ['player', 'trial', 'coached_student', 'solo_student'].includes(pr.roles?.name)
  )).length;
  return { coaches, students, total: members.length };
}

async function assignPlayer(playerId, schoolId, updatedBy) {
  const { error } = await supabase
    .from('player_profiles')
    .update({ school_id: schoolId, updated_by: updatedBy ?? null })
    .eq('id', playerId);
  if (error) throw new Error(error.message);
}

async function removePlayer(playerId, updatedBy) {
  const { error } = await supabase
    .from('player_profiles')
    .update({ school_id: null, updated_by: updatedBy ?? null })
    .eq('id', playerId);
  if (error) throw new Error(error.message);
}

// ─── Capacity checks ──────────────────────────────────────────────────────────

async function canAddCoach(schoolId) {
  const school = await findById(schoolId);
  if (!school) return false;
  if (school.max_coaches == null) return true; // no limit set
  return school.coaches < school.max_coaches;
}

async function canAddStudent(schoolId) {
  const school = await findById(schoolId);
  if (!school) return false;
  if (school.max_students == null) return true; // no limit set
  return school.students < school.max_students;
}

// ─── Feature toggles ──────────────────────────────────────────────────────────

const VALID_FEATURES = new Set([
  'feature:replay', 'feature:analysis', 'feature:chip_bank',
  'feature:playlists', 'feature:tournaments', 'feature:crm',
  'feature:leaderboard', 'feature:scenarios', 'feature:groups',
]);

async function getFeatures(schoolId) {
  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .like('key', 'feature:%');
  if (error) throw new Error(error.message);

  const result = {};
  for (const feat of VALID_FEATURES) {
    const shortKey = feat.replace('feature:', '');
    const row = (data || []).find(r => r.key === feat);
    result[shortKey] = row ? row.value?.enabled !== false : true;
  }
  return result;
}

async function setFeature(schoolId, featureKey, enabled, updatedBy) {
  const fullKey = featureKey.startsWith('feature:') ? featureKey : `feature:${featureKey}`;
  if (!VALID_FEATURES.has(fullKey)) throw new Error(`Unknown feature key: ${featureKey}`);

  const { error } = await supabase
    .from('settings')
    .upsert({
      scope:    'school',
      scope_id: schoolId,
      key:      fullKey,
      value:    { enabled: Boolean(enabled), updated_by: updatedBy ?? null },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scope,scope_id,key' });
  if (error) throw new Error(error.message);
}

async function bulkSetFeatures(schoolId, featureMap, updatedBy) {
  const rows = Object.entries(featureMap).map(([k, enabled]) => {
    const fullKey = k.startsWith('feature:') ? k : `feature:${k}`;
    if (!VALID_FEATURES.has(fullKey)) throw new Error(`Unknown feature key: ${k}`);
    return {
      scope:    'school',
      scope_id: schoolId,
      key:      fullKey,
      value:    { enabled: Boolean(enabled), updated_by: updatedBy ?? null },
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from('settings')
    .upsert(rows, { onConflict: 'scope,scope_id,key' });
  if (error) throw new Error(error.message);
}

// ─── Group policy ─────────────────────────────────────────────────────────────

/**
 * Returns the effective group policy for a school.
 * School-level setting takes priority; falls back to org-level default.
 * Shape: { enabled: bool, max_groups: int|null, max_players_per_group: int|null }
 */
async function getGroupPolicy(schoolId) {
  // School-level override
  const { data: schoolRow } = await supabase
    .from('settings')
    .select('value')
    .eq('scope', 'school')
    .eq('scope_id', schoolId)
    .eq('key', 'feature:groups')
    .maybeSingle();

  if (schoolRow?.value && 'enabled' in schoolRow.value) {
    return {
      enabled:               schoolRow.value.enabled !== false,
      max_groups:            schoolRow.value.max_groups            ?? null,
      max_players_per_group: schoolRow.value.max_players_per_group ?? null,
    };
  }

  // Org-level default
  const { data: orgRow } = await supabase
    .from('settings')
    .select('value')
    .eq('scope', 'org')
    .is('scope_id', null)
    .eq('key', 'policy:groups')
    .maybeSingle();

  return {
    enabled:               orgRow?.value?.enabled !== false,
    max_groups:            orgRow?.value?.max_groups            ?? null,
    max_players_per_group: orgRow?.value?.max_players_per_group ?? null,
  };
}

/** Upserts the school-level group policy. */
async function setGroupPolicy(schoolId, { enabled, max_groups, max_players_per_group }, updatedBy) {
  const { error } = await supabase
    .from('settings')
    .upsert({
      scope:    'school',
      scope_id: schoolId,
      key:      'feature:groups',
      value: {
        enabled:               enabled !== false,
        max_groups:            max_groups            != null ? Number(max_groups)            : null,
        max_players_per_group: max_players_per_group != null ? Number(max_players_per_group) : null,
        updated_by:            updatedBy ?? null,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scope,scope_id,key' });
  if (error) throw new Error(error.message);
}

/** Gets the org-level group policy defaults. */
async function getOrgGroupPolicy() {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('scope', 'org')
    .is('scope_id', null)
    .eq('key', 'policy:groups')
    .maybeSingle();

  return {
    enabled:               data?.value?.enabled               !== false,
    max_groups:            data?.value?.max_groups            ?? null,
    max_players_per_group: data?.value?.max_players_per_group ?? null,
  };
}

/** Sets the org-level group policy defaults. */
async function setOrgGroupPolicy({ enabled, max_groups, max_players_per_group }, updatedBy) {
  const { error } = await supabase
    .from('settings')
    .upsert({
      scope:    'org',
      scope_id: null,
      key:      'policy:groups',
      value: {
        enabled:               enabled !== false,
        max_groups:            max_groups            != null ? Number(max_groups)            : null,
        max_players_per_group: max_players_per_group != null ? Number(max_players_per_group) : null,
        updated_by:            updatedBy ?? null,
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'scope,scope_id,key' });
  if (error) throw new Error(error.message);
}

module.exports = {
  findAll, findById, create, update, archive,
  getMembers, getMemberCounts, assignPlayer, removePlayer,
  canAddCoach, canAddStudent,
  getFeatures, setFeature, bulkSetFeatures,
  getGroupPolicy, setGroupPolicy, getOrgGroupPolicy, setOrgGroupPolicy,
  VALID_FEATURES,
};
