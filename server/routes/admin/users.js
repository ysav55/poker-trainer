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
} = require('../../db/repositories/PlayerRepository.js');

const router = express.Router();
const canManageUsers = requirePermission('user:manage');

// All routes in this file require user:manage permission (requireAuth applied at registration).
router.use(canManageUsers);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { status, role, limit, offset } = req.query;
    const players = await listPlayers({
      status: status || undefined,
      role:   role   || undefined,
      limit:  limit  ? parseInt(limit,  10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    res.json({ players });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  try {
    const { displayName, email, password, role: roleName = 'player' } = req.body || {};
    if (!displayName) return res.status(400).json({ error: 'displayName is required' });
    if (!password)    return res.status(400).json({ error: 'password is required' });

    const passwordHash = await bcrypt.hash(password, 12);
    const newId = await createPlayer({
      displayName,
      email:        email || null,
      passwordHash,
      createdBy:    req.user?.id || null,
    });

    // Look up role by name
    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', roleName).single();
    if (roleRow?.id) {
      await assignRole(newId, roleRow.id, req.user?.id || null);
      invalidatePermissionCache(newId);
    }

    res.status(201).json({ id: newId });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('player_profiles')
      .select('id, display_name, email, status, avatar_url, created_at, player_roles(roles(name))')
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: 'internal_error' });
    if (!data)  return res.status(404).json({ error: 'not_found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  try {
    const { displayName, email, status, avatarUrl } = req.body || {};
    const patch = {};
    if (displayName !== undefined) patch.displayName = displayName;
    if (email       !== undefined) patch.email       = email;
    if (status      !== undefined) patch.status      = status;
    if (avatarUrl   !== undefined) patch.avatarUrl   = avatarUrl;
    await updatePlayer(req.params.id, patch);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/admin/users/:id  (soft delete)
router.delete('/users/:id', async (req, res) => {
  try {
    await archivePlayer(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'password is required' });
    const passwordHash = await bcrypt.hash(password, 12);
    await setPassword(req.params.id, passwordHash);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/admin/users/:id/roles
router.post('/users/:id/roles', async (req, res) => {
  try {
    const { action, role: roleName } = req.body || {};
    if (!action)   return res.status(400).json({ error: 'action is required (assign|remove)' });
    if (!roleName) return res.status(400).json({ error: 'role is required' });
    if (action !== 'assign' && action !== 'remove') {
      return res.status(400).json({ error: 'action must be "assign" or "remove"' });
    }

    const { data: roleRow } = await supabase.from('roles').select('id').eq('name', roleName).single();
    if (!roleRow?.id) return res.status(404).json({ error: 'role_not_found' });

    if (action === 'assign') {
      await assignRole(req.params.id, roleRow.id, req.user?.id || null);
    } else {
      await removeRole(req.params.id, roleRow.id);
    }

    invalidatePermissionCache(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
