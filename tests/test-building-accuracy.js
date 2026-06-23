process.env.TZ = 'Asia/Tashkent';
require('@dotenvx/dotenvx').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });

const pool = require('../src/config/database');
const { nearestBuilding } = require('../src/modules/work/geofence.service');

// ─────────────────────────────────────────────────────────────────────────
// BINO ANIQLASH ANIQLIGI — tizim xodim QAYSI binoda ekanini qanchalik aniq biladi?
//   PART A: nearestBuilding() — markaz, radius chegaralari, eng yaqin bino tanlash
//   PART B: Haversine masofa aniqligi (DB hisobi vs mustaqil JS hisobi)
//   PART C: End-to-end — admin panel (team-status + staff-today) qaysi binoni ko'rsatadi
// ─────────────────────────────────────────────────────────────────────────

const BASE = process.env.API_BASE_URL || 'http://localhost:5000';
const USER_ID = 52;

let passed = 0, failed = 0;
const errors = [];
function ok(label, cond, info = '') {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${info ? ' — ' + info : ''}`);
  if (cond) passed++; else { failed++; errors.push(`${label}: ${info}`); }
}
function sec(t) { console.log('\n' + '━'.repeat(66) + '\n  ' + t + '\n' + '━'.repeat(66)); }

// Mustaqil Haversine (metr) — DB hisobini solishtirish uchun
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
// Markazdan d metr shimolga siljish
const north = (c, d) => ({ lat: c.lat + d / 111320, lon: c.lon });

async function api(method, path, body, tok) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data: data?.data || data };
}
const iso = (offsetMin) => new Date(Date.now() + offsetMin * 60000).toISOString();

(async () => {
  console.log('\n' + '═'.repeat(66));
  console.log('  🎯 BINO ANIQLASH ANIQLIGI TESTI');
  console.log('  ❓ Tizim xodim QAYSI binoda ekanini qanchalik aniq biladi?');
  console.log('  📅 ' + new Date().toLocaleString('uz'));
  console.log('═'.repeat(66));

  // Binolarni DB'dan o'qiymiz
  const { rows: B } = await pool.query(
    `SELECT id, name, short_name, latitude::float8 AS lat, longitude::float8 AS lon, radius_m
     FROM buildings WHERE is_active = true ORDER BY id`);
  console.log('\n  🏢 Faol binolar:');
  for (const b of B) console.log(`     #${b.id} ${b.name}  (${b.lat}, ${b.lon})  r=${b.radius_m}m`);
  const byId = Object.fromEntries(B.map(b => [b.id, b]));

  // ═══════════════════════════════════════════════════════════════════════
  sec('PART A: nearestBuilding() — MARKAZDA TURIB ANIQLASH');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 Har bino markazida → o\'sha bino aniqlanishi va "ichkarida" bo\'lishi kerak\n');
  for (const b of B) {
    const r = await nearestBuilding(b.lat, b.lon);
    const dist = Number(r.dist_m);
    const inside = dist <= Number(r.radius_m);
    ok(`${b.name} markazi → to'g'ri bino`, r.id === b.id, `aniqlandi: ${r.name}`);
    ok(`  └ markazda masofa ≈ 0 (<2m)`, dist < 2, `${dist.toFixed(2)}m`);
    ok(`  └ "ichkarida" deb belgilandi`, inside === true, `dist ${dist.toFixed(1)} ≤ r ${r.radius_m}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  sec('PART B: RADIUS CHEGARASI — ichkarida/tashqarida aniq ajratish');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 Radiusdan biroz ichkarida → INSIDE, biroz tashqarida → OUTSIDE\n');
  for (const b of B) {
    const rin = Number(b.radius_m) - 15;   // 15m ichkarida
    const rout = Number(b.radius_m) + 15;   // 15m tashqarida
    const pin = north(b, rin);
    const pout = north(b, rout);

    const din = await nearestBuilding(pin.lat, pin.lon);
    const dout = await nearestBuilding(pout.lat, pout.lon);

    ok(`${b.short_name}: ${rin}m da → ICHKARIDA + to'g'ri bino`,
      din.id === b.id && Number(din.dist_m) <= Number(din.radius_m),
      `bino=${din.short_name} dist=${Number(din.dist_m).toFixed(1)}m`);
    ok(`${b.short_name}: ${rout}m da → TASHQARIDA`,
      Number(dout.dist_m) > Number(dout.radius_m),
      `dist=${Number(dout.dist_m).toFixed(1)}m > r=${dout.radius_m}m`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  sec('PART C: ENG YAQIN BINO TANLASH (binolar orasida)');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 Ikki bino orasidagi nuqta → eng yaqin bino tanlanishi kerak\n');
  // B2 va B3 orasi (~190m). B2 ga yaqinroq nuqta va B3 ga yaqinroq nuqta.
  const b2 = byId[2], b3 = byId[3];
  const closerToB2 = { lat: b2.lat + (b3.lat - b2.lat) * 0.30, lon: b2.lon + (b3.lon - b2.lon) * 0.30 };
  const closerToB3 = { lat: b2.lat + (b3.lat - b2.lat) * 0.70, lon: b2.lon + (b3.lon - b2.lon) * 0.70 };
  const r2 = await nearestBuilding(closerToB2.lat, closerToB2.lon);
  const r3 = await nearestBuilding(closerToB3.lat, closerToB3.lon);
  ok('B2 ga 30% yaqin nuqta → Bino 2 tanlandi', r2.id === 2, `tanlandi: ${r2.short_name} (${Number(r2.dist_m).toFixed(0)}m)`);
  ok('B3 ga 70% yaqin nuqta → Bino 3 tanlandi', r3.id === 3, `tanlandi: ${r3.short_name} (${Number(r3.dist_m).toFixed(0)}m)`);

  // Uzoq nuqta (Toshkent ~500km) → eng yaqin bino qaytaradi, lekin TASHQARIDA
  const tashkent = await nearestBuilding(41.2995, 69.2401);
  ok('Uzoq nuqta (Toshkent) → barcha binolardan TASHQARIDA',
    Number(tashkent.dist_m) > Number(tashkent.radius_m),
    `eng yaqin ${tashkent.short_name} ${(Number(tashkent.dist_m) / 1000).toFixed(0)}km`);

  // ═══════════════════════════════════════════════════════════════════════
  sec('PART D: HAVERSINE MASOFA ANIQLIGI (DB hisobi vs JS hisobi)');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 DB SQL Haversine = mustaqil JS Haversine (xato < 1 metr)\n');
  const probes = [
    { name: 'B1 +60m', p: north(byId[1], 60), ref: byId[1] },
    { name: 'B2 +120m', p: north(byId[2], 120), ref: byId[2] },
    { name: 'B1→B2 oralig\'i', p: { lat: byId[1].lat, lon: byId[1].lon }, ref: byId[2] },
  ];
  for (const pr of probes) {
    const r = await nearestBuilding(pr.p.lat, pr.p.lon);
    // r — eng yaqin bino. Biz pr.ref gacha masofani DB orqali aniq solishtirolmaymiz,
    // shuning uchun nearestBuilding qaytargan dist_m ni o'sha bino markazigacha JS bilan solishtiramiz.
    const nb = byId[r.id];
    const jsDist = haversine(pr.p.lat, pr.p.lon, nb.lat, nb.lon);
    const dbDist = Number(r.dist_m);
    const err = Math.abs(jsDist - dbDist);
    ok(`${pr.name}: DB=${dbDist.toFixed(2)}m JS=${jsDist.toFixed(2)}m → xato < 1m`,
      err < 1, `xato=${err.toFixed(3)}m`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  sec('PART E: END-TO-END — ADMIN PANEL QAYSI BINONI KO\'RSATADI');
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📝 Xodim Bino 1 da aktiv → keyin Bino 2 ga → keyin Bino 3 ga ko\'chadi.');
  console.log('     Har qadamda admin panel (team-status + staff-today) to\'g\'ri binoni ko\'rsatishi kerak.\n');

  const sr = await api('POST', '/api/auth/login', { phone: '+998905002026', password: 'Biu@002026' });
  const tok = sr.data?.token;
  const ar = await api('POST', '/api/auth/login', { phone: '+998901000014', password: 'asfan2005A@' });
  const adminTok = ar.data?.token;

  // Toza sessiya: Bino 1 da aktiv, last_ping=NOW (stale-finalizer tegmaydi)
  await pool.query(`DELETE FROM work_logs WHERE session_id IN (SELECT id FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE)`, [USER_ID]);
  await pool.query(`DELETE FROM work_sessions WHERE user_id=$1 AND work_date=CURRENT_DATE`, [USER_ID]);
  const { rows: [sess] } = await pool.query(
    `INSERT INTO work_sessions (user_id, work_date, first_entry_time, status, is_finished, last_ping_at, buildings_visited)
     VALUES ($1, CURRENT_DATE, (NOW() - INTERVAL '10 min')::time, 'active', false, NOW(), 1) RETURNING id`, [USER_ID]);
  await pool.query(
    `INSERT INTO work_logs (session_id, user_id, building_id, entry_time, entry_lat, entry_lon, is_active, source)
     VALUES ($1, $2, 1, NOW() - INTERVAL '10 min', $3, $4, true, 'gps')`,
    [sess.id, USER_ID, byId[1].lat, byId[1].lon]);

  async function adminBuilding() {
    // team-status (LivePresence)
    const ts = await api('GET', '/api/staff/team-status', null, adminTok);
    const team = ts.data?.team || [];
    const meT = team.find(x => x.user_id === USER_ID || x.id === USER_ID);
    // staff-today (StaffList)
    const std = await api('GET', '/api/admin/staff-today', null, adminTok);
    const list = std.data?.staff || [];
    const meS = list.find(x => x.id === USER_ID || x.user_id === USER_ID);
    return { team: meT?.building_name || meT?.buildingName || null, staffToday: meS?.building_name || null };
  }

  // Qadam 1: Bino 1 da
  await pool.query(`UPDATE work_sessions SET last_ping_at=NOW() WHERE id=$1`, [sess.id]);
  let ab = await adminBuilding();
  console.log(`  📍 Qadam 1 (Bino 1 da): team-status="${ab.team}"  staff-today="${ab.staffToday}"`);
  ok('team-status Bino 1 ni ko\'rsatadi', ab.team === byId[1].name, ab.team);
  ok('staff-today Bino 1 ni ko\'rsatadi', ab.staffToday === byId[1].name, ab.staffToday);

  // Qadam 2: Bino 2 markaziga ping → auto_switch
  const p2 = await api('POST', '/api/work/sync-offline',
    { events: [{ type: 'ping', lat: byId[2].lat, lon: byId[2].lon, accuracy: 8, timestamp: iso(-1) }] }, tok);
  await pool.query(`UPDATE work_sessions SET last_ping_at=NOW() WHERE id=$1`, [sess.id]);
  ab = await adminBuilding();
  console.log(`  📍 Qadam 2 (Bino 2 ga ko'chdi, action=${p2.data?.results?.[0]?.result?.action}): team="${ab.team}"  staff-today="${ab.staffToday}"`);
  ok('Bino 2 ga auto_switch', p2.data?.results?.[0]?.result?.action === 'auto_switch',
    'action=' + p2.data?.results?.[0]?.result?.action);
  ok('team-status endi Bino 2 ni ko\'rsatadi', ab.team === byId[2].name, ab.team);
  ok('staff-today endi Bino 2 ni ko\'rsatadi', ab.staffToday === byId[2].name, ab.staffToday);

  // Qadam 3: Bino 3 markaziga ping → auto_switch
  const p3 = await api('POST', '/api/work/sync-offline',
    { events: [{ type: 'ping', lat: byId[3].lat, lon: byId[3].lon, accuracy: 8, timestamp: iso(1) }] }, tok);
  await pool.query(`UPDATE work_sessions SET last_ping_at=NOW() WHERE id=$1`, [sess.id]);
  ab = await adminBuilding();
  console.log(`  📍 Qadam 3 (Bino 3 ga ko'chdi, action=${p3.data?.results?.[0]?.result?.action}): team="${ab.team}"  staff-today="${ab.staffToday}"`);
  ok('Bino 3 ga auto_switch', p3.data?.results?.[0]?.result?.action === 'auto_switch',
    'action=' + p3.data?.results?.[0]?.result?.action);
  ok('team-status endi Bino 3 ni ko\'rsatadi', ab.team === byId[3].name, ab.team);
  ok('staff-today endi Bino 3 ni ko\'rsatadi', ab.staffToday === byId[3].name, ab.staffToday);

  // Qadam 4: Binodan TASHQARIGA ping (250m) → bino o'zgarmaydi (offline outside log yopmaydi),
  // lekin bu live emas. Buni alohida tekshirmaymiz — outside xulqi test-exit-time da.

  // ── NATIJA ──
  const total = passed + failed;
  console.log('\n' + '═'.repeat(66));
  console.log('  📊 NATIJA — BINO ANIQLASH ANIQLIGI');
  console.log('═'.repeat(66));
  console.log(`  ✅ O'tdi: ${passed}   ❌ Xato: ${failed}   📈 ${passed}/${total} (${Math.round(passed / total * 100)}%)`);
  console.log('\n  📋 XULOSA:');
  console.log('     • Bino markazida → aniq o\'sha bino, masofa <2m');
  console.log('     • Radius ±15m chegarada → ichkarida/tashqarida aniq ajratiladi');
  console.log('     • Binolar orasida → eng yaqin bino tanlanadi');
  console.log('     • Haversine masofa aniqligi: xato < 1 metr (DB = JS)');
  console.log('     • Bino almashganda admin panel real vaqtda yangilanadi');

  if (failed === 0) {
    console.log('\n  🎉 TIZIM BINONI METR ANIQLIGIDA TO\'G\'RI ANIQLAYDI!');
  } else {
    console.log('\n  ⚠️  XATOLAR:');
    errors.forEach(e => console.log('     • ' + e));
  }
  console.log('═'.repeat(66) + '\n');

  await pool.end();
  process.exitCode = failed === 0 ? 0 : 1;
})().catch(async e => { console.error('❌', e); try { await pool.end(); } catch (_) {} process.exitCode = 1; });
