// ID=46 uchun aktiv log yo'q — live /ping yuborib auto_recheckin qilamiz
require('dotenv').config();
const BASE = 'http://localhost:5000';

async function api(method, path, body, tok) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.json().catch(() => ({}));
  return { status: r.status, data: raw?.data ?? raw };
}

const BINO1 = { lat: 39.74107, lon: 64.42764 };

async function run() {
  console.log('\n  ID=46 — aktiv log tiklash (live ping)');

  const loginR = await api('POST', '/api/auth/login', { phone: '+998901000031', password: 'Biu@000031' });
  const token = loginR.data?.token;
  if (!token) { console.log('  ❌ Login xato:', loginR.data); return; }
  console.log('  ✅ Login OK');

  // Live /ping — processPing (NOW() ishlatadi, hozirgi vaqt)
  const r = await api('POST', '/api/work/ping', {
    lat: BINO1.lat + (Math.random() * 0.0002 - 0.0001),
    lon: BINO1.lon + (Math.random() * 0.0002 - 0.0001),
    accuracy: 9,
  }, token);

  console.log(`  📡 Ping result: ${r.data?.action} | status=${r.status}`);

  await new Promise(res => setTimeout(res, 500));

  const tod = await api('GET', '/api/work/today', null, token);
  const ses = tod.data;
  console.log(`  📋 Session: id=${ses?.id} | kirish=${ses?.first_entry_time} | status=${ses?.status}`);
  console.log(`  ${ses?.id ? '✅ Tayyor — admin panelda bino ko\'rinadi' : '⚠️  Session topilmadi'}\n`);
}

run().catch(e => { console.error('Xato:', e.message); process.exit(1); });
