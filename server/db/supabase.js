/**
 * Supabase client for server-side use (service role — bypasses RLS).
 * Import this wherever HandLogger.js currently uses better-sqlite3.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const url  = process.env.SUPABASE_URL;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing from .env');
}

const supabase = createClient(url, key, {
  auth: {
    // Server-side: persist nothing, auto-refresh nothing
    persistSession: false,
    autoRefreshToken: false,
  },
});

module.exports = supabase;
