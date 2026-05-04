const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'BuiSmartApp'
});

async function run() {
  // Mavjud barcha userlarga '1234' parol o'rnatamiz (test uchun)
  const hash = bcrypt.hashSync('1234', 10);
  const res = await pool.query('UPDATE users SET password_hash = $1', [hash]);
  console.log('Updated rows:', res.rowCount);

  // Qaysi userlar bor ekanini ko'rish
  const users = await pool.query(
    "SELECT id, full_name, phone, role FROM users ORDER BY role, id"
  );
  console.log('\nDB foydalanuvchilari:');
  users.rows.forEach(u => {
    console.log(`  id=${u.id}  role=${u.role.padEnd(8)}  phone=${u.phone}  name=${u.full_name}`);
  });

  await pool.end();
}

run().catch(e => { console.error(e.message); pool.end(); });
