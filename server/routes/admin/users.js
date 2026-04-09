'use strict';

const express = require('express');
const bcrypt  = require('bcrypt');

const { requirePermission, invalidatePermissionCache } = require('../../auth/requirePermission.js');
const supabase = require('../../db/supabase.js');
const {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
  setPassword,
  assignRole,
  removeRole,
  getPrimaryRole,
} = require('../../db/repositories/PlayerRepository.js');

const router = express.Router();
const canManageUsers = requirePermission('user:manage');

// All routes in this file require user:manage permission (requireAuth applied at registration).
router.use(canManageUsers);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract primary role name from nested player_roles structure returned by Supabase.
 * player_roles: [{ roles: { name: 'coach' } }, ...]
 */
const ROLE_PRIORITY = ['superadmin', 'admin', 'coach', 'coached_student', 'solo_student', 'trial'];

function normalizeRole(playerRoles) {
  if (!Array.isArray(playerRoles) || playerRoles.length === 0) return null;
  const names = playerRoles.map(pr => pr.roles?.name).filter(Boolean);
  for (const r of ROLE_PRIORITY) {
    if (names.includes(r)) return r;
  }
  return names[0] ?? null;
}

function normalizeUser(row) {
  return {
    id:           row.id,
    display_name: row.display_name,
    email:        row.email      ?? null,
    status:       row.status     ?? 'active',
    avatar_url:   row.avatar_url ?? null,
    last_seen:    row.last_seen  ?? null,
    coach_id:     row.coach_id   ?? null,
    created_at:   row.created_at ?? null,
    role:         row.player_roles !== undefined ? normalizeRole(row.player_roles) : (row.role ?? null),
  };
}

/**
 * Resolve a role row from the `roles` table by name.
 * Returns the role UUID or null if not found.
 */
async function resolveRoleId(roleName) {
  const { data, error } = await supabase.from('roles').select('id').eq('name', roleName).maybeSingle();
  if (error) throw new Error(`Failed to resolve role '${roleName}': ${error.message}`);
  return data?.id ?? null;
}

/**
 * Replace all roles for a player with a single new role.
 * Removes any existing roles first, then assigns the new one.
 */
