// ID=51-55 larni 08:49 gacha bo'lgan vaqtlarga ko'chirish
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

function tashkentDate() {
  const t = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
}

// Server UTC+5: todayAt(8,28) → UTC 03:28 → getHours()=8 → "08:28"
function todayAt(hours, minutes = 0) {
  const { y, m, d } = tashkentDate();
  return new Date(Date.UTC(y, m, d, hours - 5, minutes, 0)).toISOString();
}

const BINO1 = { lat: 39.74107, lon: 64.42764 };
const BINO2 = { lat: 39.74065, lon: 64.43265 };

function makeEvents(bino, arrH, arrM, count = 5) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const totalMin = arrM + i * 3;
    const h = arrH + Math.floor(totalMin / 60);
    const mn = totalMin % 60;
    events.push({
      type: 'ping',
      lat:  bino.lat + (Math.random() * 0.0002 - 0.0001),
      lon:  bino.lon + (Math.random() * 0.0002 - 0.0001),
      accuracy: 8 + Math.random() * 4,
      timestamp: todayAt(h, mn),
    });
  }
  return events;
}

// Yangilangan vaqtlar — hammasi 08:49 dan oldin
const STAFF = [
  { id: 51, phone: '+998901000036', pwd: 'Biu@000036', name: 'Roziqova Sitorabonu',  arrH: 8, arrM: 28, bino: BINO2, label: '🟡 Biroz kechikdi (Bino-2)' },
  { id: 52, phone: '+998905002026', pwd: 'Biu@002026', name: "To'xtayeva Feruza",    arrH: 8, arrM: 34, bino: BINO1, label: '🟡 Biroz kechikdi' },
  { id: 53, phone: '+998901000038', pwd: 'Biu@000038', name: "To'yev Baxodir",       arrH: 8, arrM: 40, bino: BINO1, label: '🟡 Biroz kechikdi' },
  { id: 54, phone: '+998901000039', pwd: 'Biu@000039', name: 'Xoliqova Gulxayo',     arrH: 8, arrM: 45, bino: BINO2, label: '🟠 Kechikdi (Bino-2)' },
  { id: 55, phone: '+998901000040', pwd: 'Biu@000040', name: "Zaribboyev Ma'rufjon", arrH: 8, arrM: 48, bino: BINO1, label: '🟠 Kechikdi' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cleanToday(userId) {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
  const endUTC   = new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();
  await pool.query(`DELETE FROM work_logs WHERE session_id IN (SELECT id FROM work_sessions WHERE user_id=$1 AND work_date=$2::date)`, [userId, dateStr]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=$2::date`, [userId, dateStr]);
  await pool.query(`DELETE FROM gps_pings WHERE user_id=$1 AND created_at BETWEEN $2 AND $3`, [userId, startUTC, endUTC]);
}

async function run() {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  console.log('\n' + '═'.repeat(58));
  console.log('  🔄 ID=51-55 vaqtlarini 08:49 gacha ko\'chirish');
  console.log(`  Sana: ${dateStr}`);
  console.log('═'.repeat(58));
  console.log('\n  Yangi kelish vaqtlari:');
  STAFF.forEach(s => {
    const t = `${String(s.arrH).padStart(2,'0')}:${String(s.arrM).padStart(2,'0')}`;
    console.log(`    ID=${s.id} ${s.name.padEnd(22)} → ${t}  ${s.label}`);
  });
  console.log('');

  let ok = 0;

  for (let i = 0; i < STAFF.length; i++) {
    const s = STAFF[i];
    const t = `${String(s.arrH).padStart(2,'0')}:${String(s.arrM).padStart(2,'0')}`;
    process.stdout.write(`[${i+1}/5] ID=${s.id} ${s.name} → ${t}\n`);

    await cleanToday(s.id);
    process.stdout.write(`  🗑  Eski data tozalandi\n`);

    if (i > 0) await sleep(7000);

    const loginR = await api('POST', '/api/auth/login', { phone: s.phone, password: s.pwd });
    const token = loginR.data?.token;
    if (!token) {
      process.stdout.write(`  ❌ Login xato: ${JSON.stringify(loginR.data).slice(0,80)}\n`);
      continue;
    }

    const events = makeEvents(s.bino, s.arrH, s.arrM, 5);
    const r = await api('POST', '/api/work/sync-offline', { events }, token);
    if (r.status !== 200) {
      process.stdout.write(`  ❌ ping xato ${r.status}\n`);
      continue;
    }

    const actions = (r.data?.results ?? []).map(x => x.result?.action || '?').join(', ');
    process.stdout.write(`  ✅ [${actions}]\n`);

    // Live ping — last_ping_at ni hozirgi vaqtga yangilaymiz
    await sleep(300);
    await api('POST', '/api/work/ping', {
      lat: s.bino.lat + (Math.random() * 0.0001 - 0.00005),
      lon: s.bino.lon + (Math.random() * 0.0001 - 0.00005),
      accuracy: 9,
    }, token);

    await sleep(400);
    const tod = await api('GET', '/api/work/today', null, token);
    const ses = tod.data;
    if (ses?.id) {
      process.stdout.write(`  📋 Session ${ses.id} | kirish=${ses.first_entry_time} | ${ses.status}\n`);
      ok++;
    }
  }

  // Barcha 12 userning yakuniy holati
  console.log('\n' + '─'.repeat(58));
  console.log('  📊 BARCHA 12 XODIM HOLATI');
  console.log('─'.repeat(58));

  const allIds = [43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55];
  const res = await pool.query(
    `SELECT ws.user_id, u.full_name, ws.status, ws.first_entry_time
     FROM work_sessions ws JOIN users u ON u.id=ws.user_id
     WHERE ws.user_id = ANY($1::int[]) AND ws.work_date=$2::date
     ORDER BY ws.first_entry_time`,
    [allIds, dateStr]
  );

  res.rows.forEach((s, i) => {
    const entry = String(s.first_entry_time).slice(0, 5);
    console.log(`  ${i+1 < 10 ? ' ' : ''}${i+1}. ID=${s.user_id} ${s.full_name.padEnd(32)} ${entry}  ${s.status === 'active' ? '🟢' : '⚪'}`);
  });

  const missing = allIds.filter(id => !res.rows.find(r => r.user_id === id));
  if (missing.length) console.log(`  ⚠️  Session yo'q: ID=${missing.join(', ')}`);

  await pool.end();
  console.log('\n' + '═'.repeat(58));
  console.log(`  ✅ ${ok}/5 yangilandi | Jami active: ${res.rows.filter(r => r.status==='active').length}/12`);
  console.log('═'.repeat(58) + '\n');
}

run().catch(async e => { console.error('Xato:', e.message); await pool.end(); process.exit(1); });
