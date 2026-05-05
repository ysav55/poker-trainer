#!/usr/bin/env node
'use strict';

const path = require('path');

// Set NODE_PATH to include server node_modules
process.env.NODE_PATH = path.join(__dirname, '../server/node_modules');
require('module').Module._initPaths();

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const supabase = require('../server/db/supabase.js');

async function main() {
  try {
    const newPassword = '123456789';
    const adminNames = ['Admin_yonatan', 'Super_yonatan'];

    console.log(`\nResetting passwords for: ${adminNames.join(', ')}`);
    console.log(`New password: ${newPassword}\n`);

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    console.log(`[1/3] Bcrypt hash computed (rounds: 12)`);

    // Fetch current records before update
    const { data: before, error: fetchErr } = await supabase
      .from('player_profiles')
      .select('id, display_name, password_hash')
      .in('display_name', adminNames);

    if (fetchErr) throw fetchErr;

    console.log(`[2/3] Found ${before?.length || 0} admin accounts:`);
    (before || []).forEach(row => {
      console.log(`      • ${row.display_name} (id: ${row.id})`);
      console.log(`        old hash: ${row.password_hash.slice(0, 15)}...`);
    });

    // Update passwords
    const { error: updateErr } = await supabase
      .from('player_profiles')
      .update({ password_hash: passwordHash })
      .in('display_name', adminNames);

    if (updateErr) throw updateErr;

    console.log(`\n[3/3] Passwords updated in database`);

    // Verify
    const { data: after, error: verifyErr } = await supabase
      .from('player_profiles')
      .select('id, display_name, password_hash')
      .in('display_name', adminNames);

    if (verifyErr) throw verifyErr;

    console.log(`\nVerification:`);
    (after || []).forEach(row => {
      console.log(`      • ${row.display_name}`);
      console.log(`        new hash: ${row.password_hash.slice(0, 15)}...`);
    });

    console.log(`\n✓ Complete. Use these credentials for next step:`);
    console.log(`  Admin_yonatan / ${newPassword}`);
    console.log(`  Super_yonatan / ${newPassword}\n`);
    process.exit(0);
  } catch (err) {
    console.error('\n✗ ERROR:', err.message);
    process.exit(1);
  }
}

main();
