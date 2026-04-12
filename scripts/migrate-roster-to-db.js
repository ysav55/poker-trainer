#!/usr/bin/env node
// Run once after migration 009 is applied:
//   node scripts/migrate-roster-to-db.js
// Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (same as server)
// Does NOT delete players.csv — verify results first, then remove manually

'use strict';

const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// Load .env from project root before importing supabase client
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase    = require('../server/db/supabase');
const ROSTER_PATH = path.join(__dirname, '..', 'players.csv');

async function main() {
  // ── Sanity check ────────────────────────────────────────────────────────────
  if (!fs.existsSync(ROSTER_PATH)) {
    console.error(`[migrate-roster] ERROR: ${ROSTER_PATH} not found.`);
    console.error('[migrate-roster] Nothing to migrate. Exiting.');
    process.exit(1);
  }

  const raw = fs.readFileSync(ROSTER_PATH, 'utf8');

  // Strip comment lines and blank lines before parsing
  const filteredLines = raw
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      return trimmed !== '' && !trimmed.startsWith('#');
    })
    .join('\n');

  const rows = parse(filteredLines, {
    columns: ['name', 'bcrypt_hash', 'role'],
    skip_empty_lines: true,
    trim: true,
  });

  if (rows.length === 0) {
    console.log('[migrate-roster] No player rows found in players.csv. Exiting.');
    process.exit(0);
  }

  console.log(`[migrate-roster] Found ${rows.length} player(s) in players.csv.`);
  console.log('[migrate-roster] Starting migration...\n');

  // ── Pre-fetch role UUIDs ─────────────────────────────────────────────────────
  const { data: roleRows, error: roleErr } = await supabase
    .from('roles')
    .select('id, name');

  if (roleErr) {
    console.error('[migrate-roster] ERROR: Could not fetch roles table:', roleErr.message);
    process.exit(1);
  }

  const roleMap = {};
  for (const r of roleRows) {
    roleMap[r.name] = r.id;
  }

  const knownRoles = Object.keys(roleMap);
  console.log(`[migrate-roster] Loaded roles: ${knownRoles.join(', ')}\n`);

  // ── Migrate each player ──────────────────────────────────────────────────────
  let migrated = 0;
  let skipped  = 0;
  let errors   = 0;

  for (const row of rows) {
    const { name, bcrypt_hash, role } = row;

    // Validate role
    if (!roleMap[role]) {
      console.warn(`  [SKIP]  "${name}" — unknown role "${role}" (not in roles table). Skipping.`);
      skipped++;
      continue;
    }

    const roleId = roleMap[role];

    // ── Upsert player_profiles on display_name conflict ─────────────────────
    const { data: profileRows, error: upsertErr } = await supabase
      .from('player_profiles')
      .upsert(
        { display_name: name, password_hash: bcrypt_hash },
        { onConflict: 'display_name', ignoreDuplicates: false }
      )
      .select('id');

    if (upsertErr) {
      console.error(`  [ERROR] "${name}" — upsert player_profiles failed: ${upsertErr.message}`);
      errors++;
      continue;
    }

    const profileId = profileRows && profileRows[0] && profileRows[0].id;
    if (!profileId) {
      console.error(`  [ERROR] "${name}" — upsert returned no id. Skipping role assignment.`);
      errors++;
      continue;
    }

    // ── Insert into player_roles (skip if already exists) ────────────────────
    const { error: roleInsertErr } = await supabase
      .from('player_roles')
      .upsert(
        { player_id: profileId, role_id: roleId },
        { onConflict: 'player_id,role_id', ignoreDuplicates: true }
      );

    if (roleInsertErr) {
      console.error(`  [ERROR] "${name}" — insert player_roles failed: ${roleInsertErr.message}`);
      errors++;
      continue;
    }

    console.log(`  [OK]    "${name}" migrated (role: ${role})`);
    migrated++;
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────────────────');
  console.log(`[migrate-roster] Done.`);
  console.log(`  Migrated : ${migrated}`);
  console.log(`  Skipped  : ${skipped}`);
  console.log(`  Errors   : ${errors}`);
  console.log('─────────────────────────────────────────────────────────────');

  if (errors > 0) {
    console.warn('[migrate-roster] WARNING: Some players failed to migrate. Review errors above.');
  }

  console.log('\n[migrate-roster] players.csv has NOT been deleted.');
  console.log('[migrate-roster] Verify the results in Supabase, then remove players.csv manually.');
}

main().catch(err => {
  console.error('[migrate-roster] Fatal error:', err);
  process.exit(1);
});
