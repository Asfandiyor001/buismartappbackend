const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
async function run() {
  const r = await pool.query('SELECT id, name, latitude, longitude, radius_m, is_active FROM buildings ORDER BY id');
  console.log('Binolar:');
  r.rows.forEach(b => console.log(`  id=${b.id} | ${b.name} | lat=${b.latitude} lon=${b.longitude} radius=${b.radius_m}m | active=${b.is_active}`));
  await pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
