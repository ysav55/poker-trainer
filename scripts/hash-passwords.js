#!/usr/bin/env node
/**
 * hash-passwords.js
 *
 * One-time migration script: converts plain-text passwords in players.csv
 * to bcrypt hashes.  Run once, then delete or ignore this script.
 *
 * Usage:
 *   node scripts/hash-passwords.js
 *
 * The script reads players.csv, re-hashes any password that is NOT already
 * a bcrypt hash (i.e., does not start with "$2b$"), writes the result back
 * in place, and prints a summary.  Safe to run multiple times (idempotent).
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const bcrypt = require('bcrypt');

const ROUNDS      = 12;
const ROSTER_PATH = path.join(__dirname, '..', 'players.csv');

async function main() {
  if (!fs.existsSync(ROSTER_PATH)) {
    console.error(`[hash-passwords] ERROR: ${ROSTER_PATH} not found`);
    process.exit(1);
  }

  const raw   = fs.readFileSync(ROSTER_PATH, 'utf8');
  const lines = raw.split('\n');

  let converted = 0;
  let skipped   = 0;

  const output = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Preserve comments and blank lines unchanged
    if (trimmed === '' || trimmed.startsWith('#')) {
      output.push(line);
      continue;
    }

    const parts = trimmed.split(',');
    if (parts.length < 3) {
      // Malformed — preserve as-is
      output.push(line);
      continue;
    }

    const name     = parts[0].trim();
    const password = parts[1].trim();
    const role     = parts[2].trim();

    if (password.startsWith('$2b$') || password.startsWith('$2a$')) {
      // Already a bcrypt hash — skip
      output.push(line);
      skipped++;
      continue;
    }

    const hash = await bcrypt.hash(password, ROUNDS);
    output.push(`${name},${hash},${role}`);
    converted++;
    console.log(`  ✓ Hashed password for: ${name}`);
  }

  fs.writeFileSync(ROSTER_PATH, output.join('\n'), 'utf8');

  console.log(`\n[hash-passwords] Done. ${converted} hashed, ${skipped} already hashed.`);
  console.log(`[hash-passwords] players.csv updated.`);
}

main().catch(err => {
  console.error('[hash-passwords] Fatal error:', err);
  process.exit(1);
});
