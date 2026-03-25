'use strict';

module.exports = function registerAuthRoutes(app, { HandLogger, PlayerRoster, JwtService, authLimiter, log }) {

  // POST /api/auth/register — self-registration disabled
  app.post('/api/auth/register', (req, res) => {
    res.status(410).json({
      error: 'registration_disabled',
      message: 'Self-registration is disabled. Contact the coach to be added to the roster.',
    });
  });

  // POST /api/auth/login
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

    const token = JwtService.sign({ stableId, name: entry.name, role: entry.role });
    log.info('auth', 'login_ok', `${entry.name} logged in`, { name: entry.name, role: entry.role, playerId: stableId });
    res.json({ stableId, name: entry.name, role: entry.role, token });
  });
};
