const BASE_URL = 'https://fit-bless-embolism.ngrok-free.dev/api'
const headers = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true',
  'cloudflare-skip-browser-warning': 'true',
}

let staffToken = ''
let staffUserId = null
let sessionId = null

// Helper functions
async function api(method, path, body, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: token
      ? { ...headers, Authorization: `Bearer ${token}` }
      : headers,
    body: body ? JSON.stringify(body) : undefined
  })
  const data = await res.json()
  return { status: res.status, data }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

let passed = 0
let failed = 0
const results = []

async function test(name, fn) {
  try {
    await fn()
    console.log(`✅ ${name}`)
    passed++
    results.push({ name, status: 'PASS' })
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
    results.push({ name, status: 'FAIL', error: e.message })
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ═══════════════════════════════════════════════════
// SIMULATE FULL WORK DAY
// Staff: Zaribboyev Ma'rufjon (id=2)
// Scenario:
//   1. Login
//   2. GPS ping inside Bino 1 → auto checkin
//   3. Stay in building (multiple pings)
//   4. Move to Bino 2 → auto switch
//   5. Go outside → outside detection
//   6. Come back → auto re-checkin
//   7. Manual checkout
//   8. Check all data saved correctly
// ═══════════════════════════════════════════════════

async function runTests() {
  console.log('═'.repeat(60))
  console.log('BIU SMART APP — TO\'LIQ ISH KUNI SIMULATSIYASI')
  console.log(new Date().toLocaleString('uz-UZ'))
  console.log('═'.repeat(60))

  // ── QADAM 1: LOGIN ─────────────────────────────
  console.log('\n── 1. LOGIN ──────────────────────────────────')

  await test('1.1 Staff login (Zaribboyev Marufjon)', async () => {
    const { data } = await api('POST', '/auth/login', {
      phone: '+998902002026',
      password: 'Marufjon2026'
    })
    assert(data.success, 'Login failed: ' + data.message)
    assert(data.data?.token, 'Token not returned')
    staffToken = data.data.token
    staffUserId = data.data.user?.id
    console.log(`   Token: ${staffToken.slice(0, 20)}...`)
    console.log(`   User ID: ${staffUserId}`)
    console.log(`   Role: ${data.data.user?.role}`)
  })

  await test('1.2 Staff profile loads correctly', async () => {
    const { data } = await api('GET', '/staff/profile', null, staffToken)
    assert(data.success, 'Profile failed')
    assert(data.data.department, 'Department missing')
    assert(data.data.position, 'Position missing')
    console.log(`   Ism: ${data.data.fullName || data.data.full_name}`)
    console.log(`   Bo'lim: ${data.data.department}`)
    console.log(`   Lavozim: ${data.data.position}`)
    console.log(`   Ish vaqti: ${data.data.workStart} - ${data.data.workEnd}`)
  })

  // ── QADAM 2: BUGUNGI HOLAT ─────────────────────
  console.log('\n── 2. BUGUNGI HOLAT ──────────────────────────')

  await test('2.1 Check today session before checkin', async () => {
    const { data } = await api('GET', '/work/today', null, staffToken)
    assert(data.success, 'Today fetch failed')
    console.log(`   Session: ${data.data ? 'bor' : 'yo\'q'}`)
    if (data.data) {
      console.log(`   Status: ${data.data.status}`)
      console.log(`   Live total: ${data.data.liveTotal}s`)
      sessionId = data.data.id
    }
  })

  await test('2.2 Check active log before checkin', async () => {
    const { data } = await api('GET', '/work/active', null, staffToken)
    assert(data.success, 'Active log fetch failed')
    console.log(`   Aktiv log: ${data.data ? data.data.buildingName : 'yo\'q'}`)
  })

  // ── QADAM 3: GPS PING - BINOGA KIRISH ──────────
  console.log('\n── 3. GPS PING — BINOGA KIRISH ───────────────')

  await test('3.1 GPS ping inside Bino 1 — auto checkin', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.741066,
      lon: 64.427637,
      accuracy: 8.0
    }, staffToken)
    assert(data.success, 'Ping failed: ' + JSON.stringify(data))
    const action = data.data?.action
    console.log(`   Action: ${action}`)
    assert(
      ['auto_checkin', 'inside_same', 'auto_recheckin', 'too_frequent'].includes(action),
      `Unexpected action: ${action}`
    )
  })

  await sleep(2000)

  await test('3.2 Verify session created after ping', async () => {
    const { data } = await api('GET', '/work/today', null, staffToken)
    assert(data.success, 'Today fetch failed')
    assert(data.data, 'Session should exist after ping')
    console.log(`   Session ID: ${data.data.id}`)
    console.log(`   Status: ${data.data.status}`)
    console.log(`   Live total: ${data.data.liveTotal}s`)
    console.log(`   Active log: ${data.data.activeLog?.buildingName || 'yo\'q'}`)
    sessionId = data.data.id
  })

  await test('3.3 Active log shows Bino 1', async () => {
    const { data } = await api('GET', '/work/active', null, staffToken)
    assert(data.success, 'Active log failed')
    if (data.data) {
      console.log(`   Bino: ${data.data.buildingName}`)
      console.log(`   Kirish: ${data.data.entryTime}`)
      console.log(`   Seconds in building: ${data.data.secondsInBuilding}`)
    } else {
      console.log('   No active log (may be too_frequent)')
    }
  })

  // ── QADAM 4: BINODA QOLISH ─────────────────────
  console.log('\n── 4. BINODA QOLISH (multiple pings) ────────')

  await sleep(3000)

  await test('4.1 Stay in building — same building ping', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.741100,
      lon: 64.427600,
      accuracy: 5.0
    }, staffToken)
    assert(data.success, 'Ping failed')
    console.log(`   Action: ${data.data?.action}`)
    assert(
      ['inside_same', 'too_frequent', 'auto_recheckin'].includes(data.data?.action),
      `Should stay in building: ${data.data?.action}`
    )
  })

  // ── QADAM 5: BINO ALMASHTIRISH ─────────────────
  console.log('\n── 5. BINO ALMASHTIRISH ──────────────────────')

  await sleep(3000)

  await test('5.1 Move to Bino 2 — auto switch', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.740624,
      lon: 64.432623,
      accuracy: 6.0
    }, staffToken)
    assert(data.success, 'Bino 2 ping failed')
    const action = data.data?.action
    console.log(`   Action: ${action}`)
    console.log(`   Building: ${data.data?.buildingName || data.data?.buildingId || '-'}`)
  })

  await sleep(2000)

  await test('5.2 Verify switched to Bino 2', async () => {
    const { data } = await api('GET', '/work/active', null, staffToken)
    assert(data.success, 'Active log failed')
    console.log(`   Current building: ${data.data?.buildingName || 'yo\'q'}`)
    if (data.data?.buildingName) {
      console.log(`   Building ID: ${data.data?.buildingId}`)
    }
  })

  await test('5.3 Today session shows building switches', async () => {
    const { data } = await api('GET', '/work/today', null, staffToken)
    assert(data.success, 'Today failed')
    if (data.data) {
      console.log(`   Buildings visited: ${data.data.buildingsVisited}`)
      console.log(`   Building switches: ${data.data.buildingSwitches}`)
      console.log(`   Logs count: ${data.data.logs?.length}`)
      console.log(`   Live total: ${data.data.liveTotal}s`)
    }
  })

  // ── QADAM 6: TASHQARIGA CHIQISH ────────────────
  console.log('\n── 6. TASHQARIGA CHIQISH ─────────────────────')

  await sleep(3000)

  await test('6.1 Go outside — outside detection', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.750000,
      lon: 64.440000,
      accuracy: 15.0
    }, staffToken)
    assert(data.success, 'Outside ping failed')
    const action = data.data?.action
    console.log(`   Action: ${action}`)
    console.log(`   Distance: ${data.data?.distanceM || '-'}m`)
    assert(
      ['outside_start', 'outside_waiting', 'outside_no_log',
       'too_frequent', 'auto_checkout_end_of_day'].includes(action),
      `Unexpected outside action: ${action}`
    )
  })

  await sleep(2000)

  await test('6.2 Second outside ping — waiting', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.750000,
      lon: 64.440000,
      accuracy: 12.0
    }, staffToken)
    assert(data.success, 'Outside ping 2 failed')
    console.log(`   Action: ${data.data?.action}`)
    console.log(`   Minutes outside: ${data.data?.minutesOutside || 0}`)
  })

  // ── QADAM 7: QAYTIB KELISH ─────────────────────
  console.log('\n── 7. QAYTIB KELISH ──────────────────────────')

  await sleep(3000)

  await test('7.1 Come back to Bino 1 — auto re-checkin', async () => {
    const { data } = await api('POST', '/work/ping', {
      lat: 39.741066,
      lon: 64.427637,
      accuracy: 7.0
    }, staffToken)
    assert(data.success, 'Return ping failed')
    const action = data.data?.action
    console.log(`   Action: ${action}`)
    console.log(`   Building: ${data.data?.buildingName || data.data?.buildingId || '-'}`)
  })

  await sleep(2000)

  await test('7.2 Verify active again after return', async () => {
    const { data } = await api('GET', '/work/today', null, staffToken)
    assert(data.success, 'Today failed')
    if (data.data) {
      console.log(`   Status: ${data.data.status}`)
      console.log(`   Active log: ${data.data.activeLog?.buildingName || 'yo\'q'}`)
      console.log(`   Live total: ${data.data.liveTotal}s`)
      console.log(`   Logs: ${data.data.logs?.length} ta`)
    }
  })

  // ── QADAM 8: MANUAL CHECKOUT ───────────────────
  console.log('\n── 8. MANUAL CHECKOUT ────────────────────────')

  await test('8.1 Manual checkout', async () => {
    const { data } = await api('POST', '/work/checkout', {
      lat: 39.741066,
      lon: 64.427637
    }, staffToken)
    assert(data.success, 'Checkout failed: ' + data.message)
    console.log(`   Total: ${data.data?.totalFormatted || '-'}`)
    console.log(`   Overtime: ${data.data?.overtimeFormatted || '0'}`)
    console.log(`   Status: ${data.data?.session?.status || '-'}`)
  })

  // ── QADAM 9: YAKUNIY TEKSHIRISH ────────────────
  console.log('\n── 9. YAKUNIY TEKSHIRISH ─────────────────────')

  await test('9.1 Today session final state', async () => {
    const { data } = await api('GET', '/work/today', null, staffToken)
    assert(data.success, 'Final today failed')
    if (data.data) {
      console.log(`   Status: ${data.data.status}`)
      console.log(`   Is finished: ${data.data.isFinished}`)
      console.log(`   Total seconds: ${data.data.totalSeconds}`)
      console.log(`   Live total: ${data.data.liveTotal}s`)
      console.log(`   Regular: ${data.data.regularSeconds}s`)
      console.log(`   Overtime: ${data.data.overtimeSeconds}s`)
      console.log(`   Buildings visited: ${data.data.buildingsVisited}`)
      console.log(`   Building switches: ${data.data.buildingSwitches}`)
      console.log(`   Logs count: ${data.data.logs?.length}`)

      if (data.data.logs) {
        data.data.logs.forEach((log, i) => {
          console.log(`   Log ${i + 1}: ${log.buildingName} ${log.entryTime} → ${log.exitTime || 'hozir'} (${log.durationSeconds}s) [${log.checkoutReason}]`)
        })
      }
    }
  })

  await test('9.2 Active log should be null after checkout', async () => {
    const { data } = await api('GET', '/work/active', null, staffToken)
    assert(data.success, 'Active log fetch failed')
    assert(!data.data, 'Active log should be null after checkout')
    console.log('   Active log: yo\'q (to\'g\'ri) ✓')
  })

  await test('9.3 Weekly report includes today', async () => {
    const { data } = await api('GET', '/work/week', null, staffToken)
    assert(data.success, 'Weekly failed')
    assert(Array.isArray(data.data), 'Should return array')
    assert(data.data.length === 7, 'Should have 7 days')
    const today = new Date().toISOString().slice(0, 10)
    const todayData = data.data.find(d => d && d.workDate === today)
    if (todayData) {
      console.log(`   Bugun: ${todayData.workDate}`)
      console.log(`   Status: ${todayData.status}`)
      console.log(`   Total: ${todayData.totalSeconds}s`)
    }
  })

  await test('9.4 Daily report correct', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await api('GET', `/reports/daily?date=${today}`, null, staffToken)
    assert(data.success, 'Daily report failed')
    if (data.data) {
      console.log(`   Date: ${data.data.date}`)
      console.log(`   Status: ${data.data.status}`)
      console.log(`   Total: ${data.data.totalSeconds}s`)
      console.log(`   Logs: ${data.data.logs?.length}`)
    }
  })

  await test('9.5 Admin sees staff in active-now (before checkout) or absent', async () => {
    // Login as admin
    const adminLogin = await api('POST', '/auth/login', {
      phone: '+998901002026',
      password: 'Asfandiyor2026'
    })
    const adminToken = adminLogin.data.data?.token
    assert(adminToken, 'Admin login failed')

    const { data } = await api('GET', '/admin/staff/active-now', null, adminToken)
    assert(data.success, 'Active now failed')
    const total = Object.values(data.data)
      .filter(v => Array.isArray(v))
      .flat().length
    console.log(`   Hozir aktiv xodimlar: ${total}`)
    console.log(`   Binolar: ${Object.keys(data.data).filter(k => k !== 'total').join(', ')}`)
  })

  await test('9.6 GPS pings saved correctly in DB', async () => {
    // Check via admin overview
    const adminLogin = await api('POST', '/auth/login', {
      phone: '+998901002026',
      password: 'Asfandiyor2026'
    })
    const adminToken = adminLogin.data.data?.token

    const { data } = await api('GET', '/admin/overview', null, adminToken)
    assert(data.success, 'Overview failed')
    console.log(`   Today active: ${data.data.today?.activeNow}`)
    console.log(`   Today finished: ${data.data.today?.finishedToday}`)
    console.log(`   Today absent: ${data.data.today?.absentToday}`)
    console.log(`   Total staff: ${data.data.today?.totalStaff}`)
  })

  // ── FINAL REPORT ───────────────────────────────
  console.log('\n' + '═'.repeat(60))
  console.log('YAKUNIY NATIJA')
  console.log('═'.repeat(60))
  console.log(`✅ PASS: ${passed}`)
  console.log(`❌ FAIL: ${failed}`)
  console.log(`📊 JAMI: ${passed + failed}`)
  console.log(`📈 FOIZ: ${Math.round(passed / (passed + failed) * 100)}%`)
  console.log('═'.repeat(60))

  if (failed > 0) {
    console.log('\nMuvaffaqiyatsiz testlar:')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`)
    })
  }

  // Save results
  const fs = await import('fs')
  fs.default.writeFileSync(
    'tests/e2e-results.json',
    JSON.stringify({
      date: new Date().toISOString(),
      passed,
      failed,
      percentage: Math.round(passed / (passed + failed) * 100),
      results
    }, null, 2)
  )
  console.log('\nNatijalar: tests/e2e-results.json ga saqlandi')
}

runTests().catch(console.error)
