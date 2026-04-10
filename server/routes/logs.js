'use strict';

const rateLimit = require('express-rate-limit');
const supabase  = require('../db/supabase');

const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

module.exports = function registerLogRoutes(app) {
  app.post('/api/logs/client-error', clientErrorLimiter, async (req, res) => {
    try {
      const { message, stack, componentStack, boundary } = req.body ?? {};

      await supabase.from('alpha_logs').insert({
        level:    'error',
        category: 'client',
        event:    'react_error',
        message:  (message ?? 'unknown error').slice(0, 2000),
        meta: {
          stack:          (stack ?? '').slice(0, 4000),
          componentStack: (componentStack ?? '').slice(0, 2000),
          boundary:       boundary ?? 'unknown',
          userAgent:      req.headers['user-agent'] ?? null,
        },
      });
    } catch (_) {
      // Logging must never throw
    }

    res.status(204).end();
  });
};
