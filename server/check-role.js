require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('./db/supabase.js');

async function main() {
  try {
    const roleId = '32b83707-c0b7-499a-bd93-0e4b2052b407';
    
    // Get role name
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('name')
      .eq('id', roleId)
      .single();
    
    if (roleError) throw roleError;
    console.log(`Role ID ${roleId} is: ${role.name}`);
    
    // Get permissions for this role
    const { data: perms, error: permsError } = await supabase
      .from('role_permissions')
      .select('permissions(key)')
      .eq('role_id', roleId);
    
    if (permsError) throw permsError;
    
    const permKeys = perms.map(p => p.permissions?.key).filter(Boolean);
    console.log(`\nPermissions for ${role.name} role:`);
    permKeys.forEach(k => console.log(`  - ${k}`));
    
    const hasCrmView = permKeys.includes('crm:view');
    console.log(`\nHas crm:view? ${hasCrmView ? '✓ YES' : '✗ NO'}`);
    
    process.exit(hasCrmView ? 0 : 1);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
main();
