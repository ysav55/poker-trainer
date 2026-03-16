#!/usr/bin/env node
/**
 * analyze_tags.js — queries sim_results.db and reports auto/mistake tag distribution,
 * hands with no tags, and contradiction checks.
 *
 * Run: node analyze_tags.js [db_path]
 */
'use strict';

const Database = require('./server/node_modules/better-sqlite3');
const dbPath   = process.argv[2] || './sim_results.db';

let db;
try { db = new Database(dbPath, { readonly: true }); }
catch (e) { console.error(`Cannot open ${dbPath}: ${e.message}`); process.exit(1); }

// ─── Total hands ──────────────────────────────────────────────────────────────
const total  = db.prepare(`SELECT COUNT(*) as n FROM hands`).get().n;
const tagged = db.prepare(`SELECT COUNT(*) as n FROM hands WHERE auto_tags IS NOT NULL AND auto_tags != '[]'`).get().n;
const noTags = db.prepare(`SELECT COUNT(*) as n FROM hands WHERE auto_tags IS NULL OR auto_tags = '[]'`).get().n;

console.log(`\n═══ Tag Analysis: ${dbPath} ═══`);
console.log(`Total hands: ${total}  |  With auto-tags: ${tagged}  |  Zero tags: ${noTags}\n`);

// ─── Auto-tag frequency ───────────────────────────────────────────────────────
const hands = db.prepare(`SELECT auto_tags, mistake_tags, phase_ended FROM hands`).all();

const autoFreq    = {};
const mistakeFreq = {};

for (const h of hands) {
  const at = h.auto_tags    ? JSON.parse(h.auto_tags)    : [];
  const mt = h.mistake_tags ? JSON.parse(h.mistake_tags) : [];
  for (const t of at) autoFreq[t]    = (autoFreq[t]    || 0) + 1;
  for (const t of mt) mistakeFreq[t] = (mistakeFreq[t] || 0) + 1;
}

const pct = n => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—';

console.log('── Auto-tags ─────────────────────────────────');
for (const [tag, n] of Object.entries(autoFreq).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tag.padEnd(20)} ${String(n).padStart(5)}  (${pct(n)})`);
}

console.log('\n── Mistake-tags ──────────────────────────────');
if (Object.keys(mistakeFreq).length === 0) {
  console.log('  (none)');
} else {
  for (const [tag, n] of Object.entries(mistakeFreq).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tag.padEnd(20)} ${String(n).padStart(5)}  (${pct(n)})`);
  }
}

// ─── Contradiction checks ─────────────────────────────────────────────────────
console.log('\n── Contradiction checks ──────────────────────');
let contradictions = 0;

for (const h of hands) {
  const tags = new Set(h.auto_tags ? JSON.parse(h.auto_tags) : []);

  // WALK + SAW_FLOP: BB won without a raise — flop shouldn't be reached
  if (tags.has('WALK') && tags.has('SAW_FLOP')) {
    console.log(`  ⚠ WALK + SAW_FLOP on same hand`); contradictions++;
  }
  // LIMPED_POT + 3BET_POT: limped means no raise, 3bet means 3+ raises
  if (tags.has('LIMPED_POT') && tags.has('3BET_POT')) {
    console.log(`  ⚠ LIMPED_POT + 3BET_POT on same hand`); contradictions++;
  }
  // SAW_TURN without SAW_FLOP
  if (tags.has('SAW_TURN') && !tags.has('SAW_FLOP')) {
    console.log(`  ⚠ SAW_TURN without SAW_FLOP`); contradictions++;
  }
  // SAW_RIVER without SAW_TURN
  if (tags.has('SAW_RIVER') && !tags.has('SAW_TURN')) {
    console.log(`  ⚠ SAW_RIVER without SAW_TURN`); contradictions++;
  }
  // WENT_TO_SHOWDOWN without SAW_FLOP (rare but possible if all-in preflop)
  // just flag it for review, not a hard error
  // FOUR_BET_POT without 3BET_POT
  if (tags.has('FOUR_BET_POT') && !tags.has('3BET_POT')) {
    console.log(`  ⚠ FOUR_BET_POT without 3BET_POT`); contradictions++;
  }
  // SQUEEZE_POT without 3BET_POT (squeeze IS a 3-bet scenario)
  if (tags.has('SQUEEZE_POT') && !tags.has('3BET_POT')) {
    console.log(`  ⚠ SQUEEZE_POT without 3BET_POT (squeeze = re-raise after caller, should count as 3+)`);
    contradictions++;
  }
}

if (contradictions === 0) console.log('  ✓ No contradictions found');

// ─── Hands with WENT_TO_SHOWDOWN — verify SAW_FLOP presence ──────────────────
const showdownNoFlop = hands.filter(h => {
  const tags = new Set(h.auto_tags ? JSON.parse(h.auto_tags) : []);
  return tags.has('WENT_TO_SHOWDOWN') && !tags.has('SAW_FLOP');
}).length;
console.log(`\n── Showdown without SAW_FLOP: ${showdownNoFlop} hands (all-in preflop, expected)`);

// ─── Phase distribution ────────────────────────────────────────────────────────
const phaseFreq = {};
for (const h of hands) phaseFreq[h.phase_ended || 'null'] = (phaseFreq[h.phase_ended || 'null'] || 0) + 1;
console.log('\n── Phase ended distribution ──────────────────');
for (const [phase, n] of Object.entries(phaseFreq).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${phase.padEnd(15)} ${String(n).padStart(5)}  (${pct(n)})`);
}

// ─── New tag sanity: SHORT_STACK / DEEP_STACK coverage ────────────────────────
const ssHands   = autoFreq['SHORT_STACK']  || 0;
const dsHands   = autoFreq['DEEP_STACK']   || 0;
const sawFlop   = autoFreq['SAW_FLOP']     || 0;
const sawRiver  = autoFreq['SAW_RIVER']    || 0;
const wts       = autoFreq['WENT_TO_SHOWDOWN'] || 0;
const blindDef  = autoFreq['BLIND_DEFENSE'] || 0;
const btnOpen   = autoFreq['BTN_OPEN']     || 0;
const squeeze   = autoFreq['SQUEEZE_POT']  || 0;

console.log('\n── New tag sanity ────────────────────────────');
console.log(`  SHORT_STACK:    ${ssHands}  DEEP_STACK: ${dsHands}`);
console.log(`  SAW_FLOP:       ${sawFlop}  SAW_RIVER: ${sawRiver}  WENT_TO_SHOWDOWN: ${wts}`);
console.log(`  BTN_OPEN:       ${btnOpen}  BLIND_DEFENSE: ${blindDef}  SQUEEZE_POT: ${squeeze}`);
if (sawFlop === 0)  console.log(`  ⚠ SAW_FLOP is 0 — tagging may be broken`);
if (sawRiver === 0) console.log(`  ⚠ SAW_RIVER is 0 — may be expected if hands end early`);
if (btnOpen === 0 && total > 20)  console.log(`  ⚠ BTN_OPEN is 0 — check dealer_seat tracking`);
if (blindDef === 0 && total > 20) console.log(`  ⚠ BLIND_DEFENSE is 0 — check BB logic`);

db.close();
console.log('\n═══ Done ═══\n');
