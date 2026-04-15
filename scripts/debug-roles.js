#!/usr/bin/env node
'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../server/db/supabase.js');

async function main() {
  try {
    console.log('Fetching all player profiles with roles...\n');

    // Get all players with their primary role
    const { data: players, error: pError } = await supabase
      .from('player_profiles')
      .select(`
        id,
        display_name,
        status,
        player_roles (
          roles (
            name
          )
        )
      `)
      .order('display_name');

    if (pError) throw pError;

    if (!players || players.length === 0) {
      console.log('No players found.');
      process.exit(0);
    }

    console.log('=== ALL PLAYER ACCOUNTS ===\n');
    console.log('Name                    | Role             | Status');
    console.log('------------------------------------------------------');

    players.forEach(p => {
      const roleObj = p.player_roles?.[0]?.roles;
      const role = roleObj?.name ?? '(no role)';
      const status = p.status ?? 'active';
      const nameCol = (p.display_name || 'UNNAMED').padEnd(23);
      const roleCol = role.padEnd(16);
      console.log(`${nameCol} | ${roleCol} | ${status}`);
    });

    console.log('\n=== ROLE PERMISSION BREAKDOWN ===\n');

    // Get all roles and their permissions
    const { data: roles, error: rError } = await supabase
      .from('roles')
      .select(`
        name,
        role_permissions (
          permissions (
            key
          )
        )
      `)
      .order('name');

    if (rError) throw rError;

    if (roles && roles.length > 0) {
      roles.forEach(role => {
        const perms = (role.role_permissions || [])
          .map(rp => rp.permissions?.key)
          .filter(Boolean);
        console.log(`${role.name}:`);
        if (perms.length === 0) {
          console.log('  (no permissions)');
        } else {
          perms.forEach(p => console.log(`  - ${p}`));
        }
        console.log('');
      });
    }

    console.log('✓ Done.');
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
