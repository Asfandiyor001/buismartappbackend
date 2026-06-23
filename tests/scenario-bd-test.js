/**
 * SCENARIO B + D: Internet o'chiq ish vaqti + Kanonik formula tekshiruvi
 * user_id=52 (Feruza) bilan test
 */
process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'asfan2005', database: 'BuiSmartApp' });
const { workedSecondsSql, REGULAR_CAP, TOTAL_CAP } = require('../src/utils/workTime');
const UID = 52;
const INSIDE = { lat: 39.741066, lon: 64.427637 };
const http = require('http');
const fs = require('fs');

const postRaw = (path, body, token) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = http.request({ hostname: 'localhost', port: 5000, path, method: 'POST', headers }, (res) => {
    let chunks = '';
    res.on('data', c => chunks += c);
    res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(chunks) }); } catch { resolve({ status: res.statusCode, data: chunks }); } });
  });
  req.on('error', reject);
  req.write(data);
  req.end();
});
const getRaw = (path, token) => new Promise((resolve, reject) => {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const req = http.request({ hostname: 'localhost', port: 5000, path, method: 'GET', headers }, (res) => {
    let chunks = '';
    res.on('data', c => chunks += c);
    res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(chunks) }); } catch { resolve({ status: res.statusCode, data: chunks }); } });
  });
  req.on('error', reject);
  req.end();
});

let ADMIN_TOKEN = null;
let STAFF_TOKEN = null;
async function getTokens() {
  if (ADMIN_TOKEN) return;
  const a = await postRaw('/api/auth/login', { phone: '+998901000014', password: 'asfan2005A@' });
  ADMIN_TOKEN = a.data?.data?.token || '';
  const s = await postRaw('/api/auth/login', { phone: '+998905002026', password: 'Biu@002026' });
  STAFF_TOKEN = s.data?.data?.token || '';
  console.log(`  Tokens: admin=${ADMIN_TOKEN ? 'OK' : 'FAIL'} staff=${STAFF_TOKEN ? 'OK' : 'FAIL'}`);
}

const rec = (name, pass, detail) => {
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
};

