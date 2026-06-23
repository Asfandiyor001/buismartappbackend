process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const pool = require('../src/config/database');

// ─────────────────────────────────────────────────────────────────────────
// CHIQISH VAQTI TESTLARI — "xodim 16:40 da ketganda tizim vaqtni QACHON/QANDAY
// to'xtatadi". Wall-clock'dan MUSTAQIL: sun'iy sessiya last_ping_at=NOW() (yangi)
// bilan tayyorlanadi → finalizeInactiveSessions (60 daq stale) tegmaydi, va
// gps_off backdated 16:40 (08:00+9soat=17:00 va 18:00 EOD cap'dan oldin) bo'lgani
// uchun istalgan soatda barqaror ishlaydi.
// ─────────────────────────────────────────────────────────────────────────

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
const USER_ID = 52;
const STAFF_PHONE = '+998905002026';
const STAFF_PW = 'Biu@002026';
const ADMIN_PHONE = '+998901000014';
const ADMIN_PW = 'asfan2005A@';

let passed = 0, failed = 0;
const errors = [];

function ok(label, cond, info = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  if (cond) passed++; else { failed++; errors.push(`${label}: ${info}`); }
}
function sec(t) { console.log('\n' + '━'.repeat(64) + '\n  ' + t + '\n' + '━'.repeat(64)); }
function fmt(s) { s = Number(s) || 0; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}s ${m}d`; }
function todayAt(h, m = 0) { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 5, m, 0)).getTime(); }
const iso = (h, m) => new Date(todayAt(h, m)).toISOString();

async function api(method, path, body, tok) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data: data?.data || data };
}

// Toza sun'iy sessiya: kirish 08:00, ochiq log (Bino 1), last_ping_at=NOW() (yangi)
async function seedFreshSession() {
  await pool.query(
    `DELETE FROM work_logs WHERE session_id IN
       (SELECT id FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE)`, [USER_ID]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [USER_ID]);
  const { rows: [s] } = await pool.query(
    `INSERT INTO work_sessions
       (user_id, work_date, first_entry_time, status, is_finished, last_ping_at, buildings_visited)
     VALUES ($1, CURRENT_DATE, TIME '08:00', 'active', false, NOW(), 1) RETURNING id`, [USER_ID]);
  await pool.query(
    `INSERT INTO work_logs
       (session_id, user_id, building_id, entry_time, entry_lat, entry_lon, is_active, source)
     VALUES ($1, $2, 1, CURRENT_DATE + TIME '08:00', 39.74106600, 64.42763700, true, 'gps')`,
    [s.id, USER_ID]);
  return s.id;
}
async function readSession(id) {
  const { rows: [r] } = await pool.query(
    `SELECT first_entry_time, last_exit_time, status, is_finished, total_seconds, auto_checkout
     FROM work_sessions WHERE id=$1`, [id]);
  return r;
}
async function readActiveLog(id) {
  const { rows } = await pool.query(
    `SELECT id, exit_time::time AS exit, is_active, checkout_reason, duration_seconds
     FROM work_logs WHERE session_id=$1 ORDER BY entry_time DESC LIMIT 1`, [id]);
  return rows[0];
}

(async () => {
  console.log('\n' + '═'.repeat(64));
  console.log('  🧪 CHIQISH VAQTI TESTLARI — XODIM 16:40 DA KETDI');
  console.log('  📅 ' + new Date().toLocaleString('uz') + '  (wall-clock mustaqil)');
  console.log('═'.repeat(64));

  const sr = await api('POST', '/api/auth/login', { phone: STAFF_PHONE, password: STAFF_PW });
  const staffTok = sr.data?.token;
  const ar = await api('POST', '/api/auth/login', { phone: ADMIN_PHONE, password: ADMIN_PW });
  const adminTok = ar.data?.token;
  ok('Staff + Admin login', !!staffTok && !!adminTok);
  if (!staffTok || !adminTok) { await pool.end(); process.exit(1); }

  // ═══════════════════════════════════════════════════════════════════════
  sec('TEST 1: FAQAT OUTSIDE PING (offline) → AKTIV LOG OCHIQ QOLADI');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 Xodim binodan chiqdi, lekin app faqat outside ping yubordi (gps_off yo\'q).');
  console.log('     Kutilgan: offline outside ping aktiv logni YOPMAYDI (anti-jitter dizayni).');

  const id1 = await seedFreshSession();
  // backdated outside ping (binodan ~2km). processPingAt outside branch faqat last_ping yangilaydi.
  const rOut = await api('POST', '/api/work/sync-offline',
    { events: [{ type: 'ping', lat: 39.7600, lon: 64.4500, accuracy: 10, timestamp: iso(16, 30) }] }, staffTok);
  // last_ping_at backdated bo'lib qolmasin (stale poll'dan himoya) — darhol NOW'ga qaytaramiz
  await pool.query(`UPDATE work_sessions SET last_ping_at=NOW() WHERE id=$1`, [id1]);
  const log1 = await readActiveLog(id1);
  ok('Outside ping → 200', rOut.status === 200, 'action=' + rOut.data?.results?.[0]?.result?.action);
  ok('Aktiv log OCHIQ qoldi (outside ping yopmadi)', log1?.is_active === true,
    'is_active=' + log1?.is_active);
  console.log('  🔎 Xulosa: vaqtni to\'xtatish uchun mobil ilova "gps_off" yuborishi shart.');

  // ═══════════════════════════════════════════════════════════════════════
  sec('TEST 2: gps_off EVENT @ 16:40 → VAQT 16:40 DA TO\'XTAYDI (asosiy)');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 16:40 da app "gps_off" yuboradi → autoCheckoutAt logni 16:40 da yopadi.');
  console.log('     Kutilgan: total = 08:00→16:40 = 8s 40d (18:00 gacha SHISHMAYDI).');

  const id2 = await seedFreshSession();
  const rOff = await api('POST', '/api/work/sync-offline',
    { events: [{ type: 'gps_off', timestamp: iso(16, 40) }] }, staffTok);
  const offAction = rOff.data?.results?.[0]?.result?.action;
  const s2 = await readSession(id2);
  const log2 = await readActiveLog(id2);

  console.log(`\n  📋 gps_off natijasi:`);
  console.log(`     action:        ${offAction}`);
  console.log(`     status:        ${s2.status} (is_finished=${s2.is_finished})`);
  console.log(`     last_exit:     ${s2.last_exit_time}`);
  console.log(`     total_seconds: ${s2.total_seconds} (${fmt(s2.total_seconds)})`);
  console.log(`     log:           →${log2.exit}  reason=${log2.checkout_reason}  dur=${fmt(log2.duration_seconds)}`);

  ok('gps_off → gps_lost_checkout', offAction === 'gps_lost_checkout', 'action=' + offAction);
  ok('Session yopildi (done + auto_checkout)', s2.status === 'done' && s2.is_finished && s2.auto_checkout);
  ok('Aktiv log yopildi', log2.is_active === false);
  ok('Log gps_lost bilan yopildi', log2.checkout_reason === 'gps_lost', log2.checkout_reason);
  ok('Chiqish vaqti = 16:40 (18:00 EMAS)', String(s2.last_exit_time).startsWith('16:40'), String(s2.last_exit_time));
  console.log('\n  🔑 ASOSIY ISBOT (vaqt to\'xtashi + bug fix):');
  ok('total_seconds = 31200 (8s 40d) — 18:00 gacha SHISHMADI',
    Number(s2.total_seconds) === 31200, `${fmt(s2.total_seconds)}`);
  ok('total 32400 (9soat cap) EMAS — eski bug tuzatilgan',
    Number(s2.total_seconds) !== 32400, `${s2.total_seconds}`);

  // ═══════════════════════════════════════════════════════════════════════
  sec('TEST 3: ADMIN PANEL — CHIQISH VAQTINI KO\'RSATADI');
  // ═══════════════════════════════════════════════════════════════════════
  const st = await api('GET', '/api/admin/staff-today', null, adminTok);
  const list = st.data?.staff || (Array.isArray(st.data) ? st.data : []);
  const me = list.find(x => x.user_id === USER_ID || x.id === USER_ID);
  if (me) {
    console.log(`  👤 ${me.full_name || 'xodim'}: kirdi=${me.bugun_kirish} chiqdi=${me.bugun_chiqish} ishladi=${fmt(me.jami_sekund)} holat=${me.session_status}`);
    ok('Admin: Kirdi = 08:00', String(me.bugun_kirish || '').startsWith('08:'), me.bugun_kirish);
    ok('Admin: Chiqdi = 16:40 (18:00 EMAS)', String(me.bugun_chiqish || '').startsWith('16:40'), me.bugun_chiqish);
    ok('Admin: ish vaqti = 8s 40d', Number(me.jami_sekund) === 31200, fmt(me.jami_sekund));
    ok('Admin: holat = done', me.session_status === 'done', me.session_status);
  } else {
    ok('Admin staff-today da topildi', false, 'id=' + USER_ID);
  }

  // ═══════════════════════════════════════════════════════════════════════
  sec('TEST 4: KETGANDAN KEYIN PING → YANGI SESSION OCHILMAYDI');
  // ═══════════════════════════════════════════════════════════════════════
  const totalBefore = Number(s2.total_seconds);
  const late = await api('POST', '/api/work/ping', { lat: 39.74106600, lon: 64.42763700, accuracy: 10 }, staffTok);
  const s4 = await readSession(id2);
  console.log(`  ℹ️  post-checkout ping action: ${late.data?.action}`);
  ok('Yangi session OCHILMAYDI', !['auto_checkin', 'checked_in', 'auto_switch', 'auto_recheckin'].includes(late.data?.action),
    'action=' + late.data?.action);
  ok('Session hali done', s4.status === 'done' && s4.is_finished);
  ok('total_seconds o\'zgarmadi (16:40 saqlandi)', Number(s4.total_seconds) === totalBefore, fmt(s4.total_seconds));

  // ═══════════════════════════════════════════════════════════════════════
  sec('TEST 5: 18:00 FORCE-CLOSE — IDEMPOTENT (yopilgan vaqtni buzmaydi)');
  // ═══════════════════════════════════════════════════════════════════════
  const fc = await api('POST', '/api/admin/force-close-today', null, adminTok);
  const s5 = await readSession(id2);
  ok('Force close → 200', fc.status === 200, 'closedSessions=' + fc.data?.closedSessions);
  ok('total_seconds o\'zgarmadi (16:40 = 8s 40d saqlandi)',
    Number(s5.total_seconds) === 31200 && String(s5.last_exit_time).startsWith('16:40'),
    `total=${fmt(s5.total_seconds)}, exit=${s5.last_exit_time}`);

  // ── NATIJA ──
  const total = passed + failed;
  console.log('\n' + '═'.repeat(64));
  console.log('  📊 NATIJA');
  console.log('═'.repeat(64));
  console.log(`  ✅ O'tdi: ${passed}   ❌ Xato: ${failed}   📈 ${passed}/${total} (${Math.round(passed / total * 100)}%)`);
  console.log('\n  📋 XULOSA — VAQT QANDAY TO\'XTAYDI:');
  console.log('     1️⃣  Faqat outside ping (offline) → log OCHIQ qoladi (anti-jitter)');
  console.log('     2️⃣  gps_off event → log AYNAN chiqish vaqtida (16:40) yopiladi ✅');
  console.log('     3️⃣  Live rejim → outside-countdown (60d) + stale-finalizer (60d)');
  console.log('     4️⃣  18:00 force-close → oxirgi backstop (idempotent)');
  console.log('     🔑 Erta ketgan xodim 8s 40d oladi — vaqt 18:00 gacha SHISHMAYDI');

  if (failed === 0) {
    console.log('\n  🎉 CHIQISH VAQTI TO\'G\'RI ISHLAYAPTI! (bug fix tasdiqlandi)');
  } else {
    console.log('\n  ⚠️  XATOLAR:');
    errors.forEach(e => console.log('     • ' + e));
  }
  console.log('═'.repeat(64) + '\n');

  await pool.end();
  process.exitCode = failed === 0 ? 0 : 1;
})().catch(async e => { console.error('❌', e); try { await pool.end(); } catch (_) {} process.exitCode = 1; });
