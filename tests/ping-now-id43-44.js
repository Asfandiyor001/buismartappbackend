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

// Tashkent soat → UTC: hours-5 (UTC+5 server da getHours()=hours bo'lsin)
// first_entry_time = "08:10" saqlanishi uchun
function todayAt(hours, minutes = 0) {
  const { y, m, d } = tashkentDate();
  return new Date(Date.UTC(y, m, d, hours - 5, minutes, 0)).toISOString();
}

const BINO1 = { lat: 39.74107, lon: 64.42764 };

function makeEvent(hour, minute) {
  return {
    type:      'ping',
    lat:       BINO1.lat + (Math.random() * 0.0002 - 0.0001),
    lon:       BINO1.lon + (Math.random() * 0.0002 - 0.0001),
    accuracy:  8 + Math.random() * 4,
    timestamp: todayAt(hour, minute),
  };
}

const STAFF = [
  { id: 43, phone: '+998901000028', password: 'Biu@000028', name: 'Sharipova Sharifa' },
  { id: 44, phone: '+998901000029', password: 'Biu@000029', name: 'Sharifov Fazliddin' },
];

async function cleanToday(userId) {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // work_logs va sessions ni tozalaymiz
  const wl = await pool.query(
    `DELETE FROM work_logs WHERE session_id IN (
       SELECT id FROM work_sessions WHERE user_id=$1 AND work_date=$2::date
     )`, [userId, dateStr]
  );
  const ws = await pool.query(
    `DELETE FROM work_sessions WHERE user_id=$1 AND work_date=$2::date`, [userId, dateStr]
  );
  // gps_pings tozalash (created_at UTC da, shuning uchun bugunni UTC da olamiz)
  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0)).toISOString();
  const endUTC   = new Date(Date.UTC(y, m, d, 23, 59, 59)).toISOString();
  const gps = await pool.query(
    `DELETE FROM gps_pings WHERE user_id=$1 AND created_at BETWEEN $2 AND $3`,
    [userId, startUTC, endUTC]
  );
  return { sessions: ws.rowCount, logs: wl.rowCount, pings: gps.rowCount };
}

async function sendPings(staff) {
  const loginR = await api('POST', '/api/auth/login', { phone: staff.phone, password: staff.password });
  const token = loginR.data?.token;
  if (!token) {
    console.log(`  ❌ Login xato: ${JSON.stringify(loginR.data).slice(0, 100)}`);
    return false;
  }

  // 08:10 da 5 ta ping — bino ichida
  const events = [
    makeEvent(8, 10),
    makeEvent(8, 13),
    makeEvent(8, 17),
    makeEvent(8, 21),
    makeEvent(8, 25),
  ];

  console.log(`  📤 Timestamp namunas: ${events[0].timestamp}`);

  const r = await api('POST', '/api/work/sync-offline', { events }, token);
  if (r.status !== 200) {
    console.log(`  ❌ sync-offline xato ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
    return false;
  }

  const results = r.data?.results ?? [];
  const actions = results.map(x => x.result?.action || x.error || x.reason || '?').join(', ');
  console.log(`  ✅ ${r.data?.processed} event → [${actions}]`);

  // Live ping — last_ping_at ni hozirgi vaqtga yangilaymiz
  await new Promise(res => setTimeout(res, 300));
  await api('POST', '/api/work/ping', {
    lat: BINO1.lat + (Math.random() * 0.0001 - 0.00005),
    lon: BINO1.lon + (Math.random() * 0.0001 - 0.00005),
    accuracy: 9,
  }, token);

  await new Promise(res => setTimeout(res, 400));

  const today = await api('GET', '/api/work/today', null, token);
  const ses = today.data;
  if (ses?.id) {
    const entry = ses.first_entry_time || ses.firstEntryTime || '—';
    console.log(`  📋 Session id=${ses.id} | status=${ses.status} | first_entry=${entry} | total=${ses.total_seconds}s`);
    return true;
  }
  console.log(`  ⚠️  /work/today null qaytardi`);
  return false;
}

async function run() {
  const { y, m, d } = tashkentDate();
  const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  console.log('\n' + '='.repeat(55));
  console.log(`  ID=43 & ID=44 — 08:10 Bino-1 ga kirdi`);
  console.log(`  Sana (Tashkent): ${dateStr}`);
  console.log(`  todayAt(8,10) = ${todayAt(8, 10)}`);
  console.log('='.repeat(55));

  for (const staff of STAFF) {
    console.log(`\n--- ID=${staff.id}: ${staff.name} ---`);

    // 1. Bugungi data ni tozalaymiz
    const clean = await cleanToday(staff.id);
    console.log(`  🗑  Tozalandi: ${clean.sessions} session, ${clean.logs} log, ${clean.pings} ping`);

    // 2. Ping yuboramiz
    await sendPings(staff);
  }

  // DB dan yakuniy tekshiruv
  console.log('\n--- DB yakuniy holati ---');
  const r = await pool.query(
    `SELECT ws.id, ws.user_id, u.full_name, ws.work_date, ws.status,
            ws.first_entry_time, ws.total_seconds
     FROM work_sessions ws JOIN users u ON u.id=ws.user_id
     WHERE ws.user_id IN (43,44) AND ws.work_date=$1::date`,
    [dateStr]
  );
  if (!r.rows.length) {
    console.log('  ❌ Hech qanday session topilmadi!');
  }
  r.rows.forEach(s => {
    const ok = String(s.first_entry_time).startsWith('08:');
    console.log(`  ${ok ? '✅' : '⚠️ '} ID=${s.user_id} (${s.full_name}) | entry=${s.first_entry_time} | status=${s.status}`);
  });

  await pool.end();
  console.log('\n' + '='.repeat(55));
  console.log('  Tayyor! Admin → Live Presence da 08:10 ko\'rish kerak');
  console.log('='.repeat(55) + '\n');
}

run().catch(async e => { console.error('Xato:', e.message); await pool.end(); process.exit(1); });
