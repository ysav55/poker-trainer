'use strict';

const express          = require('express');
const { requirePermission } = require('../../auth/requirePermission.js');
const supabase         = require('../../db/supabase.js');
const SchoolRepository = require('../../db/repositories/SchoolRepository.js');

const router  = express.Router();
const canView = requirePermission('crm:view');
const canEdit = requirePermission('crm:edit');

// ── Helper: resolve the requesting user's school_id ───────────────────────────
async function resolveSchoolId(user) {
  const uid = user?.stableId ?? user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('player_profiles')
    .select('school_id')
    .eq('id', uid)
    .maybeSingle();
  return data?.school_id ?? null;
}

// ── GET /api/admin/groups/my-school ──────────────────────────────────────────
// Returns the authenticated user's school groups + policy in one call.
// Used by SettingsPage SchoolTab.
router.get('/groups/my-school', canView, async (req, res) => {
  try {
    const schoolId = await resolveSchoolId(req.user);
    if (!schoolId)
      return res.json({ schoolId: null, policy: { enabled: true, max_groups: null, max_players_per_group: null }, groups: [] });

    const policy = await SchoolRepository.getGroupPolicy(schoolId);

    const { data, error } = await supabase
      .from('groups')
      .select('id, name, color, school_id, created_at, player_groups(player_id)')
      .eq('school_id', schoolId)
      .order('name');
    if (error) throw error;

    const groups = (data ?? []).map((g) => ({
      ...g,
      member_count: (g.player_groups ?? []).length,
      player_groups: undefined,
    }));

    res.json({ schoolId, policy, groups });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/admin/groups ─────────────────────────────────────────────────────
// ?schoolId=uuid   — filter to a specific school
// ?includeMembers=1 — embed member list in each group
router.get('/groups', canView, async (req, res) => {
  try {
    const { schoolId, includeMembers } = req.query;

    let query = supabase
      .from('groups')
      .select(
        includeMembers === '1'
          ? 'id, name, color, school_id, created_at, player_groups(player_id, player_profiles(id, display_name, role, status))'
          : 'id, name, color, school_id, created_at',
      )
      .order('name');

    if (schoolId) query = query.eq('school_id', schoolId);

    const { data, error } = await query;
    if (error) throw error;

    const groups = (data ?? []).map((g) => {
      if (includeMembers !== '1') return g;
      return {
        ...g,
        members:       (g.player_groups ?? []).map((pg) => ({ ...(pg.player_profiles ?? {}) })),
        player_groups: undefined,
      };
    });

    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /api/admin/groups ────────────────────────────────────────────────────
router.post('/groups', canEdit, async (req, res) => {
  try {
    const { name, color = '#58a6ff', schoolId: bodySchoolId } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 1)
      return res.status(400).json({ error: 'name_required', message: 'Group name is required.' });

    // Resolve school: body value first, else requester's school
    const schoolId = bodySchoolId ?? (await resolveSchoolId(req.user));

    // Enforce policy
    if (schoolId) {
      const policy = await SchoolRepository.getGroupPolicy(schoolId);
      if (policy.enabled === false)
        return res.status(403).json({ error: 'groups_disabled', message: 'Groups are not enabled for this school.' });

      if (policy.max_groups != null) {
        const { count } = await supabase
          .from('groups')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', schoolId);
        if (count >= policy.max_groups)
          return res.status(409).json({
            error:   'groups_limit_reached',
            message: `Maximum number of groups (${policy.max_groups}) reached.`,
          });
      }
    }

    const { data, error } = await supabase
      .from('groups')
      .insert({
        name:       name.trim(),
        color,
        school_id:  schoolId ?? null,
        created_by: req.user?.stableId ?? req.user?.id ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── PATCH /api/admin/groups/:id ───────────────────────────────────────────────
router.patch('/groups/:id', canEdit, async (req, res) => {
  try {
    const fields = {};
    if (req.body.name  !== undefined) fields.name  = String(req.body.name).trim();
    if (req.body.color !== undefined) fields.color = req.body.color;

    if (Object.keys(fields).length === 0)
      return res.status(400).json({ error: 'no_fields', message: 'Nothing to update.' });

    const { data, error } = await supabase
      .from('groups')
      .update(fields)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/admin/groups/:id ──────────────────────────────────────────────
router.delete('/groups/:id', canEdit, async (req, res) => {
  try {
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── GET /api/admin/groups/:id/members ─────────────────────────────────────────
router.get('/groups/:id/members', canView, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('player_groups')
      .select('added_at, player_profiles(id, display_name, role, status, created_at, last_seen)')
      .eq('group_id', req.params.id);

    if (error) throw error;
    const members = (data ?? []).map((r) => ({ ...r.player_profiles, added_at: r.added_at }));
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── POST /api/admin/groups/:id/members ───────────────────────────────────────
// Body: { playerId }
router.post('/groups/:id/members', canEdit, async (req, res) => {
  try {
    const { playerId } = req.body || {};
    if (!playerId) return res.status(400).json({ error: 'playerId_required' });

    // Enforce max_players_per_group
    const { data: grp } = await supabase
      .from('groups')
      .select('school_id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (grp?.school_id) {
      const policy = await SchoolRepository.getGroupPolicy(grp.school_id);
      if (policy.max_players_per_group != null) {
        const { count } = await supabase
          .from('player_groups')
          .select('player_id', { count: 'exact', head: true })
          .eq('group_id', req.params.id);
        if (count >= policy.max_players_per_group)
          return res.status(409).json({
            error:   'group_full',
            message: `This group is full (max ${policy.max_players_per_group} players).`,
          });
      }
    }

    const { error } = await supabase
      .from('player_groups')
      .insert({ player_id: playerId, group_id: req.params.id });

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'already_member' });
      throw error;
    }
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ── DELETE /api/admin/groups/:id/members/:playerId ───────────────────────────
router.delete('/groups/:id/members/:playerId', canEdit, async (req, res) => {
  try {
    const { error } = await supabase
      .from('player_groups')
      .delete()
      .eq('group_id', req.params.id)
      .eq('player_id', req.params.playerId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
