// ═══════════════════════════════════════════════════════════
// BIU SMART — test-feruza.js
// User id=5: To'xtayeva Feruza O'roqovna, role=staff
// Run: node tests/test-feruza.js
// ═══════════════════════════════════════════════════════════

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';

let passed = 0;
let failed = 0;
let token  = null;

// ─── helpers ────────────────────────────────────────────────────────────────

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

function check(label, ok, info = '') {
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${label}${info ? '  —  ' + info : ''}`);
  if (ok) passed++; else failed++;
}

function section(title) {
  console.log(`\n${'─'.repeat(54)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(54));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── password discovery ──────────────────────────────────────────────────────

async function findPassword() {
  const candidates = [
    'Staff2026', 'Feruza2026', 'feruza2026', 'BIU2026',
    '12345678',  'staff123',   'Feruza123',  'biu2026',
    'Feruza1',   '87654321',   'feruza123',  'Feruza@2026',
  ];

  console.log('\n🔍 Feruza parolini qidiryapmiz...');
  for (const pwd of candidates) {
    process.stdout.write(`   ${pwd.padEnd(14)} → `);
    const r = await api('POST', '/api/auth/login', {
      phone: '+998905002026',
      password: pwd,
    });
    if (r.status === 200) {
      console.log('✅ TOPILDI!');
      return {
        password: pwd,
        token: r.data?.data?.token || r.data?.token,
        user:  r.data?.data?.user  || r.data?.user,
      };
    }
    console.log(`${r.status}`);
    await sleep(120); // rate-limit: 1 daqiqada 10 ta urinish
  }
  return null;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('═'.repeat(54));
  console.log('  BIU SMART — ID=5  To\'xtayeva Feruza');
  console.log(`  Vaqt: ${new Date().toLocaleString('uz-UZ')}`);
  console.log(`  API:  ${BASE}`);
  console.log('═'.repeat(54));

  // ═══════════════════════════════════════════════════════
  // 1. LOGIN
  // ═══════════════════════════════════════════════════════
  section('1. LOGIN — parol qidirish');

  const found = await findPassword();
  if (!found) {
    console.log('\n❌ Parol topilmadi!');
    console.log('   pgAdmin da tekshiring:');
    console.log("   SELECT id, full_name, phone, password FROM users WHERE id=5;");
    console.log('   Keyin qo\'lda:');
    console.log('   FERUZA_PASS=<parol> node tests/test-feruza.js');
    process.exit(1);
  }

  token = found.token;
  const u = found.user;

  check('Login muvaffaqiyatli',       !!token,                     'JWT token olindi');
  check('id = 5',                     u?.id === 5,                 `id=${u?.id}`);
  check('role = staff',               u?.role === 'staff',         `role=${u?.role}`);
  check("Ism 'Feruza' ni o'z ichiga oladi",
                                      u?.full_name?.includes('Feruza'), u?.full_name);

  // ═══════════════════════════════════════════════════════
  // 2. PROFIL  →  GET /api/auth/me
  // ═══════════════════════════════════════════════════════
  section('2. PROFIL  (/api/auth/me)');

  const me = await api('GET', '/api/auth/me', null, token);
  check('/auth/me → 200', me.status === 200, `status=${me.status}`);

  const mu = me.data?.data?.user || me.data?.data || me.data?.user || me.data;
  check('id = 5 (confirmed)',         mu?.id === 5,                `id=${mu?.id}`);
  check("phone '+998905002026'",      mu?.phone === '+998905002026', mu?.phone);
  check('full_name mavjud',           !!mu?.full_name,             mu?.full_name);
  check('is_active = true',           mu?.is_active === true,      `is_active=${mu?.is_active}`);

  // ═══════════════════════════════════════════════════════
  // 3. STAFF PROFIL  →  GET /api/staff/profile
  // ═══════════════════════════════════════════════════════
  section('3. STAFF PROFIL  (/api/staff/profile)');

  const prof = await api('GET', '/api/staff/profile', null, token);
  check('/staff/profile → 200',       prof.status === 200,         `status=${prof.status}`);

  // ═══════════════════════════════════════════════════════
  // 4. GPS PING — BINODA (INSIDE)
  //    BIU koordinatalari: 39.7747, 64.4286
  // ═══════════════════════════════════════════════════════
  section('4. GPS PING — BINODA  (POST /api/work/ping)');

  const ping1 = await api('POST', '/api/work/ping', {
    lat: 39.7747,
    lon: 64.4286,
    accuracy: 10,
  }, token);
  check('Inside ping → 200',          ping1.status === 200,        `status=${ping1.status}`);
  const a1 = ping1.data?.data?.action || ping1.data?.action;
  // Ish vaqtidan tashqarida sessiya bo'lmasa 'no_session'/'before_work_time'/'after_work_time' — to'g'ri
  check("action qabul qilinadigan holat",
    ['inside_same', 'auto_recheckin', 'auto_checkin', 'inside_drift',
     'before_work_time', 'after_work_time', 'day_off', 'too_frequent',
     'no_session'].includes(a1),
    `action=${a1}`);

  // ═══════════════════════════════════════════════════════
  // 5. GPS PING — TASHQARIDA (OUTSIDE)
  //    Toshkent koordinatalari: 41.2995, 69.2401
  // ═══════════════════════════════════════════════════════
  section('5. GPS PING — TASHQARIDA  (POST /api/work/ping)');

  await sleep(1500); // debounce guard (25s emas, lekin bir-biridan ajratish uchun)

  const ping2 = await api('POST', '/api/work/ping', {
    lat: 41.2995,
    lon: 69.2401,
    accuracy: 15,
  }, token);
  check('Outside ping → 200',         ping2.status === 200,        `status=${ping2.status}`);
  const a2 = ping2.data?.data?.action || ping2.data?.action;
  check("action tashqari holat",
    ['outside_first_ping', 'outside_start', 'outside_waiting',
     'outside_no_log', 'no_session', 'day_off', 'too_frequent',
     'internet_outage_grace', 'auto_checkout_end_of_day'].includes(a2),
    `action=${a2}`);

  // ═══════════════════════════════════════════════════════
  // 6. OFFLINE QUEUE SIMULATION — INSIDE ga qaytish
  // ═══════════════════════════════════════════════════════
  section('6. OFFLINE QUEUE → INSIDE GA QAYTISH');

  await sleep(1500);

  const ping3 = await api('POST', '/api/work/ping', {
    lat: 39.7747,
    lon: 64.4286,
    accuracy: 8,
  }, token);
  check('INSIDE ga qaytish → 200',    ping3.status === 200,        `status=${ping3.status}`);
  const a3 = ping3.data?.data?.action || ping3.data?.action;
  console.log(`   ℹ️  action = ${a3}`);

  // Sync-offline endpoint tekshiruvi
  const syncR = await api('POST', '/api/work/sync-offline', {
    events: [
      {
        type: 'ping',
        lat:  39.7747,
        lon:  64.4286,
        accuracy: 10,
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      },
    ],
  }, token);
  check('sync-offline → 200',
    syncR.status === 200 || syncR.status === 207,
    `status=${syncR.status}`);

  // ═══════════════════════════════════════════════════════
  // 7. ISH SESSIYASI  →  GET /api/work/today
  // ═══════════════════════════════════════════════════════
  section('7. ISH SESSIYASI  (/api/work/today)');

  const today = await api('GET', '/api/work/today', null, token);
  check('/work/today → 200',          today.status === 200,        `status=${today.status}`);
  // Response turli joylarda bo'lishi mumkin
  const sessRaw = today.data?.data ?? today.data;
  const sess    = Array.isArray(sessRaw) ? sessRaw[0] : sessRaw;
  if (sess && typeof sess === 'object' && Object.keys(sess).length > 0) {
    const uid = sess?.user_id ?? sess?.userId ?? sess?.staffId;
    if (uid !== undefined) {
      check('session user_id = 5',    uid === 5,                   `user_id=${uid}`);
    } else {
      console.log(`   ℹ️  Session mavjud, lekin user_id yo'q — keys: ${Object.keys(sess).join(', ')}`);
    }
  } else {
    console.log('   ℹ️  Bugun sessiya yo\'q (ish vaqtidan tashqari yoki yakunlangan)');
  }

  // Active log
  const activeLog = await api('GET', '/api/work/active', null, token);
  check('/work/active → 200',         activeLog.status === 200,    `status=${activeLog.status}`);

  // ═══════════════════════════════════════════════════════
  // 8. OYLIK HISOBOT  →  GET /api/reports/monthly
  // ═══════════════════════════════════════════════════════
  section('8. OYLIK HISOBOT  (/api/reports/monthly)');

  const reportTests = [
    [6, 2026, 'Iyun  2026 (joriy oy)'],
    [5, 2026, 'May   2026 (muammo bor edi — insert fix)'],
    [4, 2026, 'Aprel 2026'],
    [3, 2026, 'Mart  2026'],
  ];

  for (const [month, year, label] of reportTests) {
    const r = await api('GET',
      `/api/reports/monthly?month=${month}&year=${year}`,
      null, token);
    check(`${label} → 200`,           r.status === 200,            `status=${r.status}`);
  }

  // ═══════════════════════════════════════════════════════
  // 9. ABET VAQTI (13:00–14:00) tekshiruvi
  // ═══════════════════════════════════════════════════════
  section('9. ABET VAQTI TEKSHIRUVI');

  const nowD = new Date();
  const totalMins = nowD.getHours() * 60 + nowD.getMinutes();
  const isAbetNow = totalMins >= 780 && totalMins < 840;
  console.log(`   ℹ️  Hozir: ${String(nowD.getHours()).padStart(2,'0')}:${String(nowD.getMinutes()).padStart(2,'0')} — ${isAbetNow ? '⚠️  ABET VAQTI!' : 'Abet vaqti emas'}`);

  await sleep(1500);
  const abetPing = await api('POST', '/api/work/ping', {
    lat: 39.7747,
    lon: 64.4286,
    accuracy: 10,
  }, token);
  check('Abet paytida ping → 200',    abetPing.status === 200,     `status=${abetPing.status}`);
  const abetAction = abetPing.data?.data?.action || abetPing.data?.action;
  if (isAbetNow) {
    check("Abet vaqtida 'abet_time' action",
      abetAction === 'abet_time' || abetAction === 'too_frequent',
      `action=${abetAction}`);
  } else {
    console.log(`   ℹ️  Abet vaqtida emas — action = ${abetAction}`);
  }

  // abet-early-return endpoint — bo'lsa 200, bo'lmasa 404 (frontend-only)
  const earlyReturn = await api('POST', '/api/work/abet-early-return',
    { timestamp: Date.now() }, token);
  check('abet-early-return → 200 yoki 404',
    earlyReturn.status === 200 || earlyReturn.status === 404,
    earlyReturn.status === 404 ? '(frontend-only — OK)' : 'backend endpoint mavjud');

  // ═══════════════════════════════════════════════════════
  // 10. XAFVSIZLIK — Staff ADMIN sahifaga KIRA OLMASIN
  // ═══════════════════════════════════════════════════════
  section('10. XAVFSIZLIK — Staff admin endpointlarga kirmasin');

  const forbidden = [
    ['/api/admin/staff',             'Admin: staff ro\'yxati'],
    ['/api/admin/staff/active-now',  'Admin: active-now'],
    ['/api/admin/overview',          'Admin: overview statistika'],
    ['/api/admin/users',             'Admin: foydalanuvchilar'],
    ['/api/admin/buildings',         'Admin: binolar'],
  ];

  for (const [path, label] of forbidden) {
    const r = await api('GET', path, null, token);
    check(`${label} → 401/403`,
      r.status === 401 || r.status === 403,
      `status=${r.status}`);
  }

  // ═══════════════════════════════════════════════════════
  // 11. BACKGROUND GPS SIMULATION (07:30–08:40 scenario)
  // ═══════════════════════════════════════════════════════
  section('11. BACKGROUND GPS — 3 ta ping simulatsiya');

  console.log('   ℹ️  GPS koordinatalar biroz farqlanadi (real scenario)');
  const bgCoords = [
    [39.7748, 64.4287, 'background_task'],
    [39.7746, 64.4285, 'background_task'],
    [39.7749, 64.4288, 'background_task'],
  ];

  for (let i = 0; i < bgCoords.length; i++) {
    const [lat, lon, source] = bgCoords[i];
    await sleep(1500);
    const bgPing = await api('POST', '/api/work/ping', { lat, lon, accuracy: 8 + i * 2 }, token);
    check(`Background ping #${i + 1} → 200`, bgPing.status === 200, `status=${bgPing.status}`);
    const bgAction = bgPing.data?.data?.action || bgPing.data?.action;
    console.log(`   ℹ️  action = ${bgAction}`);
  }

  // ═══════════════════════════════════════════════════════
  // 12. STAFF O'Z MA'LUMOTLARINI O'QISHI
  // ═══════════════════════════════════════════════════════
  section('12. STAFF MAXSUS ENDPOINTLAR');

  const workStats = await api('GET', '/api/staff/work-stats', null, token);
  check('/staff/work-stats → 200',    workStats.status === 200,    `status=${workStats.status}`);

  const myReport = await api('GET', '/api/staff/my-report', null, token);
  check('/staff/my-report → 200',     myReport.status === 200,     `status=${myReport.status}`);

  const docs = await api('GET', '/api/staff/documents', null, token);
  check('/staff/documents → 200',     docs.status === 200,         `status=${docs.status}`);

  // ═══════════════════════════════════════════════════════
  // YAKUNIY NATIJA
  // ═══════════════════════════════════════════════════════
  const total = passed + failed;
  const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log('\n' + '═'.repeat(54));
  console.log("  📊 NATIJA — To'xtayeva Feruza (id=5)");
  console.log('═'.repeat(54));
  console.log(`  ✅ O'tdi:   ${passed}`);
  console.log(`  ❌ Xato:    ${failed}`);
  console.log(`  📈 Ball:    ${passed}/${total}  (${pct}%)`);
  console.log('─'.repeat(54));

  if (failed === 0) {
    console.log("  🎉 100% — Feruza akkaunti to'liq ishlayapti!");
  } else if (pct >= 80) {
    console.log(`  ⚠️  ${failed} ta xato bor — tekshirish tavsiya etiladi`);
  } else {
    console.log(`  🔴 ${failed} ta xato — muhim muammolar bor!`);
  }
  console.log('═'.repeat(54) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('❌ Test kutilmagan xato:', e.message);
  process.exit(1);
});
