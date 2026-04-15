require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('./db/supabase.js');

async function main() {
  try {
    const playerId = '2230b953-19dd-456e-abfa-c2ec4a6d0167';
    
    // Check player_roles entries
    const { data: roles, error: rolesError } = await supabase
      .from('player_roles')
      .select('role_id')
      .eq('player_id', playerId);
    
    if (rolesError) throw rolesError;
    
    console.log(`Idopeer player_roles entries: ${roles.length}`);
    if (roles.length === 0) {
      console.log('⚠️  NO PLAYER_ROLES ENTRIES!');
      console.log('This means permission lookup falls back to JWT role.');
      console.log('requirePermission middleware will query roles table by name instead.');
    } else {
      roles.forEach((r, i) => {
        console.log(`  ${i+1}. role_id: ${r.role_id}`);
      });
    }
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
main();
