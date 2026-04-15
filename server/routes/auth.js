'use strict';

const bcrypt      = require('bcrypt');
const requireAuth = require('../auth/requireAuth.js');

const TRIAL_DAYS    = 7;
const TRIAL_HANDS   = 20;
const BCRYPT_ROUNDS = 12;

/**
 * Returns 'active' if the player currently has an active trial, null otherwise.
 * Accepts a player_profiles row (with trial_expires_at and trial_hands_remaining).
 */
function computeTrialStatus(player) {
  if (!player?.trial_expires_at) return null;
  const expired = new Date(player.trial_expires_at) <= new Date();
  if (expired) return null;
  if (player.trial_hands_remaining != null && player.trial_hands_remaining <= 0) return null;
  return 'active';
}

module.exports = function registerAuthRoutes(app, { HandLogger, PlayerRoster, JwtService, authLimiter, log }) {

  // ── POST /api/auth/register ──────────────────────────────────────────────────
  // Student self-registration. Creates a trial account (7-day / 20-hand window).
  //
  // Request body:
  //   name, password, email (required/optional per validation)
  //   coachId (optional) — legacy path
  //   schoolId (optional) — legacy path
  //   schoolName (optional) — new: school name for lookup
  //   schoolPassword (optional) — new: school enrollment password
  //
  // Validation rules:
  //   - schoolName and schoolPassword must both be provided or both absent
  //   - If both provided, ignore coachId; role is coached_student
  //   - If neither provided, role is coached_student (if coachId) or solo_student
  //
  // Flow:
  //   1. Search school by name using SchoolRepository.searchByName()
  //   2. Validate password using SchoolPasswordService.validatePassword()
  //   3. Check school capacity
  //   4. Create player, assign coached_student role
  //   5. Auto-add to group if password specifies groupId
  //   6. Record password usage
  //   7. Assign school_id on player_profiles
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const { name, password, email, coachId, schoolId, schoolName, schoolPassword } = req.body || {};

    // ─── Input validation ─────────────────────────────────────────────────────────
    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });
    if (!password || typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 8 characters.' });
    if (email && (typeof email !== 'string' || !email.includes('@')))
      return res.status(400).json({ error: 'invalid_email', message: 'Email is not valid.' });

    // Validate schoolName and schoolPassword consistency
    const hasSchoolName = schoolName && typeof schoolName === 'string' && schoolName.trim().length > 0;
    const hasSchoolPassword = schoolPassword && typeof schoolPassword === 'string' && schoolPassword.trim().length > 0;

    if (hasSchoolName !== hasSchoolPassword) {
      return res.status(400).json({
        error: 'school_params_mismatch',
        message: 'Both schoolName and schoolPassword must be provided together, or neither.'
      });
    }

    const { findByDisplayName, createPlayer, getPrimaryRole, assignRole } = require('../db/repositories/PlayerRepository');
    const { searchByName, canAddStudent, findById: findSchool } = require('../db/repositories/SchoolRepository');
    const SchoolPasswordService = require('../services/SchoolPasswordService');
    const supabase = require('../db/supabase.js');

    try {
      const existing = await findByDisplayName(name.trim());
      if (existing) return res.status(409).json({ error: 'name_taken', message: 'That name is already registered.' });

      // ─── Determine school path ────────────────────────────────────────────────────
      let effectiveSchoolId = schoolId;
      let effectiveGroupId = null;

      if (hasSchoolName && hasSchoolPassword) {
        // New school enrollment path: search by name, validate password
        const schoolMatches = await searchByName(schoolName.trim(), 1);
        if (schoolMatches.length === 0) {
          return res.status(404).json({ error: 'school_not_found', message: `School "${schoolName}" not found.` });
        }

        const school = schoolMatches[0];
        if (school.status !== 'active') {
          return res.status(409).json({ error: 'school_inactive', message: 'This school is not active.' });
        }

        // Validate school password
        const pwValidation = await SchoolPasswordService.validatePassword(school.id, schoolPassword.trim());
        if (!pwValidation.valid) {
          const errorMap = {
            'invalid_password': { code: 'invalid_school_password', msg: 'School enrollment password is incorrect.' },
            'password_expired': { code: 'school_password_expired', msg: 'This enrollment password has expired.' },
            'password_maxed': { code: 'school_password_maxed', msg: 'This enrollment password has reached its limit.' },
            'internal_error': { code: 'internal_error', msg: 'Failed to validate enrollment password.' }
          };
          const errDef = errorMap[pwValidation.error] || errorMap['internal_error'];
          return res.status(400).json({ error: errDef.code, message: errDef.msg });
        }

        effectiveSchoolId = school.id;
        effectiveGroupId = pwValidation.groupId;
      } else if (schoolId) {
        // Legacy schoolId path: just verify it exists and has capacity
        const school = await findSchool(schoolId);
        if (!school) return res.status(404).json({ error: 'school_not_found', message: 'School not found.' });
        if (school.status !== 'active') return res.status(409).json({ error: 'school_inactive', message: 'School is not active.' });
      }

      // ─── School capacity check ────────────────────────────────────────────────────
      if (effectiveSchoolId) {
        const ok = await canAddStudent(effectiveSchoolId);
        if (!ok) return res.status(409).json({ error: 'school_at_capacity', message: 'This school has reached its student limit.' });
      }

      // ─── Create player ────────────────────────────────────────────────────────────
      const passwordHash   = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const trialExpiresAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const newId = await createPlayer({
        displayName: name.trim(),
        email:       email ? email.trim().toLowerCase() : undefined,
        passwordHash,
        createdBy:   null,
      });

      // Set trial fields
      await supabase.from('player_profiles').update({
        trial_expires_at:      trialExpiresAt,
        trial_hands_remaining: TRIAL_HANDS,
      }).eq('id', newId);

      // ─── Assign role ──────────────────────────────────────────────────────────────
      // If registering via school enrollment password, always use coached_student.
      // Otherwise, use coached_student if coachId provided, else solo_student.
      const roleName = (hasSchoolName && hasSchoolPassword) || coachId ? 'coached_student' : 'solo_student';
      const { data: roleRow } = await supabase.from('roles').select('id').eq('name', roleName).single();
      if (roleRow?.id) await assignRole(newId, roleRow.id, null);

      // ─── Assign school ────────────────────────────────────────────────────────────
      if (effectiveSchoolId) {
        await supabase.from('player_profiles').update({ school_id: effectiveSchoolId }).eq('id', newId);
      }

      // ─── Auto-add to group if password specified groupId ─────────────────────────
      if (effectiveGroupId) {
        await supabase.from('player_groups').insert({
          player_id: newId,
          group_id: effectiveGroupId
        });
      }

      // ─── Record password usage ────────────────────────────────────────────────────
      if (hasSchoolName && hasSchoolPassword) {
        const pwValidation = await SchoolPasswordService.validatePassword(effectiveSchoolId, schoolPassword.trim());
        if (pwValidation.valid && pwValidation.passwordId) {
          await SchoolPasswordService.recordUsage(pwValidation.passwordId, newId);
        }
      }

      const role  = await getPrimaryRole(newId);
      // New registrations always start with an active trial
      const token = JwtService.sign({ stableId: newId, name: name.trim(), role: role ?? roleName, trialStatus: 'active' });
      log.info('auth', 'register_ok', `New student registered: ${name.trim()}`, {
        playerId: newId,
        role: roleName,
        coachId,
        schoolId: effectiveSchoolId,
        enrolledViaPassword: hasSchoolName && hasSchoolPassword
      });
      return res.status(201).json({ stableId: newId, name: name.trim(), role: role ?? roleName, trialStatus: 'active', token });
    } catch (err) {
      log.error('auth', 'register_error', `Registration error: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Registration failed.' });
    }
  });

  // ── POST /api/auth/login ─────────────────────────────────────────────────────
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { name, password } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length === 0)
      return res.status(400).json({ error: 'invalid_input', message: 'Name is required.' });
    if (!password || typeof password !== 'string')
      return res.status(400).json({ error: 'invalid_input', message: 'Password is required.' });

    const entry = await PlayerRoster.authenticate(name.trim(), password);
    if (!entry) {
      log.warn('auth', 'login_fail', `Failed login attempt for "${name.trim()}"`, { name: name.trim(), ip: req.ip });
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid name or password.' });
    }

    let stableId;
    try {
      const record = await HandLogger.loginRosterPlayer(entry.name);
      stableId = record.stableId;
    } catch (err) {
      return res.status(500).json({ error: 'db_error', message: 'Could not resolve player identity.' });
    }

    // Check trial status so frontend can gate trial-only UI without a DB call
    const { findById } = require('../db/repositories/PlayerRepository');
    const playerProfile = await findById(stableId).catch(() => null);
    const trialStatus   = computeTrialStatus(playerProfile);

    const jwtPayload = { stableId, name: entry.name, role: entry.role, trialStatus: trialStatus || null };

    const token = JwtService.sign(jwtPayload);
    log.info('auth', 'login_ok', `${entry.name} logged in`, { name: entry.name, role: entry.role, playerId: stableId });
    res.json({ stableId, name: entry.name, role: entry.role, trialStatus: trialStatus || null, token });
  });

  // ── POST /api/auth/reset-password ────────────────────────────────────────────
  // Authenticated users reset their own password by verifying the current one.
  app.post('/api/auth/reset-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || typeof currentPassword !== 'string')
      return res.status(400).json({ error: 'invalid_password', message: 'currentPassword is required.' });
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8)
      return res.status(400).json({ error: 'invalid_password', message: 'newPassword must be at least 8 characters.' });
    if (currentPassword === newPassword)
      return res.status(400).json({ error: 'invalid_password', message: 'New password must differ from current password.' });

    const { findById, setPassword } = require('../db/repositories/PlayerRepository');

    try {
      const player = await findById(req.user.stableId);
      if (!player || !player.password_hash)
        return res.status(404).json({ error: 'not_found', message: 'Player account not found.' });

      const valid = await bcrypt.compare(currentPassword, player.password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials', message: 'Current password is incorrect.' });

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await setPassword(req.user.stableId, newHash);

      log.info('auth', 'password_reset_ok', `${req.user.name} reset their password`, { playerId: req.user.stableId });
      return res.json({ success: true });
    } catch (err) {
      log.error('auth', 'reset_password_error', `Password reset error: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Password reset failed.' });
    }
  });

  // ── POST /api/auth/register-coach ────────────────────────────────────────────
  // Submit a coach registration request.
  // An admin sets status='active' and assigns 'coach' role to approve.
  app.post('/api/auth/register-coach', authLimiter, async (req, res) => {
    const { name, password, email } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });
    if (!password || typeof password !== 'string' || password.length < 8)
      return res.status(400).json({ error: 'invalid_password', message: 'Password must be at least 8 characters.' });
    if (!email || typeof email !== 'string' || !email.includes('@'))
      return res.status(400).json({ error: 'invalid_email', message: 'A valid email is required for coach applications.' });

    const { findByDisplayName, createPlayer } = require('../db/repositories/PlayerRepository');
    const supabase = require('../db/supabase.js');

    try {
      const existing = await findByDisplayName(name.trim());
      if (existing) return res.status(409).json({ error: 'name_taken', message: 'That name is already registered.' });

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const newId = await createPlayer({
        displayName: name.trim(),
        email:       email.trim().toLowerCase(),
        passwordHash,
        createdBy:   null,
      });

      // Mark as pending + store intent in metadata for admin review
      await supabase.from('player_profiles').update({
        status:   'pending',
        metadata: { requestedRole: 'coach' },
      }).eq('id', newId);

      log.info('auth', 'coach_application', `Coach application from ${name.trim()}`, { playerId: newId, email: email.trim().toLowerCase() });
      return res.status(202).json({
        status:  'pending',
        message: 'Your coach application has been submitted and is awaiting admin approval.',
      });
    } catch (err) {
      log.error('auth', 'register_coach_error', `Coach registration error: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Coach registration failed.' });
    }
  });

  // ── POST /api/auth/forgot-password ──────────────────────────────────────────
  // Unauthenticated. Stores a pending reset request so an admin/coach can act on it.
  // No email is sent — the admin resolves it manually via POST /api/admin/users/:id/reset-password.
  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'invalid_name', message: 'Account name is required.' });

    const { findByDisplayName } = require('../db/repositories/PlayerRepository');
    const supabase = require('../db/supabase.js');

    try {
      const player = await findByDisplayName(name.trim());
      // Always return 200 to avoid username enumeration
      if (!player) return res.status(200).json({ status: 'submitted' });

      // Upsert: replace any existing pending request for this player
      await supabase.from('password_reset_requests')
        .upsert({ player_id: player.id, status: 'pending', requested_at: new Date().toISOString() },
                 { onConflict: 'player_id,status' });

      log.info('auth', 'forgot_password', `Password reset request from ${name.trim()}`, { playerId: player.id });
      return res.status(200).json({ status: 'submitted' });
    } catch (err) {
      log.error('auth', 'forgot_password_error', `Forgot password error: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Request failed.' });
    }
  });

  // ── GET /api/schools/search ─────────────────────────────────────────────────
  // Search schools by name for registration autocomplete. Public endpoint (no auth).
  app.get('/api/schools/search', async (req, res) => {
    const { q } = req.query || {};

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      return res.status(400).json({ error: 'invalid_query', message: 'Query parameter q is required and must be non-empty' });
    }

    try {
      const { searchByName } = require('../db/repositories/SchoolRepository');
      const schools = await searchByName(q.trim(), 10);
      return res.json({ schools });
    } catch (err) {
      log.error('auth', 'school_search_error', `School search failed: ${err.message}`, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Search failed' });
    }
  });

  // ── GET /api/auth/permissions ────────────────────────────────────────────────
  app.get('/api/auth/permissions', requireAuth, async (req, res) => {
    try {
      const { getPlayerPermissions } = require('../auth/requirePermission.js');
      const perms = await getPlayerPermissions(req.user.stableId ?? req.user.id, req.user.role);
      res.json({ permissions: [...perms] });
    } catch (err) {
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  });

  // ── GET /api/auth/profile ────────────────────────────────────────────────────
  // Returns the authenticated user's own profile (no password_hash).
  app.get('/api/auth/profile', requireAuth, async (req, res) => {
    const { findById } = require('../db/repositories/PlayerRepository');
    try {
      const player = await findById(req.user.stableId);
      if (!player) return res.status(404).json({ error: 'not_found', message: 'Player not found.' });
      return res.json({
        id:           player.id,
        display_name: player.display_name,
        email:        player.email ?? null,
        role:         req.user.role ?? null,
        school_id:    player.school_id ?? null,
        trialStatus:  computeTrialStatus(player),
      });
    } catch (err) {
      log.error('auth', 'profile_get_error', err.message, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Failed to load profile.' });
    }
  });

  // ── POST /api/auth/verify-password ──────────────────────────────────────────
  // Verifies the caller's current password without side effects.
  // Used by the client to gate destructive actions behind a password prompt.
  app.post('/api/auth/verify-password', requireAuth, async (req, res) => {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string')
      return res.status(400).json({ error: 'invalid_body', message: 'password is required.' });

    const { findById } = require('../db/repositories/PlayerRepository');
    try {
      const player = await findById(req.user.stableId);
      if (!player || !player.password_hash)
        return res.status(404).json({ error: 'not_found', message: 'Account not found.' });

      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials', message: 'Password is incorrect.' });

      return res.json({ verified: true });
    } catch (err) {
      log.error('auth', 'verify_password_error', err.message, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Verification failed.' });
    }
  });

  // ── POST /api/auth/deactivate ────────────────────────────────────────────────
  // Soft-deletes the caller's account by setting status = 'archived'.
  // Requires the caller's current password for confirmation.
  app.post('/api/auth/deactivate', requireAuth, async (req, res) => {
    const { password } = req.body || {};
    if (!password || typeof password !== 'string')
      return res.status(400).json({ error: 'invalid_body', message: 'password is required to confirm deactivation.' });

    const { findById, archivePlayer } = require('../db/repositories/PlayerRepository');
    try {
      const player = await findById(req.user.stableId);
      if (!player || !player.password_hash)
        return res.status(404).json({ error: 'not_found', message: 'Account not found.' });

      const valid = await bcrypt.compare(password, player.password_hash);
      if (!valid) return res.status(401).json({ error: 'invalid_credentials', message: 'Password is incorrect.' });

      await archivePlayer(req.user.stableId);

      log.info('auth', 'account_deactivated', `${req.user.name} deactivated their account`, { playerId: req.user.stableId });
      return res.json({ success: true });
    } catch (err) {
      log.error('auth', 'deactivate_error', err.message, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Deactivation failed.' });
    }
  });

  // ── PUT /api/auth/profile ────────────────────────────────────────────────────
  // Updates the authenticated user's display_name and/or email.
  app.put('/api/auth/profile', requireAuth, async (req, res) => {
    const { display_name, email } = req.body || {};

    const hasName  = display_name !== undefined;
    const hasEmail = email        !== undefined;

    if (!hasName && !hasEmail)
      return res.status(400).json({ error: 'no_fields', message: 'Provide display_name or email to update.' });

    if (hasName) {
      if (typeof display_name !== 'string' || display_name.trim().length < 2)
        return res.status(400).json({ error: 'invalid_name', message: 'Name must be at least 2 characters.' });
    }
    if (hasEmail && email !== '') {
      if (typeof email !== 'string' || !email.includes('@'))
        return res.status(400).json({ error: 'invalid_email', message: 'Email is not valid.' });
    }

    const { findByDisplayName, updatePlayer } = require('../db/repositories/PlayerRepository');

    try {
      if (hasName) {
        const trimmed  = display_name.trim();
        const existing = await findByDisplayName(trimmed);
        if (existing && existing.id !== req.user.stableId)
          return res.status(409).json({ error: 'name_taken', message: 'That name is already taken.' });
      }

      const patch = {};
      if (hasName)  patch.displayName = display_name.trim();
      if (hasEmail) patch.email       = email === '' ? null : email.trim().toLowerCase();

      await updatePlayer(req.user.stableId, patch);

      log.info('auth', 'profile_update_ok', `${req.user.name} updated profile`, { playerId: req.user.stableId });
      return res.json({
        id:           req.user.stableId,
        display_name: patch.displayName ?? req.user.name,
        email:        patch.email       ?? undefined,
      });
    } catch (err) {
      log.error('auth', 'profile_update_error', err.message, { err });
      return res.status(500).json({ error: 'internal_error', message: 'Failed to update profile.' });
    }
  });
};