async function setPlayerRole(playerId, roleName, assignedBy) {
  // Remove all existing roles for this player
  await supabase.from('player_roles').delete().eq('player_id', playerId);

  // Assign new role if given
  if (roleName) {
    const roleId = await resolveRoleId(roleName);
    if (!roleId) throw new Error(`Unknown role: '${roleName}'`);
    await assignRole(playerId, roleId, assignedBy);
  }

  invalidatePermissionCache(playerId);
}

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { status, role, limit, offset } = req.query;
    let players = await listPlayers({
      status: status || undefined,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    const normalized = players.map(normalizeUser);

    // Role filter applied in memory (user sets are small in this app)
    const filtered = role
      ? normalized.filter(u => u.role === role)
      : normalized;

    res.json({ players: filtered });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── GET /api/admin/users/pending-resets ─────────────────────────────────────
// Returns all pending password reset requests with player display names.
// Must appear before :id route to avoid being caught by it.

router.get('/users/pending-resets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('password_reset_requests')
      .select('id, player_id, requested_at, player_profiles(display_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false });

    if (error) return res.status(500).json({ error: 'internal_error' });

    const requests = (data || []).map(r => ({
      id:          r.id,
      playerId:    r.player_id,
      displayName: r.player_profiles?.display_name ?? r.player_id,
      requestedAt: r.requested_at,
    }));

    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── GET /api/admin/users/export-csv ─────────────────────────────────────────
// Must appear before :id route to avoid being caught by it

router.get('/users/export-csv', async (req, res) => {
  try {
    const players = await listPlayers({ limit: 10000 });
    const rows = players.map(normalizeUser);

    const header = ['id', 'display_name', 'email', 'role', 'status', 'last_seen', 'created_at'];
    const csvLines = [
      header.join(','),
      ...rows.map(u =>
        header.map(col => {
          const val = u[col] ?? '';
          // Escape values containing commas or quotes
          const s = String(val);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
    res.send(csvLines.join('\n'));
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────

router.get('/users/:id', async (req, res) => {
  try {
    // Try with nested role join; fall back to bare query if it fails (e.g. orphaned player_roles rows)
    let data, playerRoles = [];
    const withRoles = await supabase
      .from('player_profiles')
      .select('id, display_name, email, status, avatar_url, last_seen, coach_id, created_at, player_roles(assigned_at, roles(name))')
      .eq('id', req.params.id)
      .maybeSingle();

    if (withRoles.error) {
      // Fallback: bare profile without role history
      const bare = await supabase
        .from('player_profiles')
        .select('id, display_name, email, status, avatar_url, last_seen, coach_id, created_at')
        .eq('id', req.params.id)
        .maybeSingle();
      if (bare.error) return res.status(500).json({ error: 'internal_error' });
      data = bare.data;
    } else {
      data = withRoles.data;
      playerRoles = data?.player_roles ?? [];
    }

    if (!data) return res.status(404).json({ error: 'not_found' });

    const user = normalizeUser({ ...data, player_roles: playerRoles });

    // Include per-role assignment timestamps for the detail view
    user.roles = playerRoles.map(pr => ({
      role:        pr.roles?.name ?? null,
      assigned_at: pr.assigned_at ?? null,
      active:      true,
    }));

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── POST /api/admin/users ────────────────────────────────────────────────────

router.post('/users', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept both camelCase and snake_case from the frontend
    const displayName = body.displayName || body.display_name;
    const { email, password, role: roleName = 'coached_student', coachId } = body;

    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password)    return res.status(400).json({ error: 'password is required' });

    const creatorId = req.user?.stableId ?? req.user?.id ?? null;
    const passwordHash = await bcrypt.hash(password, 12);
    const newId = await createPlayer({
      displayName,
      email:     email || null,
      passwordHash,
      createdBy: creatorId,
    });

    await setPlayerRole(newId, roleName, creatorId);

    // If coachId explicitly provided, use it; otherwise if creator is a coach, auto-assign self
    const resolvedCoachId = coachId || (req.user?.role === 'coach' ? creatorId : null);
    if (resolvedCoachId) {
      await updatePlayer(newId, { coachId: resolvedCoachId });
    }

    res.status(201).json({ id: newId });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────────────

router.put('/users/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const displayName = body.displayName || body.display_name;
    const { email, status, avatarUrl, role: roleName } = body;

    const patch = {};
    if (displayName !== undefined) patch.displayName = displayName;
    if (email       !== undefined) patch.email       = email;
    if (status      !== undefined) patch.status      = status;
    if (avatarUrl   !== undefined) patch.avatarUrl   = avatarUrl;

    await updatePlayer(req.params.id, patch);

    if (roleName !== undefined) {
      await setPlayerRole(req.params.id, roleName, req.user?.stableId ?? req.user?.id ?? null);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── DELETE /api/admin/users/:id  (soft delete — archives) ───────────────────

router.delete('/users/:id', async (req, res) => {
  try {
    await archivePlayer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── PATCH /api/admin/users/:id/status ───────────────────────────────────────

router.patch('/users/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const VALID = ['active', 'suspended', 'archived'];
    if (!status)              return res.status(400).json({ error: 'status is required' });
    if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID.join(', ')}` });
    await updatePlayer(req.params.id, { status });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── PATCH /api/admin/users/:id/role ─────────────────────────────────────────

router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role: roleName } = req.body || {};
    if (!roleName) return res.status(400).json({ error: 'role is required' });
    await setPlayerRole(req.params.id, roleName, req.user?.stableId ?? req.user?.id ?? null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── PATCH /api/admin/users/:id/coach ────────────────────────────────────────

router.patch('/users/:id/coach', async (req, res) => {
  try {
    const { coachId } = req.body || {};
    // coachId === null means unassign; a UUID string means assign
    if (coachId !== null && coachId !== undefined) {
      // Verify coach exists before assigning
      const { data: coachRow } = await supabase
        .from('player_profiles')
        .select('id')
        .eq('id', coachId)
        .maybeSingle();
      if (!coachRow) return res.status(404).json({ error: 'coach_not_found' });
    }
    await updatePlayer(req.params.id, { coachId: coachId ?? null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── POST /api/admin/users/:id/reset-password ────────────────────────────────

router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'password is required' });
    const passwordHash = await bcrypt.hash(password, 12);
    await setPassword(req.params.id, passwordHash);

    // Resolve any pending reset request for this user
    await supabase.from('password_reset_requests')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: req.user?.stableId ?? req.user?.id ?? null })
      .eq('player_id', req.params.id)
      .eq('status', 'pending');

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// ─── POST /api/admin/users/:id/roles (granular assign/remove) ────────────────

router.post('/users/:id/roles', async (req, res) => {
  try {
    const { action, role: roleName } = req.body || {};
    if (!action)   return res.status(400).json({ error: 'action is required (assign|remove)' });
    if (!roleName) return res.status(400).json({ error: 'role is required' });
    if (action !== 'assign' && action !== 'remove') {
      return res.status(400).json({ error: 'action must be "assign" or "remove"' });
    }

    const roleId = await resolveRoleId(roleName);
    if (!roleId) return res.status(404).json({ error: 'role_not_found' });

    if (action === 'assign') {
      await assignRole(req.params.id, roleId, req.user?.stableId ?? req.user?.id ?? null);
    } else {
      await removeRole(req.params.id, roleId);
    }

    invalidatePermissionCache(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
