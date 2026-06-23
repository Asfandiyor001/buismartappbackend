require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool  = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('asfan2005A@', 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = 29', [hash]);
  console.log('✅ ID 29 paroli qaytarildi: asfan2005A@');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
