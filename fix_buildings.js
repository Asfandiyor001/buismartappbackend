require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');

async function main() {
  await pool.query(`
    UPDATE buildings SET latitude = 39.741066, longitude = 64.427637 WHERE id = 1
  `);
  await pool.query(`
    UPDATE buildings SET latitude = 39.740647, longitude = 64.432648 WHERE id = 2
  `);
  await pool.query(`
    UPDATE buildings SET latitude = 39.740200, longitude = 64.434800 WHERE id = 3
  `);

  const { rows } = await pool.query(
    `SELECT id, short_name, latitude, longitude, radius_m FROM buildings ORDER BY id`
  );

  console.log('\n' + '='.repeat(65));
  console.log('ID   BINO          LATITUDE       LONGITUDE      RADIUS');
  console.log('='.repeat(65));
  for (const b of rows) {
    console.log(
      String(b.id).padEnd(5) +
      String(b.short_name).padEnd(14) +
      String(b.latitude).padEnd(15) +
      String(b.longitude).padEnd(15) +
      b.radius_m + ' m'
    );
  }
  console.log('='.repeat(65));
  console.log('✅ Barcha binolar koordinatalari yangilandi.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
