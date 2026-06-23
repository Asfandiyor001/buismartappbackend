const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
async function run() {
  const r = await pool.query(
    `SELECT id, full_name, phone, role FROM users WHERE role IN ('admin','prorektor','staff') ORDER BY role, id LIMIT 60`
  );
  r.rows.forEach(u => console.log(`id=${u.id}\trole=${u.role}\tphone=${u.phone}\tname=${u.full_name}`));
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
