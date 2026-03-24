/**
 * Quick smoke test — verifies Supabase connection and lists all tables.
 * Run: node scripts/test-connection.js
 */
require('../server/node_modules/dotenv').config();
const { createClient } = require('../server/node_modules/@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function main() {
  console.log('\n🔌  Testing Supabase connection...');
  console.log(`    URL: ${process.env.SUPABASE_URL}\n`);

  const tables = [
    'player_profiles', 'sessions', 'hands', 'hand_tags',
    'hand_players', 'hand_actions', 'playlists', 'playlist_hands',
    'session_player_stats', 'leaderboard'
  ];

  let allOk = true;
  for (const table of tables) {
    const { error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error(`  ❌  ${table.padEnd(24)} — ${error.message}`);
      allOk = false;
    } else {
      console.log(`  ✅  ${table.padEnd(24)} — reachable (${count ?? 0} rows)`);
    }
  }

  // Test the leaderboard_view
  const { error: viewErr } = await supabase
    .from('leaderboard_view')
    .select('*', { count: 'exact', head: true });
  if (viewErr) {
    console.error(`  ❌  ${'leaderboard_view'.padEnd(24)} — ${viewErr.message}`);
    allOk = false;
  } else {
    console.log(`  ✅  ${'leaderboard_view'.padEnd(24)} — view OK`);
  }

  console.log(allOk ? '\n✅  All tables reachable.\n' : '\n❌  Some tables failed — check errors above.\n');
}

main().catch(err => { console.error(err); process.exit(1); });
