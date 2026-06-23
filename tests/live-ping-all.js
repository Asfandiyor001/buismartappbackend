// Barcha 12 test xodim uchun live ping — is_active log tiklash
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

const BINO1 = { lat: 39.74107, lon: 64.42764 };
const BINO2 = { lat: 39.74065, lon: 64.43265 };

const STAFF = [
  { id: 43, phone: '+998901000028', pwd: 'Biu@000028', bino: BINO1 },
  { id: 44, phone: '+998901000029', pwd: 'Biu@000029', bino: BINO1 },
  { id: 46, phone: '+998901000031', pwd: 'Biu@000031', bino: BINO1 },
  { id: 47, phone: '+998901000032', pwd: 'Biu@000032', bino: BINO1 },
  { id: 48, phone: '+998901000033', pwd: 'Biu@000033', bino: BINO2 },
  { id: 49, phone: '+998901000034', pwd: 'Biu@000034', bino: BINO1 },
  { id: 50, phone: '+998901000035', pwd: 'Biu@000035', bino: BINO1 },
  { id: 51, phone: '+998901000036', pwd: 'Biu@000036', bino: BINO2 },
  { id: 52, phone: '+998905002026', pwd: 'Biu@002026', bino: BINO1 },
  { id: 53, phone: '+998901000038', pwd: 'Biu@000038', bino: BINO1 },
  { id: 54, phone: '+998901000039', pwd: 'Biu@000039', bino: BINO2 },
  { id: 55, phone: '+998901000040', pwd: 'Biu@000040', bino: BINO1 },
];

async function run() {
  console.log('\n  📡 12 xodim — live ping (bino ko\'rsatish uchun)\n');

  for (let i = 0; i < STAFF.length; i++) {
    const s = STAFF[i];
    if (i > 0) await sleep(6000); // rate limiter: 10/daqiqa

    const loginR = await api('POST', '/api/auth/login', { phone: s.phone, password: s.pwd });
    const token = loginR.data?.token;
    if (!token) {
      console.log(`  ❌ ID=${s.id} login xato`);
      continue;
    }

    const r = await api('POST', '/api/work/ping', {
      lat: s.bino.lat + (Math.random() * 0.0001 - 0.00005),
      lon: s.bino.lon + (Math.random() * 0.0001 - 0.00005),
      accuracy: 9,
    }, token);

    const action = r.data?.action || r.status;
    const binoName = s.bino === BINO1 ? 'Bino-1' : 'Bino-2';
    console.log(`  ID=${s.id} → ${action} (${binoName})`);
  }

  console.log('\n  ✅ Tayyor! Admin → Live Presence da binolar ko\'rinadi.\n');
}

run().catch(e => { console.error('Xato:', e.message); process.exit(1); });
