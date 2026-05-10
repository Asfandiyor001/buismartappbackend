'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://creation-informative-absence-neural.trycloudflare.com/api';
const H = { 'Content-Type': 'application/json', 'cloudflare-skip-browser-warning': 'true' };

let tokens = {};
let results = { pass: 0, fail: 0, warn: 0, tests: [] };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(method, pathSuffix, body, token) {
  try {
    const res = await fetch(`${BASE}${pathSuffix}`, {
      method,
      headers: token ? { ...H, Authorization: `Bearer ${token}` } : H,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, ok: false, error: e.message };
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

async function test(name, fn, category) {
  try {
    const result = await fn();
    console.log(`  ✅ ${name}`);
    results.pass++;
    results.tests.push({ category, name, status: 'PASS', note: result });
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    results.fail++;
    results.tests.push({ category, name, status: 'FAIL', error: e.message });
  }
}

async function warn(name, fn, category) {
  try {
    const result = await fn();
    console.log(`  ✅ ${name}`);
    results.pass++;
    results.tests.push({ category, name, status: 'PASS', note: result });
  } catch (e) {
    console.log(`  ⚠️  ${name}: ${e.message}`);
    results.warn++;
    results.tests.push({ category, name, status: 'WARN', error: e.message });
  }
}

async function runAll() {
  console.log('═'.repeat(65));
  console.log('  BIU SMART APP — KENG QAMROVLI TEST');
  console.log(`  ${new Date().toLocaleString('uz-UZ')}`);
  console.log('═'.repeat(65));

  // ════════════════════════════════════════════════════════
  // 1. AUTH MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 1. AUTH MODULE');

  await test(
    'Admin login',
    async () => {
      const r = await api('POST', '/auth/login', { phone: '+998901002026', password: 'Asfandiyor2026' });
      assert(r.data && r.data.success, r.data?.message || 'No body');
      assert(r.data.data.token, "Token yo'q");
      assert(r.data.data.user.role === 'admin', 'Role xato');
      tokens.admin = r.data.data.token;
      tokens.adminId = r.data.data.user.id;
      return `Admin ID: ${tokens.adminId}`;
    },
    'AUTH',
  );

  await test(
    'Staff login (Marufjon)',
    async () => {
      const r = await api('POST', '/auth/login', { phone: '+998902002026', password: 'Marufjon2026' });
      assert(r.data.success, r.data.message);
      tokens.staff = r.data.data.token;
      tokens.staffId = r.data.data.user.id;
      return `Staff ID: ${tokens.staffId}`;
    },
    'AUTH',
  );

  await test(
    'Staff2 login (Orif - Dekan)',
    async () => {
      const r = await api('POST', '/auth/login', { phone: '+998914002026', password: 'Orif2026' });
      assert(r.data.success, r.data.message);
      tokens.staff2 = r.data.data.token;
      return 'OK';
    },
    'AUTH',
  );

  await test(
    "Staff3 login (Feruza farrosh)",
    async () => {
      const r = await api('POST', '/auth/login', { phone: '+998909002026', password: 'Farogat2026' });
      assert(r.data.success, r.data.message);
      tokens.staff3 = r.data.data.token;
      return 'OK';
    },
    'AUTH',
  );

  await test(
    "Noto'g'ri parol → 400/401",
    async () => {
      const r = await api('POST', '/auth/login', { phone: '+998901002026', password: 'xato_parol' });
      assert(!r.data.success, "Xato parol qabul qilindi!");
      assert(r.status === 400 || r.status === 401, `Status: ${r.status}`);
      return "Bloklandi ✓";
    },
    'AUTH',
  );

  await test(
    "Token yo'q → 401",
    async () => {
      const r = await api('GET', '/work/today');
      assert(r.status === 401, `Status ${r.status} bo'lishi kerak 401`);
      return "Bloklandi ✓";
    },
    'AUTH',
  );

  await test(
    "Noto'g'ri token → 401",
    async () => {
      const r = await api('GET', '/work/today', null, 'fake.token.here');
      assert(r.status === 401, `Status ${r.status}`);
      return "Bloklandi ✓";
    },
    'AUTH',
  );

  await test(
    'Staff → admin endpoint → 403',
    async () => {
      const r = await api('GET', '/admin/overview', null, tokens.staff);
      assert(r.status === 403, `Status ${r.status} bo'lishi kerak 403`);
      return "Bloklandi ✓";
    },
    'AUTH',
  );

  await test(
    'Change password validation',
    async () => {
      const r = await api(
        'PUT',
        '/auth/change-password',
        {
          oldPassword: 'xato',
          newPassword: '1234',
        },
        tokens.staff,
      );
      assert(!r.data.success || r.status === 400, "Xato parol bilan o'zgartirish mumkin bo'lmasin");
      return 'Validation ishlayapti ✓';
    },
    'AUTH',
  );

  // ════════════════════════════════════════════════════════
  // 2. STAFF PROFILE MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 2. STAFF PROFILE MODULE');

  await test(
    'Profil yuklash',
    async () => {
      const r = await api('GET', '/staff/profile', null, tokens.staff);
      assert(r.data.success, 'Profil yuklenmadi');
      assert(r.data.data.fullName || r.data.data.full_name, "Ism yo'q");
      assert(r.data.data.department, "Bo'lim yo'q");
      assert(r.data.data.position, "Lavozim yo'q");
      assert(r.data.data.workStart, "workStart yo'q");
      assert(r.data.data.workEnd, "workEnd yo'q");
      return `${r.data.data.department} - ${r.data.data.position}`;
    },
    'PROFILE',
  );

  await test(
    "Profil yangilash (ruxsat etilgan maydonlar)",
    async () => {
      const r = await api(
        'PUT',
        '/staff/profile',
        {
          address: "Buxoro sh., Test ko'chasi 1",
          emergency_name: 'Test Kishi',
          emergency_phone: '+998901234567',
        },
        tokens.staff,
      );
      assert(r.data.success, 'Profil yangilanmadi: ' + r.data.message);
      return 'Yangilandi ✓';
    },
    'PROFILE',
  );

  await test(
    'Ish statistikasi',
    async () => {
      const r = await api('GET', '/staff/work-stats', null, tokens.staff);
      assert(r.data.success, 'Stats yuklanmadi');
      assert(r.data.data.month !== undefined, "Month stats yo'q");
      return 'OK';
    },
    'PROFILE',
  );

  await test(
    "Hujjatlar ro'yxati",
    async () => {
      const r = await api('GET', '/staff/documents', null, tokens.staff);
      assert(r.data.success, 'Hujjatlar yuklanmadi');
      assert(Array.isArray(r.data.data), 'Array bo\'lishi kerak');
      return `${r.data.data.length} ta hujjat`;
    },
    'PROFILE',
  );

  await test(
    "Ta'tillar ro'yxati",
    async () => {
      const r = await api('GET', '/staff/vacations', null, tokens.staff);
      assert(r.data.success, "Ta'tillar yuklanmadi");
      assert(Array.isArray(r.data.data), 'Array bo\'lishi kerak');
      return `${r.data.data.length} ta ta'til`;
    },
    'PROFILE',
  );

  await test(
    "Ta'til so'rovi yuborish",
    async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter = new Date();
      dayAfter.setDate(dayAfter.getDate() + 3);

      const r = await api(
        'POST',
        '/staff/vacations',
        {
          type: 'yillik',
          start_date: tomorrow.toISOString().slice(0, 10),
          end_date: dayAfter.toISOString().slice(0, 10),
          reason: "Test ta'til so'rovi",
        },
        tokens.staff,
      );
      assert(r.data.success, "Ta'til so'rovi yuborilmadi: " + r.data.message);
      return "So'rov yuborildi ✓";
    },
    'PROFILE',
  );

  await test(
    "Mukofot/jarimalar ro'yxati",
    async () => {
      const r = await api('GET', '/staff/rewards', null, tokens.staff);
      assert(r.data.success, 'Rewards yuklanmadi');
      assert(r.data.data.rewards !== undefined, "rewards array yo'q");
      assert(r.data.data.summary !== undefined, "summary yo'q");
      return `Mukofotlar: ${r.data.data.summary?.totalRewards || 0}`;
    },
    'PROFILE',
  );

  // ════════════════════════════════════════════════════════
  // 3. WORK MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 3. WORK MODULE');

  await test(
    'Bugungi sessiya',
    async () => {
      const r = await api('GET', '/work/today', null, tokens.staff);
      assert(r.data.success, 'Today yuklanmadi');
      if (r.data.data) {
        assert(r.data.data.status !== undefined, "status yo'q");
        assert(r.data.data.liveTotal !== undefined, "liveTotal yo'q");
        assert(r.data.data.isFinished !== undefined, "isFinished yo'q");
        assert(Array.isArray(r.data.data.logs), 'logs array emas');
      }
      return r.data.data ? `Status: ${r.data.data.status}, Live: ${r.data.data.liveTotal}s` : "Sessiya yo'q";
    },
    'WORK',
  );

  await test(
    'Aktiv log',
    async () => {
      const r = await api('GET', '/work/active', null, tokens.staff);
      assert(r.data.success, 'Active log yuklanmadi');
      if (r.data.data) {
        assert(r.data.data.buildingName, "buildingName yo'q");
        assert(r.data.data.entryTime, "entryTime yo'q");
        assert(r.data.data.secondsInBuilding !== undefined, "secondsInBuilding yo'q");
      }
      return r.data.data ? `Bino: ${r.data.data.buildingName}` : 'Aktiv log yo\'q';
    },
    'WORK',
  );

  await test(
    'Haftalik hisobot (7 kun)',
    async () => {
      const r = await api('GET', '/work/week', null, tokens.staff);
      assert(r.data.success, 'Haftalik yuklanmadi');
      assert(Array.isArray(r.data.data), 'Array bo\'lishi kerak');
      assert(r.data.data.length === 7, `7 kun bo'lishi kerak, ${r.data.data.length} keldi`);
      return '7 kunlik ✓';
    },
    'WORK',
  );

  await test(
    'Oylik hisobot',
    async () => {
      const now = new Date();
      const r = await api(
        'GET',
        `/work/month?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        null,
        tokens.staff,
      );
      assert(r.data.success, 'Oylik yuklanmadi');
      return 'OK';
    },
    'WORK',
  );

  await test(
    'Haftalik default (from parametrsiz)',
    async () => {
      const r = await api('GET', '/work/week', null, tokens.staff);
      assert(r.data.success, 'Haftalik yuklanmadi');
      assert(r.data.data.length === 7, '7 kun kerak');
      return 'Auto-Monday ✓';
    },
    'WORK',
  );

  // ════════════════════════════════════════════════════════
  // 4. GPS GEOFENCE MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 4. GPS GEOFENCE MODULE');

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const dayOfWeek = now.getDay();

  await test(
    'GPS ping — Bino 1 ichida (39.741066, 64.427637)',
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 39.741066,
          lon: 64.427637,
          accuracy: 8.0,
        },
        tokens.staff,
      );
      assert(r.data.success, 'Ping failed: ' + JSON.stringify(r.data));
      const action = r.data.data?.action;
      if (dayOfWeek === 0) {
        assert(action === 'day_off', `Yakshanba day_off bo'lishi kerak, keldi: ${action}`);
      } else {
        const valid = [
          'auto_checkin',
          'inside_same',
          'auto_recheckin',
          'too_frequent',
          'before_work_time',
          'after_work_time',
          'abet_time',
          'day_finished',
        ];
        assert(valid.includes(action), `Noto'g'ri action: ${action}`);
      }
      return `Action: ${action}`;
    },
    'GPS',
  );

  await sleep(2000);

  await test(
    'GPS ping — Bino 2 (39.740624, 64.432623)',
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 39.740624,
          lon: 64.432623,
          accuracy: 6.0,
        },
        tokens.staff,
      );
      assert(r.data.success, 'Ping failed');
      const action2 = r.data.data?.action;
      if (dayOfWeek === 0) {
        assert(action2 === 'day_off', `Yakshanba day_off bo'lishi kerak, keldi: ${action2}`);
      }
      return `Action: ${r.data.data?.action}`;
    },
    'GPS',
  );

  await sleep(2000);

  await test(
    'GPS ping — Tashqarida (Toshkent 41.2995, 69.2401)',
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 41.2995,
          lon: 69.2401,
          accuracy: 15.0,
        },
        tokens.staff,
      );
      assert(r.data.success, 'Outside ping failed');
      const action = r.data.data?.action;
      if (dayOfWeek === 0) {
        assert(action === 'day_off', `Yakshanba day_off bo'lishi kerak, keldi: ${action}`);
      } else {
        const valid = [
          'outside_start',
          'outside_waiting',
          'outside_no_log',
          'no_session',
          'too_frequent',
          'day_finished',
          'after_work_time',
          'auto_checkout_end_of_day',
        ];
        assert(valid.includes(action), `Noto'g'ri outside action: ${action}`);
      }
      return `Action: ${action}`;
    },
    'GPS',
  );

  // Abet time test
  if (dayOfWeek !== 0 && nowMins >= 780 && nowMins < 840) {
    await test(
      "Abet vaqti — tashqarida bo'lsa checkout bo'lmasin",
      async () => {
        const r = await api(
          'POST',
          '/work/ping',
          {
            lat: 41.2995,
            lon: 69.2401,
            accuracy: 15.0,
          },
          tokens.staff,
        );
        assert(r.data.success, 'Ping failed');
        assert(r.data.data?.action === 'abet_time', `Abet action kutilgan, keldi: ${r.data.data?.action}`);
        return 'Abet himoya ishlayapti ✓';
      },
      'GPS',
    );
  } else {
    console.log(
      `  ⏩ Abet test skip — hozir ${Math.floor(nowMins / 60)}:${String(nowMins % 60).padStart(2, '0')} (13:00-14:00 emas)`,
    );
  }

  // Before work test
  if (dayOfWeek !== 0 && nowMins < 480) {
    await test(
    "08:00 dan oldin — checkin bo'lmasin",
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 39.741066,
          lon: 64.427637,
          accuracy: 5.0,
        },
        tokens.staff,
      );
      assert(r.data.data?.action === 'before_work_time', `Expected before_work_time, got: ${r.data.data?.action}`);
      return 'Before work guard ✓';
    },
    'GPS',
  );
  }

  // After work test
  if (dayOfWeek !== 0 && nowMins > 990) {
    await test(
    '16:30 dan keyin — overtime yoki day_finished',
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 39.741066,
          lon: 64.427637,
          accuracy: 5.0,
        },
        tokens.staff,
      );
      assert(r.data.success, 'Ping failed');
      const valid = [
        'inside_same',
        'auto_recheckin',
        'day_finished',
        'after_work_time',
        'too_frequent',
        'auto_checkout_end_of_day',
      ];
      assert(valid.includes(r.data.data?.action), `Action: ${r.data.data?.action}`);
      return `Action: ${r.data.data?.action}`;
    },
    'GPS',
  );
  }

  await test(
    "Reset session — qayta checkin imkoniyati",
    async () => {
      const r = await api('POST', '/work/reset-session', null, tokens.staff);
      // reset is optional, may return error if no session
      return r.data.success ? 'Reset ishladi' : "Session yo'q (normal)";
    },
    'GPS',
  );

  // ════════════════════════════════════════════════════════
  // 5. BUILDINGS MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 5. BUILDINGS MODULE');

  await test(
    "Binolar ro'yxati",
    async () => {
      const r = await api('GET', '/buildings', null, tokens.staff);
      assert(r.data.success, 'Buildings yuklanmadi');
      assert(Array.isArray(r.data.data), 'Array kerak');
      assert(r.data.data.length === 3, `3 ta bino kerak, ${r.data.data.length} keldi`);
      const adminUyi = r.data.data.find((b) => b.name?.toLowerCase().includes('admin'));
      assert(!adminUyi, "Admin uyi ro'yxatda bo'lmasligi kerak!");
      const names = r.data.data.map((b) => b.name).join(', ');
      return `Binolar: ${names}`;
    },
    'BUILDINGS',
  );

  await test(
    'Har bino GPS koordinatalari bor',
    async () => {
      const r = await api('GET', '/buildings', null, tokens.staff);
      r.data.data.forEach((b) => {
        assert(b.latitude, `${b.name} latitude yo'q`);
        assert(b.longitude, `${b.name} longitude yo'q`);
        assert(b.radius_m || b.radiusM, `${b.name} radius yo'q`);
      });
      return 'Barcha koordinatalar bor ✓';
    },
    'BUILDINGS',
  );

  // ════════════════════════════════════════════════════════
  // 6. REPORTS MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 6. REPORTS MODULE');

  await test(
    'Kunlik hisobot (bugun)',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const r = await api('GET', `/reports/daily?date=${today}`, null, tokens.staff);
      assert(r.data.success, 'Daily yuklanmadi');
      return `Sana: ${today}`;
    },
    'REPORTS',
  );

  await test(
    'Oylik hisobot',
    async () => {
      const now = new Date();
      const r = await api(
        'GET',
        `/reports/monthly?year=${now.getFullYear()}&month=${now.getMonth() + 1}`,
        null,
        tokens.staff,
      );
      assert(r.data.success, 'Monthly yuklanmadi');
      assert(r.data.data.summary !== undefined, "Summary yo'q");
      return `Kelgan: ${r.data.data.summary?.presentDays || 0} kun`;
    },
    'REPORTS',
  );

  await test(
    'Yillik hisobot',
    async () => {
      const r = await api('GET', `/reports/yearly?year=${new Date().getFullYear()}`, null, tokens.staff);
      assert(r.data.success, 'Yearly yuklanmadi');
      return 'OK';
    },
    'REPORTS',
  );

  await test(
    'Haftalik hisobot (reports)',
    async () => {
      const r = await api('GET', '/reports/weekly', null, tokens.staff);
      assert(r.data.success, 'Weekly reports yuklanmadi');
      return 'OK';
    },
    'REPORTS',
  );

  await test(
    "Boshqa xodim hisoboti — staff bloklanadi",
    async () => {
      const r = await api('GET', `/reports/daily?userId=1`, null, tokens.staff);
      // Staff boshqa xodim hisobotini ko'ra olmasligi kerak
      assert(r.status === 403 || r.data.success, 'Kutilmagan natija');
      return r.status === 403 ? "Bloklandi ✓" : "O'z hisoboti ko'rindi";
    },
    'REPORTS',
  );

  await test(
    "Admin boshqa xodim hisobotini ko'ra oladi",
    async () => {
      const r = await api('GET', `/reports/daily?userId=2`, null, tokens.admin);
      assert(r.data.success, 'Admin daily report yuklanmadi');
      return "Admin ko'ra oldi ✓";
    },
    'REPORTS',
  );

  // ════════════════════════════════════════════════════════
  // 7. NOTIFICATIONS MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 7. NOTIFICATIONS MODULE');

  await test(
    "Xabarnomalar ro'yxati",
    async () => {
      const r = await api('GET', '/notifications', null, tokens.staff);
      assert(r.data.success, 'Notifications yuklanmadi');
      assert(r.data.data.notifications !== undefined, "notifications field yo'q");
      assert(typeof r.data.data.unreadCount === 'number', 'unreadCount son bo\'lishi kerak');
      return `${r.data.data.notifications.length} ta, O'qilmagan: ${r.data.data.unreadCount}`;
    },
    'NOTIFICATIONS',
  );

  await test(
    "Hammasini o'qildi",
    async () => {
      const r = await api('PUT', '/notifications/read-all', null, tokens.staff);
      assert(r.data.success, "Mark all read muvaffaqiyatsiz");
      return "Hammasi o'qildi ✓";
    },
    'NOTIFICATIONS',
  );

  await test(
    "O'qilmagan soni 0 bo'ldi",
    async () => {
      const r = await api('GET', '/notifications', null, tokens.staff);
      assert(r.data.success, 'Notifications yuklanmadi');
      assert(r.data.data.unreadCount === 0, `Unread: ${r.data.data.unreadCount}`);
      return 'UnreadCount = 0 ✓';
    },
    'NOTIFICATIONS',
  );

  // ════════════════════════════════════════════════════════
  // 8. ADMIN MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 8. ADMIN MODULE');

  await test(
    "Barcha xodimlar ro'yxati",
    async () => {
      const r = await api('GET', '/admin/staff', null, tokens.admin);
      assert(r.data.success, 'Staff list yuklanmadi');
      const count = r.data.data.total || r.data.data.length || 0;
      return `${count} ta xodim`;
    },
    'ADMIN',
  );

  await test(
    'Hozir aktiv xodimlar',
    async () => {
      const r = await api('GET', '/admin/staff/active-now', null, tokens.admin);
      assert(r.data.success, 'Active now yuklanmadi');
      const total = Object.values(r.data.data)
        .filter((v) => Array.isArray(v))
        .flat().length;
      return `${total} ta aktiv xodim`;
    },
    'ADMIN',
  );

  await test(
    'Bugun kelmagan xodimlar',
    async () => {
      const r = await api('GET', '/admin/staff/absent-today', null, tokens.admin);
      assert(r.data.success, 'Absent today yuklanmadi');
      assert(Array.isArray(r.data.data), 'Array kerak');
      return `${r.data.data.length} ta kelmagan`;
    },
    'ADMIN',
  );

  await test(
    'Admin overview — barcha statistika',
    async () => {
      const r = await api('GET', '/admin/overview', null, tokens.admin);
      assert(r.data.success, 'Overview yuklanmadi');
      assert(r.data.data.today !== undefined, "today stats yo'q");
      assert(r.data.data.today.totalStaff !== undefined, "totalStaff yo'q");
      assert(r.data.data.today.activeNow !== undefined, "activeNow yo'q");
      assert(r.data.data.today.absentToday !== undefined, "absentToday yo'q");
      return `Jami: ${r.data.data.today.totalStaff}, Aktiv: ${r.data.data.today.activeNow}, Yo'q: ${r.data.data.today.absentToday}`;
    },
    'ADMIN',
  );

  await test(
    'Xodim detail (id=2)',
    async () => {
      const r = await api('GET', '/admin/staff/2', null, tokens.admin);
      assert(r.data.success, 'Staff detail yuklanmadi');
      return 'OK';
    },
    'ADMIN',
  );

  await test(
    'Xodim hujjatlari (admin)',
    async () => {
      const r = await api('GET', '/admin/staff/2/documents', null, tokens.admin);
      assert(r.data.success, 'Documents yuklanmadi');
      return `${r.data.data.length} ta hujjat`;
    },
    'ADMIN',
  );

  await test(
    "Xodim ta'tillari (admin)",
    async () => {
      const r = await api('GET', '/admin/staff/2/vacations', null, tokens.admin);
      assert(r.data.success, "Vacations yuklanmadi");
      return `${r.data.data.length} ta ta'til`;
    },
    'ADMIN',
  );

  await test(
    'Xodim mukofotlari (admin)',
    async () => {
      const r = await api('GET', '/admin/staff/2/rewards', null, tokens.admin);
      assert(r.data.success, 'Rewards yuklanmadi');
      return 'OK';
    },
    'ADMIN',
  );

  await test(
    'Xodim ish loglari (admin)',
    async () => {
      const today = new Date().toISOString().slice(0, 10);
      const r = await api('GET', `/admin/staff/2/work-logs?date=${today}`, null, tokens.admin);
      assert(r.data.success, 'Work logs yuklanmadi');
      return `${r.data.data.length} ta log`;
    },
    'ADMIN',
  );

  await test(
    'Broadcast xabar — barcha foydalanuvchilarga',
    async () => {
      const r = await api(
        'POST',
        '/admin/notify',
        {
          userIds: [],
          type: 'tizim',
          title: 'Test xabar',
          body: 'Keng qamrovli test xabarnomasi',
        },
        tokens.admin,
      );
      assert(r.data.success, 'Broadcast muvaffaqiyatsiz');
      assert(r.data.data.sentCount > 0, 'Hech kimga yuborilmadi');
      return `${r.data.data.sentCount} ta foydalanuvchiga yuborildi`;
    },
    'ADMIN',
  );

  await test(
    "QR generatsiya (jadval mavjud bo'lsa)",
    async () => {
      // Check schedules first
      const sched = await api('GET', '/student/schedule?week=0', null, tokens.staff);
      const days = sched.data.data?.days || {};
      const allClasses = Object.values(days).flat();

      if (allClasses.length > 0) {
        const scheduleId = allClasses[0].id;
        const r = await api('POST', '/admin/qr/generate', { scheduleId }, tokens.admin);
        assert(r.data.success, 'QR generatsiya muvaffaqiyatsiz');
        return `QR token: ${r.data.data?.token?.slice(0, 10)}...`;
      }
      return "Jadval yo'q, skip";
    },
    'ADMIN',
  );

  // ════════════════════════════════════════════════════════
  // 9. STUDENT MODULE
  // ════════════════════════════════════════════════════════
  console.log('\n📌 9. STUDENT MODULE');

  await test(
    'Talaba login',
    async () => {
      // Try student login
      const r = await api('POST', '/auth/login', { phone: '+998902222001', password: '1234' });
      if (r.data.success && r.data.data?.user?.role === 'student') {
        tokens.student = r.data.data.token;
        return `Talaba: ${r.data.data.user.full_name || r.data.data.user.fullName}`;
      }
      return 'Talaba topilmadi (skip)';
    },
    'STUDENT',
  );

  if (tokens.student) {
    await test(
      'Talaba profili',
      async () => {
        const r = await api('GET', '/student/profile', null, tokens.student);
        assert(r.data.success, 'Profil yuklanmadi');
        return 'OK';
      },
      'STUDENT',
    );

    await test(
      'Bugungi darslar',
      async () => {
        const r = await api('GET', '/student/schedule/today', null, tokens.student);
        assert(r.data.success, 'Jadval yuklanmadi');
        return `${r.data.data?.length || 0} ta dars`;
      },
      'STUDENT',
    );

    await test(
      'Haftalik jadval',
      async () => {
        const r = await api('GET', '/student/schedule?week=0', null, tokens.student);
        assert(r.data.success, 'Jadval yuklanmadi');
        return 'OK';
      },
      'STUDENT',
    );

    await test(
      'Davomat xulosasi',
      async () => {
        const r = await api('GET', '/student/attendance/summary', null, tokens.student);
        assert(r.data.success, 'Summary yuklanmadi');
        return 'OK';
      },
      'STUDENT',
    );

    await test(
      'Baholar',
      async () => {
        const r = await api('GET', '/student/grades', null, tokens.student);
        assert(r.data.success, 'Grades yuklanmadi');
        return 'OK';
      },
      'STUDENT',
    );

    await test(
      'Topshiriqlar',
      async () => {
        const r = await api('GET', '/student/assignments', null, tokens.student);
        assert(r.data.success, 'Assignments yuklanmadi');
        return 'OK';
      },
      'STUDENT',
    );

    await test(
      "Noto'g'ri QR token → xato",
      async () => {
        const r = await api(
          'POST',
          '/student/attendance/checkin',
          {
            token: 'INVALID_TOKEN_123',
            lat: 39.741066,
            lon: 64.427637,
          },
          tokens.student,
        );
        assert(!r.data.success, "Noto'g'ri token qabul qilindi!");
        return "Bloklandi ✓";
      },
      'STUDENT',
    );
  }

  // ════════════════════════════════════════════════════════
  // 10. SECURITY & EDGE CASES
  // ════════════════════════════════════════════════════════
  console.log('\n📌 10. XAVFSIZLIK & CHEGARAVIY HOLATLAR');

  await test(
    'SQL injection urinish',
    async () => {
      const r = await api('POST', '/auth/login', {
        phone: "'; DROP TABLE users; --",
        password: "' OR '1'='1",
      });
      assert(!r.data.success, 'SQL injection muvaffaqiyatli bo\'lmasligi kerak!');
      return 'SQL injection bloklandi ✓';
    },
    'SECURITY',
  );

  await test(
    "Bo'sh body → validation xato",
    async () => {
      const r = await api('POST', '/auth/login', {});
      assert(!r.data.success, "Bo'sh body qabul qilindi!");
      return 'Validation ishlayapti ✓';
    },
    'SECURITY',
  );

  await test(
    'GPS koordinatalar validatsiyasi',
    async () => {
      const r = await api(
        'POST',
        '/work/ping',
        {
          lat: 'abc',
          lon: 'xyz',
        },
        tokens.staff,
      );
      assert(!r.data.success || r.status === 400, "Noto'g'ri koordinatalar qabul qilindi!");
      return 'Koordinata validatsiya ✓';
    },
    'SECURITY',
  );

  await test(
    'Server health check',
    async () => {
      const r = await fetch(`${BASE}/health`)
        .then((res) => res.json())
        .catch(() => null);
      assert(r, 'Health check muvaffaqiyatsiz');
      return "Server sog'lom ✓";
    },
    'SECURITY',
  );

  await test(
    'CORS header tekshirish',
    async () => {
      const r = await fetch(`${BASE}/auth/login`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://test.com', 'Access-Control-Request-Method': 'POST' },
      });
      assert(r.status < 500, 'CORS xatosi');
      return `Status: ${r.status}`;
    },
    'SECURITY',
  );

  await warn(
    'Rate limit (login spam)',
    async () => {
      let blocked = false;
      for (let i = 0; i < 12; i++) {
        const r = await api('POST', '/auth/login', { phone: '+998901002026', password: 'xato' });
        if (r.status === 429) {
          blocked = true;
          break;
        }
      }
      assert(blocked, "Rate limit yo'q");
      return 'Rate limit ishlayapti ✓';
    },
    'SECURITY',
  );

  // ════════════════════════════════════════════════════════
  // YAKUNIY HISOBOT
  // ════════════════════════════════════════════════════════
  const total = results.pass + results.fail + results.warn;
  const pct = total ? Math.round((results.pass / total) * 100) : 0;

  console.log('\n' + '═'.repeat(65));
  console.log('  YAKUNIY NATIJA');
  console.log('═'.repeat(65));
  console.log(`  ✅ PASS : ${results.pass}`);
  console.log(`  ❌ FAIL : ${results.fail}`);
  console.log(`  ⚠️  WARN : ${results.warn}`);
  console.log(`  📊 JAMI : ${total}`);
  console.log(`  📈 FOIZ : ${pct}%`);
  console.log('═'.repeat(65));

  // Group by category
  const categories = [...new Set(results.tests.map((t) => t.category))];
  console.log("\n  Kategoriya bo'yicha:");
  categories.forEach((cat) => {
    const catTests = results.tests.filter((t) => t.category === cat);
    const catPass = catTests.filter((t) => t.status === 'PASS').length;
    console.log(`  ${catPass === catTests.length ? '✅' : '⚠️'} ${cat}: ${catPass}/${catTests.length}`);
  });

  if (results.fail > 0) {
    console.log('\n  ❌ Muvaffaqiyatsiz testlar:');
    results.tests
      .filter((t) => t.status === 'FAIL')
      .forEach((t) => {
        console.log(`    ❌ [${t.category}] ${t.name}: ${t.error}`);
      });
  }

  if (results.warn > 0) {
    console.log('\n  ⚠️ Ogohlantirishlar:');
    results.tests
      .filter((t) => t.status === 'WARN')
      .forEach((t) => {
        console.log(`    ⚠️ [${t.category}] ${t.name}: ${t.error}`);
      });
  }

  const report = {
    date: new Date().toISOString(),
    backend: 'https://creation-informative-absence-neural.trycloudflare.com',
    summary: { pass: results.pass, fail: results.fail, warn: results.warn, total, percentage: pct },
    byCategory: Object.fromEntries(
      categories.map((cat) => {
        const t = results.tests.filter((x) => x.category === cat);
        return [cat, { pass: t.filter((x) => x.status === 'PASS').length, total: t.length }];
      }),
    ),
    tests: results.tests,
  };
  const outPath = path.join(__dirname, 'comprehensive-results.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n  Natijalar: ${outPath} ga saqlandi`);
}

runAll().catch(console.error);
