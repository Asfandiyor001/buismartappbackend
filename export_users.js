require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool   = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function main() {
  const { rows } = await pool.query(
    `SELECT id, full_name, phone, role
     FROM users
     WHERE role IN ('staff','admin','prorektor')
       AND is_active = true
     ORDER BY id ASC`
  );

  const updated = [];

  for (const u of rows) {
    const digits = (u.phone || '').replace(/\D/g, '');
    const last6  = digits.slice(-6) || '000000';
    const plain  = `Biu@${last6}`;
    const hash   = await bcrypt.hash(plain, 10);

    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, u.id]);

    updated.push({ id: u.id, full_name: u.full_name, phone: u.phone, password: plain, role: u.role });
  }

  console.log('\n' + '='.repeat(90));
  console.log(
    'ID'.padEnd(6) +
    'F.I.O'.padEnd(35) +
    'TELEFON'.padEnd(18) +
    'PAROL'.padEnd(16) +
    'ROL'
  );
  console.log('='.repeat(90));

  for (const u of updated) {
    console.log(
      String(u.id).padEnd(6) +
      String(u.full_name).padEnd(35) +
      String(u.phone).padEnd(18) +
      String(u.password).padEnd(16) +
      String(u.role)
    );
  }

  console.log('='.repeat(90));
  console.log(`Jami: ${updated.length} ta xodim. Parollar yangilandi.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
