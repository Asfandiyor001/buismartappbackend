const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const r = http.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw.slice(0, 300) }); }
      });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    r.setTimeout(5000, () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    if (data) r.write(data);
    r.end();
  });
}

function check(label, result, expectStatus, expectKey) {
  const ok = result.status === expectStatus;
  const keyOk = expectKey ? JSON.stringify(result.body).includes(expectKey) : true;
  const icon = (ok && keyOk) ? 'PASS' : 'FAIL';
  const body = JSON.stringify(result.body).slice(0, 130);
  console.log(`[${icon}] ${label.padEnd(28)} ${result.status}  ${body}`);
  return ok && keyOk;
}

async function run() {
  let staffToken, studentToken, adminToken;

  console.log('\n========== 1. AUTH TESTS ==========');

  // DB'dagi haqiqiy phone raqamlar:
  // admin  id=1  → +998901112233  (Murodov Jasur)
  // staff  id=2  → +998932223344  (Karimova Aziza)
  // student id=4 → +998994445566  (Aliyeva Malika)

  let r = await req('POST', '/api/auth/login', { phone: '+998932223344', password: '1234' });
  staffToken = r.body?.token || r.body?.data?.token || null;
  check('1-1 Staff login', r, 200, 'token');

  r = await req('POST', '/api/auth/login', { phone: '+998932223344', password: 'wrongpass' });
  check('1-2 Wrong password', r, 401);

  r = await req('POST', '/api/auth/login', { phone: '+998994445566', password: '1234' });
  studentToken = r.body?.token || r.body?.data?.token || null;
  check('1-3 Student login', r, 200, 'token');

  r = await req('POST', '/api/auth/login', { phone: '+998901112233', password: '1234' });
  adminToken = r.body?.token || r.body?.data?.token || null;
  check('1-4 Admin login', r, 200, 'token');

  r = await req('POST', '/api/auth/login', { password: '1234' });
  check('1-5 Missing phone', r, 400);

  r = await req('POST', '/api/auth/login', { phone: '+998901111001', password: '123' });
  check('1-6 Short password', r, 400);

  r = await req('POST', '/api/auth/login', { phone: '+998909999999', password: '1234' });
  check('1-7 Non-existent user', r, 401);

  if (!staffToken) { console.log('\n[FATAL] No staff token. Check login.'); return; }

  console.log('\n========== 2. WORK TESTS ==========');

  r = await req('GET', '/api/work/active', null, staffToken);
  check('2-1 Active log', r, 200);

  // Bino 1 haqiqiy koordinatalar: 39.741066, 64.427637 (radius 120m)
  r = await req('POST', '/api/work/checkin', { buildingId: 1, lat: 39.741066, lon: 64.427637 }, staffToken);
  check('2-2 Checkin GPS OK', r, 200);

  r = await req('POST', '/api/work/checkin', { buildingId: 1, lat: 39.741066, lon: 64.427637 }, staffToken);
  check('2-3 Double checkin', r, 400);

  r = await req('POST', '/api/work/checkin', { buildingId: 1, lat: 41.2995, lon: 69.2401 }, staffToken);
  check('2-4 Wrong GPS', r, 400);

  r = await req('GET', '/api/work/today', null, staffToken);
  check('2-5 Today session', r, 200);

  r = await req('POST', '/api/work/checkout', { lat: 39.741066, lon: 64.427637 }, staffToken);
  check('2-6 Checkout', r, 200);

  // FIX 1: reset sessiya — keyin xuddi shu kuni qayta checkin qilish
  r = await req('POST', '/api/work/reset-session', null, staffToken);
  check('2-6b Reset session', r, 200);

  r = await req('POST', '/api/work/checkin', { buildingId: 2, lat: 39.740624, lon: 64.432623 }, staffToken);
  check('2-6c Re-checkin after reset', r, 200);

  r = await req('POST', '/api/work/checkout', { lat: 39.740624, lon: 64.432623 }, staffToken);
  check('2-6d Checkout again', r, 200);

  // FIX 2: weekly report — from parametrsiz, auto Monday
  r = await req('GET', '/api/work/week?from=2026-04-27', null, staffToken);
  check('2-7 Weekly report', r, 200);

  r = await req('GET', '/api/work/month?year=2025&month=4', null, staffToken);
  check('2-8 Monthly report', r, 200);

  r = await req('GET', '/api/work/today', null, null);
  check('2-9 No token (401)', r, 401);

  console.log('\n========== 3. STAFF TESTS ==========');

  r = await req('GET', '/api/staff/profile', null, staffToken);
  check('3-1 Staff profile', r, 200);

  r = await req('GET', '/api/staff/work-stats', null, staffToken);
  check('3-2 Work stats', r, 200);

  r = await req('GET', '/api/staff/vacations', null, staffToken);
  check('3-3 Vacations list', r, 200);

  // Har safar yangi sana ishlatiladi (test idempotent bo'lishi uchun)
  const vacYear = new Date().getFullYear() + 1;
  r = await req('POST', '/api/staff/vacations', { type: 'yillik', start_date: `${vacYear}-07-01`, end_date: `${vacYear}-07-10`, reason: "Yillik ta'til" }, staffToken);
  check('3-4 Request vacation', r, 200);

  r = await req('POST', '/api/staff/vacations', { type: 'invalid_type', start_date: '2025-05-01', end_date: '2025-05-10' }, staffToken);
  check('3-5 Invalid vac type', r, 400);

  r = await req('GET', '/api/staff/rewards', null, staffToken);
  check('3-6 Rewards', r, 200);

  r = await req('GET', '/api/staff/profile', null, studentToken);
  check('3-7 Student->staff (403)', r, 403);

  console.log('\n========== 4. STUDENT TESTS ==========');

  r = await req('GET', '/api/student/profile', null, studentToken);
  check('4-1 Student profile', r, 200);

  r = await req('GET', '/api/student/schedule/today', null, studentToken);
  check('4-2 Today schedule', r, 200);

  r = await req('GET', '/api/student/schedule?week=0', null, studentToken);
  check('4-3 Week schedule', r, 200);

  r = await req('GET', '/api/student/attendance/summary', null, studentToken);
  check('4-4 Attendance summary', r, 200);

  r = await req('GET', '/api/student/grades', null, studentToken);
  check('4-5 Grades', r, 200);

  r = await req('GET', '/api/student/assignments', null, studentToken);
  check('4-6 Assignments', r, 200);

  r = await req('POST', '/api/student/attendance/checkin', { token: 'invalid-token-123', lat: 39.7747, lon: 64.4286 }, studentToken);
  check('4-7 Invalid QR (400)', r, 400);

  r = await req('GET', '/api/student/profile', null, staffToken);
  check('4-8 Staff->student (403)', r, 403);

  console.log('\n========== 5. NOTIFICATIONS TESTS ==========');

  r = await req('GET', '/api/notifications', null, staffToken);
  check('5-1 Notif staff', r, 200);

  r = await req('GET', '/api/notifications', null, studentToken);
  check('5-2 Notif student', r, 200);

  r = await req('PUT', '/api/notifications/read-all', null, staffToken);
  check('5-3 Mark all read', r, 200);

  r = await req('GET', '/api/notifications', null, null);
  check('5-4 No token (401)', r, 401);

  console.log('\n========== 6. REPORTS TESTS ==========');

  r = await req('GET', '/api/reports/daily', null, staffToken);
  check('6-1 Daily report', r, 200);

  // FIX 2: from parametrsiz — bu haftaning dushanbasi avtomatik hisoblanadi
  r = await req('GET', '/api/reports/weekly', null, staffToken);
  check('6-2 Weekly (no param)', r, 200);

  r = await req('GET', '/api/reports/weekly?from=2026-04-21', null, staffToken);
  check('6-2b Weekly (with from)', r, 200);

  r = await req('GET', '/api/reports/monthly?year=2025&month=4', null, staffToken);
  check('6-3 Monthly report', r, 200);

  console.log('\n========== 7. ADMIN TESTS ==========');

  if (!adminToken) { console.log('[FATAL] No admin token.'); return; }

  r = await req('GET', '/api/admin/staff', null, adminToken);
  check('7-1 All staff', r, 200);

  r = await req('GET', '/api/admin/staff/active-now', null, adminToken);
  check('7-2 Active now', r, 200);

  r = await req('GET', '/api/admin/overview', null, adminToken);
  check('7-3 Overview', r, 200);

  r = await req('POST', '/api/admin/qr/generate', { scheduleId: 1 }, adminToken);
  check('7-4 QR generate', r, 200);

  r = await req('POST', '/api/admin/notify', { userIds: [], type: 'tizim', title: 'Test xabar', body: 'Bu test xabarnomasi' }, adminToken);
  check('7-5 Broadcast notif', r, 200);

  r = await req('POST', '/api/admin/notify', { userIds: [], type: 'invalid_type', title: 'Test', body: 'Test' }, adminToken);
  check('7-6 Invalid notif type', r, 400);

  r = await req('GET', '/api/admin/overview', null, studentToken);
  check('7-7 Student->admin (403)', r, 403);

  r = await req('GET', '/api/admin/overview', null, staffToken);
  check('7-8 Staff->admin (403)', r, 403);

  r = await req('GET', '/api/admin/overview', null, null);
  check('7-9 No token (401)', r, 401);

  console.log('\n========== DONE ==========\n');
}

run().catch(console.error);
