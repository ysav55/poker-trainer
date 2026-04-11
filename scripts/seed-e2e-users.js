#!/usr/bin/env node
'use strict';

/**
 * Seed E2E test users into the database.
 *
 * Creates 3 test users (coach, student, admin) with known credentials
 * so Playwright E2E tests can authenticate. Skips users that already exist.
 *
 * Usage:
 *   node scripts/seed-e2e-users.js
 *
 * Requires .env with SUPABASE_URL and SUPABASE_SERVICE_KEY.
 */

const path = require('path');
// Load dotenv from server's node_modules
require(path.join(__dirname, '../server/node_modules/dotenv')).config({
  path: path.join(__dirname, '../.env'),
});
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;

const TEST_USERS = [
  {
    name: process.env.E2E_COACH_NAME || 'TestCoach',
    password: process.env.E2E_COACH_PASSWORD || 'testcoach123',
    role: 'coach',
  },
  {
    name: process.env.E2E_STUDENT_NAME || 'TestStudent',
    password: process.env.E2E_STUDENT_PASSWORD || 'teststudent123',
    role: 'coached_student',
  },
  {
    name: process.env.E2E_ADMIN_NAME || 'TestAdmin',
    password: process.env.E2E_ADMIN_PASSWORD || 'testadmin123',
    role: 'admin',
  },
  {
    name: process.env.E2E_STUDENT2_NAME || 'TestStudent2',
    password: process.env.E2E_STUDENT2_PASSWORD || 'teststudent2',
    role: 'coached_student',
  },
  {
    name: process.env.E2E_STUDENT3_NAME || 'TestStudent3',
    password: process.env.E2E_STUDENT3_PASSWORD || 'teststudent3',
    role: 'coached_student',
  },
];

async function main() {
  // Lazy-load after dotenv so env vars are available
  const supabase = require('../server/db/supabase');

  for (const user of TEST_USERS) {
    console.log(`\n--- ${user.name} (${user.role}) ---`);

    // Check if user already exists
    const { data: existing } = await supabase
      .from('player_profiles')
      .select('id, display_name, status')
      .ilike('display_name', user.name)
      .maybeSingle();

    let playerId;

    if (existing) {
      playerId = existing.id;
      console.log(`  Already exists: ${existing.display_name} (${existing.id})`);

      // Ensure password is set (update it regardless)
      const hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
      const { error: pwErr } = await supabase
        .from('player_profiles')
        .update({ password_hash: hash, status: 'active' })
        .eq('id', playerId);
      if (pwErr) console.error(`  Password update failed: ${pwErr.message}`);
      else console.log('  Password updated');
    } else {
      // Create new user
      const hash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);
      const { data: newPlayer, error: createErr } = await supabase
        .from('player_profiles')
        .insert({
          id: crypto.randomUUID(),
          display_name: user.name,
          password_hash: hash,
          status: 'active',
        })
        .select('id')
        .single();

      if (createErr) {
        console.error(`  Create failed: ${createErr.message}`);
        continue;
      }
      playerId = newPlayer.id;
      console.log(`  Created: ${playerId}`);
    }

    // Ensure role is assigned
    const { data: roleRow } = await supabase
      .from('roles')
      .select('id')
      .eq('name', user.role)
      .single();

    if (!roleRow) {
      console.error(`  Role '${user.role}' not found in roles table!`);
      continue;
    }

    // Check if role already assigned
    const { data: existingRole } = await supabase
      .from('player_roles')
      .select('id')
      .eq('player_id', playerId)
      .eq('role_id', roleRow.id)
      .maybeSingle();

    if (existingRole) {
      console.log(`  Role '${user.role}' already assigned`);
    } else {
      const { error: roleErr } = await supabase
        .from('player_roles')
        .insert({ player_id: playerId, role_id: roleRow.id, assigned_by: null });
      if (roleErr) console.error(`  Role assign failed: ${roleErr.message}`);
      else console.log(`  Role '${user.role}' assigned`);
    }

    console.log(`  OK: ${user.name} / ${user.password} → ${user.role}`);
  }

  console.log('\nDone. E2E test users are ready.\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
