const { Pool } = require('pg');
require('dotenv').config();

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
const pool = new Pool({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });

async function api(method, path, body, tok) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await r.json().catch(() => ({}));
    return { status: r.status, data: raw?.data ?? raw };
  } catch (e) {
    return { status: 0, data: {}, error: e.message };
  }
}

// Tashkent UTC+5 dan bugungi sanani aniqlaymiz
function tashkentDate() {
  const t = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

// Tashkent soat → UTC timestamp (server UTC+5 da getHours() = hours bo'lsin)
function todayAt(hours, minutes = 0) {
  const { y, m, d } = tashkentDate();
  return new Date(Date.UTC(y, m, d, hours - 5, minutes, 0)).toISOString();
}

// Bino koordinatalari
const BINO1 = { lat: 39.74107, lon: 64.42764 }; // Asosiy bino, radius 120m
const BINO2 = { lat: 39.74065, lon: 64.43265 }; // Laboratoriya, radius 100m

function makeEvents(bino, arrHour, arrMin, count = 5) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const totalMin = arrMin + i * 4;
    const h = arrHour + Math.floor(totalMin / 60);
    const mn = totalMin % 60;
    events.push({
      type:      'ping',
      lat:       bino.lat + (Math.random() * 0.0002 - 0.0001),
      lon:       bino.lon + (Math.random() * 0.0002 - 0.0001),
      accuracy:  8 + Math.random() * 4,
      timestamp: todayAt(h, mn),
    });
  }
  return events;
}

