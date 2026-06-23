const BASE = 'http://localhost:5000';
async function api(method, path, body, tok) {
  const r = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await r.json().catch(() => ({}));
  return { status: r.status, raw };
}
async function run() {
  const a = await api('POST', '/api/auth/login', { phone: '+998901000014', password: 'asfan2005A@' });
  console.log('admin raw:', JSON.stringify(a.raw).slice(0, 300));
  const tok = a.raw?.data?.token || a.raw?.token;
  if (!tok) { console.log('token yoq'); return; }

  const s43 = await api('GET', '/api/admin/staff/43', null, tok);
  console.log('\nstaff/43 raw:', JSON.stringify(s43.raw).slice(0, 400));
}
run().catch(console.error);
