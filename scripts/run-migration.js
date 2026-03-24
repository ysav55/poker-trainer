/**
 * Migration runner — executes supabase/migrations/001_initial_schema.sql
 * directly against the Supabase PostgreSQL database.
 *
 * Prerequisites:
 *   1. Add DATABASE_URL to .env  (Settings → Database → Connection string → URI)
 *      Format: postgresql://postgres:[YOUR-DB-PASSWORD]@db.vxrjmpqgkqsyekmxnjti.supabase.co:5432/postgres
 *   2. npm install  (pg is a devDependency in server/)
 *
 * Run:
 *   node scripts/run-migration.js
 */
require('../server/node_modules/dotenv').config();
const { Client } = require('../server/node_modules/pg');
const fs = require('fs');
const path = require('path');

const SQL_FILE = path.join(__dirname, '../supabase/migrations/001_initial_schema.sql');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('\n❌  DATABASE_URL is not set in .env');
    console.error('   Get it from: Supabase dashboard → Settings → Database → Connection string → URI');
    console.error('   It looks like: postgresql://postgres:[PASSWORD]@db.vxrjmpqgkqsyekmxnjti.supabase.co:5432/postgres\n');
    process.exit(1);
  }

  const sql = fs.readFileSync(SQL_FILE, 'utf8');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }, // required for Supabase TLS
  });

  console.log('\n🚀  Connecting to Supabase PostgreSQL...');
  await client.connect();
  console.log('✅  Connected\n');

  console.log('📋  Running 001_initial_schema.sql...');
  try {
    await client.query(sql);
    console.log('✅  Migration complete — all tables, triggers, views, and RLS policies created.\n');
  } catch (err) {
    console.error('\n❌  Migration failed:', err.message);
    console.error(err.detail || '');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
