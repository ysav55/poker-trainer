'use strict';

const supabase = require('../db/supabase');

/**
 * Express middleware: verifies that the student in req.params.id
 * is assigned to the requesting coach (via coach_id column in player_profiles).
 *
 * Admin and superadmin roles bypass the check.
 * On success, sets req.studentId for downstream handlers.
 */
async function requireStudentAssignment(req, res, next) {
  const coachId   = req.user?.id ?? req.user?.stableId;
  const studentId = req.params.id;
  const role      = req.user?.role;

  // Admin/superadmin can access any student
  if (role === 'admin' || role === 'superadmin') {
    req.studentId = studentId;
    return next();
  }

  try {
    const { data, error } = await supabase
      .from('player_profiles')
      .select('id')
      .eq('id', studentId)
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(403).json({ error: 'forbidden', message: 'Student not assigned to you' });
    }

    req.studentId = studentId;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'internal_error', message: 'Failed to verify student assignment' });
  }
}

module.exports = requireStudentAssignment;
