#!/usr/bin/env node
'use strict';

/**
 * verify-simulation.js
 *
 * Post-run verification of the simulate-hands.js output.
 * Queries the DB directly via Supabase client (service-role key — bypasses RLS).
 *
 * Run after waiting ~10s for the async hand analyzer to finish writing tags:
 *   node scripts/verify-simulation.js
 */

const path = require('path');
process.env.NODE_PATH = path.join(__dirname, '../server/node_modules');
require('module').Module._initPaths();

require('dotenv').config({ path: path.join(__dirname, '../.env') });
const supabase = require('../server/db/supabase.js');

const SAMPLE_SIZE = 50;
const HR = '─'.repeat(72);
const HR2 = '═'.repeat(72);

function section(title) {
  console.log(`\n${HR}`);
  console.log(`  ${title}`);
  console.log(HR);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${HR2}`);
  console.log('  SIMULATION VERIFICATION');
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(HR2);

  // ── 1. Find sim tables ──────────────────────────────────────────────────────
  section('1. Simulation Tables');

  const { data: tables, error: tErr } = await supabase
    .from('tables')
    .select('id, name, mode, created_at')
    .in('name', ['SimCoached', 'SimUncoached'])
    .order('created_at', { ascending: false });

  if (tErr) throw tErr;
  if (!tables || tables.length === 0) {
    console.log('  No SimCoached / SimUncoached tables found. Run simulate-hands.js first.');
    process.exit(1);
  }

  tables.forEach(t => console.log(`  ${t.name.padEnd(14)} id=${t.id}  mode=${t.mode}`));
  const tableIds = tables.map(t => t.id);

  // ── 2. Hand counts ──────────────────────────────────────────────────────────
  section('2. Hand Counts per Table');

  const { data: handRows, error: hErr } = await supabase
    .from('hands')
    .select('hand_id, table_id, winner_name, final_pot, ended_at, completed_normally')
    .in('table_id', tableIds)
    .order('ended_at', { ascending: false });

  if (hErr) throw hErr;

  const allHands = handRows || [];
  const byTable  = {};
  tableIds.forEach(id => { byTable[id] = []; });
  allHands.forEach(h => { if (byTable[h.table_id]) byTable[h.table_id].push(h); });

  tables.forEach(t => {
    const hs = byTable[t.id];
    const completed  = hs.filter(h => h.ended_at).length;
    const incomplete = hs.length - completed;
    console.log(`  ${t.name.padEnd(14)} total=${hs.length}  completed=${completed}  incomplete=${incomplete}`);
  });

  if (allHands.length === 0) {
    console.log('\n  No hands found — nothing to verify.');
    process.exit(0);
  }

  // ── 3. hand_actions coverage ────────────────────────────────────────────────
  section('3. hand_actions Coverage (sample of 10 hands)');

  const sampleHandIds = allHands.slice(0, 10).map(h => h.hand_id);
  const { data: actionCounts, error: acErr } = await supabase
    .from('hand_actions')
    .select('hand_id')
    .in('hand_id', sampleHandIds);

  if (acErr) throw acErr;

  const actByHand = {};
  (actionCounts || []).forEach(a => {
    actByHand[a.hand_id] = (actByHand[a.hand_id] || 0) + 1;
  });

  sampleHandIds.forEach(id => {
    const count = actByHand[id] || 0;
    const flag  = count === 0 ? ' ⚠ NO ACTIONS' : '';
    console.log(`  ${id.slice(0, 12)}…  actions=${count}${flag}`);
  });

  // ── 4. hand_players coverage ────────────────────────────────────────────────
  section('4. hand_players Coverage — stack_end written (endHand ran)');

  const { data: hpRows, error: hpErr } = await supabase
    .from('hand_players')
    .select('hand_id, player_name, stack_start, stack_end, is_winner')
    .in('hand_id', sampleHandIds)
    .order('hand_id');

  if (hpErr) throw hpErr;

  const hpByHand = {};
  (hpRows || []).forEach(r => {
    if (!hpByHand[r.hand_id]) hpByHand[r.hand_id] = [];
    hpByHand[r.hand_id].push(r);
  });

  sampleHandIds.forEach(id => {
    const rows   = hpByHand[id] || [];
    const noEnd  = rows.filter(r => r.stack_end == null).length;
    const flag   = noEnd > 0 ? ` ⚠ ${noEnd} missing stack_end` : '';
    const names  = rows.map(r => `${r.player_name}(${r.is_winner ? '★' : ''})`).join(', ');
    console.log(`  ${id.slice(0, 12)}…  players=${rows.length}${flag}  ${names}`);
  });

  // ── 5. Analyzer coverage ────────────────────────────────────────────────────
  section('5. Analyzer Coverage — hand_tags written');

  const { data: tagSummary, error: tsErr } = await supabase
    .from('hand_tags')
    .select('hand_id')
    .in('hand_id', allHands.map(h => h.hand_id));

  if (tsErr) throw tsErr;

  const tagCountByHand = {};
  (tagSummary || []).forEach(t => {
    tagCountByHand[t.hand_id] = (tagCountByHand[t.hand_id] || 0) + 1;
  });

  const handsWithTags    = allHands.filter(h => (tagCountByHand[h.hand_id] || 0) > 0).length;
  const handsWithoutTags = allHands.length - handsWithTags;
  const coverage         = allHands.length ? ((handsWithTags / allHands.length) * 100).toFixed(1) : 0;

  console.log(`  Total hands       : ${allHands.length}`);
  console.log(`  With tags         : ${handsWithTags} (${coverage}%)`);
  console.log(`  Without tags      : ${handsWithoutTags}${handsWithoutTags > 0 ? ' ⚠' : ''}`);

  if (handsWithoutTags > 0) {
    const missing = allHands
      .filter(h => !tagCountByHand[h.hand_id])
      .slice(0, 5)
      .map(h => `  ${h.hand_id.slice(0, 12)}… (table=${tables.find(t => t.id === h.table_id)?.name})`);
    console.log('\n  Sample of hands missing tags:');
    missing.forEach(m => console.log(m));
  }

  // ── 6. Random 50-hand tag sample ────────────────────────────────────────────
  section(`6. Random ${SAMPLE_SIZE}-Hand Tag Sample`);
  console.log(`  Randomly selected ${SAMPLE_SIZE} hands from all ${allHands.length} — showing every tag assigned.\n`);

  // Only sample hands that have ended (ended_at set) so analyzer had a chance to run
  const completedHands = allHands.filter(h => h.ended_at);
  const shuffled       = completedHands.slice().sort(() => Math.random() - 0.5);
  const sample         = shuffled.slice(0, Math.min(SAMPLE_SIZE, shuffled.length));

  if (sample.length === 0) {
    console.log('  No completed hands to sample.');
  } else {
    // Fetch all tags for sampled hands in one query
    const sampleIds = sample.map(h => h.hand_id);
    const { data: sampleTags, error: stErr } = await supabase
      .from('hand_tags')
      .select('hand_id, tag, tag_type, player_id')
      .in('hand_id', sampleIds)
      .order('hand_id')
      .order('tag_type')
      .order('tag');

    if (stErr) throw stErr;

    // Group tags by hand_id
    const tagsByHand = {};
    (sampleTags || []).forEach(t => {
      if (!tagsByHand[t.hand_id]) tagsByHand[t.hand_id] = [];
      tagsByHand[t.hand_id].push(t);
    });

    // Build a name lookup from hand_players for tag player attribution
    const { data: hpLookup } = await supabase
      .from('hand_players')
      .select('hand_id, player_id, player_name')
      .in('hand_id', sampleIds);

    const nameByPlayerId = {};
    (hpLookup || []).forEach(r => {
      if (r.player_id) nameByPlayerId[r.player_id] = r.player_name;
    });

    // Find which table each hand belongs to
    const tableNameById = {};
    tables.forEach(t => { tableNameById[t.id] = t.name; });

    let handIdx = 0;
    for (const hand of sample) {
      handIdx++;
      const tableName = tableNameById[hand.table_id] || hand.table_id;
      const tags      = tagsByHand[hand.hand_id] || [];
      const pot       = hand.final_pot != null ? `pot=${hand.final_pot}` : 'pot=?';
      const winner    = hand.winner_name || '?';

      console.log(`  [${String(handIdx).padStart(2, '0')}] hand=${hand.hand_id.slice(0, 12)}…  table=${tableName}  winner=${winner}  ${pot}`);

      if (tags.length === 0) {
        console.log('       (no tags — analyzer may not have run yet)');
      } else {
        // Group by tag_type for readability
        const byType = {};
        tags.forEach(t => {
          if (!byType[t.tag_type]) byType[t.tag_type] = [];
          byType[t.tag_type].push(t);
        });

        for (const [tagType, typeTags] of Object.entries(byType)) {
          const formatted = typeTags.map(t => {
            const player = t.player_id ? ` (${nameByPlayerId[t.player_id] || t.player_id.slice(0, 8)})` : '';
            return `${t.tag}${player}`;
          }).join(', ');
          console.log(`       ${tagType.padEnd(14)} ${formatted}`);
        }
      }
      console.log('');
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(HR2);
  console.log('  VERIFICATION SUMMARY');
  console.log(HR2);
  console.log(`  Hands total      : ${allHands.length}`);
  console.log(`  Hands completed  : ${completedHands.length}`);
  console.log(`  With tags        : ${handsWithTags} (${coverage}%)`);
  console.log(`  Sampled          : ${sample.length}`);
  console.log('');
  console.log('  Key indicators:');
  console.log(`  ${handsWithoutTags === 0 ? '✓' : '✗'} All hands have tags (analyzer fired for every hand)`);
  console.log(`  ${completedHands.length === allHands.length ? '✓' : '✗'} All hands completed (endHand ran)`);
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('\n✗ ERROR:', err.message);
  process.exit(1);
});