// Har bir xodim uchun stsenariy
// phone: +998901000031 → password: Biu@000031
const STAFF = [
  { id: 46, phone: '+998901000031', pwd: 'Biu@000031', name: 'Haydarov Orif',        arrH: 8,  arrM: 3,  bino: BINO1, label: '⏰ Erta keldi' },
  { id: 47, phone: '+998901000032', pwd: 'Biu@000032', name: "Po'lotov Ulug'bek",    arrH: 8,  arrM: 12, bino: BINO1, label: '✅ O\'z vaqtida' },
  { id: 48, phone: '+998901000033', pwd: 'Biu@000033', name: 'Qambarova Marjona',    arrH: 8,  arrM: 22, bino: BINO2, label: '✅ O\'z vaqtida (Bino-2)' },
  { id: 49, phone: '+998901000034', pwd: 'Biu@000034', name: 'Ozodov Oxunjon',       arrH: 8,  arrM: 38, bino: BINO1, label: '🟡 Biroz kechikdi' },
  { id: 50, phone: '+998901000035', pwd: 'Biu@000035', name: 'Ramazonova Malika',    arrH: 8,  arrM: 47, bino: BINO1, label: '🟡 Biroz kechikdi' },
  { id: 51, phone: '+998901000036', pwd: 'Biu@000036', name: "Roziqova Sitorabonu",  arrH: 9,  arrM: 2,  bino: BINO2, label: '🟠 Kechikdi (Bino-2)' },
  { id: 52, phone: '+998905002026', pwd: 'Biu@002026', name: "To'xtayeva Feruza",    arrH: 9,  arrM: 15, bino: BINO1, label: '🟠 Kechikdi' },
  { id: 53, phone: '+998901000038', pwd: 'Biu@000038', name: "To'yev Baxodir",       arrH: 9,  arrM: 28, bino: BINO1, label: '🔴 Kech kechikdi' },
  { id: 54, phone: '+998901000039', pwd: 'Biu@000039', name: 'Xoliqova Gulxayo',     arrH: 9,  arrM: 42, bino: BINO2, label: '🔴 Kech kechikdi (Bino-2)' },
  { id: 55, phone: '+998901000040', pwd: 'Biu@000040', name: "Zaribboyev Ma'rufjon", arrH: 10, arrM: 5,  bino: BINO1, label: '🔴 Juda kech' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cleanToday(userId) {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
  const endUTC   = new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();

  await pool.query(
    `DELETE FROM work_logs WHERE session_id IN (
       SELECT id FROM work_sessions WHERE user_id=$1 AND work_date=$2::date
     )`, [userId, dateStr]
  );
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=$2::date`, [userId, dateStr]);
  await pool.query(
    `DELETE FROM gps_pings WHERE user_id=$1 AND created_at BETWEEN $2 AND $3`,
    [userId, startUTC, endUTC]
  );
}

async function processStaff(s, idx) {
  process.stdout.write(`\n[${idx + 1}/10] ID=${s.id} ${s.name} — ${s.label}\n`);

  // Tozalash
  await cleanToday(s.id);

  // Login (rate limiter uchun 7 soniya oraliq)
  if (idx > 0) {
    process.stdout.write(`  ⏳ 7s kutilmoqda (rate limiter)...\n`);
    await sleep(7000);
  }

  const loginR = await api('POST', '/api/auth/login', { phone: s.phone, password: s.pwd });
  const token = loginR.data?.token;
  if (!token) {
    // Boshqa parollarni sinab ko'ramiz
    const fallbacks = ['1234', 'Staff2026', 'BIU2026'];
    for (const p of fallbacks) {
      await sleep(1000);
      const r2 = await api('POST', '/api/auth/login', { phone: s.phone, password: p });
      if (r2.data?.token) {
        process.stdout.write(`  🔑 Fallback parol: ${p}\n`);
        return processWithToken(s, r2.data.token);
      }
    }
    process.stdout.write(`  ❌ Login xato: ${JSON.stringify(loginR.data).slice(0, 80)}\n`);
    return false;
  }

  return processWithToken(s, token);
}

async function processWithToken(s, token) {
  const timeLabel = `${String(s.arrH).padStart(2,'0')}:${String(s.arrM).padStart(2,'0')}`;
  const binoName = s.bino === BINO1 ? 'Bino-1' : 'Bino-2';

  const events = makeEvents(s.bino, s.arrH, s.arrM, 5);
  process.stdout.write(`  📍 ${binoName} ga ${timeLabel} da kirdi — ping yuborilmoqda...\n`);

  const r = await api('POST', '/api/work/sync-offline', { events }, token);
  if (r.status !== 200) {
    process.stdout.write(`  ❌ sync-offline ${r.status}: ${JSON.stringify(r.data).slice(0, 120)}\n`);
    return false;
  }

  const results = r.data?.results ?? [];
  const actions = results.map(x => x.result?.action || x.error || '?').join(', ');
  process.stdout.write(`  ✅ [${actions}]\n`);

  // Live ping — last_ping_at ni hozirgi vaqtga yangilaymiz
  // (backdated timestamp autoClose.job tomonidan eskirgan deb hisoblanmasligi uchun)
  await sleep(300);
  await api('POST', '/api/work/ping', {
    lat: s.bino.lat + (Math.random() * 0.0001 - 0.00005),
    lon: s.bino.lon + (Math.random() * 0.0001 - 0.00005),
    accuracy: 9,
  }, token);

  await sleep(400);

  const today = await api('GET', '/api/work/today', null, token);
  const ses = today.data;
  if (ses?.id) {
    const entry = ses.first_entry_time || ses.firstEntryTime || '—';
    const entryOk = String(entry).startsWith(timeLabel.slice(0, 2));
    process.stdout.write(`  📋 Session ${ses.id} | kirish=${entry} | ${entryOk ? '✅' : '⚠️ '} status=${ses.status}\n`);
    return true;
  }
  process.stdout.write(`  ⚠️  Session topilmadi\n`);
  return false;
}

async function run() {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  console.log('\n' + '═'.repeat(60));
  console.log('  📅 ID=46–55 DAVOMAT SIMULATSIYASI');
  console.log(`  Sana: ${dateStr} | Server: ${BASE}`);
  console.log('═'.repeat(60));
  console.log('\n  Kelish vaqtlari:');
  STAFF.forEach(s => {
    const t = `${String(s.arrH).padStart(2,'0')}:${String(s.arrM).padStart(2,'0')}`;
    console.log(`    ID=${s.id} ${s.name.padEnd(22)} → ${t}  ${s.label}`);
  });

  let success = 0, fail = 0;

  for (let i = 0; i < STAFF.length; i++) {
    const ok = await processStaff(STAFF[i], i);
    if (ok) success++; else fail++;
  }

  // Yakuniy DB tekshiruv
  console.log('\n' + '─'.repeat(60));
  console.log('  📊 DB YAKUNIY HOLAT');
  console.log('─'.repeat(60));

  const ids = STAFF.map(s => s.id);
  const r = await pool.query(
    `SELECT ws.user_id, u.full_name, ws.status, ws.first_entry_time, ws.work_date
     FROM work_sessions ws JOIN users u ON u.id=ws.user_id
     WHERE ws.user_id = ANY($1::int[]) AND ws.work_date=$2::date
     ORDER BY ws.first_entry_time`,
    [ids, dateStr]
  );

  if (!r.rows.length) {
    console.log('  ❌ Session topilmadi!');
  } else {
    r.rows.forEach(s => {
      const st = STAFF.find(x => x.id === s.user_id);
      const expected = `${String(st.arrH).padStart(2,'0')}:${String(st.arrM).padStart(2,'0')}`;
      const entryStr = String(s.first_entry_time).slice(0, 5);
      const ok = entryStr === expected;
      console.log(`  ${ok ? '✅' : '⚠️ '} ID=${s.user_id} ${s.full_name.padEnd(30)} kirish=${entryStr} (kutilgan=${expected}) ${s.status}`);
    });
  }

  const notFound = STAFF.filter(s => !r.rows.find(x => x.user_id === s.id));
  notFound.forEach(s => {
    console.log(`  ❌ ID=${s.id} ${s.full_name} — session topilmadi`);
  });

  await pool.end();

  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Muvaffaqiyat: ${success}/10   ❌ Xato: ${fail}/10`);
  console.log('  Admin → Live Presence da ko\'rish mumkin!');
  console.log('═'.repeat(60) + '\n');
}

run().catch(async e => { console.error('Xato:', e.message); await pool.end(); process.exit(1); });
