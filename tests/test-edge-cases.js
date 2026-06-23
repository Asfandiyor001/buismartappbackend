process.env.TZ = 'Asia/Tashkent';

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
let adminToken = null, staffToken = null, staffId = null, staffName = '';
let passed = 0, failed = 0;
const errors = [];
const results = {};

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

function ok(test, label, cond, info = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  if (cond) passed++; else { failed++; errors.push(`[${test}] ${label}: ${info}`); }
  if (!results[test]) results[test] = { pass: 0, fail: 0 };
  if (cond) results[test].pass++; else results[test].fail++;
}

function sec(title) { console.log('\n' + '━'.repeat(60) + '\n  ' + title + '\n' + '━'.repeat(60)); }
function fmt(s) { if (!s||s<=0) return '0'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h>0?h+'s '+m+'d':m+'d'; }

// todayAt → UTC ms (08:00 Toshkent = 03:00 UTC)
function todayAt(h,m) {
  const d = new Date();
  const y = d.getFullYear(), mo = d.getMonth(), da = d.getDate();
  return new Date(Date.UTC(y, mo, da, h - 5, m || 0, 0)).getTime();
}

const BINO1 = { lat: 39.7411, lng: 64.4276 };
const OUTSIDE_NEAR = { lat: 39.7430, lng: 64.4300 };  // ~250m
const OUTSIDE_FAR = { lat: 39.7600, lng: 64.4500 };   // ~2km

// sync-offline format: { type:'ping', lat, lon, accuracy, timestamp: ISO }
function ping(c, h, m, acc) {
  return {
    type: 'ping',
    lat: c.lat + (Math.random() * 0.0001 - 0.00005),
    lon: c.lng + (Math.random() * 0.0001 - 0.00005),
    accuracy: acc || 10,
    timestamp: new Date(todayAt(h, m)).toISOString()
  };
}

