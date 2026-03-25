'use strict';

/**
 * HandLoggerSupabase — thin facade shim.
 *
 * This file preserves backward compatibility for all callers using
 *   require('./db/HandLoggerSupabase')
 * All symbols now live in their respective modules under server/db/repositories/
 * and server/game/AnalyzerService.js.
 *
 * See server/db/index.js for the full re-export map.
 */

module.exports = require('./index');
