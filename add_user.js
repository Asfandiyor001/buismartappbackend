require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool  = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function main() {
  const full_name = 'Xayrullayev Azizbek';
  const phone     = '+998949593633';
  const position  = 'Hemischi';
  const plain     = 'Biu@593633';
  const hash      = await bcrypt.hash(plain, 10);

  // 1) users jadvaliga qo'sh
  const { rows } = await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, role, is_active)
     VALUES ($1, $2, $3, 'staff', true)
     RETURNING id, full_name, phone, role`,
    [full_name, phone, hash]
  );
  const user = rows[0];

  // 2) staff_profiles jadvaliga qo'sh
  await pool.query(
    `INSERT INTO staff_profiles (user_id, position, department, work_start, work_end)
     VALUES ($1, $2, 'Xodimlar bo''limi', '08:30', '16:30')`,
    [user.id, position]
  );

  console.log('\n' + '='.repeat(55));
  console.log('✅ Yangi xodim muvaffaqiyatli qo\'shildi!');
  console.log('='.repeat(55));
  console.log('ID       :', user.id);
  console.log('Ism      :', user.full_name);
  console.log('Telefon  :', user.phone);
  console.log('Lavozim  :', position);
  console.log('Parol    :', plain);
  console.log('Role     :', user.role);
  console.log('='.repeat(55));

  await pool.end();
}

main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