async function cleanUser() {
  await pool.query(`DELETE FROM work_logs WHERE user_id=$1 AND DATE(entry_time AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM gps_pings WHERE user_id=$1 AND DATE(created_at AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [UID]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
}

// ── SCENARIO B: Internet o'chiq simulyatsiya ──────────────────────────────────

async function scenarioB() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('SCENARIO B: INTERNET O\'CHIQ ISH VAQTI');
  console.log('═══════════════════════════════════════════════════');

  await cleanUser();

  // STEP 1-2: Checkin simulyatsiya (sync-offline, 08:00 dan 3 ta inside ping)
  await getTokens();
  const post = (path, body) => postRaw(path, body, STAFF_TOKEN);
  const get = (path, token) => getRaw(path, token);

  // 08:00 checkin via sync-offline
  const today = new Date();
  const makeTs = (h, m) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m, 0);
    return d.toISOString();
  };

  const checkinPings = [];
  for (let m = 0; m < 15; m += 5) {
    checkinPings.push({ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: makeTs(8, m) });
  }

  const syncRes = await post('/api/work/sync-offline', { events: checkinPings });
  rec('STEP 1-2: sync-offline 3 ping (08:00-08:10)', syncRes.status === 200, `status=${syncRes.status}`);

  // STEP 3: Session yaratilganini tekshir
  const s1 = await pool.query(`SELECT id, status, first_entry_time, is_finished, total_seconds, last_ping_at FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [UID]);
  const sess = s1.rows[0];
  rec('STEP 3: Session yaratildi', !!sess, sess ? `id=${sess.id} status=${sess.status} first_entry=${sess.first_entry_time}` : 'NO SESSION');

  if (!sess) {
    console.log('  ⛔ Session yo\'q — keyingi steplar o\'tkazib yuboriladi');
    return;
  }

  // STEP 4: "Internet o'chdi" — 3 soat hech narsa yuborilmaydi
  // Hech narsa qilmaymiz — shunchaki vaqt o'tganini simulyatsiya qilamiz
  console.log('\n  ⏳ STEP 4: "Internet o\'chdi" — 3 soat hech narsa yuborilmaydi');
  console.log('     (Haqiqiy vaqtda kutmaymiz — DB holatini tekshiramiz)');

  // STEP 5: work/today tekshir — internet yo'q paytda nima ko'rsatadi
  const todayRes = await getRaw('/api/work/today', STAFF_TOKEN);
  const todayData = todayRes.data?.data || todayRes.data;
  const liveTotal = todayData?.liveTotal ?? todayData?.total_seconds ?? 0;
  const status = todayData?.status ?? todayData?.session?.status ?? 'unknown';
  rec('STEP 5: /work/today holati', todayRes.status === 200, `status=${status} liveTotal=${liveTotal} (${(liveTotal/3600).toFixed(2)}h)`);
  rec('STEP 5a: liveTotal > 0 (formula span-abet ishlatadi)', liveTotal > 0, `liveTotal=${liveTotal}s`);

  // STEP 5b: total_seconds nima (DBda saqlangan)?
  const s2 = await pool.query(`SELECT total_seconds, status FROM work_sessions WHERE id=$1`, [sess.id]);
  const dbTotal = s2.rows[0]?.total_seconds || 0;
  rec('STEP 5b: DB total_seconds (faqat yopilganda yoziladi)', true, `db_total=${dbTotal} status=${s2.rows[0]?.status}`);

  // STEP 6: "Internet qaytdi" — offline pings flush (11:00-11:15)
  console.log('\n  📡 STEP 6: "Internet qaytdi" — offline pings flush');
  const flushPings = [];
  for (let m = 0; m < 15; m += 5) {
    flushPings.push({ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: makeTs(11, m) });
  }
  const flushRes = await post('/api/work/sync-offline', { events: flushPings });
  rec('STEP 6: sync-offline 3 ping (11:00-11:15)', flushRes.status === 200, `status=${flushRes.status}`);

  // STEP 7: work/today qayta tekshir
  const todayRes2 = await getRaw('/api/work/today', STAFF_TOKEN);
  const todayData2 = todayRes2.data?.data || todayRes2.data;
  const liveTotal2 = todayData2?.liveTotal ?? todayData2?.total_seconds ?? 0;
  rec('STEP 7: /work/today qayta tekshiruv', todayRes2.status === 200, `liveTotal=${liveTotal2} (${(liveTotal2/3600).toFixed(2)}h)`);
  rec('STEP 7a: liveTotal o\'sdi', liveTotal2 >= liveTotal, `before=${liveTotal} after=${liveTotal2}`);

  // ── STALE CHECK ──
  console.log('\n  ⏰ STALE CHECK TEKSHIRUVI');
  // 90 daq ping kelmasa — stale check yopadimi?
  // Javob: HA, agar nowMins <= 990 bo'lsa STALE_PING_MINUTES_WORK=90 daqiqadan keyin
  const lastPing = (await pool.query(`SELECT MAX(created_at) as lp FROM gps_pings WHERE user_id=$1`, [UID])).rows[0]?.lp;
  const minsSinceLastPing = lastPing ? (Date.now() - new Date(lastPing).getTime()) / 60000 : null;
  rec('Oxirgi ping vaqti', !!lastPing, `last_ping=${lastPing} mins_ago=${minsSinceLastPing?.toFixed(1)}`);

  // Resurrect tekshiruvi: yopilsa keyin ping kelsa qayta ochadimi?
  console.log('\n  🔄 RESURRECT TEKSHIRUVI');
  // Sessiyani qo'lda "done" qilamiz va keyin ping yuboramiz
  await pool.query(`UPDATE work_sessions SET status='done', is_finished=true WHERE id=$1`, [sess.id]);
  const activeLog = (await pool.query(`SELECT id FROM work_logs WHERE session_id=$1 AND is_active=true`, [sess.id])).rows[0];
  if (activeLog) {
    await pool.query(`UPDATE work_logs SET is_active=false, exit_time=NOW(), checkout_reason='test_stale' WHERE id=$1`, [activeLog.id]);
  }
  rec('Sessiya qo\'lda yopildi (done/is_finished=true)', true, `session_id=${sess.id}`);

  // Yangi ping yuboramiz — resurrect bo'lishi kerak
  const resurrectPings = [{ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: makeTs(12, 0) }];
  const resRes = await post('/api/work/sync-offline', { events: resurrectPings });
  rec('12:00 da yangi ping yuborildi (sync-offline)', resRes.status === 200, `status=${resRes.status}`);

  const s3 = await pool.query(`SELECT status, is_finished, first_entry_time FROM work_sessions WHERE id=$1`, [sess.id]);
  const afterRes = s3.rows[0];
  rec('Resurrect ishladi — sessiya qayta ochildi', afterRes?.status === 'active' && afterRes?.is_finished === false, `status=${afterRes?.status} is_finished=${afterRes?.is_finished}`);
  rec('first_entry_time saqlanib qoldi', afterRes?.first_entry_time != null, `first_entry=${afterRes?.first_entry_time}`);
}

// ── SCENARIO C: ADMIN PANEL DA KO'RINISH ──────────────────────────────────

async function scenarioC() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('SCENARIO C: ADMIN PANEL DA OFFLINE XODIM KO\'RINISHI');
  console.log('═══════════════════════════════════════════════════');

  await getTokens();

  const staffRes = await getRaw('/api/admin/staff-today', ADMIN_TOKEN);
  rec('GET /api/admin/staff-today', staffRes.status === 200, `status=${staffRes.status}`);

  const staffList = staffRes.data?.data?.staff || staffRes.data?.staff || [];
  const feruza = staffList.find(s => s.id === UID);

  if (feruza) {
    console.log('\n  📋 Feruza (id=52) admin panelda:');
    console.log(`     session_status = ${feruza.session_status}`);
    console.log(`     first_entry_time = ${feruza.first_entry_time}`);
    console.log(`     bugun_kirish = ${feruza.bugun_kirish}`);
    console.log(`     bugun_chiqish = ${feruza.bugun_chiqish}`);
    console.log(`     jami_sekund = ${feruza.jami_sekund} (${(feruza.jami_sekund/3600).toFixed(2)}h)`);
    console.log(`     total_seconds = ${feruza.total_seconds}`);
    console.log(`     davomat_foiz = ${feruza.davomat_foiz}%`);
  } else {
    rec('Feruza admin panelda topilmadi', false, `staffList.length=${staffList.length}`);
  }
}

