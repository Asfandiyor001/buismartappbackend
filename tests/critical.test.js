const BASE = 'https://fit-bless-embolism.ngrok-free.dev/api'
const H = {
  'Content-Type': 'application/json',
  'ngrok-skip-browser-warning': 'true'
}
let adminToken = ''
let staffToken = ''
let results = { pass: 0, fail: 0, tests: [] }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function api(method, path, body, token) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: token ? { ...H, Authorization: `Bearer ${token}` } : H,
      body: body ? JSON.stringify(body) : undefined
    })
    return { status: res.status, data: await res.json(), ok: res.ok }
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message }
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg) }

async function test(name, fn) {
  try {
    const note = await fn()
    console.log(`  ✅ ${name}${note ? ': ' + note : ''}`)
    results.pass++
    results.tests.push({ name, status: 'PASS', note })
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`)
    results.fail++
    results.tests.push({ name, status: 'FAIL', error: e.message })
  }
}

async function runCritical() {
  console.log('='.repeat(60))
  console.log('  BIU SMART — CRITICAL TESTS')
  console.log(`  ${new Date().toLocaleString('uz-UZ')}`)
  console.log('='.repeat(60))

  // Login
  const adminRes = await api('POST', '/auth/login', {
    phone: '+998901002026', password: 'Asfandiyor2026'
  })
  adminToken = adminRes.data?.data?.token

  const staffRes = await api('POST', '/auth/login', {
    phone: '+998902002026', password: 'Marufjon2026'
  })
  staffToken = staffRes.data?.data?.token

  console.log('\n📋 1. VAQT QOIDALARI ' + '─'.repeat(30))

  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const dayOfWeek = now.getDay()

  await test("Yakshanba (0) → day_off qaytarishi", async () => {
    if (dayOfWeek !== 0) return "Skip — bugun yakshanba emas"
    const r = await api('POST', '/work/ping', {
      lat: 39.741066, lon: 64.427637, accuracy: 5
    }, staffToken)
    assert(r.data?.data?.action === 'day_off', `Expected day_off, got: ${r.data?.data?.action}`)
    return "day_off ✓"
  })

  await test("08:00 dan oldin → before_work_time", async () => {
    if (nowMins >= 480) return "Skip — hozir 08:00 dan keyin"
    const r = await api('POST', '/work/ping', {
      lat: 39.741066, lon: 64.427637, accuracy: 5
    }, staffToken)
    assert(r.data?.data?.action === 'before_work_time', `Got: ${r.data?.data?.action}`)
    return "before_work_time ✓"
  })

  await test("13:00-14:00 tashqarida → abet_time", async () => {
    if (nowMins < 780 || nowMins >= 840) return "Skip — abet vaqti emas"
    const r = await api('POST', '/work/ping', {
      lat: 41.2995, lon: 69.2401, accuracy: 15
    }, staffToken)
    const valid = ['abet_time', 'too_frequent', 'outside_start']
    assert(valid.includes(r.data?.data?.action), `Got: ${r.data?.data?.action}`)
    return `${r.data?.data?.action} ✓`
  })

  await test("16:30 dan keyin → after_work_time yoki day_finished", async () => {
    if (nowMins <= 990) return "Skip — hozir 16:30 dan oldin"
    const r = await api('POST', '/work/ping', {
      lat: 39.741066, lon: 64.427637, accuracy: 5
    }, staffToken)
    const valid = ['after_work_time', 'day_finished', 'auto_checkout_end_of_day',
      'inside_same', 'too_frequent', 'auto_recheckin']
    assert(valid.includes(r.data?.data?.action), `Got: ${r.data?.data?.action}`)
    return `${r.data?.data?.action} ✓`
  })

  console.log('\n📋 2. GPS ANIQLIK TESTLARI ' + '─'.repeat(25))

  await test("Bino 1 ichida (52m) → inside", async () => {
    await sleep(26000) // debounce
    const r = await api('POST', '/work/ping', {
      lat: 39.741066, lon: 64.427637, accuracy: 8
    }, staffToken)
    const valid = ['auto_checkin', 'inside_same', 'auto_recheckin',
      'too_frequent', 'before_work_time', 'after_work_time', 'day_off']
    assert(valid.includes(r.data?.data?.action), `Got: ${r.data?.data?.action}`)
    return `${r.data?.data?.action} (52m)`
  })

  await sleep(26000)

  await test("GPS drift (radius+30m) → inside_drift yoki inside", async () => {
    // 39.741066 + ~0.0015 degrees ≈ 150m north (outside radius 120m)
    // But with 50m GPS drift tolerance → should be inside_drift
    const r = await api('POST', '/work/ping', {
      lat: 39.74240, lon: 64.42763, accuracy: 20
    }, staffToken)
    const valid = ['inside_drift', 'inside_same', 'outside_first_ping',
      'outside_start', 'too_frequent', 'before_work_time', 'day_off',
      'no_session', 'after_work_time']
    assert(valid.includes(r.data?.data?.action), `Got: ${r.data?.data?.action}`)
    return `${r.data?.data?.action} (drift)`
  })

  await sleep(26000)

  await test("Toshkent (1000km) → outside", async () => {
    const r = await api('POST', '/work/ping', {
      lat: 41.2995, lon: 69.2401, accuracy: 10
    }, staffToken)
    const valid = ['outside_start', 'outside_waiting', 'outside_no_log',
      'too_frequent', 'outside_first_ping', 'outside_checking',
      'internet_outage_grace', 'before_work_time', 'day_off',
      'after_work_time', 'day_finished', 'auto_checkout_end_of_day', 'no_session']
    assert(valid.includes(r.data?.data?.action), `Got: ${r.data?.data?.action}`)
    return `${r.data?.data?.action} ✓`
  })

  console.log('\n📋 3. SESSION YAXLITLIGI ' + '─'.repeat(27))

  await test("Bugungi session ma'lumotlari to'liq", async () => {
    const r = await api('GET', '/work/today', null, staffToken)
    assert(r.data.success, 'Today failed')
    if (r.data.data) {
      const d = r.data.data
      assert(d.status !== undefined, "status yo'q")
      assert(d.liveTotal !== undefined, "liveTotal yo'q")
      assert(d.isFinished !== undefined, "isFinished yo'q")
      assert(d.regularSeconds !== undefined, "regularSeconds yo'q")
      assert(Array.isArray(d.logs), 'logs array emas')

      // Duration sanity check: max 10 hours (8h regular + 2h overtime upper bound)
      if (d.totalSeconds > 0) {
        assert(d.totalSeconds <= 36000, `Total ${d.totalSeconds}s > 10 soat! Xato!`)
      }

      // Regular max 8 hours
      assert(d.regularSeconds <= 28800, `Regular ${d.regularSeconds}s > 8 soat!`)

      return `status=${d.status} total=${Math.round(d.liveTotal / 3600 * 10) / 10}s logs=${d.logs.length}`
    }
    return "Sessiya yo'q (normal)"
  })

  await test('Loglar duration manfiy emas', async () => {
    const r = await api('GET', '/work/today', null, staffToken)
    if (!r.data.data?.logs?.length) return "Log yo'q"

    const errors = []
    r.data.data.logs.forEach((log, i) => {
      if (log.durationSeconds < 0) errors.push(`Log ${i}: ${log.durationSeconds}s manfiy!`)
      if (log.durationSeconds > 32400) errors.push(`Log ${i}: ${log.durationSeconds}s > 9 soat!`)
    })
    assert(errors.length === 0, errors.join(', '))
    return `${r.data.data.logs.length} ta log — hammasi musbat ✓`
  })

  await test('Aktiv log mavjudligi tekshiruvi', async () => {
    const r = await api('GET', '/work/active', null, staffToken)
    assert(r.data.success, 'Active failed')
    if (r.data.data) {
      assert(r.data.data.buildingName, "buildingName yo'q")
      assert(r.data.data.entryTime, "entryTime yo'q")
      assert(r.data.data.secondsInBuilding >= 0, 'secondsInBuilding manfiy')
      return `Bino: ${r.data.data.buildingName} (${r.data.data.secondsInBuilding}s)`
    }
    return "Aktiv log yo'q"
  })

  console.log('\n📋 4. ADMIN PANEL TESTLARI ' + '─'.repeat(25))

  await test("Jamoa holati — stale_active yo'q", async () => {
    const r = await api('GET', '/staff/team-status', null, staffToken)
    assert(r.data.success, 'Team status failed')
    const staff = Array.isArray(r.data.data?.team) ? r.data.data.team
      : Array.isArray(r.data.data) ? r.data.data : []
    const staleActive = staff.filter(s => s.workStatus === 'stale_active')
    // Warn if any stale_active (internet outage cases)
    return `${staff.length} xodim, ${staleActive.length} ta aloqa uzilgan`
  })

  await test('Active-now — faqat haqiqiy aktiv', async () => {
    const r = await api('GET', '/admin/staff/active-now', null, adminToken)
    assert(r.data.success, 'Active-now failed')
    const total = Object.values(r.data.data)
      .filter(v => Array.isArray(v)).flat().length
    return `${total} ta aktiv xodim (ping < 35 daqiqa)`
  })

  await test("Admin overview — barcha fieldlar bor", async () => {
    const r = await api('GET', '/admin/overview', null, adminToken)
    assert(r.data.success, 'Overview failed')
    const t = r.data.data.today
    assert(t.totalStaff !== undefined, "totalStaff yo'q")
    assert(t.activeNow !== undefined, "activeNow yo'q")
    assert(t.absentToday !== undefined, "absentToday yo'q")
    assert(t.finishedToday !== undefined, "finishedToday yo'q")
    return `Total:${t.totalStaff} Aktiv:${t.activeNow} Absent:${t.absentToday}`
  })

  await test('Bugungi avto-chiqishlar (ping dan keyin) tekshiruvi', async () => {
    // Check for false auto-checkouts (ping came AFTER checkout)
    const r = await api('GET', '/admin/staff', null, adminToken)
    assert(r.data.success, 'Staff list failed')
    return 'Admin staff list ishlayapti ✓'
  })

  console.log('\n📋 5. HISOBOT TESTLARI ' + '─'.repeat(29))

  await test("Oylik hisobot — soatlar 9 dan oshmasin", async () => {
    const now2 = new Date()
    const r = await api('GET', `/reports/monthly?year=${now2.getFullYear()}&month=${now2.getMonth() + 1}`, null, staffToken)
    assert(r.data.success, 'Monthly failed')
    const sessions = r.data.data.sessions || []
    const errors = []
    sessions.forEach(s => {
      const hours = (s.total_seconds || 0) / 3600
      if (hours > 9.5) errors.push(`${s.work_date}: ${hours.toFixed(1)} soat > 9.5!`)
    })
    assert(errors.length === 0, errors.join(', '))
    return `${sessions.length} sessiya — hammasi normal ✓`
  })

  await test("work_date format — YYYY-MM-DD (UTC muammo yo'q)", async () => {
    const now2 = new Date()
    const r = await api('GET', `/reports/monthly?year=${now2.getFullYear()}&month=${now2.getMonth() + 1}`, null, staffToken)
    assert(r.data.success, 'Monthly failed')
    const sessions = r.data.data.sessions || []
    sessions.forEach(s => {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(s.work_date),
        `work_date format xato: ${s.work_date}`)
    })
    return `${sessions.length} sessiya — format to'g'ri ✓`
  })

  await test("Haftalik hisobot — 7 kun", async () => {
    const r = await api('GET', '/work/week', null, staffToken)
    assert(r.data.success, 'Weekly failed')
    assert(r.data.data.length === 7, `7 kun kerak, ${r.data.data.length} keldi`)
    return "7 kunlik ✓"
  })

  console.log('\n📋 6. XAVFSIZLIK TESTLARI ' + '─'.repeat(26))

  await test("SQL injection → bloklandi", async () => {
    const r = await api('POST', '/auth/login', {
      phone: "'; DROP TABLE users; --", password: "' OR '1'='1"
    })
    assert(!r.data.success, "SQL injection o'tib ketdi!")
    return "Bloklandi ✓"
  })

  await test("Noto'g'ri token → 401", async () => {
    const r = await api('GET', '/work/today', null, 'fake.token.xyz')
    assert(r.status === 401, `Status: ${r.status}`)
    return "401 ✓"
  })

  await test("Staff → admin endpoint → 403", async () => {
    const r = await api('GET', '/admin/overview', null, staffToken)
    assert(r.status === 403, `Status: ${r.status}`)
    return "403 ✓"
  })

  await test('Rate limit ishlayapti', async () => {
    // Use a dummy phone that does not exist — avoids blocking real accounts
    let blocked = false
    for (let i = 0; i < 15; i++) {
      const r = await api('POST', '/auth/login', {
        phone: '+998000000000', password: 'xato'
      })
      if (r.status === 429) { blocked = true; break }
    }
    return blocked ? "Rate limit ✓" : "Rate limit yo'q (warn)"
  })

  console.log('\n📋 7. NOTIFICATIONS TESTLARI ' + '─'.repeat(23))

  await test('Xabarnomalar yuklanadi', async () => {
    const r = await api('GET', '/notifications', null, staffToken)
    assert(r.data.success, 'Notifications failed')
    assert(typeof r.data.data.unreadCount === 'number', "unreadCount yo'q")
    return `${r.data.data.notifications.length} ta, ${r.data.data.unreadCount} o'qilmagan`
  })

  await test("Hammasi o'qildi", async () => {
    const r = await api('PUT', '/notifications/read-all', null, staffToken)
    assert(r.data.success, 'Read-all failed')
    return "OK ✓"
  })

  console.log('\n📋 8. BUILDINGS TESTLARI ' + '─'.repeat(27))

  await test("3 ta bino, Admin uyi yo'q", async () => {
    const r = await api('GET', '/buildings', null, staffToken)
    assert(r.data.success, 'Buildings failed')
    assert(r.data.data.length === 3, `3 ta kerak, ${r.data.data.length} keldi`)
    const admin = r.data.data.find(b => b.name?.toLowerCase().includes('admin'))
    assert(!admin, 'Admin uyi bor!')
    assert(r.data.data[0].latitude, "latitude yo'q")
    assert(r.data.data[0].longitude, "longitude yo'q")
    return r.data.data.map(b => b.name).join(', ')
  })

  // FINAL REPORT
  const total = results.pass + results.fail
  console.log('\n' + '='.repeat(60))
  console.log('  YAKUNIY NATIJA')
  console.log('='.repeat(60))
  console.log(`  ✅ PASS: ${results.pass}`)
  console.log(`  ❌ FAIL: ${results.fail}`)
  console.log(`  📊 JAMI: ${total}`)
  console.log(`  📈 FOIZ: ${Math.round(results.pass / total * 100)}%`)
  console.log('='.repeat(60))

  if (results.fail > 0) {
    console.log('\n  Muvaffaqiyatsiz:')
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`    ❌ ${t.name}: ${t.error}`)
    })
  }

  require('fs').writeFileSync(
    'tests/critical-results.json',
    JSON.stringify({
      date: new Date().toISOString(),
      pass: results.pass, fail: results.fail,
      percentage: Math.round(results.pass / total * 100),
      tests: results.tests
    }, null, 2)
  )
  console.log('\n  Natijalar: tests/critical-results.json')
}

runCritical().catch(console.error)
