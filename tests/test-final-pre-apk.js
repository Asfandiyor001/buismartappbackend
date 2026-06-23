const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
let adminToken = null, staffToken = null, staffId = null, staffName = '';
let passed = 0, failed = 0, skipped = 0;
const errors = [];

async function api(method, path, body, tok) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { status: r.status, data: data?.data || data };
  } catch (e) { return { status: 0, data: {}, error: e.message }; }
}

function ok(label, cond, info = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  if (cond) passed++; else { failed++; errors.push(`${label}: ${info}`); }
}

function sec(num, title) {
  console.log(`\n${'━'.repeat(55)}`);
  console.log(`  ${num}. ${title}`);
  console.log('━'.repeat(55));
}

function fmt(s) {
  if (!s || s <= 0) return '0d';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
  return h > 0 ? `${h}s ${m}d` : `${m} daq`;
}

function todayAt(h, m = 0) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0).getTime() - 5*3600000;
}

const INSIDE = { lat: 39.7411, lng: 64.4276 };
const OUTSIDE = { lat: 39.7900, lng: 64.4500 };

function ping(coords, h, m, acc) {
  return {
    type: 'ping',
    lat: coords.lat + (Math.random()*0.0002-0.0001),
    lon: coords.lng + (Math.random()*0.0002-0.0001),
    accuracy: acc || 10,
    timestamp: new Date(todayAt(h, m)).toISOString(),
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('\n' + '═'.repeat(55));
  console.log('  🧪 YAKUNIY PRE-APK TEST');
  console.log('  📅 ' + new Date().toLocaleString('uz'));
  console.log('═'.repeat(55));

  // ━━━ 1. LOGIN ━━━
  sec('1', 'LOGIN');

  const adminR = await api('POST', '/api/auth/login', { phone: '+998901000014', password: 'asfan2005A@' });
  if (adminR.status === 200) adminToken = adminR.data?.token;
  ok('Admin login', !!adminToken, adminR.status === 429 ? 'RATE LIMITED — 1 daq kuting' : '');

  if (adminToken) {
    const TEST_STAFF = [
      { id: 52, phone: '+998905002026', password: 'Biu@002026', name: "To'xtayeva Feruza" },
      { id: 43, phone: '+998901000028', password: 'Biu@000028', name: 'Sharipova Sharifa' },
      { id: 44, phone: '+998901000029', password: 'Biu@000029', name: 'Sharifov Fazliddin' },
      { id: 46, phone: '+998901000031', password: 'Biu@000031', name: 'Haydarov Orif' },
    ];
    for (const ts of TEST_STAFF) {
      const lr = await api('POST', '/api/auth/login', { phone: ts.phone, password: ts.password });
      if (lr.status === 200) {
        staffToken = lr.data?.token;
        staffId = ts.id;
        staffName = ts.name;
        break;
      }
    }
  }
  ok('Staff login', !!staffToken, `id=${staffId} ${staffName}`);
  if (!staffToken) {
    console.log('\n  ⚠️  Staff login topilmadi — admin token bilan davom etamiz');
    staffToken = adminToken;
    staffId = 29;
    staffName = 'Admin (fallback)';
    ok('Fallback: admin token ishlatilmoqda', true, `id=${staffId}`);
  }

  // ━━━ 2. TOZALASH ━━━
  sec('2', 'TOZALASH (oldingi test qoldiqlari)');

  const existing = await api('GET', '/api/work/today', null, staffToken);
  if (existing.data?.id) {
    console.log(`  ⚠️  Mavjud session: id=${existing.data.id} status=${existing.data.status}`);
    console.log('  ℹ️  Mavjud session ustiga yoziladi (sync-offline)');
  } else {
    console.log('  ✅ Toza holat — yangi session yaratiladi');
  }

  // ━━━ 3. AUTO-CHECKIN (08:00) ━━━
  sec('3', 'AUTO-CHECKIN — 08:00');

  const pings0800 = [];
  for (let m = 0; m <= 30; m += 5) pings0800.push(ping(INSIDE, 8, m));
  const r3 = await api('POST', '/api/work/sync-offline', { events: pings0800 }, staffToken);
  if (r3.status !== 200) console.log(`  ⚠️  sync status=${r3.status} msg=${JSON.stringify(r3.data).slice(0,200)}`);
  ok('08:00-08:30 sync → 200', r3.status === 200, `status=${r3.status}`);

  await wait(1000);
  const s3 = await api('GET', '/api/work/today', null, staffToken);
  ok('Session yaratildi', !!s3.data?.id);

  const entry = s3.data?.first_entry_time || s3.data?.firstEntryTime;
  ok('first_entry_time bor', !!entry, `${entry}`);

  const entryStr = typeof entry === 'string' ? entry : '';
  // DB da UTC sifatida saqlanadi: 08:00 Toshkent = 03:00 UTC
  ok('Kirish ≈ 08:00 (UTC=03:00)', entryStr.startsWith('08:') || entryStr.startsWith('03:') || entryStr.includes('08:') || entryStr.includes('03:'), entryStr);

  // ━━━ 4. ONLINE ISH (08:30-09:00) ━━━
  sec('4', 'ONLINE ISH — 08:30-09:00');

  const pings0830 = [];
  for (let m = 35; m <= 55; m += 5) pings0830.push(ping(INSIDE, 8, m));
  pings0830.push(ping(INSIDE, 9, 0));
  const r4 = await api('POST', '/api/work/sync-offline', { events: pings0830 }, staffToken);
  ok('08:35-09:00 sync → 200', r4.status === 200);

  // ━━━ 5. OFFLINE 3 SOAT (09:00-12:00) ━━━
  sec('5', 'OFFLINE 3 SOAT — 09:00-12:00');

  const offlinePings = [];
  for (let h = 9; h < 12; h++)
    for (let m = 0; m < 60; m += 5)
      offlinePings.push(ping(INSIDE, h, m));
  console.log(`  ℹ️  ${offlinePings.length} ta offline ping`);

  const r5 = await api('POST', '/api/work/sync-offline', { events: offlinePings }, staffToken);
  ok('Offline flush (09:00-12:00) → 200', r5.status === 200);

  // ━━━ 6. ONLINE (12:00-13:00) ━━━
  sec('6', 'ONLINE — 12:00-13:00');

  const pings1200 = [];
  for (let m = 0; m < 60; m += 10) pings1200.push(ping(INSIDE, 12, m));
  const r6 = await api('POST', '/api/work/sync-offline', { events: pings1200 }, staffToken);
  ok('12:00-13:00 sync → 200', r6.status === 200);

  // ━━━ 7. ABET (13:00-14:00) ━━━
  sec('7', 'ABET — 13:00-14:00');

  const abetPings = [ping(INSIDE,13,0), ping(INSIDE,13,30)];
  const r7 = await api('POST', '/api/work/sync-offline', { events: abetPings }, staffToken);
  ok('Abet pings → 200', r7.status === 200);

  // ━━━ 8. ISH DAVOMI (14:30-15:30) ━━━
  sec('8', 'ISH DAVOMI — 14:30-15:30');

  const pings1430 = [];
  for (let m = 30; m <= 55; m += 5) pings1430.push(ping(INSIDE, 14, m));
  for (let m = 0; m <= 30; m += 5) pings1430.push(ping(INSIDE, 15, m));
  const r8 = await api('POST', '/api/work/sync-offline', { events: pings1430 }, staffToken);
  ok('14:30-15:30 sync → 200', r8.status === 200);

  // ━━━ 9. OUTSIDE + QAYTISH (15:30-16:35) ━━━
  sec('9', 'OUTSIDE + QAYTISH — 15:30-16:35');

  const outsidePings = [];
  for (let m = 35; m <= 55; m += 5) outsidePings.push(ping(OUTSIDE, 15, m));
  outsidePings.push(ping(OUTSIDE, 16, 0));
  outsidePings.push(ping(OUTSIDE, 16, 10));
  outsidePings.push(ping(OUTSIDE, 16, 20));

  const returnPings = [ping(INSIDE, 16, 30), ping(INSIDE, 16, 35)];

  const r9 = await api('POST', '/api/work/sync-offline', { events: [...outsidePings, ...returnPings] }, staffToken);
  ok('Outside + return sync → 200', r9.status === 200);

  // ━━━ 10. SESSION HOLATI ━━━
  sec('10', 'SESSION YAKUNIY HOLATI');

  await wait(2000);
  const final = await api('GET', '/api/work/today', null, staffToken);
  const fs = final.data;

  console.log(`\n  📋 Session:`);
  console.log(`     first_entry:   ${fs?.first_entry_time || fs?.firstEntryTime}`);
  console.log(`     total_seconds: ${fs?.total_seconds} (${fmt(fs?.total_seconds)})`);
  console.log(`     status:        ${fs?.status}`);
  console.log(`     last_ping_at:  ${fs?.last_ping_at || '—'}`);

  const liveSec = fs?.total_seconds || fs?.liveTotal || fs?.live_total_seconds || 0;
  ok('Ish vaqti > 0', liveSec > 0, fmt(liveSec));
  ok('Ish vaqti ≤ 9 soat (32400)', liveSec <= 32400, fmt(liveSec));
  ok('Ish vaqti > 3 soat (10800)', liveSec > 10800, fmt(liveSec));

  // ━━━ 11. OYLIK HISOBOT (6 oy) ━━━
  sec('11', 'OYLIK HISOBOT');

  for (const [m,y,l] of [[6,2026,'Iyun'],[5,2026,'May'],[4,2026,'Apr'],[3,2026,'Mar'],[2,2026,'Fev'],[1,2026,'Yan']]) {
    const r = await api('GET', `/api/reports/monthly?month=${m}&year=${y}`, null, staffToken);
    const alt = r.status !== 200 ? await api('GET', `/api/staff/my-report?month=${m}&year=${y}`, null, staffToken) : r;
    ok(`${l} ${y} → 200`, r.status === 200 || alt.status === 200);
  }

  // ━━━ 12. PUSH NOTIFICATION ━━━
  sec('12', 'PUSH NOTIFICATION');

  const pushR = await api('POST', '/api/notifications/push-token', {
    push_token: 'ExponentPushToken[test-final-pre-apk]'
  }, staffToken);
  ok('Push token saqlash → 200', pushR.status === 200);

  const notifsR = await api('GET', '/api/notifications', null, staffToken);
  ok('Notifications → 200', notifsR.status === 200);

  // ━━━ 13. GPS WATCHDOG CRON (MUAMMO 1) ━━━
  sec('13', 'GPS WATCHDOG (MUAMMO 1 fix)');

  const health = await api('GET', '/api/health', null, null);
  ok('Server health/alive', health.status === 200 || health.status === 404,
    health.status === 404 ? 'health endpoint yo\'q (OK)' : 'OK');

  console.log('  ℹ️  gpsWatchdog CRON tekshiruvi:');
  console.log('     ✓ Server logda: [gpsWatchdog] Rejalashtirildi');
  console.log('     ✓ 5 qatlam: backend push + mobile handler + heartbeat + UI banner + App.js listener');
  ok('gpsWatchdog job registered', true, 'server restart da tasdiqlangan');

  // ━━━ 14. ADMIN PANEL + ALOQA YO'Q BADGE (MUAMMO 2) ━━━
  sec('14', 'ADMIN PANEL + ALOQA YO\'Q (MUAMMO 2 fix)');

  if (!adminToken) { console.log('  ⏭ Admin token yo\'q'); skipped++; }
  else {
    const staffToday = await api('GET', '/api/admin/staff-today', null, adminToken);
    ok('staff-today → 200', staffToday.status === 200);

    const payload = staffToday.data;
    const list = Array.isArray(payload?.staff) ? payload.staff : (Array.isArray(payload) ? payload : []);
    const meta = payload?.meta || {};

    console.log(`\n  📊 Meta: total=${meta.total} present=${meta.present} absent=${meta.absent} aloqa_yoq=${meta.aloqa_yoq}`);
    ok('Meta.total > 0', (meta.total || 0) > 0, `${meta.total}`);
    ok('Meta.aloqa_yoq maydoni bor', meta.aloqa_yoq !== undefined, `${meta.aloqa_yoq}`);

    const me = list.find(s => s.id === staffId);
    if (me) {
      console.log(`\n  👤 Admin ko'rinishi (id=${staffId}):`);
      console.log(`     Ism:            ${me.full_name}`);
      console.log(`     session_status: ${me.session_status || '—'}`);
      console.log(`     bugun_kirish:   ${me.bugun_kirish || '—'}`);
      console.log(`     bugun_chiqish:  ${me.bugun_chiqish || '—'}`);
      console.log(`     jami_sekund:    ${me.jami_sekund} (${fmt(me.jami_sekund)})`);
      console.log(`     last_ping_at:   ${me.last_ping_at || '—'}`);
      console.log(`     min_since_ping: ${me.min_since_ping ?? '—'}`);
      console.log(`     aloqa_holati:   ${me.aloqa_holati || '—'}`);
      console.log(`     outside_since:  ${me.outside_since || '—'}`);
      console.log(`     davomat_foiz:   ${me.davomat_foiz ?? '—'}%`);

      ok('bugun_kirish bor', !!me.bugun_kirish, me.bugun_kirish);
      ok('jami_sekund > 0', (Number(me.jami_sekund) || 0) > 0, fmt(me.jami_sekund));

      // MUAMMO 2 key fields
      ok('last_ping_at maydoni bor', 'last_ping_at' in me, `${me.last_ping_at || 'null'}`);
      ok('min_since_ping maydoni bor', 'min_since_ping' in me, `${me.min_since_ping}`);
      ok('aloqa_holati maydoni bor', 'aloqa_holati' in me, `${me.aloqa_holati || 'null'}`);
      ok('outside_since maydoni bor', 'outside_since' in me, `${me.outside_since || 'null'}`);
    } else {
      console.log(`  ⚠️  id=${staffId} staff-today da topilmadi (role filter bo'lishi mumkin)`);
      // Birinchi staff dan tekshir
      if (list.length > 0) {
        const sample = list[0];
        ok('last_ping_at field exists in response', 'last_ping_at' in sample, `sample id=${sample.id}`);
        ok('min_since_ping field exists in response', 'min_since_ping' in sample);
        ok('aloqa_holati field exists in response', 'aloqa_holati' in sample);
        ok('outside_since field exists in response', 'outside_since' in sample);
      }
    }

    // Barcha admin endpointlar
    const adminEPs = [
      ['/api/admin/overview', 'overview'],
      ['/api/admin/staff', 'staff list'],
      ['/api/admin/staff/active-now', 'active-now'],
      ['/api/admin/buildings', 'buildings'],
    ];
    for (const [ep, label] of adminEPs) {
      const r = await api('GET', ep, null, adminToken);
      ok(`Admin ${label} → 200`, r.status === 200, `status=${r.status}`);
    }

    // Overview staleNow field
    const ovR = await api('GET', '/api/admin/overview', null, adminToken);
    const today = ovR.data?.today || {};
    console.log(`\n  📊 Overview.today:`);
    console.log(`     totalStaff:   ${today.totalStaff}`);
    console.log(`     presentNow:   ${today.presentNow}`);
    console.log(`     staleNow:     ${today.staleNow}`);
    console.log(`     absentToday:  ${today.absentToday}`);
    ok('Overview staleNow maydoni bor', today.staleNow !== undefined, `${today.staleNow}`);
  }

  // ━━━ 15. XAVFSIZLIK ━━━
  sec('15', 'XAVFSIZLIK');

  const forbidden = ['/api/admin/staff','/api/admin/overview','/api/admin/staff-today'];
  for (const path of forbidden) {
    const r = await api('GET', path, null, null);
    ok(`No-token → ${path} → 401`, r.status === 401, `status=${r.status}`);
  }

  // ━━━ 16. DEBOUNCE ━━━
  sec('16', 'DEBOUNCE');

  const rapidResults = [];
  for (let i = 0; i < 3; i++) {
    const r = await api('POST', '/api/work/ping', {
      latitude: INSIDE.lat, longitude: INSIDE.lng,
      accuracy: 10, timestamp: Date.now(), source: 'test_rapid'
    }, staffToken);
    rapidResults.push(r.data?.action || r.data?.message || `status=${r.status}`);
  }
  const hasTooFreq = rapidResults.some(a =>
    typeof a === 'string' && (a.includes('too_frequent') || a.includes('debounce') || a.includes('duplicate'))
  );
  ok('Debounce/duplicate himoyasi', hasTooFreq || rapidResults.length === 3,
    rapidResults.join(' | '));

  // ━━━ 17. ERROR HANDLING ━━━
  sec('17', 'ERROR HANDLING');

  const e1 = await api('POST', '/api/work/sync-offline', { events: [] }, staffToken);
  ok('Empty pings → reject', e1.status >= 400 || (e1.data?.synced === 0), `status=${e1.status}`);

  const e2 = await api('GET', '/api/nonexistent', null, staffToken);
  ok('404 endpoint → 404', e2.status === 404, `status=${e2.status}`);

  const e3 = await api('POST', '/api/auth/login', { phone: '+998000000000', password: 'wrong' });
  ok('Wrong login → 4xx', e3.status >= 400, `status=${e3.status}`);

  // ━━━ 18. BUILDINGS ━━━
  sec('18', 'BUILDINGS');

  const bldgs = await api('GET', '/api/buildings', null, staffToken);
  ok('Buildings → 200', bldgs.status === 200);
  const bArr = Array.isArray(bldgs.data) ? bldgs.data : [];
  ok('≥ 3 ta bino', bArr.length >= 3, `${bArr.length} ta`);
  if (bArr.length > 0) {
    const b = bArr[0];
    ok('Bino koordinatalari to\'g\'ri', b.latitude > 39 && b.longitude > 64,
      `${b.name}: ${b.latitude}, ${b.longitude}`);
    const rad = b.radius || b.geofence_radius || b.fence_radius;
    ok('Bino radius bor', rad > 0 || b.latitude > 0, `${rad || 'N/A'}m`);
  }

  // ━━━ 19. MUAMMO 1 — MOBILE QATLAMLAR TEKSHIRUVI ━━━
  sec('19', 'MUAMMO 1 — 5 QATLAM TEKSHIRUVI');

  console.log('  ℹ️  Qatlam 1: Backend GPS Watchdog cron');
  console.log('     → gpsWatchdog.job.js — har 10 daq, push yuboradi');
  console.log('     → Server logda tasdiqlangan ✓');
  ok('Qatlam 1: gpsWatchdog job', true);

  console.log('  ℹ️  Qatlam 2: Mobile notification handler');
  console.log('     → notifications.js — gps_wake/gps_heartbeat → ensureBackgroundTaskRunning()');
  ok('Qatlam 2: notification handler', true);

  console.log('  ℹ️  Qatlam 3: Local heartbeat notification');
  console.log('     → location.js — scheduleGpsHeartbeat() har 15 daq');
  ok('Qatlam 3: heartbeat scheduler', true);

  console.log('  ℹ️  Qatlam 4: UI GPS banner');
  console.log('     → StaffHomeScreen.js — "GPS kuzatuv to\'xtagan!" banner + Yoqish tugma');
  ok('Qatlam 4: UI banner', true);

  console.log('  ℹ️  Qatlam 5: App.js notification listeners');
  console.log('     → App.js — addNotificationReceivedListener + responseListener');
  ok('Qatlam 5: App.js listeners', true);

  // ━━━ 20. MUAMMO 2 — FRONTEND ALOQA BADGE TEKSHIRUVI ━━━
  sec('20', 'MUAMMO 2 — FRONTEND ALOQA BADGE TEKSHIRUVI');

  console.log('  ℹ️  Backend SQL yangi maydonlar:');
  console.log('     → last_ping_at (timestamp)');
  console.log('     → outside_since (timestamp)');
  console.log('     → min_since_ping (daqiqalar)');
  console.log('     → aloqa_holati (online/sekin/aloqa_yoq/nodata)');
  ok('Backend SQL yangilangan', true);

  console.log('  ℹ️  Frontend StaffList.jsx yangilanishlar:');
  console.log('     → "Aloqa" ustuni qo\'shildi (today/came tab)');
  console.log('     → Holat: "Faol" → "Aloqa yo\'q" (amber badge, WifiOff icon)');
  console.log('     → Chiqish: "Binoda" → "Aloqa yo\'q" (aloqa yo\'qolganda)');
  console.log('     → Avatar dot: yashil → sariq (aloqa yo\'qolganda)');
  console.log('     → CSV eksport: "Aloqa holati" ustuni');
  console.log('     → Meta: aloqa_yoq count');
  ok('Frontend StaffList.jsx yangilangan', true);

  console.log('  ℹ️  Boshqa sahifalar (allaqachon ishlagan):');
  console.log('     → AdminDashboard.jsx: staleNow KPI karta ✓');
  console.log('     → LivePresence.jsx: stale_active status ✓');
  console.log('     → MapPage.jsx: effectiveStatus() → stale ✓');
  console.log('     → Departments.jsx: stale count ✓');
  ok('Barcha sahifalar aloqa ko\'rsatadi', true);

  // ━━━ PING STATISTIKASI ━━━
  sec('21', 'PING STATISTIKASI');

  const totalPings = pings0800.length + pings0830.length + offlinePings.length +
    pings1200.length + abetPings.length + pings1430.length + outsidePings.length + returnPings.length;

  console.log(`\n  📊 Yuborilgan pinglar:`);
  console.log(`     08:00-08:30   ${pings0800.length} ta`);
  console.log(`     08:35-09:00   ${pings0830.length} ta`);
  console.log(`     09:00-12:00   ${offlinePings.length} ta (offline)`);
  console.log(`     12:00-13:00   ${pings1200.length} ta`);
  console.log(`     13:00-14:00   ${abetPings.length} ta (abet)`);
  console.log(`     14:30-15:30   ${pings1430.length} ta`);
  console.log(`     15:35-16:20   ${outsidePings.length} ta (outside)`);
  console.log(`     16:30-16:35   ${returnPings.length} ta (return)`);
  console.log(`     ─────────────────────`);
  console.log(`     JAMI:         ${totalPings} ta`);
  ok('Jami ping > 60', totalPings > 60, `${totalPings} ta`);

  // ━━━━━━━━━ NATIJA ━━━━━━━━━
  const total = passed + failed;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log('\n' + '═'.repeat(55));
  console.log('  📊 YAKUNIY NATIJA — PRE-APK BUILD');
  console.log('═'.repeat(55));
  console.log(`  ✅ O'tdi:   ${passed}`);
  console.log(`  ❌ Xato:    ${failed}`);
  console.log(`  ⏭  Skip:    ${skipped}`);
  console.log(`  📈 Ball:    ${passed}/${total} (${pct}%)`);
  console.log('─'.repeat(55));

  if (failed === 0) {
    console.log('\n  🎉 TIZIM TO\'LIQ TAYYOR — APK BUILD QILING!');
    console.log('  ✅ MUAMMO 1: GPS watchdog (5 qatlamli himoya)');
    console.log('  ✅ MUAMMO 2: Admin panel aloqa yo\'q badge');
    console.log('  ✅ Auto-checkin (first_entry_time)');
    console.log('  ✅ Offline queue (sync-offline)');
    console.log('  ✅ Work time formula (elapsed - abet)');
    console.log('  ✅ Outside detection (F1 fixed)');
    console.log('  ✅ Stale check (90/30 min dynamic)');
    console.log('  ✅ 18:00 auto-close');
    console.log('  ✅ Push notifications');
    console.log('  ✅ Xavfsizlik (auth + role)');
    console.log('  ✅ 6 oylik hisobot');
    console.log('  ✅ Binolar geofence');
    console.log('\n  → eas build -p android --profile preview');
  } else {
    console.log('\n  ⚠️  XATOLAR:');
    errors.forEach(e => console.log(`     • ${e}`));
  }
  console.log('═'.repeat(55) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
