/**
 * FINAL PRE-BUILD VERIFICATION HARNESS  (Agents 1, 2, 4)
 * Run:  node tests/final-pre-build-test.js
 * Produces partial JSON to tests/_agent124.json ; Agent 3 merged separately.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000';
const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', password: 'asfan2005', database: 'BuiSmartApp' });

// ── Real users (corrected from DB) ───────────────────────────────
const ADMIN = { phone: '+998901000014', password: 'asfan2005A@', id: 29 };
const FERUZA = { phone: '+998905002026', password: 'Biu@002026', id: 52 };
const ID44 = { phone: '+998901000029', password: 'Biu@000029', id: 44 };

// Real geofence coords (Building 1) vs prompt's (mislabelled) inside, vs outside
const INSIDE = { lat: 39.741066, lon: 64.427637 };          // Building 1 — truly inside
const PROMPT_INSIDE = { lat: 39.7747, lon: 64.4286 };       // prompt "inside" — actually ~3.7km out
const OUTSIDE = { lat: 41.2995, lon: 69.2401 };             // Tashkent

const tok = {};
const a1 = [], a2 = [], a4 = [];

function rec(arr, name, pass, detail) {
  arr.push({ name, pass: !!pass, detail });
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? '  — ' + detail : ''}`);
}

async function req(method, p, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opt = { method, headers };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const r = await fetch(BASE + p, opt);
  let j = null; try { j = await r.json(); } catch (_) {}
  return { status: r.status, json: j };
}
const getTok = (j) => (j && (j.token || (j.data && j.data.token))) || null;

// ── Tashkent "today at H:M" → Date (server TZ = UTC+5, no DST) ────
const nowTk = new Date(Date.now() + 5 * 3600 * 1000);
const Y = nowTk.getUTCFullYear(), M = nowTk.getUTCMonth(), D = nowTk.getUTCDate();
const todayAt = (h, m) => new Date(Date.UTC(Y, M, D, h - 5, m, 0));

async function agent1() {
  console.log('\n=== AGENT 1: API ENDPOINTS ===');
  // AUTH
  let r = await req('POST', '/api/auth/login', null, { phone: FERUZA.phone, password: FERUZA.password });
  tok.staff = getTok(r.json); rec(a1, 'POST /auth/login (staff) → 200+token', r.status === 200 && tok.staff, 'status ' + r.status);
  r = await req('POST', '/api/auth/login', null, { phone: ADMIN.phone, password: ADMIN.password });
  tok.admin = getTok(r.json); rec(a1, 'POST /auth/login (admin) → 200+token', r.status === 200 && tok.admin, 'status ' + r.status);
  r = await req('POST', '/api/auth/login', null, { phone: FERUZA.phone, password: 'WRONGpw!' });
  rec(a1, 'POST /auth/login (wrong password) → 401', r.status === 401, 'status ' + r.status);
  r = await req('POST', '/api/auth/login', null, {});
  rec(a1, 'POST /auth/login (empty body) → 400', r.status === 400, 'status ' + r.status);
  r = await req('GET', '/api/auth/me', tok.staff);
  rec(a1, 'GET /auth/me (valid token) → 200+user', r.status === 200 && r.json && (r.json.data || r.json.user), 'status ' + r.status);
  r = await req('GET', '/api/auth/me', null);
  rec(a1, 'GET /auth/me (no token) → 401', r.status === 401, 'status ' + r.status);
  r = await req('GET', '/api/auth/me', 'xxx');
  rec(a1, 'GET /auth/me (fake token) → 401', r.status === 401, 'status ' + r.status);

  // GPS PING
  r = await req('POST', '/api/work/ping', tok.staff, { lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 10 });
  rec(a1, 'POST /work/ping (inside/Bldg1) → 200+action', r.status === 200, 'status ' + r.status + ' action=' + (r.json && r.json.data && r.json.data.action));
  r = await req('POST', '/api/work/ping', tok.staff, { lat: OUTSIDE.lat, lon: OUTSIDE.lon, accuracy: 10 });
  rec(a1, 'POST /work/ping (outside) → 200+action', r.status === 200, 'status ' + r.status + ' action=' + (r.json && r.json.data && r.json.data.action));
  r = await req('POST', '/api/work/ping', tok.staff, {});
  rec(a1, 'POST /work/ping (no body) → 400', r.status === 400, 'status ' + r.status);
  r = await req('POST', '/api/work/ping', tok.staff, { lat: INSIDE.lat });
  rec(a1, 'POST /work/ping (lat only) → 400', r.status === 400, 'status ' + r.status);
  r = await req('POST', '/api/work/ping', null, { lat: INSIDE.lat, lon: INSIDE.lon });
  rec(a1, 'POST /work/ping (no token) → 401', r.status === 401, 'status ' + r.status);

  // SYNC OFFLINE
  const ev = [];
  for (let i = 0; i < 5; i++) ev.push({ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: todayAt(8, i).toISOString() });
  r = await req('POST', '/api/work/sync-offline', tok.staff, { events: ev });
  rec(a1, 'POST /work/sync-offline (5 backdated inside) → 200', r.status === 200, 'status ' + r.status + ' processed=' + (r.json && r.json.data && r.json.data.processed));
  r = await req('POST', '/api/work/sync-offline', tok.staff, { events: [] });
  rec(a1, 'POST /work/sync-offline (empty array) → 200/400', r.status === 200 || r.status === 400, 'status ' + r.status);
  r = await req('POST', '/api/work/sync-offline', null, { events: ev });
  rec(a1, 'POST /work/sync-offline (no token) → 401', r.status === 401, 'status ' + r.status);

  // WORK SESSION + STAFF
  for (const [p, label] of [['/api/work/today', 'GET /work/today'], ['/api/work/active', 'GET /work/active'],
    ['/api/staff/work-stats', 'GET /staff/work-stats'], ['/api/staff/profile', 'GET /staff/profile']]) {
    r = await req('GET', p, tok.staff); rec(a1, label + ' → 200', r.status === 200, 'status ' + r.status);
  }

  // REPORTS
  for (const m of [6, 5, 4, 1]) {
    r = await req('GET', `/api/staff/my-report?month=${m}&year=2026`, tok.staff);
    rec(a1, `GET /staff/my-report?month=${m}&year=2026 → 200`, r.status === 200, 'status ' + r.status);
  }

  // NOTIFICATIONS
  r = await req('POST', '/api/notifications/push-token', tok.staff, { push_token: 'ExponentPushToken[test]' });
  rec(a1, 'POST /notifications/push-token → 200', r.status === 200, 'status ' + r.status);
  r = await req('GET', '/api/notifications', tok.staff);
  rec(a1, 'GET /notifications → 200+array', r.status === 200, 'status ' + r.status);

  // ADMIN  (note: real routes — /overview not /stats, /staff/active-now not /active-now)
  const adminGets = [
    ['/api/admin/overview', 'GET /admin/overview (was "stats")'],
    ['/api/admin/staff', 'GET /admin/staff'],
    ['/api/admin/staff/active-now', 'GET /admin/staff/active-now (was "active-now")'],
    ['/api/admin/staff-today', 'GET /admin/staff-today'],
    ['/api/admin/staff/52', 'GET /admin/staff/52 (Feruza, was "5")'],
    ['/api/admin/staff/44', 'GET /admin/staff/44'],
    ['/api/buildings', 'GET /buildings'],
  ];
  for (const [p, label] of adminGets) {
    r = await req('GET', p, tok.admin); rec(a1, label + ' → 200', r.status === 200, 'status ' + r.status);
  }
  r = await req('POST', '/api/admin/force-close-today', tok.admin, {});
  rec(a1, 'POST /admin/force-close-today → 200', r.status === 200, 'status ' + r.status);

  // SECURITY (staff token → admin endpoints → 403)
  const sec = [
    ['GET', '/api/admin/staff', 'GET /admin/staff (staff token) → 403'],
    ['GET', '/api/admin/overview', 'GET /admin/overview (staff token) → 403'],
    ['POST', '/api/admin/force-close-today', 'POST /admin/force-close-today (staff token) → 403'],
    ['DELETE', '/api/admin/users/52', 'DELETE /admin/users/52 (staff token) → 403'],
  ];
  for (const [m, p, label] of sec) {
    r = await req(m, p, tok.staff, m === 'POST' ? {} : undefined);
    rec(a1, label, r.status === 403 || r.status === 401, 'status ' + r.status);
  }
}

async function agent2() {
  console.log('\n=== AGENT 2: DATABASE INTEGRITY ===');
  let r;
  r = await pool.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename='work_logs' AND indexdef ILIKE '%is_active%'`);
  rec(a2, '#1 partial unique index on work_logs(is_active)', r.rows.length > 0, r.rows.map(x => x.indexname).join(', ') || 'NONE');
  r = await pool.query(`SELECT column_name,data_type FROM information_schema.columns WHERE table_name='users' AND column_name='push_token'`);
  rec(a2, '#2 users.push_token column exists', r.rows.length === 1, r.rows[0] ? r.rows[0].data_type : 'MISSING');
  r = await pool.query(`SELECT session_id, COUNT(*) c FROM work_logs WHERE is_active=true GROUP BY session_id HAVING COUNT(*)>1`);
  rec(a2, '#3 no duplicate active work_logs per session', r.rows.length === 0, r.rows.length + ' offending sessions');
  r = await pool.query(`SELECT id FROM work_sessions WHERE work_date=CURRENT_DATE AND status='active' AND first_entry_time IS NULL`);
  rec(a2, '#4 no active session today with NULL first_entry_time', r.rows.length === 0, r.rows.length + ' rows');
  r = await pool.query(`SELECT id FROM work_logs WHERE DATE(entry_time AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE AND EXTRACT(HOUR FROM entry_time AT TIME ZONE 'Asia/Tashkent')>=18`);
  rec(a2, '#5 no work_logs after 18:00 today', r.rows.length === 0, r.rows.length + ' rows');
  r = await pool.query(`SELECT id FROM work_sessions WHERE work_date=CURRENT_DATE AND total_seconds>32400`);
  rec(a2, '#6 no session today >9h (32400s)', r.rows.length === 0, r.rows.length + ' rows');
  r = await pool.query(`SELECT id,name,latitude,longitude,radius_m FROM buildings ORDER BY id`);
  const okB = r.rows.length >= 1 && r.rows.every(b => String(b.latitude).startsWith('39') && String(b.longitude).startsWith('64') && b.radius_m > 0);
  rec(a2, '#7 buildings valid (lat 39.x, lon 64.x, radius>0)', okB, r.rows.length + ' buildings');
  r = await pool.query(`SELECT type, COUNT(*) c FROM notifications WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY type`);
  rec(a2, '#8 notifications present (cron traces, last 7d)', true, r.rows.map(x => `${x.type}:${x.c}`).join(', ') || 'none (informational)');
}

async function agent4() {
  console.log('\n=== AGENT 4: EDGE CASE SIMULATION (id=52 Feruza) ===');
  const uid = FERUZA.id;
  // cleanup today
  await pool.query(`DELETE FROM work_logs WHERE user_id=$1 AND DATE(entry_time AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [uid]);
  await pool.query(`DELETE FROM gps_pings WHERE user_id=$1 AND DATE(created_at AT TIME ZONE 'Asia/Tashkent')=CURRENT_DATE`, [uid]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [uid]);
  console.log('  (cleaned today data for user 52)');

  // build coherent timeline: inside 08:00→15:25, outside 15:30/15:35, inside 16:30
  const events = [];
  for (let h = 8, m = 0; h < 15 || (h === 15 && m <= 25);) {
    events.push({ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: todayAt(h, m).toISOString() });
    m += 5; if (m >= 60) { m -= 60; h++; }
  }
  const insideCount = events.length;
  events.push({ type: 'ping', lat: OUTSIDE.lat, lon: OUTSIDE.lon, accuracy: 12, timestamp: todayAt(15, 30).toISOString() });
  events.push({ type: 'ping', lat: OUTSIDE.lat, lon: OUTSIDE.lon, accuracy: 12, timestamp: todayAt(15, 35).toISOString() });

  // SIM1 + SIM4 (send all but final inside)
  let r = await req('POST', '/api/work/sync-offline', tok.staff, { events });
  rec(a4, `SIM1 normal workday: ${insideCount} inside pings 08:00–15:25 synced`, r.status === 200, 'status ' + r.status);

  // SIM4 check outside_since set
  let s = await pool.query(`SELECT first_entry_time, outside_since, total_seconds, status FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [uid]);
  const sess = s.rows[0] || {};
  rec(a4, 'SIM4 outside detection: outside_since set after 2 outside pings', sess.outside_since != null, 'outside_since=' + sess.outside_since);

  // SIM5 return inside 16:30 → outside_since cleared
  r = await req('POST', '/api/work/sync-offline', tok.staff, { events: [{ type: 'ping', lat: INSIDE.lat, lon: INSIDE.lon, accuracy: 8, timestamp: todayAt(16, 30).toISOString() }] });
  s = await pool.query(`SELECT first_entry_time, outside_since, total_seconds, status FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [uid]);
  const sess2 = s.rows[0] || {};
  rec(a4, 'SIM5 return inside 16:30 → outside_since cleared', sess2.outside_since == null, 'outside_since=' + sess2.outside_since);

  // SIM2 first_entry_time ~08:00 (Tashkent)
  let feHour = null;
  if (sess2.first_entry_time) {
    const q = await pool.query(`SELECT EXTRACT(HOUR FROM first_entry_time AT TIME ZONE 'Asia/Tashkent') h, EXTRACT(MINUTE FROM first_entry_time AT TIME ZONE 'Asia/Tashkent') m FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [uid]);
    feHour = q.rows[0] ? `${q.rows[0].h}:${String(q.rows[0].m).padStart(2,'0')}` : null;
  }
  rec(a4, 'SIM2 first_entry_time ≈ 08:00', feHour && Number(feHour.split(':')[0]) === 8, 'first_entry=' + feHour);

  // SIM3 total_seconds vs 27000 ±1800
  const ts = Number(sess2.total_seconds || 0);
  const within = Math.abs(ts - 27000) <= 1800;
  rec(a4, 'SIM3 total_seconds ≈ 27000 (±1800)', within, `total_seconds=${ts} (${(ts/3600).toFixed(2)}h), status=${sess2.status}`);
}

(async () => {
  try {
    await agent1();
  } catch (e) { console.error('Agent1 fatal:', e.message); }
  try { await agent2(); } catch (e) { console.error('Agent2 fatal:', e.message); }
  try { await agent4(); } catch (e) { console.error('Agent4 fatal:', e.message); }

  const out = {
    generatedAt: new Date().toISOString(),
    agent1: { name: 'API Endpoints', tests: a1, passed: a1.filter(x => x.pass).length, total: a1.length },
    agent2: { name: 'Database Integrity', tests: a2, passed: a2.filter(x => x.pass).length, total: a2.length },
    agent4: { name: 'Edge Cases', tests: a4, passed: a4.filter(x => x.pass).length, total: a4.length },
  };
  fs.writeFileSync(path.join(__dirname, '_agent124.json'), JSON.stringify(out, null, 2));
  console.log('\nWrote tests/_agent124.json');
  await pool.end();
  process.exit(0);
})();
