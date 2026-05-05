require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const supabase = require('./db/supabase.js');

async function main() {
  try {
    const { data, error } = await supabase
      .from('role_permissions')
      .select('roles(name), permissions(key)')
      .eq('roles.name', 'coach');
    
    if (error) throw error;
    
    console.log('Coach role permissions in DB:');
    const perms = data.map(rp => rp.permissions?.key).filter(Boolean);
    perms.forEach(p => console.log(`  - ${p}`));
    
    const hasCrmView = perms.includes('crm:view');
    console.log(`\nHas crm:view? ${hasCrmView ? '✓ YES' : '✗ NO'}`);
    
    process.exit(hasCrmView ? 0 : 1);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}
main();