// ── SCENARIO D: KANONIK FORMULA SQL ──────────────────────────────────

async function scenarioD() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('SCENARIO D: KANONIK FORMULA TEKSHIRUVI');
  console.log('═══════════════════════════════════════════════════');

  const { rows } = await pool.query(`
    SELECT
      u.full_name,
      ws.status,
      TO_CHAR(ws.first_entry_time, 'HH24:MI') AS first_entry,
      TO_CHAR(ws.last_ping_at AT TIME ZONE 'Asia/Tashkent', 'HH24:MI') as last_ping,
      ROUND(EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) / 60) AS min_since_ping,
      ws.total_seconds AS saved_total,
      CASE
        WHEN ws.first_entry_time IS NOT NULL THEN
          LEAST(32400,
            GREATEST(
              COALESCE(ws.total_seconds, 0),
              GREATEST(0,
                EXTRACT(EPOCH FROM (
                  LEAST(NOW(), CURRENT_DATE + INTERVAL '18 hours')
                  - (CURRENT_DATE + ws.first_entry_time)
                )) - 3600
              )
            )
          )::INT
        ELSE 0
      END AS formula_total,
      CASE
        WHEN ws.first_entry_time IS NOT NULL THEN
          (LEAST(32400,
            GREATEST(
              COALESCE(ws.total_seconds, 0),
              GREATEST(0,
                EXTRACT(EPOCH FROM (
                  LEAST(NOW(), CURRENT_DATE + INTERVAL '18 hours')
                  - (CURRENT_DATE + ws.first_entry_time)
                )) - 3600
              )
            )
          ) - COALESCE(ws.total_seconds, 0))::INT
        ELSE 0
      END AS farq_seconds
    FROM work_sessions ws
    JOIN users u ON u.id = ws.user_id
    WHERE ws.work_date = CURRENT_DATE
    ORDER BY u.full_name
  `);

  if (rows.length === 0) {
    console.log('  ⚠️  Bugun hech qanday work_session topilmadi');
  } else {
    console.log(`\n  📊 Bugungi ${rows.length} ta sessiya:\n`);
    console.log('  ┌────────────────────────────┬────────┬───────┬─────────┬──────────┬───────────┬──────────┬─────────┐');
    console.log('  │ Ism                        │ Status │ Kirdi │ O.Ping  │ DB_total │ Formula   │ Farq(s)  │ Ping_ago│');
    console.log('  ├────────────────────────────┼────────┼───────┼─────────┼──────────┼───────────┼──────────┼─────────┤');
    for (const r of rows) {
      const name = (r.full_name || '').padEnd(26).slice(0, 26);
      const st = (r.status || '').padEnd(6).slice(0, 6);
      const entry = (r.first_entry || '--:--').padEnd(5);
      const lpng = (r.last_ping || '--:--').padEnd(7);
      const dbT = String(r.saved_total ?? 0).padStart(8);
      const fT = String(r.formula_total).padStart(9);
      const farq = String(r.farq_seconds).padStart(8);
      const ago = String(r.min_since_ping ?? '?').padStart(7);
      console.log(`  │ ${name} │ ${st} │ ${entry} │ ${lpng} │ ${dbT} │ ${fT} │ ${farq} │ ${ago} │`);
    }
    console.log('  └────────────────────────────┴────────┴───────┴─────────┴──────────┴───────────┴──────────┴─────────┘');
    console.log('\n  IZOH: farq > 0 → formula GPS bo\'shliqlarni to\'ldiradi (span - abet_overlap)');
    console.log('         farq = 0 → logSum ≥ span yoki sessiya yopiq');

    // farq > 0 bo'lganlar — bu "internet o'chsa ish vaqti sanaladi" dalili
    const withFarq = rows.filter(r => r.farq_seconds > 0);
    if (withFarq.length > 0) {
      console.log(`\n  ✅ ${withFarq.length} ta xodimda formula GPS bo'shliqni to'ldirmoqda (farq>0)`);
    }
  }
}

(async () => {
  try {
    await scenarioB();
  } catch (e) { console.error('SCENARIO B ERROR:', e.message); }

  try {
    await scenarioC();
  } catch (e) { console.error('SCENARIO C ERROR:', e.message); }

  try {
    await scenarioD();
  } catch (e) { console.error('SCENARIO D ERROR:', e.message); }

  // Cleanup
  await cleanUser();
  console.log('\n  🧹 User 52 test data tozalandi');

  await pool.end();
  process.exit(0);
})();
