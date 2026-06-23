require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  const { rows } = await pool.query(
    `SELECT id, full_name, phone, password_hash, role
     FROM users
     WHERE id BETWEEN 16 AND 130
     ORDER BY id ASC`
  );

  console.log('\n' + '='.repeat(100));
  console.log(
    'ID'.padEnd(5) +
    'F.I.O'.padEnd(40) +
    'TELEFON'.padEnd(16) +
    'PAROL'.padEnd(14) +
    'ROL'
  );
  console.log('='.repeat(100));

  for (const u of rows) {
    const digits = (u.phone || '').replace(/\D/g, '');
    const last6  = digits.slice(-6) || '000000';
    const plain  = `Biu@${last6}`;

    console.log(
      String(u.id).padEnd(5) +
      String(u.full_name).padEnd(40) +
      String(u.phone).padEnd(16) +
      String(plain).padEnd(14) +
      String(u.role)
    );
  }

  console.log('='.repeat(100));
  console.log(`Jami: ${rows.length} ta xodim`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
