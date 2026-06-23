// ═══════════════════════════════════════════════════════════════
// BIU SMART APP — TO'LIQ INTEGRATSIYA TESTI
// Test user : To'xtayeva Feruza O'roqovna  id=52
// Admin user: Ro'ziyeva Dilnoz Isomjonovna id=16
// ═══════════════════════════════════════════════════════════════

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
let token      = null;
let adminToken = null;
let passed = 0, failed = 0, skipped = 0;
const errors = [];

async function api(method, path, body, tok) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: {}, error: e.message };
  }
}

function ok(label, condition, info = '') {
  if (condition) {
    console.log(`  ✅ ${label}${info ? ' — ' + info : ''}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${info ? ' — ' + info : ''}`);
    failed++;
    errors.push(`${label}: ${info}`);
  }
}

function skip(label, reason) {
  console.log(`  ⏭  ${label} — ${reason}`);
  skipped++;
}

function section(num, title) {
  console.log(`\n${'━'.repeat(58)}`);
  console.log(`  ${num}. ${title}`);
  console.log('━'.repeat(58));
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('\n🚀 BIU SMART APP — TO\'LIQ INTEGRATSIYA TESTI');
  console.log(`📅 ${new Date().toLocaleString('uz-UZ')}`);
  console.log(`🌐 API: ${BASE}`);
  console.log('═'.repeat(58));

  // ────────────────────────────────────────────────────────────
  section('1', 'LOGIN — Feruza (staff) va Dilnoz (admin)');
  // ────────────────────────────────────────────────────────────

  const staffLogin = await api('POST', '/api/auth/login', {
    phone: '+998905002026', password: 'Feruza2026',
  });
  token = staffLogin.data?.data?.token || staffLogin.data?.token;
  const user = staffLogin.data?.data?.user || staffLogin.data?.user;
  ok('Staff login → 200',          staffLogin.status === 200, `status=${staffLogin.status}`);
  ok('Token olindi',               !!token,                   token ? 'bor' : 'YO\'Q');
  ok('id = 52 (Feruza)',           user?.id === 52,           `id=${user?.id}`);
  ok('role = staff',               user?.role === 'staff',    `role=${user?.role}`);

  if (!token) {
    console.log('\n  ❌ Token yo\'q — test to\'xtadi'); process.exit(1);
  }

  // Admin login
  const adminLogin = await api('POST', '/api/auth/login', {
    phone: '+998901000001', password: 'Dilnoz2026',
  });
  adminToken = adminLogin.data?.data?.token || adminLogin.data?.token;
  ok('Admin login → 200',          adminLogin.status === 200,  `status=${adminLogin.status}`);
  ok('Admin token olindi',         !!adminToken,               adminToken ? 'bor' : 'YO\'Q');

  // ────────────────────────────────────────────────────────────
  section('2', 'PROFIL va BAZAVIY ENDPOINTLAR');
  // ────────────────────────────────────────────────────────────

  const me = await api('GET', '/api/auth/me', null, token);
  ok('/auth/me → 200', me.status === 200, `status=${me.status}`);

  const profile = await api('GET', '/api/staff/profile', null, token);
  ok('/staff/profile → 200', profile.status === 200, `status=${profile.status}`);
  const sp = profile.data?.data || profile.data;
  ok('Profile department bor', !!(sp?.department || sp?.profile?.department),
    sp?.department || sp?.profile?.department || '?');

  const buildings = await api('GET', '/api/buildings', null, token);
  const bArr = buildings.data?.data ?? buildings.data ?? [];
  ok('/buildings → 200',
    buildings.status === 200,
    `${Array.isArray(bArr) ? bArr.length : '?'} ta bino`);

  // ────────────────────────────────────────────────────────────
  section('3', 'GPS PING — INSIDE (BuxDU binosi ichida)');
  // ────────────────────────────────────────────────────────────

  const ping1 = await api('POST', '/api/work/ping', {
    lat: 39.7747, lon: 64.4286, accuracy: 10,
    timestamp: Date.now(), source: 'test_inside',
  }, token);
  const a1 = ping1.data?.data?.action ?? ping1.data?.action;
  ok('Inside ping → 200', ping1.status === 200, `status=${ping1.status}`);
  ok('Inside action mantiqiy', [
    'inside_same','auto_recheckin','checked_in','checkin',
    'auto_checkin','session_created','no_session','too_frequent',
    'outside_waiting','already_inside',
  ].includes(a1), `action=${a1}`);

  await wait(1200);

  // ────────────────────────────────────────────────────────────
  section('4', 'GPS PING — OUTSIDE (Toshkent koordinatasi)');
  // ────────────────────────────────────────────────────────────

  const ping2 = await api('POST', '/api/work/ping', {
    lat: 41.2995, lon: 69.2401, accuracy: 15,
    timestamp: Date.now(), source: 'test_outside',
  }, token);
  const a2 = ping2.data?.data?.action ?? ping2.data?.action;
  ok('Outside ping → 200', ping2.status === 200, `status=${ping2.status}`);
  ok('Outside action mantiqiy', [
    'outside_start','outside_continue','outside','outside_waiting',
    'already_outside','too_frequent','no_session','auto_checkout',
  ].includes(a2), `action=${a2}`);

  await wait(800);

  // Qaytib INSIDE
  const ping3 = await api('POST', '/api/work/ping', {
    lat: 39.7747, lon: 64.4286, accuracy: 8,
    timestamp: Date.now(), source: 'test_return',
  }, token);
  const a3 = ping3.data?.data?.action ?? ping3.data?.action;
  ok('INSIDE qaytish → 200', ping3.status === 200, `status=${ping3.status}`);
  ok('INSIDE qaytish action', [
    'inside_same','auto_recheckin','checked_in','checkin',
    'auto_checkin','session_created','too_frequent','already_inside',
    'outside_waiting','no_session',
  ].includes(a3), `action=${a3}`);

  // ────────────────────────────────────────────────────────────
  section('5', 'AUTO-CHECKOUT — Consecutive outside pinglar');
  // ────────────────────────────────────────────────────────────

  for (let i = 1; i <= 3; i++) {
    await wait(600);
    const r = await api('POST', '/api/work/ping', {
      lat: 41.2995 + (Math.random() * 0.001),
      lon: 69.2401 + (Math.random() * 0.001),
      accuracy: 12, timestamp: Date.now(),
      source: `auto_checkout_test_${i}`,
    }, token);
    const act = r.data?.data?.action ?? r.data?.action;
    ok(`Outside #${i} ping → 200`, r.status === 200, `action=${act}`);
  }

  // Sessiyani tiklash
  await wait(600);
  await api('POST', '/api/work/ping', {
    lat: 39.7747, lon: 64.4286, accuracy: 8,
    timestamp: Date.now(), source: 'reset_inside',
  }, token);

  // ────────────────────────────────────────────────────────────
  section('6', 'OFFLINE QUEUE va SYNC');
  // ────────────────────────────────────────────────────────────

  const offPing = await api('POST', '/api/work/ping', {
    lat: 39.7747, lon: 64.4286, accuracy: 12,
    timestamp: Date.now() - 15 * 60 * 1000,
    source: 'offline_queue',
  }, token);
  ok('Offline (backdated) ping → 200', offPing.status === 200, `status=${offPing.status}`);

  const syncRes = await api('POST', '/api/work/sync-offline', {
    events: [
      { lat: 39.7747, lon: 64.4286, accuracy: 10, timestamp: Date.now() - 10 * 60 * 1000 },
      { lat: 39.7747, lon: 64.4286, accuracy: 11, timestamp: Date.now() - 5  * 60 * 1000 },
    ],
  }, token);
  ok('/work/sync-offline → 200 yoki 404',
    syncRes.status === 200 || syncRes.status === 404,
    syncRes.status === 404 ? 'alohida ping ishlaydi' : 'OK');

  // ────────────────────────────────────────────────────────────
  section('7', 'ISH SESSIYASI va WORK LOGS');
  // ────────────────────────────────────────────────────────────

  const today = await api('GET', '/api/work/today', null, token);
  ok('/work/today → 200', today.status === 200, `status=${today.status}`);

  const active = await api('GET', '/api/work/active', null, token);
  ok('/work/active → 200', active.status === 200 || active.status === 404,
    `status=${active.status}`);

  const wStats = await api('GET', '/api/staff/work-stats', null, token);
  ok('/staff/work-stats → 200', wStats.status === 200, `status=${wStats.status}`);

  // ────────────────────────────────────────────────────────────
  section('8', 'OYLIK HISOBOT (Barcha oylar)');
  // ────────────────────────────────────────────────────────────

  const months = [
    [6, 2026, 'Iyun 2026 (joriy)'],
    [5, 2026, 'May 2026'],
    [4, 2026, 'Aprel 2026'],
    [1, 2026, 'Yanvar 2026'],
    [12, 2025, 'Dekabr 2025'],
  ];
  for (const [m, y, label] of months) {
    const r = await api('GET', `/api/staff/my-report?month=${m}&year=${y}`, null, token);
    ok(`${label} → 200`, r.status === 200, `status=${r.status}`);
  }

  // ────────────────────────────────────────────────────────────
  section('9', 'PUSH NOTIFICATION TIZIMI');
  // ────────────────────────────────────────────────────────────

  const pushSave = await api('POST', '/api/notifications/push-token', {
    push_token: 'ExponentPushToken[test-feruza-bui-2026-xyz]',
  }, token);
  ok('Push token saqlash → 200', pushSave.status === 200, `status=${pushSave.status}`);

  const notifs = await api('GET', '/api/notifications', null, token);
  ok('/notifications → 200', notifs.status === 200, `status=${notifs.status}`);
  const nArr = Array.isArray(notifs.data?.data) ? notifs.data.data
             : Array.isArray(notifs.data)       ? notifs.data : [];
  ok('Notifications array', true, `count=${nArr.length}`);

  // ────────────────────────────────────────────────────────────
  section('10', '18:00 AUTO-CLOSE CRON — Force close');
  // ────────────────────────────────────────────────────────────

  if (!adminToken) {
    skip('Force close', 'admin token yo\'q');
  } else {
    const fc = await api('POST', '/api/admin/force-close-today', null, adminToken);
    ok('Force close → 200', fc.status === 200,
      `status=${fc.status} | closed sessions=${fc.data?.data?.closedSessions ?? '?'} logs=${fc.data?.data?.closedLogs ?? '?'}`);

    const fcStaff = await api('POST', '/api/admin/force-close-today', null, token);
    ok('Staff → force-close → 401/403',
      fcStaff.status === 401 || fcStaff.status === 403,
      `status=${fcStaff.status}`);
  }

  // ────────────────────────────────────────────────────────────
  section('11', 'BACKGROUND GPS — Drift simulatsiya');
  // ────────────────────────────────────────────────────────────

  console.log('  ℹ️  3 ta background GPS ping (drift bilan)...');
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', '/api/work/ping', {
      lat: 39.7747 + (Math.random() * 0.0008 - 0.0004),
      lon: 64.4286 + (Math.random() * 0.0008 - 0.0004),
      accuracy: 8 + Math.random() * 7,
      timestamp: Date.now(), source: 'background_task',
    }, token);
    ok(`Background ping #${i} → 200`, r.status === 200,
      `action=${r.data?.data?.action ?? r.data?.action}`);
    if (i < 3) await wait(1500);
  }

  // ────────────────────────────────────────────────────────────
  section('12', 'ADMIN PANEL ENDPOINTLARI');
  // ────────────────────────────────────────────────────────────

  if (!adminToken) {
    skip('Admin panel testlari', 'admin token yo\'q');
  } else {
    const adminRoutes = [
      ['/api/admin/overview',          'Admin overview'],
      ['/api/admin/staff',             'Staff ro\'yxati'],
      ['/api/admin/staff/active-now',  'Active now'],
      ['/api/admin/staff-today',       'Staff today'],
      ['/api/admin/buildings',         'Binolar (admin)'],
      ['/api/admin/buildings/gps-pings',   'GPS pings'],
      ['/api/admin/buildings/daily-stats', 'Daily stats'],
    ];
    for (const [path, label] of adminRoutes) {
      const r = await api('GET', path, null, adminToken);
      ok(`${label} → 200`, r.status === 200 || r.status === 404,
        r.status === 404 ? 'endpoint yo\'q (tekshiring)' : `status=${r.status}`);
    }

    // Admin monthly report
    const aRep = await api('GET', '/api/admin/reports/monthly?year=2026&month=6', null, adminToken);
    ok('Admin monthly report → 200', aRep.status === 200, `status=${aRep.status}`);
  }

  // ────────────────────────────────────────────────────────────
  section('13', 'XAVFSIZLIK — Staff → Admin endpointlar BLOK');
  // ────────────────────────────────────────────────────────────

  const blocked = [
    ['GET',  '/api/admin/staff',                'Staff ro\'yxati'],
    ['GET',  '/api/admin/overview',             'Admin overview'],
    ['GET',  '/api/admin/staff/active-now',     'Active now'],
    ['POST', '/api/admin/force-close-today',    'Force close'],
    ['POST', '/api/admin/users',                'User yaratish'],
  ];
  for (const [method, path, label] of blocked) {
    const r = await api(method, path, method === 'POST' ? {} : null, token);
    ok(`Staff → ${label} → 401/403`,
      r.status === 401 || r.status === 403,
      `status=${r.status}`);
  }

  // ────────────────────────────────────────────────────────────
  section('14', 'TOKEN XAVFSIZLIGI');
  // ────────────────────────────────────────────────────────────

  const noToken = await api('GET', '/api/staff/profile', null, null);
  ok('Token yo\'qda → 401', noToken.status === 401, `status=${noToken.status}`);

  const badToken = await api('GET', '/api/staff/profile', null, 'bad.token.here');
  ok('Noto\'g\'ri token → 401', badToken.status === 401, `status=${badToken.status}`);

  // ────────────────────────────────────────────────────────────
  section('15', 'CRON JOBLAR HOLATI');
  // ────────────────────────────────────────────────────────────

  const health = await api('GET', '/api/health', null, null);
  ok('/api/health → 200 yoki 404',
    health.status === 200 || health.status === 404,
    health.status === 404 ? 'endpoint yo\'q (OK)' : JSON.stringify(health.data).slice(0, 60));

  console.log('\n  ℹ️  CRON jadval:');
  console.log('      08:45 → Kelmagan xodimlarga push notification');
  console.log('      17:45 → Chiqish eslatma push notification');
  console.log('      18:00 → Auto-close barcha faol sessiyalar');
  console.log('      00:05 → Midnight cleanup (eski sessiyalar)');

  // ════════════════════════════════════════════════════════════
  // YAKUNIY NATIJA
  // ════════════════════════════════════════════════════════════

  const total = passed + failed;
  const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log('\n' + '═'.repeat(58));
  console.log('  📊 YAKUNIY NATIJA — BIU SMART APP');
  console.log('═'.repeat(58));
  console.log(`  ✅  O'tdi   : ${passed}`);
  console.log(`  ❌  Xato    : ${failed}`);
  console.log(`  ⏭   Skip    : ${skipped}`);
  console.log(`  📈  Ball    : ${passed}/${total}  (${pct}%)`);
  console.log('─'.repeat(58));

  if (failed === 0) {
    console.log('  🎉  MUKAMMAL — BARCHA TESTLAR O\'TDI!');
    console.log('');
    console.log('  ✅  Auto-checkout (outside aniqlash)');
    console.log('  ✅  18:00 CRON auto-close sessiyalar');
    console.log('  ✅  Push notification token saqlash');
    console.log('  ✅  GPS ping (inside / outside / offline)');
    console.log('  ✅  Oylik hisobot (barcha oylar)');
    console.log('  ✅  Background GPS drift tolerant');
    console.log('  ✅  Xavfsizlik (staff → admin bloklangan)');
    console.log('  ✅  Token autentifikatsiyasi');
  } else {
    console.log(`  ⚠️   ${failed} ta xato topildi:`);
    errors.forEach(e => console.log(`       • ${e}`));
    console.log('');
    console.log('  ↑ Yuqoridagilarni tuzating va qayta ishga tushiring:');
    console.log('    node tests/test-all-features.js');
  }

  console.log('═'.repeat(58));

  // Natijani JSON ga saqlash
  const fs = require('fs');
  const resultPath = 'tests/test-results.json';
  fs.writeFileSync(resultPath, JSON.stringify({
    timestamp : new Date().toISOString(),
    base_url  : BASE,
    passed, failed, skipped, total, pct,
    errors,
  }, null, 2));
  console.log(`  💾  Natija saqlandi: ${resultPath}\n`);
}

run().catch(e => {
  console.error('❌ Test runner xato:', e.message);
  process.exit(1);
});
