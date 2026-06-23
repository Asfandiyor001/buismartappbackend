// DB dan staff 43, 44 va admin password hash lari
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

async function run() {
  const r = await pool.query(`SELECT id, phone, password_hash FROM users WHERE id IN (29, 43, 44)`);
  const toTest = ['1234', 'Staff2026', 'asfan2005A@', 'BIU2026', 'Xodim2026'];
  for (const u of r.rows) {
    for (const pwd of toTest) {
      const ok = await bcrypt.compare(pwd, u.password_hash);
      if (ok) { console.log(`id=${u.id} phone=${u.phone} parol="${pwd}"`); break; }
    }
  }
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
