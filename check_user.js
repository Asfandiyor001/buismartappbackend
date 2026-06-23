require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const { rows: count } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users WHERE role IN ('staff','admin','prorektor')`
  );
  const { rows: user } = await pool.query(
    `SELECT id, full_name, phone, role, is_active FROM users WHERE phone = '+998949593633'`
  );

  console.log('\nJami xodimlar:', count[0].c);
  if (user.length) {
    console.log('✅ Xayrullayev topildi:', user[0]);
  } else {
    console.log('❌ Xayrullayev DB da YOQ — node add_user.js ishlatilmagan!');
  }
  await pool.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });
