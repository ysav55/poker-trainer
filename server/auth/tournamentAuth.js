'use strict';

const supabase = require('../db/supabase.js');
const { getPlayerPermissions } = require('./requirePermission.js');

/**
 * Returns true if the user can manage the given tournament.
 * Allows either:
 *   a) the user has the `tournament:manage` permission globally, OR
 *   b) the user is an active referee for this specific table or group
 *
 * @param {string} userId - stable UUID of the requesting user
 * @param {{ tableId?: string, groupId?: string }} scope
 */
async function canManageTournament(userId, { tableId = null, groupId = null } = {}) {
  // Check global permission
  const perms = await getPlayerPermissions(userId);
  if (perms.has('tournament:manage')) return true;

  // Check active referee row
  const query = supabase
    .from('tournament_referees')
    .select('id')
    .eq('player_id', userId)
    .eq('active', true);

  if (tableId)  query.eq('table_id', tableId);
  else if (groupId) query.eq('group_id', groupId);
  else return false;

  const { data } = await query.maybeSingle();
  return !!data;
}

/**
 * Returns true if the requester can appoint/revoke a referee for the given scope.
 * Requires `tournament:manage` permission (coaches and above, not the ref themselves).
 */
async function canAppoint(userId) {
  const perms = await getPlayerPermissions(userId);
  return perms.has('tournament:manage');
}

/**
 * Express middleware factory. Reads tableId from req.params.id (or req.params.tableId).
 * Responds 403 if the user cannot manage the tournament.
 */
function requireTournamentAccess(opts = {}) {
  return async (req, res, next) => {
    const userId  = req.user?.stableId ?? req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const tableId = opts.tableId ?? req.params.id ?? req.params.tableId ?? null;
    const groupId = opts.groupId ?? req.params.groupId ?? null;
    const ok = await canManageTournament(userId, { tableId, groupId });
    if (!ok) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

module.exports = { canManageTournament, canAppoint, requireTournamentAccess };
