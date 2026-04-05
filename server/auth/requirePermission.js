'use strict';

const supabase = require('../db/supabase.js');

// In-memory cache: Map<playerId, Set<permKey>>
const permissionCache = new Map();

async function getPlayerPermissions(playerId, roleHint = null) {
  if (permissionCache.has(playerId)) return permissionCache.get(playerId);

  const { data } = await supabase
    .from('player_roles')
    .select('roles(role_permissions(permissions(key)))')
    .eq('player_id', playerId);

  let keys = new Set(
    data?.flatMap(pr =>
      pr.roles?.role_permissions?.map(rp => rp.permissions?.key).filter(Boolean) ?? []
    ) ?? []
  );

  // Fallback: players with no player_roles rows — derive permissions from JWT role name.
  if (keys.size === 0 && roleHint) {
    const { data: roleData } = await supabase
      .from('roles')
      .select('role_permissions(permissions(key))')
      .eq('name', roleHint)
      .single();
    keys = new Set(
      roleData?.role_permissions?.map(rp => rp.permissions?.key).filter(Boolean) ?? []
    );
  }

  permissionCache.set(playerId, keys);
  return keys;
}

function invalidatePermissionCache(playerId) {
  permissionCache.delete(playerId);
}

function requirePermission(...keys) {
  return async (req, res, next) => {
    const uid = req.user?.stableId ?? req.user?.id;
    if (!uid) return res.status(401).json({ error: 'Unauthorized' });
    const perms = await getPlayerPermissions(uid, req.user?.role);
    if (keys.every(k => perms.has(k))) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = { getPlayerPermissions, invalidatePermissionCache, requirePermission };
