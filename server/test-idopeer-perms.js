require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('./db/supabase.js');

async function main() {
  try {
    const playerId = '2230b953-19dd-456e-abfa-c2ec4a6d0167';
    
    console.log('\n=== IDOPEER PERMISSION DEBUG ===\n');
    
    // 1. Check player_roles
    const { data: playerRoles } = await supabase
      .from('player_roles')
      .select('role_id, roles(id, name)')
      .eq('player_id', playerId);
    
    console.log(`player_roles entries: ${playerRoles.length}`);
    playerRoles.forEach(pr => {
      console.log(`  role_id: ${pr.role_id} → name: ${pr.roles?.name}`);
    });
    
    if (playerRoles.length === 0) {
      console.log('  ⚠️ NO ENTRIES - permission lookup will fall back to JWT role hint');
    }
    
    // 2. For each role, get permissions
    for (const pr of playerRoles) {
      const roleId = pr.role_id;
      const { data: perms } = await supabase
        .from('role_permissions')
        .select('permissions(key)')
        .eq('role_id', roleId);
      
      const permKeys = perms.map(p => p.permissions?.key).filter(Boolean);
      console.log(`\n  Permissions for role ${pr.roles?.name}:`);
      permKeys.forEach(k => console.log(`    - ${k}`));
      
      const hasCrmView = permKeys.includes('crm:view');
      console.log(`    crm:view? ${hasCrmView ? '✓' : '✗'}`);
    }
    
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
