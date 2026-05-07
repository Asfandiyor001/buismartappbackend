'use strict';
// ═══════════════════════════════════════════════════════════
// BIU Smart App — Comprehensive API Test Suite
// Run: node tests/api.test.js
// Node 18+ native fetch is used (no extra dependencies).
// ═══════════════════════════════════════════════════════════
const fs   = require('fs');
const path = require('path');

const BASE_URL = 'https://creation-informative-absence-neural.trycloudflare.com/api';

const headers = {
  'Content-Type':                    'application/json',
  'cloudflare-skip-browser-warning': 'true',
};

// ── Test state ───────────────────────────────────────────
let adminToken  = '';
let staffToken  = '';
let staff2Token = '';

let passed  = 0;
let failed  = 0;
const results = [];

// ── Helpers ──────────────────────────────────────────────
function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
    results.push({ name, status: 'PASS' });
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
    results.push({ name, status: 'FAIL', error: e.message });
  }
}

// Authenticated GET
async function get(p, token) {
  return fetch(`${BASE_URL}${p}`, {
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

// Authenticated POST
async function post(p, body, token) {
  return fetch(`${BASE_URL}${p}`, {
    method:  'POST',
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:    JSON.stringify(body),
  });
}

// Authenticated PUT
async function put(p, body, token) {
  return fetch(`${BASE_URL}${p}`, {
    method:  'PUT',
    headers: { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body:    body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ════════════════════════════════════════════════════════
// 1. AUTH TESTS
// Response shape: { success, data: { user, token } }
// ════════════════════════════════════════════════════════
async function runAuthTests() {
  console.log('\n── 1. AUTH ─────────────────────────────────────────');

  await test('1.1 Admin login', async () => {
    const res  = await post('/api/auth/login', { phone: '+998901002026', password: 'Asfandiyor2026' });
    const body = await res.json();
    assert(body.success === true,          'Login failed: ' + (body.message || JSON.stringify(body)));
    assert(body.data?.token,               'Token not found at data.token');
    assert(body.data?.user?.role === 'admin',
      `Role should be admin, got: ${body.data?.user?.role}`);
    adminToken = body.data.token;
    console.log(`   Admin: ${body.data.user.full_name}  role=${body.data.user.role}`);
  });

  await test('1.2 Staff login', async () => {
    const res  = await post('/api/auth/login', { phone: '+998902002026', password: 'Marufjon2026' });
    const body = await res.json();
    assert(body.success === true,  'Staff login failed: ' + (body.message || JSON.stringify(body)));
    assert(body.data?.token,       'Token not found at data.token');
    staffToken = body.data.token;
    console.log(`   Staff: ${body.data.user.full_name}  role=${body.data.user.role}`);
  });

  await test('1.3 Staff2 login (Dekan / Orif)', async () => {
    const res  = await post('/api/auth/login', { phone: '+998914002026', password: 'Orif2026' });
    const body = await res.json();
    assert(body.success === true,  'Staff2 login failed: ' + (body.message || JSON.stringify(body)));
    assert(body.data?.token,       'Token not found at data.token');
    staff2Token = body.data.token;
    console.log(`   Staff2: ${body.data.user.full_name}  role=${body.data.user.role}`);
  });

  await test('1.4 Wrong password returns error', async () => {
    const res  = await post('/api/auth/login', { phone: '+998901002026', password: 'wrongpass' });
    const body = await res.json();
    assert(body.success === false, 'Should return success=false for wrong password');
    assert(res.status === 400 || res.status === 401,
      `Expected 400/401, got ${res.status}`);
  });

  await test('1.5 No token returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/work/today`, {
      headers: { 'cloudflare-skip-browser-warning': 'true' },
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test('1.6 Staff token blocked on admin endpoint (403)', async () => {
    const res = await get('/api/admin/overview', staffToken);
    assert(res.status === 403,
      `Staff should be blocked (403) on admin endpoint, got ${res.status}`);
  });
}

// ════════════════════════════════════════════════════════
// 2. STAFF PROFILE TESTS
// Response shape: { success, data: { id, full_name, department, position, ... } }
// ════════════════════════════════════════════════════════
async function runStaffProfileTests() {
  console.log('\n── 2. STAFF PROFILE ────────────────────────────────');

  await test('2.1 Get staff profile', async () => {
    const res  = await get('/api/staff/profile', staffToken);
    const body = await res.json();
    assert(body.success === true, 'Profile fetch failed: ' + JSON.stringify(body));
    const d = body.data || {};
    assert(d.full_name || d.fullName, 'Name field missing');
    assert(d.department,              'Department missing');
    assert(d.position,                'Position missing');
    console.log(`   ${d.full_name}  dept=${d.department}  pos=${d.position}`);
  });

  await test('2.2 Get staff work stats', async () => {
    const res  = await get('/api/staff/work-stats', staffToken);
    const body = await res.json();
    assert(body.success === true, 'Work stats failed: ' + JSON.stringify(body));
    assert(body.data?.month !== undefined,
      'month field missing. Keys: ' + Object.keys(body.data || {}).join(', '));
    const m = body.data.month;
    console.log(`   presentDays=${m.presentDays}  totalHours=${m.totalHours}  attendancePct=${m.attendancePct}%`);
  });

  await test('2.3 Get staff vacations', async () => {
    const res  = await get('/api/staff/vacations', staffToken);
    const body = await res.json();
    assert(body.success === true,  'Vacations failed: ' + JSON.stringify(body));
    assert(Array.isArray(body.data), `Should return array, got ${typeof body.data}`);
    console.log(`   vacations count: ${body.data.length}`);
  });

  await test('2.4 Get staff rewards', async () => {
    const res  = await get('/api/staff/rewards', staffToken);
    const body = await res.json();
    assert(body.success === true, 'Rewards failed: ' + JSON.stringify(body));
    assert(body.data?.rewards !== undefined,
      'rewards field missing. Keys: ' + Object.keys(body.data || {}).join(', '));
    console.log(`   rewards=${body.data.rewards.length}  totalBonus=${body.data.summary?.totalBonus}`);
  });

  await test('2.5 Get staff documents', async () => {
    const res  = await get('/api/staff/documents', staffToken);
    const body = await res.json();
    assert(body.success === true,  'Documents failed: ' + JSON.stringify(body));
    assert(Array.isArray(body.data), `Should return array, got ${typeof body.data}`);
    console.log(`   documents count: ${body.data.length}`);
  });
}

// ════════════════════════════════════════════════════════
// 3. WORK MODULE TESTS
// ════════════════════════════════════════════════════════
async function runWorkTests() {
  console.log('\n── 3. WORK MODULE ──────────────────────────────────');

  await test('3.1 Get today session', async () => {
    const res  = await get('/api/work/today', staffToken);
    const body = await res.json();
    assert(body.success === true, 'Today fetch failed: ' + JSON.stringify(body));
    if (body.data) {
      const lt = body.data.liveTotal;
      assert(lt === undefined || typeof lt === 'number',
        `liveTotal should be number or undefined, got ${typeof lt}`);
      const active = body.data.activeLog;
      console.log(`   liveTotal=${lt ?? 0}s  activeLog=${active ? active.buildingName : 'none'}  finished=${body.data.is_finished}`);
    } else {
      console.log('   No session today (data=null)');
    }
  });

  await test('3.2 Get active log', async () => {
    const res  = await get('/api/work/active', staffToken);
    const body = await res.json();
    assert(body.success === true, 'Active log failed: ' + JSON.stringify(body));
    // data is null when not checked in — that is valid
    console.log(`   Active log: ${body.data ? (body.data.building_name || body.data.buildingName) : 'none (outside)'}`);
  });

  await test('3.3 GPS ping — inside Bino 1 (39.741066, 64.427637)', async () => {
    const res  = await post('/api/work/ping',
      { lat: 39.741066, lon: 64.427637, accuracy: 5.0 },
      staffToken
    );
    const body = await res.json();
    assert(body.success === true, 'Ping failed: ' + JSON.stringify(body));
    assert(body.data?.action,     'Action missing in ping response');
    console.log(`   Inside ping action: ${body.data.action}`);
  });

  await test('3.4 GPS ping — outside all buildings (Tashkent coords)', async () => {
    const res  = await post('/api/work/ping',
      { lat: 41.2995, lon: 69.2401, accuracy: 10.0 },
      staffToken
    );
    const body = await res.json();
    assert(body.success === true, 'Outside ping failed: ' + JSON.stringify(body));
    const valid = [
      'outside_start', 'outside_waiting', 'outside_no_log', 'no_session',
      'day_finished', 'after_work_time', 'auto_checkout_end_of_day', 'abet_time',
      'too_frequent',
    ];
    assert(valid.includes(body.data?.action),
      `Unexpected outside action: "${body.data?.action}". Valid: ${valid.join(', ')}`);
    console.log(`   Outside ping action: ${body.data.action}`);
  });

  await test('3.5 Get weekly report — 7 days', async () => {
    const res  = await get('/api/work/week', staffToken);
    const body = await res.json();
    assert(body.success === true,       'Weekly failed: ' + JSON.stringify(body));
    assert(Array.isArray(body.data),    `Should return array, got ${typeof body.data}`);
    assert(body.data.length === 7,      `Should have 7 days, got ${body.data.length}`);
    console.log(`   Week days: ${body.data.length}  non-null: ${body.data.filter(Boolean).length}`);
  });

  await test('3.6 Get monthly report', async () => {
    const now  = new Date();
    const res  = await get(
      `/api/work/month?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      staffToken
    );
    const body = await res.json();
    assert(body.success === true, 'Monthly failed: ' + JSON.stringify(body));
    const d = body.data || {};
    console.log(`   Monthly sessions: ${d.sessions?.length ?? '?'}  summary: ${JSON.stringify(d.summary ?? {})}`);
  });
}

// ════════════════════════════════════════════════════════
// 4. GEOFENCE TIME LOGIC TESTS
// ════════════════════════════════════════════════════════
async function runGeofenceTimeTests() {
  console.log('\n── 4. GEOFENCE TIME LOGIC ──────────────────────────');

  await test('4.1 Before-work ping guard (time-conditional)', async () => {
    const now     = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const ts      = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (nowMins < 480) {
      const res  = await post('/api/work/ping',
        { lat: 39.741066, lon: 64.427637, accuracy: 5 },
        staffToken
      );
      const body = await res.json();
      assert(
        body.data?.action === 'before_work_time' || body.data?.action === 'inside_same',
        `Before-work guard not triggered at ${ts}: got "${body.data?.action}"`
      );
      console.log(`   Action at ${ts}: ${body.data?.action}`);
    } else {
      console.log(`   ⏩ Skipped — current time ${ts} is after 08:00`);
    }
  });

  await test('4.2 After-work ping guard (time-conditional)', async () => {
    const now     = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const ts      = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (nowMins > 990) {
      const res  = await post('/api/work/ping',
        { lat: 39.741066, lon: 64.427637, accuracy: 5 },
        staffToken
      );
      const body = await res.json();
      // Inside ping after 16:30: if session already exists → inside_same is valid
      // If no session → after_work_time
      const valid = [
        'after_work_time', 'auto_checkout_end_of_day',
        'inside_same', 'day_finished',
      ];
      console.log(`   After-work action at ${ts}: ${body.data?.action}`);
      assert(valid.includes(body.data?.action),
        `Unexpected after-work action: "${body.data?.action}"`);
    } else {
      console.log(`   ⏩ Skipped — current time ${ts} is before 16:30`);
    }
  });

  await test('4.3 Abet-time outside ping guard (time-conditional)', async () => {
    const now     = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const ts      = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (nowMins >= 780 && nowMins < 840) {
      const res  = await post('/api/work/ping',
        { lat: 41.2995, lon: 69.2401, accuracy: 10 },
        staffToken
      );
      const body = await res.json();
      const valid = [
        'abet_time', 'no_session', 'outside_no_log',
        'outside_start', 'outside_waiting', 'too_frequent',
      ];
      assert(valid.includes(body.data?.action),
        `Expected abet-related action at ${ts}, got: "${body.data?.action}"`);
      console.log(`   Abet action at ${ts}: ${body.data?.action}`);
    } else {
      console.log(`   ⏩ Skipped — current time ${ts} is outside abet window (13:00–14:00)`);
    }
  });
}

// ════════════════════════════════════════════════════════
// 5. BUILDINGS TESTS
// Response shape: { success, data: [ { id, name, short_name, ... } ] }
// ════════════════════════════════════════════════════════
async function runBuildingsTests() {
  console.log('\n── 5. BUILDINGS ────────────────────────────────────');

  await test('5.1 Get buildings — 3 returned, no "Admin uyi"', async () => {
    // /buildings requires admin privileges
    const res  = await get('/api/buildings', adminToken);
    const body = await res.json();
    assert(body.success === true,       'Buildings failed: ' + JSON.stringify(body));
    assert(Array.isArray(body.data),    `Should return array, got ${typeof body.data}`);
    assert(body.data.length === 3,
      `Expected 3 buildings, got ${body.data.length}: ${body.data.map(b => b.name).join(', ')}`);
    const adminBuilding = body.data.find(b =>
      (b.name       || '').toLowerCase().includes('admin') ||
      (b.short_name || '').toLowerCase().includes('admin') ||
      (b.shortName  || '').toLowerCase().includes('admin')
    );
    assert(!adminBuilding,
      `"Admin uyi" must NOT be in buildings list! Found: "${adminBuilding?.name}"`);
    console.log(`   Buildings (${body.data.length}): ${body.data.map(b => b.name).join(' | ')}`);
  });
}

// ════════════════════════════════════════════════════════
// 6. NOTIFICATIONS TESTS
// Response shape: { success, data: { notifications: [...], unreadCount: N } }
// ════════════════════════════════════════════════════════
async function runNotificationTests() {
  console.log('\n── 6. NOTIFICATIONS ────────────────────────────────');

  await test('6.1 Get notifications', async () => {
    const res  = await get('/api/notifications', staffToken);
    const body = await res.json();
    assert(body.success === true,  'Notifications failed: ' + JSON.stringify(body));
    const d = body.data || {};
    assert(d.notifications !== undefined,
      'notifications field missing. Keys: ' + Object.keys(d).join(', '));
    assert(typeof d.unreadCount === 'number',
      `unreadCount should be number, got ${typeof d.unreadCount}`);
    console.log(`   unreadCount=${d.unreadCount}  total=${Array.isArray(d.notifications) ? d.notifications.length : '?'}`);
  });

  await test('6.2 Mark all notifications as read', async () => {
    const res  = await put('/api/notifications/read-all', undefined, staffToken);
    const body = await res.json();
    assert(body.success === true, 'Mark all read failed: ' + JSON.stringify(body));
  });
}

// ════════════════════════════════════════════════════════
// 7. ADMIN TESTS
// ════════════════════════════════════════════════════════
async function runAdminTests() {
  console.log('\n── 7. ADMIN ────────────────────────────────────────');

  await test('7.1 Get all staff list', async () => {
    const res  = await get('/api/admin/staff', adminToken);
    const body = await res.json();
    assert(body.success === true, 'Get staff failed: ' + JSON.stringify(body));
    // Response: { data: { staff: [...], total: N } } or { data: [...] }
    const list  = body.data?.staff ?? (Array.isArray(body.data) ? body.data : null);
    const total = body.data?.total ?? (Array.isArray(body.data) ? body.data.length : null);
    assert(list !== null, 'Staff list not found in response. Keys: ' + Object.keys(body.data || {}).join(', '));
    console.log(`   Total staff: ${total}  returned: ${list.length}`);
  });

  await test('7.2 Get active-now staff', async () => {
    // Response: { data: { "buildingId": [ ...staff ], ... } } — keyed by building ID
    const res  = await get('/api/admin/staff/active-now', adminToken);
    const body = await res.json();
    assert(body.success === true, 'Active now failed: ' + JSON.stringify(body));
    const d = body.data || {};
    // Count total active staff across all buildings
    const total = Object.values(d).reduce((sum, arr) =>
      sum + (Array.isArray(arr) ? arr.length : 0), 0
    );
    console.log(`   Active staff total: ${total}  buildings with staff: ${Object.keys(d).length}`);
    // Just ensure it's a valid object (not null/undefined)
    assert(typeof d === 'object', `data should be object, got ${typeof d}`);
  });

  await test('7.3 Get absent-today staff', async () => {
    const res  = await get('/api/admin/staff/absent-today', adminToken);
    const body = await res.json();
    assert(body.success === true,       'Absent today failed: ' + JSON.stringify(body));
    assert(Array.isArray(body.data),    `Should return array, got ${typeof body.data}`);
    console.log(`   Absent today count: ${body.data.length}`);
  });

  await test('7.4 Get admin overview', async () => {
    const res  = await get('/api/admin/overview', adminToken);
    const body = await res.json();
    assert(body.success === true,         'Overview failed: ' + JSON.stringify(body));
    assert(body.data?.today !== undefined,
      'today field missing. Keys: ' + Object.keys(body.data || {}).join(', '));
    const t = body.data.today;
    console.log(`   today → totalStaff=${t.totalStaff}  presentNow=${t.presentNow}  absentToday=${t.absentToday}`);
  });

  await test('7.5 Generate QR for schedule (skipped when no schedules)', async () => {
    const schRes  = await get('/api/student/schedule?week=0', staffToken);
    const schBody = await schRes.json();
    const days     = schBody.data?.days || {};
    const allSlots = Object.values(days).flat();
    const scheduleId = allSlots[0]?.id;

    if (!scheduleId) {
      console.log('   ⏩ Skipped — no schedules found in DB');
      return;
    }
    const res  = await post('/api/admin/qr/generate', { scheduleId }, adminToken);
    const body = await res.json();
    assert(body.success === true, 'QR generate failed: ' + JSON.stringify(body));
    console.log(`   QR token: ${(body.data?.token || '').slice(0, 12)}...`);
  });

  await test('7.6 Admin broadcast notification to all users', async () => {
    const res  = await post('/api/admin/notify', {
      userIds: [],
      type:    'tizim',
      title:   'Test xabarnoma',
      body:    'Bu avtomatik API test xabarnomasi',
    }, adminToken);
    const body = await res.json();
    assert(body.success === true, 'Broadcast failed: ' + JSON.stringify(body));
    assert(
      typeof body.data?.sentCount === 'number' && body.data.sentCount > 0,
      `sentCount should be > 0, got ${body.data?.sentCount}`
    );
    console.log(`   Broadcast sent to: ${body.data.sentCount} users`);
  });
}

// ════════════════════════════════════════════════════════
// 8. REPORTS TESTS
// ════════════════════════════════════════════════════════
async function runReportsTests() {
  console.log('\n── 8. REPORTS ──────────────────────────────────────');

  await test('8.1 Daily report', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res   = await get(`/api/reports/daily?date=${today}`, staffToken);
    const body  = await res.json();
    assert(body.success === true, 'Daily report failed: ' + JSON.stringify(body));
    const d = body.data || {};
    console.log(`   Daily: date=${d.date}  status=${d.status}  logs=${d.logs?.length ?? 0}`);
  });

  await test('8.2 Monthly report', async () => {
    const now  = new Date();
    const res  = await get(
      `/api/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
      staffToken
    );
    const body = await res.json();
    assert(body.success === true, 'Monthly report failed: ' + JSON.stringify(body));
    assert(body.data?.summary !== undefined,
      'summary missing. Keys: ' + Object.keys(body.data || {}).join(', '));
    const s = body.data.summary;
    console.log(`   Monthly summary: totalDays=${s.totalDays}  totalHours=${s.totalHours}  attendancePct=${s.attendancePct}%`);
  });

  await test('8.3 Yearly report', async () => {
    const year  = new Date().getFullYear();
    const res   = await get(`/api/reports/yearly?year=${year}`, staffToken);
    const body  = await res.json();
    assert(body.success === true, 'Yearly report failed: ' + JSON.stringify(body));
    assert(body.data?.year === year, `year field should be ${year}`);
    const nonNull = (body.data?.months || []).filter(Boolean).length;
    console.log(`   Yearly: year=${body.data.year}  months with data=${nonNull}`);
  });
}

// ════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(57));
  console.log('  BIU SMART APP — API TEST SUITE');
  console.log(`  ${BASE_URL}`);
  console.log(`  ${new Date().toLocaleString('uz-UZ')}`);
  console.log('═'.repeat(57));

  await runAuthTests();
  await runStaffProfileTests();
  await runWorkTests();
  await runGeofenceTimeTests();
  await runBuildingsTests();
  await runNotificationTests();
  await runAdminTests();
  await runReportsTests();

  // ── Summary ───────────────────────────────────────────
  const total = passed + failed;
  const pct   = total > 0 ? Math.round((passed / total) * 100) : 0;

  console.log('\n' + '═'.repeat(57));
  console.log('  BIU SMART APP — TEST NATIJALARI');
  console.log('═'.repeat(57));
  console.log(`  ✅ PASS  : ${passed}`);
  console.log(`  ❌ FAIL  : ${failed}`);
  console.log(`  📊 JAMI  : ${total}`);
  console.log(`  📈 FOIZ  : ${pct}%`);
  console.log('═'.repeat(57));

  if (failed > 0) {
    console.log('\n  Muvaffaqiyatsiz testlar:');
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => console.log(`    ❌ ${r.name}: ${r.error}`));
  }

  console.log('\n  Har bir test natijasi:');
  results.forEach(r =>
    console.log(`    ${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`)
  );

  // ── Save JSON ─────────────────────────────────────────
  const outFile = path.join(__dirname, 'test-results.json');
  fs.writeFileSync(
    outFile,
    JSON.stringify({ date: new Date().toISOString(), baseUrl: BASE_URL,
      passed, failed, total, percentage: pct, results }, null, 2)
  );
  console.log(`\n  Natijalar saqlandi → ${outFile}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Kutilmagan xato:', err);
  process.exit(2);
});
