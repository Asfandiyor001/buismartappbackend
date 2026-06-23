const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
let token = null;
let adminToken = null;
let passed = 0, failed = 0;
const errors = [];
const timeline = [];

// Bino 1 haqiqiy koordinatalari (DB dan)
const BINO1 = { lat: 39.74106600, lon: 64.42763700 };
const OUTSIDE = { lat: 39.7550, lon: 64.4400 };

async function api(method, path, body, tok) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data: data?.data ?? data };
}

function ok(label, cond, info = '') {
  const icon = cond ? '✅' : '❌';
  console.log(`  ${icon} ${label}${info ? ' — ' + info : ''}`);
  if (cond) passed++; else { failed++; errors.push(`${label}: ${info}`); }
}

function log(time, event) {
  console.log(`\n  ⏰ ${time} — ${event}`);
  timeline.push({ time, event });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

function fmtSec(s) {
  if (!s || s <= 0) return '0d';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}s ${m}d` : `${m}d`;
}

function jitter(base, range = 0.0003) {
  return base + (Math.random() * range * 2 - range);
}

async function sendPing(coords, tok) {
  return api('POST', '/api/work/ping', {
    lat: coords.lat,
    lon: coords.lon,
    accuracy: 8 + Math.random() * 7,
  }, tok);
}

async function sendOfflineEvents(events, tok) {
  return api('POST', '/api/work/sync-offline', { events }, tok);
}

async function getToday(tok) {
  const r = await api('GET', '/api/work/today', null, tok);
  return r.data;
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('  TEST: TO\'LIQ KUN SIMULATSIYASI — ID=44 (Sharifov Fazliddin)');
  console.log('  ' + new Date().toLocaleString('uz'));
  console.log('  ' + BASE);
  console.log('='.repeat(60));

  // ========== 0. LOGIN ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  0. LOGIN');
  console.log('-'.repeat(50));

  const adminPasswords = ['asfan2005A@', 'Biu@000014', '1234', 'Admin2026'];
  for (const ap of adminPasswords) {
    const ar = await api('POST', '/api/auth/login', { phone: '+998901000014', password: ap });
    if (ar.data?.token) { adminToken = ar.data.token; break; }
  }
  ok('Admin login (To\'rakulov)', !!adminToken, adminToken ? 'topildi' : 'parol topilmadi — admin testlar skip');

  const staffR = await api('POST', '/api/auth/login', {
    phone: '+998901000029', password: 'Biu@000029'
  });
  token = staffR.data?.token;
  ok('Staff login (ID=44, Sharifov)', !!token);

  if (!token) {
    console.log('\n  XATO: Login bo\'lmadi. Backendni tekshiring.');
    process.exit(1);
  }

  // Sessiya toza ekanini tekshir
  const pre = await getToday(token);
  ok('Test oldidan sessiya yo\'q', !pre || !pre.first_entry_time, pre?.status || 'toza');

  // ========== 1. 08:00 — AUTO CHECKIN ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  1. 08:00 — BINOGA KELDI, AUTO CHECKIN');
  console.log('-'.repeat(50));

  log('08:00', 'Xodim Bino 1 ga keldi');
  const p1 = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('Birinchi ping → 200', p1.status === 200, `action=${p1.data?.action}`);
  ok('Auto-checkin bo\'ldi', ['auto_checkin','inside_same','checked_in'].includes(p1.data?.action), p1.data?.action);

  await wait(1500);
  const s1 = await getToday(token);
  ok('Session yaratildi', !!s1);
  ok('first_entry_time bor (NULL emas)', !!(s1?.first_entry_time || s1?.firstEntryTime),
    s1?.first_entry_time || s1?.firstEntryTime || 'NULL!');

  // ========== 2. 08:00-09:00 — NORMAL ISH ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  2. 08:00-09:00 — NORMAL ISH (online ping lar)');
  console.log('-'.repeat(50));

  for (const t of ['08:15', '08:30', '08:45']) {
    log(t, 'Normal ping');
    await wait(1500);
    const p = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
    ok(`${t} ping → 200`, p.status === 200, `action=${p.data?.action}`);
  }

  // ========== 3. 09:00-12:00 — OFFLINE (3 soat) ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  3. 09:00-12:00 — OFFLINE (3 soat, GPS lokal yig\'ildi)');
  console.log('-'.repeat(50));

  log('09:00', 'Internet O\'CHIRDI — offline boshlandi');

  const now = Date.now();
  const offlineEvents = [];
  for (let i = 0; i < 36; i++) {
    const ts = new Date(now - (3 * 3600000) + (i * 5 * 60000));
    offlineEvents.push({
      type: 'ping',
      lat: jitter(BINO1.lat),
      lon: jitter(BINO1.lon),
      accuracy: 8 + Math.random() * 5,
      timestamp: ts.toISOString(),
    });
  }
  ok('Offline queue: 36 ta ping yig\'ildi (lokal)', offlineEvents.length === 36);

  // ========== 4. 12:00 — INTERNET QAYTDI, FLUSH ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  4. 12:00 — INTERNET QAYTDI, OFFLINE FLUSH');
  console.log('-'.repeat(50));

  log('12:00', 'Internet YOQILDI — offline queue flush');
  const syncR = await sendOfflineEvents(offlineEvents, token);
  ok('sync-offline → 200', syncR.status === 200, `processed=${syncR.data?.processed}`);

  if (syncR.data?.results) {
    const skipped = syncR.data.results.filter(r => r.skipped);
    const errored = syncR.data.results.filter(r => r.error);
    ok('Barcha eventlar qabul qilindi', skipped.length === 0 && errored.length === 0,
      `skip=${skipped.length} err=${errored.length}`);
  }

  await wait(1500);
  const s2 = await getToday(token);
  ok('Session hali aktiv', s2?.status === 'active' || !s2?.is_finished, s2?.status);

  // ========== 5. 12:00-13:00 — NORMAL ISH ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  5. 12:00-13:00 — NORMAL ISH');
  console.log('-'.repeat(50));

  log('12:30', 'Normal ping');
  await wait(1500);
  const p5 = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('12:30 ping → 200', p5.status === 200, `action=${p5.data?.action}`);

  // ========== 6. 13:00-14:00 — ABET ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  6. 13:00-14:00 — ABET (tushlik)');
  console.log('-'.repeat(50));

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  log('13:00', `ABET boshlandi ${nowMins >= 780 && nowMins < 840 ? '(HOZIR ABET!)' : ''}`);

  await wait(1500);
  const pAbet = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('Abet vaqtida ping → 200', pAbet.status === 200, `action=${pAbet.data?.action}`);

  // ========== 7. 14:30 — ABETDAN QAYTDI ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  7. 14:30 — ABETDAN QAYTDI');
  console.log('-'.repeat(50));

  log('14:30', 'Abetdan qaytdi');
  await wait(1500);
  const p7 = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('14:30 ping → 200', p7.status === 200, `action=${p7.data?.action}`);

  // ========== 8. 15:00 — ISH DAVOM ETDI ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  8. 15:00-15:30 — ISH');
  console.log('-'.repeat(50));

  log('15:00', 'Normal ping');
  await wait(1500);
  const p8 = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('15:00 ping → 200', p8.status === 200, `action=${p8.data?.action}`);

  // ========== 9. 15:30 — BINODAN CHIQDI ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  9. 15:30 — BINODAN CHIQDI');
  console.log('-'.repeat(50));

  log('15:30', 'Binodan CHIQDI');
  await wait(1500);
  const pOut1 = await sendPing(OUTSIDE, token);
  ok('Outside ping #1 → 200', pOut1.status === 200, `action=${pOut1.data?.action}`);

  await wait(1500);
  const pOut2 = await sendPing(OUTSIDE, token);
  ok('Outside ping #2 → 200', pOut2.status === 200, `action=${pOut2.data?.action}`);

  log('15:32', 'Internet O\'CHIRDI — 1 soat offline tashqarida');

  // Tashqaridagi offline ping lar
  const outsideOffline = [];
  for (let i = 0; i < 12; i++) {
    const ts = new Date(Date.now() - 3600000 + i * 5 * 60000);
    outsideOffline.push({
      type: 'ping',
      lat: jitter(OUTSIDE.lat, 0.001),
      lon: jitter(OUTSIDE.lon, 0.001),
      accuracy: 15 + Math.random() * 10,
      timestamp: ts.toISOString(),
    });
  }

  // ========== 10. 16:30 — QAYTDI + ONLINE ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  10. 16:30 — BINOGA QAYTDI + ONLINE');
  console.log('-'.repeat(50));

  log('16:30', 'Binoga QAYTDI, Internet YOQDI');
  const syncOut = await sendOfflineEvents(outsideOffline, token);
  ok('Tashqari offline flush → 200', syncOut.status === 200, `processed=${syncOut.data?.processed}`);

  await wait(1500);
  const pReturn = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('Binoga qaytish ping → 200', pReturn.status === 200, `action=${pReturn.data?.action}`);

  // ========== 11. 16:35 — ISH TUGADI ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  11. 16:35 — ISH TUGADI');
  console.log('-'.repeat(50));

  log('16:35', 'Uyiga ketdi');
  await wait(1500);
  const pLast = await sendPing({ lat: jitter(BINO1.lat), lon: jitter(BINO1.lon) }, token);
  ok('Oxirgi ping → 200', pLast.status === 200, `action=${pLast.data?.action}`);

  // ========== 12. YAKUNIY TEKSHIRUV ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  12. YAKUNIY TEKSHIRUV — SESSION');
  console.log('-'.repeat(50));

  await wait(2000);
  const sf = await getToday(token);

  const fEntry = sf?.firstEntryTime || sf?.first_entry_time;
  const lExit  = sf?.lastExitTime || sf?.last_exit_time;
  const total  = Number(sf?.totalSeconds || sf?.total_seconds || 0);
  const liveT  = Number(sf?.liveTotal || sf?.live_total_seconds || 0);
  const best   = Math.max(total, liveT);

  console.log('\n  SESSION MA\'LUMOTLARI:');
  console.log(`     status:           ${sf?.status}`);
  console.log(`     firstEntryTime:   ${fEntry || 'NULL!'}`);
  console.log(`     lastExitTime:     ${lExit || 'hali yopilmagan'}`);
  console.log(`     totalSeconds:     ${total} (${fmtSec(total)})`);
  console.log(`     liveTotal:        ${liveT} (${fmtSec(liveT)})`);
  console.log(`     isFinished:       ${sf?.isFinished}`);

  ok('Session mavjud', !!sf);
  ok('first_entry_time bor', !!fEntry, fEntry);
  ok('liveTotal yoki totalSeconds > 0', best > 0, fmtSec(best));
  ok('total <= 32400 (9s cap)', best <= 32400, fmtSec(best));

  // ========== 13. ADMIN KO'RINISHI ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  13. ADMIN KO\'RINISHI');
  console.log('-'.repeat(50));

  if (adminToken) {
    const detail = await api('GET', '/api/admin/staff/44', null, adminToken);
    ok('Admin staff/44 → 200', detail.status === 200);

    const team = await api('GET', '/api/staff/team-status', null, adminToken);
    ok('team-status → 200', team.status === 200);

    const teamArr = Array.isArray(team.data?.team) ? team.data.team : Array.isArray(team.data?.rows) ? team.data.rows : Array.isArray(team.data) ? team.data : [];
    const s44 = teamArr.find(s => s.id === 44 || s.user_id === 44);
    if (s44) {
      console.log(`\n  Admin ko'rinishi (ID=44):`);
      console.log(`     Ism:         ${s44.full_name}`);
      console.log(`     Kirdi:       ${s44.first_entry_time ? s44.first_entry_time.toString().slice(0, 5) : '—'}`);
      console.log(`     Ish vaqti:   ${fmtSec(s44.total_work_seconds)}`);
      console.log(`     Unumdorlik:  ${s44.performance_percent}%`);
      console.log(`     Status:      ${s44.work_status}`);

      ok('Admin Kirdi vaqti bor', !!s44.first_entry_time, s44.first_entry_time);
      ok('Admin ish vaqti > 0', Number(s44.total_work_seconds) > 0, fmtSec(s44.total_work_seconds));
    } else {
      ok('ID=44 team-status da topildi', false, 'topilmadi');
    }
  }

  // ========== 14. XAVFSIZLIK ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  14. XAVFSIZLIK');
  console.log('-'.repeat(50));

  for (const path of ['/api/admin/staff', '/api/admin/staff/active-now']) {
    const r = await api('GET', path, null, token);
    ok(`Staff → ${path} → 401/403`, r.status === 401 || r.status === 403, `status=${r.status}`);
  }

  // ========== 15. WORK LOGS ==========
  console.log('\n' + '-'.repeat(50));
  console.log('  15. WORK LOGS');
  console.log('-'.repeat(50));

  if (adminToken) {
    const logs = await api('GET', '/api/admin/staff/44/work-logs', null, adminToken);
    ok('Work logs → 200', logs.status === 200);
    const logArr = Array.isArray(logs.data) ? logs.data : [];
    console.log(`  Log soni: ${logArr.length}`);
    logArr.slice(0, 5).forEach((l, i) => {
      const entry = l.entry_time ? new Date(l.entry_time).toLocaleTimeString('uz') : '?';
      const exit = l.exit_time ? new Date(l.exit_time).toLocaleTimeString('uz') : 'aktiv';
      console.log(`     #${i + 1}: ${entry} → ${exit} (${fmtSec(l.duration_seconds)}) [${l.checkout_reason}]`);
    });
  }

  // ========== NATIJA ==========
  const total_ = passed + failed;
  const pct = Math.round((passed / total_) * 100);

  console.log('\n' + '='.repeat(60));
  console.log('  NATIJA — ID=44 TO\'LIQ KUN TESTI');
  console.log('='.repeat(60));
  console.log(`  ✅ O'tdi:   ${passed}`);
  console.log(`  ❌ Xato:    ${failed}`);
  console.log(`  Ball:    ${passed}/${total_} (${pct}%)`);
  console.log('-'.repeat(60));

  console.log('\n  KUN TIMELINE:');
  timeline.forEach(t => console.log(`     ${t.time} → ${t.event}`));

  if (failed === 0) {
    console.log('\n  BARCHA TESTLAR O\'TDI!');
  } else {
    console.log('\n  XATOLAR:');
    errors.forEach(e => console.log(`     • ${e}`));
  }
  console.log('='.repeat(60));

  require('fs').writeFileSync(
    __dirname + '/full-day-id44.json',
    JSON.stringify({ timestamp: new Date().toISOString(), passed, failed, total: total_, pct, timeline, errors }, null, 2)
  );
  console.log('  Natija saqlandi: tests/full-day-id44.json\n');
}

run().catch(e => { console.error('Test xato:', e.message); process.exit(1); });