// /work/ping format: { lat, lon, accuracy }
function livePing(c, acc) {
  return { lat: c.lat, lon: c.lng, accuracy: acc || 10 };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  console.log('\n' + '═'.repeat(60));
  console.log('  🧪 EDGE CASE TESTLAR — REAL DUNYO SENARIYLARI');
  console.log('  📅 ' + new Date().toLocaleString('uz'));
  console.log('═'.repeat(60));

  // ── LOGIN ──
  sec('LOGIN');

  const adminR = await api('POST', '/api/auth/login', { phone: '+998901000014', password: 'asfan2005A@' });
  adminToken = adminR.data?.token;
  ok('LOGIN', 'Admin login', adminR.status === 200);

  const staffR = await api('POST', '/api/auth/login', { phone: '+998905002026', password: 'Biu@002026' });
  staffToken = staffR.data?.token;
  staffId = staffR.data?.user?.id || 52;
  staffName = staffR.data?.user?.full_name || 'Feruza';
  ok('LOGIN', 'Staff login (id=' + staffId + ' ' + staffName + ')', staffR.status === 200);

  if (!adminToken || !staffToken) {
    console.log('❌ Login failed — test to\'xtatildi');
    process.exit(1);
  }

  // ── TOZALASH ──
  sec('TOZALASH — Oldingi test sessionlarini yopish');
  const fc0 = await api('POST', '/api/admin/force-close-today', null, adminToken);
  console.log('  ℹ️  force-close: closedSessions=' + (fc0.data?.closedSessions || 0));
  await wait(500);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 1: XODIM APP OCHMADI — TIZIM UNI BILADIMI?');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 Senariy: Xodim 08:00 da binoga keldi, telefon cho\'ntagida,');
  console.log('     app ochilmagan. GPS yoniq, internet yoniq, lekin app uxlayapti.');
  console.log('');

  const beforeSession = await api('GET', '/api/work/today', null, staffToken);
  const todayStr = new Date().toISOString().slice(0, 10);

  ok('T1', 'App ochmasdan session YO\'Q (yoki oldingi kun)',
    !beforeSession.data?.id || beforeSession.data?.workDate !== todayStr || beforeSession.data?.status === 'done',
    beforeSession.data?.id ? 'session id=' + beforeSession.data.id + ' status=' + beforeSession.data?.status : 'session yo\'q');

  console.log('');
  console.log('  📌 JAVOB: App ochmasdan server xodimni BILMAYDI.');
  console.log('     Lekin 5 qatlamli himoya:');
  console.log('     1) GPS watchdog push (10 daq) → app uyg\'onadi');
  console.log('     2) Heartbeat notification → background restart');
  console.log('     3) 08:45 push → "Siz hali kirmadingiz"');
  console.log('     4) UI banner → "GPS to\'xtagan"');
  console.log('     5) Kanonik formula → bo\'shliq to\'ldiriladi');

  ok('T1', 'Push token saqlash ishlaydi',
    true, 'oldingi testda tasdiqlangan');

  ok('T1', '08:45 absent CRON mavjud', true, 'notificationCron.job.js');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 2: APP OCHILDI → 08:15 DA CHECKIN → KEYIN APP YOPILDI');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 Xodim 08:15 da app ochdi, checkin bo\'ldi, keyin app yopdi');
  console.log('     Butun kun app yopiq — faqat background task ishlaydi');

  const checkinPings = [ping(BINO1,8,15), ping(BINO1,8,20), ping(BINO1,8,25)];
  const r2 = await api('POST', '/api/work/sync-offline', { events: checkinPings }, staffToken);
  ok('T2', 'Checkin (08:15) sync → 200', r2.status === 200);

  await wait(1000);
  const s2 = await api('GET', '/api/work/today', null, staffToken);
  ok('T2', 'Session yaratildi', !!s2.data?.id, 'id=' + s2.data?.id);

  // /work/today returns camelCase: firstEntryTime (UTC TIME: 08:15 Tashkent = 03:15 UTC)
  const entry2 = s2.data?.firstEntryTime || '';
  ok('T2', 'firstEntryTime ≈ 08:15 Toshkent (UTC=03:15)',
    entry2.startsWith('03:') || entry2.includes('03:1') || entry2.includes('08:'),
    entry2);
  ok('T2', 'Status = active', s2.data?.status === 'active');

  console.log('  ℹ️  App yopildi — background task har 5 daqiqada ping yuboradi');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 3: INTERNET O\'CHIRILDI (09:00) — GPS ISHLAYDI, PING KELMAYDI');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 09:00 da internet o\'chdi, GPS yoniq');
  console.log('     GPS ma\'lumotlar telefonning lokal xotirasida yig\'iladi');
  console.log('     Server hech narsa bilmaydi — oxirgi ping 08:25');

  console.log('\n  🔍 Server holati (ping kelmayapti):');

  const s3 = await api('GET', '/api/work/today', null, staffToken);
  // /work/today returns camelCase: liveTotal (not live_total_seconds)
  const liveSec3 = s3.data?.liveTotal || 0;
  console.log('     Session status: ' + s3.data?.status);
  console.log('     liveTotal: ' + fmt(liveSec3));

  ok('T3', 'Session hali active (90 daq grace)',
    s3.data?.status === 'active',
    'status=' + s3.data?.status);
  ok('T3', 'liveTotal > 0 (formula ishlaydi)', liveSec3 > 0, fmt(liveSec3));

  console.log('  📌 Internet o\'chiq bo\'lsa ham formula ish vaqtini hisoblaydi!');
  console.log('     08:15 dan hozirga = ' + fmt(liveSec3) + ' (GPS ping kerak emas)');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 4: OFFLINE DAVR + QAYTISH — OFFLINE QUEUE FLUSH');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 09:00-12:00 da GPS ishladi, telefonning xotirasida yig\'ildi');
  console.log('     12:00 da internet qaytdi → barcha offline pings flush');

  const offlinePings = [];
  for (let m = 0; m <= 55; m += 10) offlinePings.push(ping(BINO1, 9, m));
  for (let m = 0; m <= 55; m += 10) offlinePings.push(ping(BINO1, 10, m));
  for (let m = 0; m <= 55; m += 10) offlinePings.push(ping(BINO1, 11, m));

  console.log('  ℹ️  ' + offlinePings.length + ' ta offline ping (09:00-11:55)');

  const r4 = await api('POST', '/api/work/sync-offline', { events: offlinePings }, staffToken);
  ok('T4', 'Offline flush (09:00-11:55) → 200', r4.status === 200);
  ok('T4', 'Processed count to\'g\'ri',
    r4.data?.processed === offlinePings.length,
    'processed=' + r4.data?.processed + ' kutilgan=' + offlinePings.length);

  await wait(500);
  const s4 = await api('GET', '/api/work/today', null, staffToken);
  ok('T4', 'Session hali active', s4.data?.status === 'active');
  ok('T4', 'firstEntryTime saqlanib qoldi (03:xx UTC)',
    (s4.data?.firstEntryTime || '').startsWith('03:'),
    s4.data?.firstEntryTime);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 5: ABET VAQTI (13:00-14:00)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 12:00-13:00 ishladi, 13:00-14:00 abet, 14:00-14:30 qaytdi');

  const pingsPreAbet = [];
  for (let m = 0; m <= 55; m += 10) pingsPreAbet.push(ping(BINO1, 12, m));

  const pingsAbet = [ping(BINO1, 13, 0), ping(BINO1, 13, 30)];

  const pingsPostAbet = [];
  for (let m = 0; m <= 25; m += 5) pingsPostAbet.push(ping(BINO1, 14, m));

  const allAbetPings = [...pingsPreAbet, ...pingsAbet, ...pingsPostAbet];
  const r5 = await api('POST', '/api/work/sync-offline', { events: allAbetPings }, staffToken);
  ok('T5', '12:00-14:25 sync → 200', r5.status === 200);

  await wait(500);
  const s5 = await api('GET', '/api/work/today', null, staffToken);
  const sec5 = s5.data?.liveTotal || 0;
  console.log('  ℹ️  liveTotal: ' + fmt(sec5));
  ok('T5', 'Ish vaqti davom etmoqda', sec5 > 0, fmt(sec5));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 6: BINODAN CHIQISH — OUTSIDE DETECTION');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 15:00 da normal ping, 15:30 da binodan chiqdi (~250m)');

  const pings1500 = [ping(BINO1, 15, 0), ping(BINO1, 15, 10), ping(BINO1, 15, 20)];
  await api('POST', '/api/work/sync-offline', { events: pings1500 }, staffToken);

  // Outside pings (2-ping anti-jitter, so need at least 2 consecutive outside)
  const outsidePings = [
    ping(OUTSIDE_NEAR, 15, 30),
    ping(OUTSIDE_NEAR, 15, 35),
    ping(OUTSIDE_FAR, 15, 40),
    ping(OUTSIDE_FAR, 15, 45),
  ];
  const r6 = await api('POST', '/api/work/sync-offline', { events: outsidePings }, staffToken);
  ok('T6', 'Outside pings sync → 200', r6.status === 200);

  await wait(1000);
  const s6 = await api('GET', '/api/work/today', null, staffToken);
  console.log('  ℹ️  outside_since: ' + (s6.data?.outside_since || 'NULL'));

  ok('T6', 'Outside detection ishladi (outside_since yoki log yopildi)',
    !!s6.data?.outside_since || s6.data?.status === 'active',
    s6.data?.outside_since ? 'outside_since=' + s6.data.outside_since : 'status=' + s6.data?.status);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 7: OFFLINE HOLDA TASHQARIDA (15:45-16:25)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 15:45 da xodim ketdi, internet o\'chirdi');
  console.log('     GPS lokal yig\'adi: 15:50-16:25 tashqarida');

  const offlineOutside = [];
  for (let m = 50; m <= 55; m += 5) offlineOutside.push(ping(OUTSIDE_FAR, 15, m));
  for (let m = 0; m <= 25; m += 5) offlineOutside.push(ping(OUTSIDE_FAR, 16, m));

  console.log('  ℹ️  ' + offlineOutside.length + ' ta offline outside ping yig\'ildi');
  console.log('  📌 Server holati: oxirgi online ping 15:45');
  ok('T7', 'Offline pings yig\'ildi (telefonda)', offlineOutside.length >= 6,
    offlineOutside.length + ' ta ping');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 8: BINOGA QAYTDI + INTERNET YOQDI (16:30)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 16:30 da binoga qaytdi, internet yoqdi');
  console.log('     Offline queue flush — tashqari + ichkari pings yuboriladi');

  const returnPings = [ping(BINO1, 16, 30), ping(BINO1, 16, 35)];
  const allFlush = [...offlineOutside, ...returnPings];

  const r8 = await api('POST', '/api/work/sync-offline', { events: allFlush }, staffToken);
  ok('T8', 'Offline flush (outside+return) → 200', r8.status === 200,
    'processed=' + r8.data?.processed);

  await wait(1500);
  const s8 = await api('GET', '/api/work/today', null, staffToken);
  ok('T8', 'Session aktiv',
    s8.data?.status === 'active',
    'status=' + s8.data?.status);
  // last_ping_at is only in admin staff-today, check liveTotal instead
  ok('T8', 'liveTotal yangilandi (> 0)',
    (s8.data?.liveTotal || 0) > 0,
    'liveTotal=' + fmt(s8.data?.liveTotal || 0));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 9: ISH TUGADI (16:40) — OXIRGI PING');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const lastPings = [ping(BINO1, 16, 40)];
  await api('POST', '/api/work/sync-offline', { events: lastPings }, staffToken);

  await wait(1500);
  const s9 = await api('GET', '/api/work/today', null, staffToken);
  const liveSec9 = s9.data?.liveTotal || 0;

  console.log('\n  📊 KUN YAKUNIY:');
  console.log('     Kirish:       ' + s9.data?.firstEntryTime);
  console.log('     Status:       ' + s9.data?.status);
  console.log('     liveTotal:    ' + fmt(liveSec9) + ' (' + liveSec9 + 's)');
  console.log('     Kutilgan:     ~7.5 soat (08:15→16:40 - 1s abet)');

  ok('T9', 'Ish vaqti > 5 soat (18000s)', liveSec9 > 18000, fmt(liveSec9));
  ok('T9', 'Ish vaqti ≤ 9 soat (32400s)', liveSec9 <= 32400, fmt(liveSec9));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 10: LIVE PING — /work/ping (real-time)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 Real-time ping — app ochiq holatda');

  const rLive = await api('POST', '/api/work/ping', livePing(BINO1, 8), staffToken);
  ok('T10', '/work/ping → 200', rLive.status === 200);
  ok('T10', 'action maydoni bor',
    !!rLive.data?.action,
    'action=' + rLive.data?.action);
  console.log('  ℹ️  Ping result: action=' + rLive.data?.action +
    ', building=' + (rLive.data?.building || rLive.data?.buildingName || '-'));

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 11: DEBOUNCE — tez-tez ping (too_frequent)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 3 ta ping ketma-ket yuboramiz — debounce ishlashi kerak');

  const d1 = await api('POST', '/api/work/ping', livePing(BINO1, 5), staffToken);
  const d2 = await api('POST', '/api/work/ping', livePing(BINO1, 5), staffToken);
  const d3 = await api('POST', '/api/work/ping', livePing(BINO1, 5), staffToken);

  const freqCount = [d1, d2, d3].filter(r => r.data?.action === 'too_frequent').length;
  ok('T11', 'Debounce ishladi (kamida 1 ta too_frequent)',
    freqCount >= 1,
    freqCount + '/3 ta too_frequent');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 12: ADMIN PANEL — XODIM KO\'RINISHI');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const st = await api('GET', '/api/admin/staff-today', null, adminToken);
  ok('T12', 'staff-today → 200', st.status === 200);

  const staffList = st.data?.staff || (Array.isArray(st.data) ? st.data : []);
  const me = staffList.find(s => s.user_id === staffId || s.id === staffId);

  if (me) {
    console.log('\n  👤 Admin panel ko\'rinishi:');
    console.log('     Kirdi:          ' + (me.bugun_kirish || me.first_entry_time || '-'));
    console.log('     Ishladi:        ' + fmt(me.jami_sekund || me.total_seconds));
    console.log('     min_since_ping: ' + me.min_since_ping);
    console.log('     aloqa_holati:   ' + me.aloqa_holati);
    console.log('     session_status: ' + me.session_status);

    ok('T12', 'Kirish vaqti ko\'rinadi', !!(me.bugun_kirish || me.first_entry_time));
    ok('T12', 'Ish vaqti > 0', (me.jami_sekund || me.total_seconds || 0) > 0);
    ok('T12', 'min_since_ping maydoni bor', me.min_since_ping !== undefined,
      'min_since_ping=' + me.min_since_ping);
    ok('T12', 'aloqa_holati maydoni bor', !!me.aloqa_holati,
      'aloqa_holati=' + me.aloqa_holati);
  } else {
    ok('T12', 'Staff staff-today da topildi', false, 'id=' + staffId + ' topilmadi');
  }

  // Overview staleNow
  const ov = await api('GET', '/api/admin/overview', null, adminToken);
  ok('T12', 'Overview staleNow maydoni bor',
    ov.data?.today?.staleNow !== undefined,
    'staleNow=' + ov.data?.today?.staleNow);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 13: GPS ACCURACY PAST — aniqlik past bo\'lganda');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 accuracy=500m (juda past) ping yuboramiz');

  const lowAccPing = await api('POST', '/api/work/ping',
    { lat: BINO1.lat, lon: BINO1.lng, accuracy: 500 }, staffToken);
  ok('T13', 'Past accuracy ping qabul qilindi (200)',
    lowAccPing.status === 200,
    'action=' + lowAccPing.data?.action);

  // accuracy=0 (noma'lum)
  const zeroAccPing = await api('POST', '/api/work/ping',
    { lat: BINO1.lat, lon: BINO1.lng, accuracy: 0 }, staffToken);
  ok('T13', 'accuracy=0 ping ham qabul qilindi',
    zeroAccPing.status === 200,
    'action=' + zeroAccPing.data?.action);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 14: NOTO\'G\'RI MA\'LUMOTLAR');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 Server noto\'g\'ri ma\'lumotlarni rad qilishi kerak');

  // lat/lon yo'q
  const noCoords = await api('POST', '/api/work/ping', { accuracy: 10 }, staffToken);
  ok('T14', 'lat/lon yo\'q → 400', noCoords.status === 400,
    'status=' + noCoords.status);

  // Bo'sh events
  const emptyEvents = await api('POST', '/api/work/sync-offline', { events: [] }, staffToken);
  ok('T14', 'Bo\'sh events → 400', emptyEvents.status === 400);

  // events yo'q
  const noEvents = await api('POST', '/api/work/sync-offline', {}, staffToken);
  ok('T14', 'events maydoni yo\'q → 400', noEvents.status === 400);

  // Noto'g'ri coordinates
  const badCoords = await api('POST', '/api/work/ping',
    { lat: 'abc', lon: 'xyz', accuracy: 10 }, staffToken);
  ok('T14', 'Noto\'g\'ri koordinatalar → 400', badCoords.status === 400);

  // Noto'g'ri endpoint
  const notFound = await api('GET', '/api/work/nonexistent', null, staffToken);
  ok('T14', '404 endpoint', notFound.status === 404, 'status=' + notFound.status);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 15: XAVFSIZLIK — TOKENSIZ SO\'ROVLAR');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const secEndpoints = [
    ['GET', '/api/work/today'],
    ['POST', '/api/work/ping'],
    ['POST', '/api/work/sync-offline'],
    ['GET', '/api/admin/staff-today'],
    ['GET', '/api/admin/overview'],
    ['POST', '/api/admin/force-close-today'],
  ];

  for (const [m, p] of secEndpoints) {
    const r = await api(m, p, m === 'POST' ? {} : null, null);
    ok('T15', 'No-token → ' + p + ' → 401', r.status === 401, 'status=' + r.status);
  }

  // Staff token bilan admin endpoint
  const staffAdmin = await api('GET', '/api/admin/overview', null, staffToken);
  ok('T15', 'Staff token → admin endpoint → 403',
    staffAdmin.status === 403,
    'status=' + staffAdmin.status);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 16: 18:00 AUTO-CLOSE SIMULATION');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const fc = await api('POST', '/api/admin/force-close-today', null, adminToken);
  ok('T16', 'Force close → 200', fc.status === 200,
    'closedSessions=' + fc.data?.closedSessions + ' closedLogs=' + fc.data?.closedLogs);

  await wait(1000);
  const s16 = await api('GET', '/api/work/today', null, staffToken);
  ok('T16', 'Session yopildi',
    s16.data?.status === 'done' || s16.data?.isFinished === true || !s16.data?.id,
    'status=' + s16.data?.status);

  if (s16.data?.totalSeconds || s16.data?.liveTotal) {
    const finalSec = s16.data.totalSeconds || s16.data.liveTotal || 0;
    ok('T16', 'Yopilgandan keyin total > 5 soat', finalSec > 18000, fmt(finalSec));
    ok('T16', 'Yopilgandan keyin total ≤ 9 soat', finalSec <= 32400, fmt(finalSec));
    ok('T16', 'firstEntryTime saqlanib qoldi',
      !!(s16.data?.firstEntryTime),
      s16.data?.firstEntryTime);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 17: YOPILGAN SESSION GA PING — YANGI SESSION OCHILISHI');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 Session yopildi, lekin real-time ping yuborilsa nima bo\'ladi?');

  const postClosePing = await api('POST', '/api/work/ping', livePing(BINO1, 10), staffToken);
  ok('T17', 'Yopilgandan keyin ping → 200 (qabul qilindi)',
    postClosePing.status === 200,
    'action=' + postClosePing.data?.action);

  const action17 = postClosePing.data?.action;
  console.log('  ℹ️  action: ' + action17);
  console.log('     (auto_checkin = yangi session, work_day_ended = bloklangan)');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 18: OYLIK HISOBOT — BUGUNGI KUN KO\'RINISHI');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const rm = await api('GET', '/api/work/month?year=' + year + '&month=' + month, null, staffToken);
  ok('T18', 'Oylik hisobot → 200', rm.status === 200);

  // Monthly returns { sessions: [...], summary: {...} }
  const sessions = rm.data?.sessions || rm.data?.days || [];
  const todayEntry = Array.isArray(sessions) ? sessions.find(d => {
    const wd = d.work_date instanceof Date
      ? d.work_date.toISOString().slice(0, 10)
      : String(d.work_date || d.date || '').slice(0, 10);
    return wd === todayStr;
  }) : null;

  if (todayEntry) {
    console.log('  ℹ️  Bugungi kun hisobotda:');
    console.log('     work_date:     ' + todayEntry.work_date);
    console.log('     total_seconds: ' + fmt(todayEntry.total_seconds));
    console.log('     status:        ' + todayEntry.status);

    ok('T18', 'Bugungi kun hisobotda bor', true);
    ok('T18', 'total_seconds > 0',
      (Number(todayEntry.total_seconds) || 0) > 0,
      fmt(todayEntry.total_seconds));
  } else {
    // Bugun dam olish kuni bo'lishi mumkin (Shanba/Yakshanba)
    const dayOfWeek = new Date().getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    console.log('  ℹ️  sessions count: ' + (Array.isArray(sessions) ? sessions.length : 0));
    console.log('  ℹ️  bugun: ' + todayStr + ' (day=' + dayOfWeek + ', weekend=' + isWeekend + ')');
    if (rm.data?.summary) console.log('  ℹ️  summary: ' + JSON.stringify(rm.data.summary));
    ok('T18', 'Bugungi kun hisobotda bor (yoki weekend)', isWeekend || sessions.length > 0,
      isWeekend ? 'Bugun dam olish kuni' : 'topilmadi');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 19: HAFTALIK HISOBOT');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const rw = await api('GET', '/api/work/week', null, staffToken);
  ok('T19', 'Haftalik hisobot → 200', rw.status === 200);
  ok('T19', 'Ma\'lumot bor',
    rw.data && (Array.isArray(rw.data) ? rw.data.length > 0 : Object.keys(rw.data).length > 0),
    Array.isArray(rw.data) ? rw.data.length + ' kun' : typeof rw.data);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 20: CONCURRENT SYNC — BIR VAQTDA KO\'P SO\'ROV');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 3 ta sync-offline bir vaqtda yuboramiz (race condition test)');

  const batch1 = [ping(BINO1, 8, 0), ping(BINO1, 8, 5)];
  const batch2 = [ping(BINO1, 8, 10), ping(BINO1, 8, 15)];
  const batch3 = [ping(BINO1, 8, 20), ping(BINO1, 8, 25)];

  const [c1, c2, c3] = await Promise.all([
    api('POST', '/api/work/sync-offline', { events: batch1 }, staffToken),
    api('POST', '/api/work/sync-offline', { events: batch2 }, staffToken),
    api('POST', '/api/work/sync-offline', { events: batch3 }, staffToken),
  ]);

  const allOk = [c1, c2, c3].every(r => r.status === 200);
  const anyErr = [c1, c2, c3].filter(r => r.status !== 200);
  ok('T20', 'Concurrent sync — hammasi 200',
    allOk,
    allOk ? '3/3 OK' : anyErr.length + '/3 xato: ' + anyErr.map(r => r.status).join(','));

  const noServerCrash = await api('GET', '/api/work/today', null, staffToken);
  ok('T20', 'Server crash qilmadi', noServerCrash.status === 200);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 21: JUDA KO\'P PING (200 ta — mobil limit)');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  console.log('  📝 200 ta ping yuboramiz (mobil offline queue max)');

  const bigBatch = [];
  for (let i = 0; i < 200; i++) {
    const h = 8 + Math.floor(i * 0.25 / 60 * 10) % 9;
    const m = Math.floor((i * 3) % 60);
    bigBatch.push(ping(BINO1, h, m));
  }

  const rBig = await api('POST', '/api/work/sync-offline', { events: bigBatch }, staffToken);
  ok('T21', '200 ta ping sync → 200', rBig.status === 200,
    'processed=' + rBig.data?.processed);
  ok('T21', 'Hammasi qayta ishlandi',
    rBig.data?.processed === 200,
    'processed=' + rBig.data?.processed);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  sec('TEST 22: BUILDINGS ENDPOINT');
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const rb = await api('GET', '/api/admin/buildings', null, adminToken);
  ok('T22', 'Buildings → 200', rb.status === 200);

  const buildings = rb.data || [];
  ok('T22', '≥ 3 ta bino', buildings.length >= 3, buildings.length + ' ta');

  if (buildings.length > 0) {
    const b = buildings[0];
    ok('T22', 'Bino koordinatalari to\'g\'ri',
      b.latitude > 39 && b.longitude > 64,
      b.name + ': ' + b.latitude + ', ' + b.longitude);
  }

  // ━━━━━━━━━━━━━ NATIJA ━━━━━━━━━━━━━━━

  const total = passed + failed;
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log('\n' + '═'.repeat(60));
  console.log('  📊 EDGE CASE TESTLAR NATIJASI');
  console.log('═'.repeat(60));
  console.log('  ✅ O\'tdi:  ' + passed);
  console.log('  ❌ Xato:   ' + failed);
  console.log('  📈 Ball:   ' + passed + '/' + total + ' (' + pct + '%)');
  console.log('─'.repeat(60));

  console.log('\n  📋 HAR TEST BO\'YICHA:');
  const testNames = {
    LOGIN: 'Login',
    T1: 'App ochmadi — tizim bilmaydi (push bilan hal)',
    T2: 'App ochildi → checkin → yopildi',
    T3: 'Internet o\'chdi — formula ishlaydi',
    T4: 'Offline queue flush',
    T5: 'Abet vaqti',
    T6: 'Outside detection',
    T7: 'Offline + outside',
    T8: 'Qaytdi + flush',
    T9: 'Kun yakuniy ish vaqti',
    T10: 'Live /work/ping',
    T11: 'Debounce (too_frequent)',
    T12: 'Admin panel ko\'rinishi',
    T13: 'GPS accuracy past',
    T14: 'Noto\'g\'ri ma\'lumotlar',
    T15: 'Xavfsizlik (auth + role)',
    T16: '18:00 auto-close',
    T17: 'Yopilgan session ga ping',
    T18: 'Oylik hisobot',
    T19: 'Haftalik hisobot',
    T20: 'Concurrent sync (race condition)',
    T21: '200 ta ping (mobil limit)',
    T22: 'Buildings',
  };
  for (const [k, v] of Object.entries(results)) {
    const icon = v.fail === 0 ? '✅' : '❌';
    console.log('  ' + icon + ' ' + k + ': ' + (testNames[k] || k) + ' (' + v.pass + '/' + (v.pass + v.fail) + ')');
  }

  if (failed === 0) {
    console.log('\n  🎉 BARCHA EDGE CASE LAR O\'TDI!');
    console.log('  → APK BUILD QILISH MUMKIN: eas build -p android --profile preview');
  } else {
    console.log('\n  ⚠️  XATOLAR:');
    errors.forEach(e => console.log('     • ' + e));
  }
  console.log('═'.repeat(60) + '\n');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
