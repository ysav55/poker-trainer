'use strict';

module.exports = function registerHealthRoute(app, { supabaseAdmin, tables }) {
  app.get('/health', async (_, res) => {
    let dbStatus = 'ok';
    let dbError  = null;
    try {
      const { error } = await supabaseAdmin.from('player_profiles').select('player_id').limit(1);
      if (error) { dbStatus = 'error'; dbError = error.message; }
    } catch (err) {
      dbStatus = 'error';
      dbError  = err.message;
    }
    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({
      status,
      tables: tables.size,
      db: dbStatus,
      ...(dbError ? { dbError } : {}),
    });
  });
};
