require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const pool = require('./src/config/database');
const { processPingAt } = require('./src/modules/work/geofence.service');

const LAT = 39.741066;
const LON = 64.427637;
const ACC = 18;

function today(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ID lar to'g'ridan — xil-xil kelish vaqti
const SCENARIOS = [
  { id: 46, inH: 7,  inM: 48 },  // Haydarov Orif
  { id: 47, inH: 8,  inM: 12 },  // Po'lotov Ulug'bek
  { id: 48, inH: 8,  inM: 33 },  // Qambarova Marjona
  { id: 49, inH: 8,  inM: 29 },  // Ozodov Oxunjon
  { id: 50, inH: 8,  inM: 35 },  // Ramazonova Malika
  { id: 51, inH: 8,  inM: 41 },  // Roziqova Sitorabonu
  { id: 52, inH: 8,  inM: 52 },  // To'xtayeva Feruza
  { id: 53, inH: 9,  inM: 5  },  // To'yev Baxodir
  { id: 54, inH: 8,  inM: 24 },  // Xoliqova Gulxayo
  { id: 55, inH: 9,  inM: 18 },  // Zaribboyev Ma'rufjon
];

async function main() {
  const { rows: users } = await pool.query(
    `SELECT id, full_name FROM users WHERE id = ANY($1)`,
    [SCENARIOS.map(s => s.id)]
  );
  const userMap = Object.fromEntries(users.map(u => [u.id, u.full_name]));

  console.log('\n' + '='.repeat(68));
  console.log('GPS CHECK-IN SIMULYATSIYA — ID 46–55');
  console.log('='.repeat(68));

  for (const sc of SCENARIOS) {
    // Bugungi sessiyani tozalaymiz
    await pool.query(
      `DELETE FROM work_sessions WHERE user_id = $1 AND work_date = CURRENT_DATE`,
      [sc.id]
    );

    const ts = today(sc.inH, sc.inM);
    const result = await processPingAt(sc.id, LAT, LON, ACC, ts);

    const timeStr = `${String(sc.inH).padStart(2,'0')}:${String(sc.inM).padStart(2,'0')}`;
    const late = sc.inH > 8 || (sc.inH === 8 && sc.inM > 35);
    const tag  = late ? '⚠ KECH' : '✓     ';
    const name = (userMap[sc.id] || `ID ${sc.id}`).padEnd(34);

    console.log(`${tag}  ${name} ${timeStr}  →  ${result.action}`);
  }

  console.log('='.repeat(68));
  console.log('✅ Tugadi. Dashboard ni F5 bilan yangilang.\n');
  await pool.end();
}

main().catch(e => { console.error('Xato:', e.message); process.exit(1); });
