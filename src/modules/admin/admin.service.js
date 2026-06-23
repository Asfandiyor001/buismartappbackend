const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../config/database');
const { todayStr } = require('../../utils/time');
const { workedSecondsSql } = require('../../utils/workTime');
const staffService = require('../staff/staff.service');
const reportService = require('../report/report.service');
const studentService = require('../student/student.service');
const { sendNotification } = require('../notification/notification.service');

async function getAllStaff(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;

  const params = [];
  let idx = 1;
  let where = "WHERE u.role IN ('staff', 'admin', 'prorektor')";
  if (filters.role && ['staff', 'admin', 'prorektor'].includes(filters.role)) {
    where += ` AND u.role = $${idx}`;
    params.push(filters.role);
    idx += 1;
  }
  if (filters.department) {
    where += ` AND sp.department = $${idx}`;
    params.push(filters.department);
    idx += 1;
  }
  if (filters.position) {
    where += ` AND sp.position = $${idx}`;
    params.push(filters.position);
    idx += 1;
  }
  if (filters.search) {
    where += ` AND (u.full_name ILIKE $${idx} OR sp.employee_id ILIKE $${idx + 1})`;
    const q = `%${filters.search}%`;
    params.push(q, q);
    idx += 2;
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     ${where}`,
    params
  );
  const total = countRes.rows[0].c;

  const limIdx = idx;
  const offIdx = idx + 1;
  params.push(limit, offset);

  const res = await pool.query(
    `SELECT u.id, u.full_name, u.phone, u.role, u.is_active, u.last_login,
            sp.department, sp.position, sp.rank, sp.employee_id,
            sp.hire_date, sp.contract_type, sp.work_start, sp.work_end,
            ws.status AS today_status,
            ws.total_seconds AS today_seconds,
            b.name AS current_building,
            wl.entry_time AS building_since
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN work_sessions ws ON ws.user_id = u.id
       AND ws.work_date = CURRENT_DATE
     LEFT JOIN work_logs wl ON wl.user_id = u.id AND wl.is_active = true
     LEFT JOIN buildings b ON b.id = wl.building_id
     ${where}
     ORDER BY u.full_name ASC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params
  );

  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { staff: res.rows, total, page, totalPages };
}

async function listBuildings() {
  const [bldRes, staffRes] = await Promise.all([
    pool.query(`
      SELECT
        b.id, b.name, b.short_name, b.latitude, b.longitude, b.radius_m, b.is_active,
        COALESCE(s.checked_in,  0)::int AS checked_in_today,
        COALESCE(s.gps_active,  0)::int AS gps_active_today
      FROM buildings b
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT wl.user_id)::int AS checked_in,
          COUNT(DISTINCT wl.user_id) FILTER (
            WHERE ws.last_ping_at > NOW() - INTERVAL '60 minutes'
          )::int AS gps_active
        FROM work_logs wl
        JOIN users u  ON u.id  = wl.user_id
        JOIN work_sessions ws ON ws.id = wl.session_id
        WHERE wl.building_id = b.id
          AND wl.is_active = true
          AND u.role IN ('staff', 'admin', 'prorektor')
          AND ws.work_date = CURRENT_DATE
      ) s ON true
      ORDER BY b.id ASC
    `),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM users
       WHERE role IN ('staff','admin','prorektor') AND is_active = true`
    ),
  ]);

  const totalStaff = staffRes.rows[0].total;
  return bldRes.rows.map(b => ({ ...b, totalStaff }));
}

async function createBuilding(data) {
  const { name, short_name, latitude, longitude, radius_m } = data || {};
  if (!name || !short_name) {
    throw new Error('name va short_name majburiy');
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  const radius = Number(radius_m);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('latitude va longitude to\'g\'ri son bo\'lishi kerak');
  }
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error('radius_m musbat son bo\'lishi kerak');
  }
  const res = await pool.query(
    `INSERT INTO buildings (name, short_name, latitude, longitude, radius_m, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [String(name).trim(), String(short_name).trim(), lat, lon, radius]
  );
  return res.rows[0];
}

async function updateBuilding(buildingId, data) {
  const id = Number(buildingId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  const ALLOWED = ['name', 'short_name', 'latitude', 'longitude', 'radius_m', 'is_active'];
  const updates = [];
  const values = [];
  let i = 1;

  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(data || {}, key)) {
      updates.push(`${key} = $${i}`);
      values.push(data[key]);
      i += 1;
    }
  }
  if (updates.length === 0) throw new Error('Yangilanadigan maydonlar kiritilmadi');
  values.push(id);

  const res = await pool.query(
    `UPDATE buildings SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING *`,
    values
  );
  if (res.rowCount === 0) throw new Error('Bino topilmadi');
  return res.rows[0];
}

async function deleteBuilding(buildingId) {
  const id = Number(buildingId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  const active = await pool.query(
    `SELECT COUNT(*)::int AS c FROM work_logs WHERE building_id = $1 AND is_active = true`,
    [id]
  );
  if (active.rows[0].c > 0) {
    throw new Error('Binoda hozir faol xodimlar bor. Avval ularni chiqib ketishini kuting');
  }

  // Qattiq o'chirish o'rniga soft-delete: is_active = false
  const res = await pool.query(
    `UPDATE buildings SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (res.rowCount === 0) throw new Error('Bino topilmadi');
  return true;
}

async function getActiveNow() {
  // DISTINCT ON (u.id) ensures each user appears only once even if they have
  // multiple is_active=true work_log rows (stale duplicates in the DB).
  // We pick the row with the latest entry_time per user.
  const res = await pool.query(
    `SELECT DISTINCT ON (u.id)
            u.id, u.full_name, u.role, u.phone, u.last_login, u.created_at,
            sp.department, sp.position, sp.employee_id,
            b.id AS building_id, b.name AS building_name, b.short_name AS building_short,
            wl.entry_time, wl.checkout_reason,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - wl.entry_time)))::bigint AS seconds_in_building,
            ws.total_seconds,
            -- Jonli ish vaqti: YAGONA kanonik formula (mobil bilan bir xil).
            -- Abet (1s) ayriladi, 9s cap — xom oraliq EMAS.
            ${workedSecondsSql('ws')} AS live_total_seconds,
            ws.status AS session_status,
            (SELECT gp.created_at FROM gps_pings gp WHERE gp.user_id = u.id
             ORDER BY gp.created_at DESC LIMIT 1) AS last_ping_at,
            (SELECT gp.accuracy_m FROM gps_pings gp WHERE gp.user_id = u.id
             ORDER BY gp.created_at DESC LIMIT 1) AS last_ping_accuracy
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     JOIN buildings b ON b.id = wl.building_id
     JOIN work_sessions ws ON ws.id = wl.session_id
     WHERE wl.is_active = true
       AND u.role IN ('staff', 'admin', 'prorektor')
       AND DATE(ws.work_date) = CURRENT_DATE
       AND ws.last_ping_at > NOW() - INTERVAL '60 minutes'
     ORDER BY u.id, wl.entry_time DESC`
  );

  const grouped = {};
  let total = 0;
  for (const row of res.rows) {
    const key = String(row.building_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      phone: row.phone || null,
      lastLogin: row.last_login || null,
      createdAt: row.created_at || null,
      department: row.department,
      position: row.position,
      employeeId: row.employee_id ?? null,
      buildingId: row.building_id,
      buildingName: row.building_name,
      buildingShort: row.building_short,
      entryTime: row.entry_time,
      secondsInBuilding: Number(row.seconds_in_building) || 0,
      totalSeconds: Number(row.total_seconds) || 0,
      liveTotalSeconds: Number(row.live_total_seconds) || 0,
      sessionStatus: row.session_status,
      checkoutReason: row.checkout_reason || null,
      lastPingAt: row.last_ping_at || null,
      lastPingAccuracy: row.last_ping_accuracy != null ? Number(row.last_ping_accuracy) : null,
    });
    total += 1;
  }
  return Object.assign(grouped, { total });
}

async function getStaffDetail(staffId) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) {
    throw new Error('Noto\'g\'ri identifikator');
  }
  const roleRes = await pool.query(
    `SELECT role FROM users WHERE id = $1`,
    [id]
  );
  if (!roleRes.rows[0] || !['staff', 'admin', 'prorektor'].includes(roleRes.rows[0].role)) {
    throw new Error('Xodim topilmadi');
  }

  const profile = await staffService.getProfile(id);
  const today = todayStr();
  const daily = await reportService.getDailyReport(id, today);
  const now = new Date();
  const monthStats = (
    await reportService.getMonthlyReport(id, now.getFullYear(), now.getMonth() + 1)
  ).summary;

  return { profile, today: daily, monthStats };
}

async function updateStaffStatus(staffId, isActive, adminId) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) {
    throw new Error('Noto\'g\'ri identifikator');
  }
  const res = await pool.query(
    `UPDATE users SET is_active = $1, updated_at = NOW()
     WHERE id = $2 AND role = 'staff'
     RETURNING id, full_name, phone, role, is_active, avatar_url, last_login`,
    [Boolean(isActive), id]
  );
  if (res.rowCount === 0) {
    throw new Error('Xodim topilmadi');
  }
  const user = res.rows[0];
  const title = isActive ? 'Hisobingiz faollashtirildi' : 'Hisobingiz to\'xtatildi';
  const body = isActive
    ? 'Administrator hisobingizni qayta yoqdi.'
    : 'Administrator hisobingizni vaqtincha to\'xtatdi.';
  await sendNotification(id, 'tizim', title, body, { adminId });
  return user;
}

function combineLocalTs(ymd, timeVal) {
  const [y, m, d] = ymd.split('-').map(Number);
  const parts = String(timeVal).slice(0, 8).split(':');
  const hh = Number(parts[0]) || 0;
  const mm = Number(parts[1]) || 0;
  const ss = Number(parts[2]) || 0;
  return new Date(y, m - 1, d, hh, mm, ss, 0);
}

async function generateQR(scheduleId, adminId) {
  const sid = Number(scheduleId);
  if (!Number.isFinite(sid)) {
    throw new Error('Jadval identifikatori noto\'g\'ri');
  }
  const sRes = await pool.query('SELECT * FROM schedules WHERE id = $1', [sid]);
  const s = sRes.rows[0];
  if (!s) {
    throw new Error('Dars jadvali topilmadi');
  }

  const ymd = todayStr();
  const startDt = combineLocalTs(ymd, s.start_time);
  const endDt = combineLocalTs(ymd, s.end_time);
  const validFrom = new Date(startDt.getTime() - 10 * 60 * 1000);
  const validUntil = new Date(endDt.getTime() + 15 * 60 * 1000);
  const token = crypto.randomBytes(16).toString('hex');

  const ins = await pool.query(
    `INSERT INTO qr_tokens (schedule_id, token, valid_date, valid_from, valid_until, is_used_count)
     VALUES ($1, $2, $3::date, $4, $5, 0)
     ON CONFLICT (schedule_id, valid_date) DO UPDATE SET
       token = EXCLUDED.token,
       valid_from = EXCLUDED.valid_from,
       valid_until = EXCLUDED.valid_until,
       is_used_count = 0
     RETURNING *`,
    [sid, token, ymd, validFrom, validUntil]
  );
  const row = ins.rows[0];

  return {
    token: row.token,
    scheduleId: sid,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    qrData: JSON.stringify({
      t: row.token,
      s: sid,
      d: ymd,
    }),
  };
}

const MANAGED_ROLES = `u.role IN ('staff', 'admin', 'prorektor')`;

async function getOverview() {
  const staffCountRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users u
     WHERE u.role IN ('staff', 'admin', 'prorektor')`
  );
  const totalStaff = staffCountRes.rows[0].c;

  const presentRes = await pool.query(
    `SELECT COUNT(DISTINCT wl.user_id)::int AS c
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     JOIN work_sessions ws ON ws.id = wl.session_id
     WHERE wl.is_active = true
       AND u.role IN ('staff', 'admin', 'prorektor')
       AND ws.last_ping_at > NOW() - INTERVAL '60 minutes'`
  );
  const presentNow = presentRes.rows[0].c;
  const activeNow = presentNow;

  const finishedRes = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE
       AND ws.status = 'done'
       AND u.role IN ('staff', 'admin', 'prorektor')`
  );
  const finishedToday = finishedRes.rows[0].c;

  const outsideRes = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE
       AND ws.status = 'active'
       AND ws.outside_since IS NOT NULL
       AND u.role IN ('staff', 'admin', 'prorektor')`
  );
  const outsideNow = outsideRes.rows[0].c;

  const staleRes = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE
       AND ws.status = 'active'
       AND ws.outside_since IS NULL
       AND (ws.last_ping_at IS NULL OR ws.last_ping_at < NOW() - INTERVAL '60 minutes')
       AND u.role IN ('staff', 'admin', 'prorektor')`
  );
  const staleNow = staleRes.rows[0].c;

  const otRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE ws.work_date = CURRENT_DATE
       AND ws.overtime_seconds > 0
       AND u.role IN ('staff', 'admin', 'prorektor')`
  );
  const overtimeNow = otRes.rows[0].c;

  const bcRes = await pool.query(
    `SELECT b.name AS n, COUNT(DISTINCT wl.user_id)::int AS c
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     JOIN users u ON u.id = wl.user_id
     JOIN work_sessions ws ON ws.id = wl.session_id
     WHERE wl.is_active = true
       AND u.role IN ('staff', 'admin', 'prorektor')
       AND DATE(ws.work_date) = CURRENT_DATE
       AND ws.last_ping_at > NOW() - INTERVAL '60 minutes'
     GROUP BY b.name`
  );
  const buildingCounts = {};
  for (const r of bcRes.rows) {
    buildingCounts[r.n] = r.c;
  }

  const bldTotalRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM buildings WHERE is_active = true`
  );
  const totalBuildings = bldTotalRes.rows[0].c;

  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const attRes = await pool.query(
    `SELECT AVG(
       LEAST(100, (ws.total_seconds::numeric / NULLIF(8 * 3600, 0)) * 100)
     )::numeric AS avg_pct
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE u.role IN ('staff', 'admin', 'prorektor')
       AND EXTRACT(YEAR FROM ws.work_date) = $1
       AND EXTRACT(MONTH FROM ws.work_date) = $2
       AND ws.status IN ('done', 'active')`,
    [y, m]
  );
  const avgAttendancePct =
    attRes.rows[0].avg_pct != null
      ? Math.round(Number(attRes.rows[0].avg_pct) * 100) / 100
      : 0;

  const otHRes = await pool.query(
    `SELECT COALESCE(SUM(ws.overtime_seconds), 0)::bigint AS s
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE u.role IN ('staff', 'admin', 'prorektor')
       AND EXTRACT(YEAR FROM ws.work_date) = $1
       AND EXTRACT(MONTH FROM ws.work_date) = $2`,
    [y, m]
  );
  const totalOvertimeHours =
    Math.round((Number(otHRes.rows[0].s) / 3600) * 100) / 100;

  const mbRes = await pool.query(
    `SELECT b.name, COUNT(*)::int AS c
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     JOIN users u ON u.id = wl.user_id
     WHERE u.role IN ('staff', 'admin', 'prorektor')
       AND EXTRACT(YEAR FROM wl.entry_time) = $1
       AND EXTRACT(MONTH FROM wl.entry_time) = $2
     GROUP BY b.name
     ORDER BY c DESC
     LIMIT 1`,
    [y, m]
  );
  const mostActiveBuilding = mbRes.rows[0]?.name || null;

  const [recentRes, deptRes, vacRes, lateRes] = await Promise.all([
    pool.query(
      `SELECT wl.id, wl.entry_time, wl.exit_time, wl.duration_seconds,
              u.full_name AS user_name, b.name AS building_name
       FROM work_logs wl
       JOIN users u ON u.id = wl.user_id
       JOIN buildings b ON b.id = wl.building_id
       ORDER BY wl.entry_time DESC
       LIMIT 10`
    ),
    pool.query(
      `SELECT COALESCE(sp.department, 'Boshqa') AS department,
              COUNT(*)::int AS cnt
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE u.role IN ('staff', 'admin', 'prorektor')
       GROUP BY department
       ORDER BY cnt DESC`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM staff_vacations sv
       WHERE sv.status = 'approved'
         AND sv.start_date <= CURRENT_DATE
         AND sv.end_date   >= CURRENT_DATE`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c
       FROM work_sessions ws
       JOIN users u ON u.id = ws.user_id
       JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE ws.work_date = CURRENT_DATE
         AND u.role IN ('staff', 'admin', 'prorektor')
         AND ws.first_entry_time IS NOT NULL
         AND sp.work_start IS NOT NULL
         AND ws.first_entry_time::time > (sp.work_start + INTERVAL '10 minutes')`
    ),
  ]);

  const departmentStats = {};
  for (const r of deptRes.rows) {
    departmentStats[r.department] = r.cnt;
  }
  const onVacation = vacRes.rows[0].c;
  const lateToday  = lateRes.rows[0].c;

  // absentToday = hech qanday status yo'q xodimlar (ta'tildagilar ham chiqariladi)
  const absentToday = Math.max(0, totalStaff - presentNow - finishedToday - outsideNow - staleNow - onVacation);

  return {
    today: {
      totalStaff,
      presentNow,
      activeNow,
      finishedToday,
      outsideNow,
      staleNow,
      absentToday,
      overtimeNow,
      lateToday,
      onVacation,
      buildingCounts,
      totalBuildings,
      departmentStats,
    },
    thisMonth: {
      avgAttendancePct,
      totalOvertimeHours,
      mostActiveBuilding,
    },
    recentActivity: recentRes.rows,
  };
}

async function getStudentsForAdmin(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const params = [];
  let idx = 1;
  let where = "WHERE u.role = 'student' AND u.is_active = true";
  if (filters.search) {
    where += ` AND u.full_name ILIKE $${idx}`;
    params.push(`%${filters.search}%`);
    idx += 1;
  }
  if (filters.group_name) {
    where += ` AND sp.group_name = $${idx}`;
    params.push(filters.group_name);
    idx += 1;
  }
  if (filters.year != null && String(filters.year).length > 0) {
    where += ` AND sp.year = $${idx}`;
    params.push(Number(filters.year));
    idx += 1;
  }
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     ${where}`,
    params,
  );
  const total = countRes.rows[0].c;
  const limIdx = idx;
  const offIdx = idx + 1;
  params.push(limit, offset);
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.phone, u.is_active,
            sp.group_name, sp.year, sp.department,
            (SELECT ROUND(AVG(ats.attendance_pct)::numeric, 2)
               FROM attendance_summary ats WHERE ats.student_id = u.id) AS attendance_pct,
            (SELECT ROUND(AVG(
               CASE WHEN g.is_passed AND g.total IS NOT NULL THEN (g.total / 100.0) * 4.0 ELSE NULL END
             )::numeric, 2) FROM grades g WHERE g.student_id = u.id) AS gpa
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     ${where}
     ORDER BY u.full_name ASC
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { students: res.rows, total, page, totalPages };
}

async function getStudentAdminDetail(studentId) {
  const id = Number(studentId);
  if (!Number.isFinite(id)) {
    throw new Error('Noto\'g\'ri identifikator');
  }
  const profile = await studentService.getProfile(id);
  const attendance = await studentService.getAttendanceSummary(id);
  const grades = await studentService.getGrades(id, null);
  let schedule = null;
  try {
    schedule = await studentService.getSchedule(id, 0);
  } catch {
    schedule = null;
  }
  let assignments = { pending: [], urgent: [], submitted: [], overdue: [] };
  try {
    assignments = await studentService.getAssignments(id);
  } catch {
    /* guruh yoвЂq */
  }
  return { profile, attendance, grades, schedule, assignments };
}

async function getStaffTodayData() {
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.full_name,
      u.phone,
      u.role,
      u.is_active,
      sp.position         AS lavozim,
      ws.status           AS session_status,
      ws.first_entry_time,
      ws.total_seconds,
      ws.work_date,
      (
        SELECT TO_CHAR(wl.entry_time, 'HH24:MI')
        FROM work_logs wl
        WHERE wl.user_id = u.id
          AND DATE(wl.entry_time) = CURRENT_DATE
        ORDER BY wl.entry_time ASC
        LIMIT 1
      ) AS bugun_kirish,
      (
        SELECT TO_CHAR(wl.exit_time, 'HH24:MI')
        FROM work_logs wl
        WHERE wl.user_id = u.id
          AND DATE(wl.entry_time) = CURRENT_DATE
          AND wl.exit_time IS NOT NULL
        ORDER BY wl.exit_time DESC
        LIMIT 1
      ) AS bugun_chiqish,
      -- Ish vaqti: YAGONA kanonik formula (mobil bilan bir xil).
      -- Aktiv ham, yopilgan sessiya ham — abet (1s) ayriladi, 9s cap.
      ${workedSecondsSql('ws')} AS jami_sekund,
      (
        SELECT ROUND(
          COUNT(DISTINCT DATE(ws2.work_date))::numeric /
          NULLIF(
            (SELECT COUNT(*)
             FROM generate_series(
               DATE_TRUNC('month', CURRENT_DATE),
               CURRENT_DATE,
               '1 day'::interval
             ) AS d
             WHERE EXTRACT(DOW FROM d) NOT IN (0)
            ), 0
          ) * 100
        )
        FROM work_sessions ws2
        WHERE ws2.user_id = u.id
          AND DATE_TRUNC('month', ws2.work_date) = DATE_TRUNC('month', CURRENT_DATE)
          AND ws2.status != 'absent'
      ) AS davomat_foiz,
      u.last_login,
      ws.last_ping_at,
      ws.outside_since,
      CASE
        WHEN ws.status = 'active' AND ws.last_ping_at IS NOT NULL THEN
          ROUND(EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) / 60)::INT
        ELSE NULL
      END AS min_since_ping,
      CASE
        WHEN ws.status IS NULL THEN NULL
        WHEN ws.status != 'active' THEN NULL
        WHEN ws.last_ping_at IS NULL THEN 'nodata'
        WHEN EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) < 600 THEN 'online'
        WHEN EXTRACT(EPOCH FROM (NOW() - ws.last_ping_at)) < 1800 THEN 'sekin'
        ELSE 'aloqa_yoq'
      END AS aloqa_holati,
      -- HOZIR qaysi binoda: aktiv (ochiq) work_log binosi
      (
        SELECT b.name
        FROM work_logs wl
        JOIN buildings b ON b.id = wl.building_id
        WHERE wl.session_id = ws.id AND wl.is_active = true
        LIMIT 1
      ) AS building_name,
      (
        SELECT b.short_name
        FROM work_logs wl
        JOIN buildings b ON b.id = wl.building_id
        WHERE wl.session_id = ws.id AND wl.is_active = true
        LIMIT 1
      ) AS building_short,
      -- OXIRGI bino (ketgan bo'lsa ham — eng so'nggi tashrif)
      (
        SELECT b.name
        FROM work_logs wl
        JOIN buildings b ON b.id = wl.building_id
        WHERE wl.session_id = ws.id
        ORDER BY wl.entry_time DESC
        LIMIT 1
      ) AS last_building
    FROM users u
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN work_sessions ws
      ON ws.user_id = u.id
      AND ws.work_date = CURRENT_DATE
    WHERE u.role IN ('staff', 'admin', 'prorektor')
    ORDER BY u.id ASC
  `);

  const total   = rows.length;
  const present = rows.filter((r) =>
    r.bugun_kirish != null ||
    r.session_status === 'active' ||
    r.session_status === 'done' ||
    Number(r.jami_sekund) > 0
  ).length;
  const absent    = total - present;
  const aloqa_yoq = rows.filter((r) => r.aloqa_holati === 'aloqa_yoq').length;

  return {
    staff: rows,
    meta: { total, present, absent, aloqa_yoq },
  };
}

async function sendBroadcastNotification(adminId, userIds, type, title, body) {
  if (!title || !body) {
    throw new Error('title va body majburiy');
  }
  let ids = Array.isArray(userIds) ? userIds.map(Number).filter(Number.isFinite) : [];
  if (ids.length === 0) {
    const r = await pool.query(
      `SELECT id FROM users WHERE is_active = true`
    );
    ids = r.rows.map((x) => x.id);
  }
  const results = await Promise.allSettled(
    ids.map(uid => sendNotification(uid, type, title, body, { fromAdmin: adminId }))
  );
  const sentCount = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    console.warn(`[broadcast] ${failed} ta xabar yuborilmadi`);
  }
  return { sentCount, failed };
}

async function getStaffDocuments(staffId) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');
  const res = await pool.query(
    `SELECT * FROM staff_documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [id]
  );
  return res.rows;
}

async function getStaffVacations(staffId) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');
  const res = await pool.query(
    `SELECT sv.*, u.full_name AS approved_by_name
     FROM staff_vacations sv
     LEFT JOIN users u ON u.id = sv.approved_by
     WHERE sv.user_id = $1
     ORDER BY sv.created_at DESC`,
    [id]
  );
  return res.rows;
}

async function getStaffRewards(staffId) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');
  const res = await pool.query(
    `SELECT sr.*, u.full_name AS issued_by_name
     FROM staff_rewards sr
     LEFT JOIN users u ON u.id = sr.issued_by
     WHERE sr.user_id = $1
     ORDER BY sr.reward_date DESC`,
    [id]
  );
  return res.rows;
}

async function getStaffWorkLogs(staffId, date, from, to) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  let whereDate = '';
  const params = [id];

  if (date) {
    whereDate = `AND DATE(wl.entry_time) = $2::date`;
    params.push(date);
  } else if (from && to) {
    whereDate = `AND DATE(wl.entry_time) BETWEEN $2::date AND $3::date`;
    params.push(from, to);
  } else if (from) {
    whereDate = `AND DATE(wl.entry_time) >= $2::date`;
    params.push(from);
  }

  const res = await pool.query(
    `SELECT
       wl.id,
       wl.user_id,
       wl.session_id,
       wl.building_id,
       wl.is_active,
       wl.checkout_reason,
       wl.duration_seconds,
       TO_CHAR(wl.entry_time, 'YYYY-MM-DD') AS day,
       TO_CHAR(wl.entry_time, 'HH24:MI')   AS entry_time_fmt,
       TO_CHAR(wl.exit_time,  'HH24:MI')   AS exit_time_fmt,
       b.name       AS building,
       b.short_name AS building_short
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     WHERE wl.user_id = $1 ${whereDate}
     ORDER BY wl.entry_time ASC`,
    params
  );

  /* Kunlar bo'yicha guruhlash вЂ” ASC tartib: firstEntry = birinchi kirish */
  const byDay = {};
  for (const row of res.rows) {
    const dayKey = row.day || 'вЂ”';
    if (!byDay[dayKey]) {
      byDay[dayKey] = {
        date:         dayKey,
        logs:         [],
        totalSeconds: 0,
        firstEntry:   row.entry_time_fmt || 'вЂ”',
        lastExit:     null,
      };
    }
    byDay[dayKey].logs.push(row);
    byDay[dayKey].totalSeconds += Number(row.duration_seconds) || 0;
    /* lastExit = oxirgi qayd etilgan chiqish */
    if (row.exit_time_fmt) byDay[dayKey].lastExit = row.exit_time_fmt;
  }

  const days = Object.values(byDay).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { logs: res.rows, days, total: res.rows.length };
}

async function getAbsentToday() {
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.phone, u.last_login, u.is_active,
            sp.department, sp.position, sp.employee_id,
            sp.work_start, sp.work_end,
            b.name AS last_building,
            gp.created_at AS last_ping_at,
            gp.accuracy_m AS last_ping_accuracy
     FROM users u
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT wl.building_id FROM work_logs wl
       WHERE wl.user_id = u.id
       ORDER BY wl.entry_time DESC LIMIT 1
     ) AS lw ON true
     LEFT JOIN buildings b ON b.id = lw.building_id
     LEFT JOIN LATERAL (
       SELECT gp2.created_at, gp2.accuracy_m FROM gps_pings gp2
       WHERE gp2.user_id = u.id
       ORDER BY gp2.created_at DESC LIMIT 1
     ) AS gp ON true
     WHERE u.role IN ('staff', 'admin', 'prorektor')
       AND u.id NOT IN (
         SELECT DISTINCT ws.user_id FROM work_sessions ws
         WHERE ws.work_date = CURRENT_DATE AND ws.status IN ('active','done')
       )
     ORDER BY u.full_name ASC`
  );
  return res.rows;
}

async function getPendingVacations(limit = 8) {
  const res = await pool.query(
    `SELECT sv.id, sv.type, sv.start_date, sv.end_date, sv.days_count,
            sv.reason, sv.status, sv.created_at,
            u.id AS user_id, u.full_name,
            sp.position, sp.department
     FROM staff_vacations sv
     JOIN users u ON u.id = sv.user_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE sv.status = 'pending'
     ORDER BY sv.created_at ASC
     LIMIT $1`,
    [limit]
  );
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM staff_vacations WHERE status = 'pending'`
  );
  return { items: res.rows, total: countRes.rows[0].c };
}

async function updateVacationStatus(vacationId, status, adminId) {
  // status: 'approved' | 'rejected'
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE staff_vacations
       SET status = $1, approved_by = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, adminId, vacationId]
    );
    if (result.rowCount === 0) throw new Error("Ta'til topilmadi");
    const vacation = result.rows[0];

    if (status === 'approved') {
      // Tasdiqlangan ta'til kunlarini work_sessions ga 'vacation' sifatida yoz
      // start_date dan end_date gacha har bir ish kuni uchun
      const start = new Date(vacation.start_date);
      const end = new Date(vacation.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Dam olish kunlari
        const dateStr = d.toISOString().split('T')[0];
        await client.query(
          `INSERT INTO work_sessions (user_id, work_date, status, is_finished)
           VALUES ($1, $2, 'vacation', true)
           ON CONFLICT (user_id, work_date) DO UPDATE SET status = 'vacation'`,
          [vacation.user_id, dateStr]
        );
      }
    }

    await client.query('COMMIT');
    return vacation;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getAllUsers(filters) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = (page - 1) * limit;
  const params = [];
  let idx = 1;
  let where = 'WHERE 1=1';

  if (filters.role) {
    where += ` AND u.role = $${idx}`;
    params.push(filters.role);
    idx += 1;
  }
  if (filters.isActive === true || filters.isActive === false) {
    where += ` AND u.is_active = $${idx}`;
    params.push(filters.isActive);
    idx += 1;
  }
  if (filters.search) {
    where += ` AND (u.full_name ILIKE $${idx} OR u.phone ILIKE $${idx + 1})`;
    const q = `%${filters.search}%`;
    params.push(q, q);
    idx += 2;
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users u ${where}`,
    params
  );
  const total = countRes.rows[0].c;

  params.push(limit, offset);
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.phone, u.role, u.is_active, u.last_login, u.created_at
     FROM users u
     ${where}
     ORDER BY u.role ASC, u.full_name ASC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    params
  );
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { users: res.rows, total, page, totalPages };
}

async function createUser(data) {
  const { full_name, phone, password, role } = data || {};
  const VALID_ROLES = ['staff', 'student', 'admin', 'prorektor'];

  if (!full_name || !phone || !password || !role) {
    throw new Error('full_name, phone, password va role majburiy');
  }
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`role quyidagilardan biri bo'lishi kerak: ${VALID_ROLES.join(', ')}`);
  }
  if (String(password).length < 4) {
    throw new Error('Parol kamida 4 belgidan iborat bo\'lishi kerak');
  }

  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    throw new Error('Bu telefon raqam allaqachon ro\'yxatdan o\'tgan');
  }

  const hash = await bcrypt.hash(String(password), 10);
  const res = await pool.query(
    `INSERT INTO users (full_name, phone, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, full_name, phone, role, is_active, created_at`,
    [String(full_name).trim(), String(phone).trim(), hash, role]
  );

  const user = res.rows[0];

  if (role === 'staff' || role === 'admin' || role === 'prorektor') {
    await pool.query(
      `INSERT INTO staff_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );
  } else if (role === 'student') {
    await pool.query(
      `INSERT INTO student_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );
  }

  return user;
}

async function updateUser(userId, data) {
  const id = Number(userId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  const ALLOWED = ['full_name', 'phone', 'role', 'is_active', 'avatar_url'];
  const updates = [];
  const values = [];
  let i = 1;

  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(data || {}, key)) {
      updates.push(`${key} = $${i}`);
      values.push(data[key]);
      i += 1;
    }
  }
  if (updates.length === 0) throw new Error('Yangilanadigan maydonlar kiritilmadi');
  values.push(id);

  const res = await pool.query(
    `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING id, full_name, phone, role, is_active, avatar_url, last_login`,
    values
  );
  if (res.rowCount === 0) throw new Error('Foydalanuvchi topilmadi');
  return res.rows[0];
}

async function deleteUser(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  // Qattiq o'chirish o'rniga soft-delete: is_active = false
  const res = await pool.query(
    `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (res.rowCount === 0) throw new Error('Foydalanuvchi topilmadi');
  return true;
}

async function getDepartments() {
  const { rows } = await pool.query(`
    WITH today_sessions AS (
      SELECT ws.user_id,
        ws.status,
        ws.first_entry_time,
        ws.outside_since,
        ws.last_ping_at
      FROM work_sessions ws
      WHERE ws.work_date = CURRENT_DATE
    ),
    dept_heads AS (
      SELECT DISTINCT ON (sp.department)
        sp.department,
        u.full_name  AS head_name,
        u.phone      AS head_phone,
        sp.position  AS head_position
      FROM staff_profiles sp
      JOIN users u ON u.id = sp.user_id
      WHERE sp.position ILIKE ANY(ARRAY[
        '%rektor%','%prorektor%','%mudiri%','%boshliq%','%boshlig%','%direktor%','%departament%'
      ])
      AND u.role IN ('staff','admin','prorektor')
      AND u.is_active = true
      ORDER BY sp.department,
        CASE
          WHEN sp.position ILIKE '%rektor%'       THEN 1
          WHEN sp.position ILIKE '%mudiri%'        THEN 2
          WHEN sp.position ILIKE '%boshliq%'       THEN 3
          WHEN sp.position ILIKE '%boshlig%'       THEN 3
          WHEN sp.position ILIKE '%departament%'   THEN 4
          WHEN sp.position ILIKE '%direktor%'      THEN 5
          ELSE 9
        END, u.full_name
    ),
    month_stats AS (
      SELECT sp.department,
        ROUND(
          COUNT(DISTINCT ws2.user_id) FILTER (WHERE ws2.status IN ('done','active'))::numeric
          / NULLIF(COUNT(DISTINCT sp.user_id) * GREATEST(1, (
              SELECT COUNT(DISTINCT work_date) FROM work_sessions
              WHERE EXTRACT(YEAR FROM work_date)  = EXTRACT(YEAR FROM CURRENT_DATE)
                AND EXTRACT(MONTH FROM work_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND work_date <= CURRENT_DATE
          )), 0) * 100
        , 1) AS monthly_pct
      FROM staff_profiles sp
      JOIN users u ON u.id = sp.user_id
      LEFT JOIN work_sessions ws2 ON ws2.user_id = sp.user_id
        AND EXTRACT(YEAR  FROM ws2.work_date) = EXTRACT(YEAR  FROM CURRENT_DATE)
        AND EXTRACT(MONTH FROM ws2.work_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND ws2.work_date <= CURRENT_DATE
      WHERE u.role IN ('staff','admin','prorektor')
        AND u.is_active = true
        AND sp.department IS NOT NULL
      GROUP BY sp.department
    )
    SELECT
      sp.department,
      COUNT(DISTINCT u.id)::int AS total,
      -- в”Ђв”Ђ 5 MUTUALLY EXCLUSIVE kategoriya (yig'indisi = total) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
      -- 1. HOZIR ISHDA: active + binoda + yangi ping + o'z vaqtida (<=09:00)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.status = 'active'
          AND ts.outside_since IS NULL
          AND ts.last_ping_at >= NOW() - INTERVAL '60 minutes'
          AND (
            ts.first_entry_time IS NULL
            OR (EXTRACT(HOUR   FROM ts.first_entry_time::time)*60
              + EXTRACT(MINUTE FROM ts.first_entry_time::time)) <= 8*60+35
          )
      )::int AS active,
      -- 2. KECHIKKAN: active + binoda + yangi ping + kech kirgan (>09:00)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.status = 'active'
          AND ts.outside_since IS NULL
          AND ts.last_ping_at >= NOW() - INTERVAL '60 minutes'
          AND ts.first_entry_time IS NOT NULL
          AND (EXTRACT(HOUR   FROM ts.first_entry_time::time)*60
             + EXTRACT(MINUTE FROM ts.first_entry_time::time)) > 8*60+35
      )::int AS late,
      -- 3. KO'CHADA: active + outside_since set (outside/abet)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.status = 'active' AND ts.outside_since IS NOT NULL
      )::int AS outside,
      -- 4. PING YO'Q: active + binoda + eski yoki yo'q ping (stale)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.status = 'active'
          AND ts.outside_since IS NULL
          AND (ts.last_ping_at IS NULL OR ts.last_ping_at < NOW() - INTERVAL '60 minutes')
      )::int AS stale,
      -- 5. KETDI: bugun ishga keldi va ish tugatdi (done)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.status = 'done'
      )::int AS done_count,
      -- 6. KELMAGAN: sessiya yo'q YOKI 'absent' (umuman kelmagan)
      COUNT(DISTINCT u.id) FILTER (
        WHERE ts.user_id IS NULL OR ts.status NOT IN ('active', 'done')
      )::int AS absent,
      dh.head_name,
      dh.head_phone,
      dh.head_position,
      COALESCE(ms.monthly_pct, 0)::float                                                   AS monthly_pct
    FROM staff_profiles sp
    JOIN users u ON u.id = sp.user_id
    LEFT JOIN today_sessions ts ON ts.user_id = u.id
    LEFT JOIN dept_heads dh ON dh.department = sp.department
    LEFT JOIN month_stats ms ON ms.department = sp.department
    WHERE u.role IN ('staff','admin','prorektor')
      AND u.is_active = true
      AND sp.department IS NOT NULL
    GROUP BY sp.department, dh.head_name, dh.head_phone, dh.head_position, ms.monthly_pct
    ORDER BY ms.monthly_pct DESC NULLS LAST, COUNT(DISTINCT u.id) DESC
  `);
  return rows;
}

async function getDepartmentStaff(departmentName) {
  const { rows } = await pool.query(`
    SELECT
      u.id,
      u.full_name,
      u.phone,
      sp.position,
      sp.rank,
      sp.work_start,
      ws.status        AS session_status,
      ws.first_entry_time,
      ws.outside_since,
      ws.last_ping_at,
      ws.total_seconds,
      COALESCE(
        ROUND(
          COUNT(DISTINCT ws2.work_date) FILTER (WHERE ws2.status IN ('done','active'))::numeric
          / NULLIF((
              SELECT COUNT(DISTINCT work_date) FROM work_sessions
              WHERE EXTRACT(YEAR  FROM work_date) = EXTRACT(YEAR  FROM CURRENT_DATE)
                AND EXTRACT(MONTH FROM work_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                AND work_date <= CURRENT_DATE
          ), 0) * 100
        , 1),
        0
      )::float AS monthly_pct
    FROM staff_profiles sp
    JOIN users u ON u.id = sp.user_id
    LEFT JOIN work_sessions ws ON ws.user_id = u.id AND ws.work_date = CURRENT_DATE
    LEFT JOIN work_sessions ws2 ON ws2.user_id = u.id
      AND EXTRACT(YEAR  FROM ws2.work_date) = EXTRACT(YEAR  FROM CURRENT_DATE)
      AND EXTRACT(MONTH FROM ws2.work_date) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND ws2.work_date <= CURRENT_DATE
    WHERE u.role IN ('staff','admin','prorektor')
      AND u.is_active = true
      AND sp.department = $1
    GROUP BY u.id, u.full_name, u.phone, sp.position, sp.rank,
             sp.work_start, ws.status, ws.first_entry_time,
             ws.outside_since, ws.last_ping_at, ws.total_seconds
    ORDER BY
      CASE WHEN sp.position ILIKE ANY(ARRAY['%rektor%','%prorektor%','%mudiri%','%boshliq%','%boshlig%','%departament%','%direktor%']) THEN 0 ELSE 1 END,
      u.full_name
  `, [departmentName]);
  return rows;
}

// в”Ђв”Ђ Admin Report Helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function addDaysAdm(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + n);
  const p = v => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function workdaysEffAdm(year, month, firstDateStr) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();
  let startDay = 1;
  if (firstDateStr) {
    const [fy, fm, fd] = String(firstDateStr).slice(0, 10).split('-').map(Number);
    if (fy > year || (fy === year && fm > month)) return 0;
    if (fy === year && fm === month) startDay = fd;
  }
  let endDay = daysInMonth;
  if (year === today.getFullYear() && month === today.getMonth() + 1) {
    endDay = today.getDate();
  }
  let n = 0;
  for (let d = startDay; d <= endDay; d += 1) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) n += 1;
  }
  return n;
}

async function getAdminMonthlyReport(year, month, department) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("Yil yoki oy noto'g'ri");
  }

  const params = [y, m];
  let deptWhere = '';
  if (department && department !== 'Hammasi' && department !== '') {
    params.push(department);
    deptWhere = `AND sp.department = $${params.length}`;
  }

  const [deptRes, staffRes] = await Promise.all([
    pool.query(
      `WITH dept_users AS (
         SELECT sp.department, u.id AS user_id
         FROM staff_profiles sp
         JOIN users u ON u.id = sp.user_id
         WHERE u.role IN ('staff','admin','prorektor')
           AND u.is_active = true
           AND sp.department IS NOT NULL
           ${deptWhere}
       ),
       month_sess AS (
         SELECT ws.user_id,
           BOOL_OR(ws.status IN ('done','active')) AS came,
           BOOL_OR(
             ws.first_entry_time IS NOT NULL
             AND (EXTRACT(HOUR  FROM ws.first_entry_time::time)*60
                + EXTRACT(MINUTE FROM ws.first_entry_time::time)) > 8*60+35
           ) AS was_late,
           COALESCE(SUM(ws.total_seconds), 0)::bigint                                      AS total_seconds,
           COUNT(DISTINCT ws.work_date) FILTER (WHERE ws.status IN ('done','active'))::int  AS present_days
         FROM work_sessions ws
         WHERE EXTRACT(YEAR  FROM ws.work_date) = $1
           AND EXTRACT(MONTH FROM ws.work_date) = $2
         GROUP BY ws.user_id
       )
       SELECT
         du.department,
         COUNT(DISTINCT du.user_id)::int                                         AS total,
         COUNT(DISTINCT du.user_id) FILTER (WHERE ms.came IS TRUE)::int          AS came,
         COUNT(DISTINCT du.user_id) FILTER (WHERE ms.came IS NOT TRUE)::int       AS absent,
         COUNT(DISTINCT du.user_id) FILTER (WHERE ms.was_late IS TRUE)::int       AS late,
         COALESCE(SUM(ms.total_seconds), 0)::bigint                              AS total_seconds,
         COALESCE(SUM(ms.present_days), 0)::int                                  AS present_days_sum
       FROM dept_users du
       LEFT JOIN month_sess ms ON ms.user_id = du.user_id
       GROUP BY du.department
       ORDER BY
         (COUNT(DISTINCT du.user_id) FILTER (WHERE ms.came IS TRUE)::float
           / NULLIF(COUNT(DISTINCT du.user_id), 0)) DESC NULLS LAST,
         du.department`,
      params
    ),
    pool.query(
      `WITH first_sess AS (
         SELECT user_id, MIN(work_date)::text AS first_date
         FROM work_sessions GROUP BY user_id
       ),
       month_sess AS (
         SELECT ws.user_id,
           COUNT(DISTINCT ws.work_date) FILTER (WHERE ws.status IN ('done','active'))::int    AS present_days,
           COUNT(DISTINCT ws.work_date) FILTER (WHERE ws.status = 'vacation')::int            AS vacation_days,
           COUNT(DISTINCT ws.work_date) FILTER (WHERE ws.status = 'sick')::int                AS sick_days,
           COALESCE(SUM(ws.total_seconds),    0)::bigint                                      AS total_seconds,
           COALESCE(SUM(ws.overtime_seconds), 0)::bigint                                      AS overtime_seconds
         FROM work_sessions ws
         WHERE EXTRACT(YEAR  FROM ws.work_date) = $1
           AND EXTRACT(MONTH FROM ws.work_date) = $2
         GROUP BY ws.user_id
       )
       SELECT
         u.id,
         u.full_name,
         COALESCE(sp.department, 'Boshqa')  AS department,
         sp.position,
         COALESCE(ms.present_days,    0)    AS present_days,
         COALESCE(ms.vacation_days,   0)    AS vacation_days,
         COALESCE(ms.sick_days,       0)    AS sick_days,
         COALESCE(ms.total_seconds,   0)    AS total_seconds,
         COALESCE(ms.overtime_seconds,0)    AS overtime_seconds,
         fs.first_date                      AS first_session_date
       FROM users u
       LEFT JOIN staff_profiles sp ON sp.user_id = u.id
       LEFT JOIN month_sess ms ON ms.user_id = u.id
       LEFT JOIN first_sess fs ON fs.user_id = u.id
       WHERE u.role IN ('staff','admin','prorektor')
         AND u.is_active = true
         ${deptWhere}
       ORDER BY COALESCE(sp.department,'Boshqa'), u.full_name`,
      params
    ),
  ]);

  const departments = deptRes.rows.map(d => {
    const total    = Number(d.total)            || 0;
    const came     = Number(d.came)             || 0;
    const late     = Number(d.late)             || 0;
    const absent   = Number(d.absent)           || 0;
    const totalSec = Number(d.total_seconds)    || 0;
    const presSum  = Number(d.present_days_sum) || 0;
    const att      = total > 0 ? Math.round(came / total * 100) : 0;
    const avgHours = presSum > 0 ? Math.round(totalSec / presSum / 3600 * 10) / 10 : 0;
    let grade;
    if (att >= 95) grade = 'A';
    else if (att >= 90) grade = 'A-';
    else if (att >= 85) grade = 'B+';
    else if (att >= 80) grade = 'B';
    else if (att >= 70) grade = 'C';
    else grade = 'D';
    return { name: d.department, total, came, absent, late, att, avgHours, grade };
  });

  const staff = staffRes.rows.map(s => {
    const wd           = workdaysEffAdm(y, m, s.first_session_date);
    const presentDays  = Number(s.present_days)    || 0;
    const vacationDays = Number(s.vacation_days)   || 0;
    const sickDays     = Number(s.sick_days)       || 0;
    const absentDays   = Math.max(0, wd - presentDays - vacationDays - sickDays);
    const attPct       = wd > 0 ? Math.round(presentDays / wd * 100) : 0;
    const totalHours   = Math.round(Number(s.total_seconds)     / 3600 * 10) / 10;
    const otHours      = Math.round(Number(s.overtime_seconds)  / 3600 * 10) / 10;
    return {
      id: Number(s.id),
      fullName: s.full_name,
      department: s.department || 'Boshqa',
      position: s.position || '',
      presentDays, absentDays, vacationDays, sickDays,
      totalHours, otHours, attPct,
      workdays: wd,
    };
  });

  const totalHoursAll = Math.round(staff.reduce((a, s) => a + s.totalHours, 0) * 10) / 10;
  const totalPresent  = staff.reduce((a, s) => a + s.presentDays, 0);
  const totalAbsent   = staff.reduce((a, s) => a + s.absentDays,  0);
  const totalWorkdays = staff.reduce((a, s) => a + s.workdays,    0);
  const attPct        = totalWorkdays > 0 ? Math.round(totalPresent / totalWorkdays * 100) : 0;

  return {
    summary: {
      totalHours: totalHoursAll,
      attendancePct: attPct,
      presentDays: totalPresent,
      absentDays: totalAbsent,
      totalStaff: staff.length,
    },
    departments,
    staff,
  };
}

async function getAdminWeeklyReport(weekStart) {
  const weekEnd = addDaysAdm(weekStart, 7);

  const [dailyRes, totalRes] = await Promise.all([
    pool.query(
      `SELECT
         ws.work_date::text AS work_date,
         COUNT(DISTINCT u.id) FILTER (WHERE ws.status IN ('done','active'))::int AS came,
         COUNT(DISTINCT u.id) FILTER (
           WHERE ws.first_entry_time IS NOT NULL
             AND (EXTRACT(HOUR  FROM ws.first_entry_time::time)*60
                + EXTRACT(MINUTE FROM ws.first_entry_time::time)) > 8*60+35
         )::int AS late,
         COALESCE(SUM(ws.total_seconds), 0)::bigint AS total_seconds
       FROM work_sessions ws
       JOIN users u ON u.id = ws.user_id
       WHERE u.role IN ('staff','admin','prorektor')
         AND u.is_active = true
         AND ws.work_date >= $1::date
         AND ws.work_date <  $2::date
       GROUP BY ws.work_date
       ORDER BY ws.work_date ASC`,
      [weekStart, weekEnd]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM users u
       WHERE u.role IN ('staff','admin','prorektor') AND u.is_active = true`
    ),
  ]);

  const totalStaff = totalRes.rows[0].c;
  const byDate = {};
  for (const r of dailyRes.rows) {
    byDate[String(r.work_date).slice(0, 10)] = r;
  }

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = addDaysAdm(weekStart, i);
    const [yr, mo, da] = d.split('-').map(Number);
    const dow = new Date(yr, mo - 1, da).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const row = byDate[d];
    days.push({
      date: d,
      dow,
      isWeekend,
      came:       row ? Number(row.came)  : 0,
      late:       row ? Number(row.late)  : 0,
      totalHours: row ? Math.round(Number(row.total_seconds) / 3600 * 10) / 10 : 0,
      absent:     isWeekend ? 0 : Math.max(0, totalStaff - (row ? Number(row.came) : 0)),
    });
  }

  const workDays = days.filter(d => !d.isWeekend);
  const sumCame  = workDays.reduce((a, d) => a + d.came,       0);
  const sumLate  = workDays.reduce((a, d) => a + d.late,       0);
  const sumHours = Math.round(workDays.reduce((a, d) => a + d.totalHours, 0) * 10) / 10;
  const attPct   = workDays.length > 0 && totalStaff > 0
    ? Math.round(sumCame / (workDays.length * totalStaff) * 100) : 0;

  return {
    weekStart,
    weekEnd: addDaysAdm(weekStart, 6),
    totalStaff,
    days,
    summary: {
      sumCame, sumLate, sumHours, attPct,
      workdaysCount: workDays.length,
      avgCame: workDays.length > 0 ? Math.round(sumCame / workDays.length) : 0,
    },
  };
}

async function getAdminYearlyReport(year) {
  const y = Number(year);
  if (!Number.isFinite(y)) throw new Error("Yil noto'g'ri");

  const [monthlyRes, totalRes] = await Promise.all([
    pool.query(
      `SELECT
         EXTRACT(MONTH FROM ws.work_date)::int           AS month,
         COUNT(*)::int                                   AS user_day_present,
         COALESCE(SUM(ws.total_seconds),    0)::bigint   AS total_seconds,
         COALESCE(SUM(ws.overtime_seconds), 0)::bigint   AS overtime_seconds
       FROM work_sessions ws
       JOIN users u ON u.id = ws.user_id
       WHERE u.role IN ('staff','admin','prorektor')
         AND EXTRACT(YEAR FROM ws.work_date) = $1
         AND ws.status IN ('done','active')
       GROUP BY EXTRACT(MONTH FROM ws.work_date)
       ORDER BY month ASC`,
      [y]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS c FROM users u
       WHERE u.role IN ('staff','admin','prorektor') AND u.is_active = true`
    ),
  ]);

  const totalStaff = totalRes.rows[0].c;
  const byMonth = {};
  for (const r of monthlyRes.rows) byMonth[Number(r.month)] = r;

  const today = new Date();
  const months = [];
  for (let mo = 1; mo <= 12; mo += 1) {
    const daysInMonth = new Date(y, mo, 0).getDate();
    const endDay =
      y === today.getFullYear() && mo === today.getMonth() + 1
        ? today.getDate() : daysInMonth;
    let wd = 0;
    for (let d = 1; d <= endDay; d += 1) {
      const dow = new Date(y, mo - 1, d).getDay();
      if (dow !== 0 && dow !== 6) wd += 1;
    }

    const row = byMonth[mo];
    if (row) {
      const totalSec = Number(row.total_seconds)    || 0;
      const otSec    = Number(row.overtime_seconds) || 0;
      const userDays = Number(row.user_day_present) || 0;
      const attPct   = totalStaff > 0 && wd > 0
        ? Math.round(userDays / (totalStaff * wd) * 100) : 0;
      months.push({
        month: mo,
        totalHours: Math.round(totalSec / 3600 * 10) / 10,
        otHours:    Math.round(otSec    / 3600 * 10) / 10,
        userDays, attPct, workdays: wd,
      });
    } else {
      months.push({ month: mo, totalHours: 0, otHours: 0, userDays: 0, attPct: 0, workdays: wd });
    }
  }

  return {
    year: y, totalStaff,
    months,
    totals: {
      totalHours: Math.round(months.reduce((a, m) => a + m.totalHours, 0) * 10) / 10,
      otHours:    Math.round(months.reduce((a, m) => a + m.otHours,    0) * 10) / 10,
    },
  };
}

async function getBuildingGpsPings(limit = 30) {
  const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const res = await pool.query(
    `SELECT
       gp.id,
       u.full_name,
       COALESCE(b.name, 'Tashqarida')         AS building_name,
       ROUND(COALESCE(gp.distance_m, 0))::int  AS distance_m,
       gp.is_inside,
       COALESCE(gp.action, 'no_action')        AS action,
       ROUND(COALESCE(gp.accuracy_m, 0))::int  AS accuracy_m,
       TO_CHAR(gp.created_at, 'HH24:MI:SS') AS time_fmt
     FROM gps_pings gp
     JOIN users u ON u.id = gp.user_id
     LEFT JOIN buildings b ON b.id = gp.building_id
     WHERE gp.created_at > NOW() - INTERVAL '24 hours'
     ORDER BY gp.created_at DESC
     LIMIT $1`,
    [n]
  );
  return res.rows;
}

async function getBuildingDailyStats() {
  const res = await pool.query(
    `SELECT
       b.id::int                                        AS building_id,
       gs.day::date::text                               AS day,
       COUNT(DISTINCT wl.user_id)::int                  AS cnt
     FROM buildings b
     CROSS JOIN generate_series(
       CURRENT_DATE - 6 * INTERVAL '1 day',
       CURRENT_DATE,
       INTERVAL '1 day'
     ) AS gs(day)
     LEFT JOIN work_logs wl
       ON wl.building_id = b.id
       AND DATE(wl.entry_time) = gs.day::date
     GROUP BY b.id, gs.day
     ORDER BY b.id ASC, gs.day ASC`
  );
  const grouped = {};
  for (const r of res.rows) {
    const key = String(r.building_id);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(Number(r.cnt));
  }
  return grouped;
}

async function resetUserPassword(userId, newPassword) {
  const id = Number(userId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');

  const hash = await bcrypt.hash(String(newPassword), 10);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [hash, id]
  );
  if (res.rowCount === 0) throw new Error('Foydalanuvchi topilmadi');
  return true;
}

async function getStaffHistory(staffId, days = 30) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error("Noto'g'ri identifikator");
  const d = Math.min(Math.max(Number(days) || 30, 7), 90);

  const res = await pool.query(
    `SELECT
       gs.day::date::text                     AS date,
       EXTRACT(DOW FROM gs.day::date)::int   AS dow,
       ws.status,
       ws.first_entry_time::text             AS first_entry,
       ws.last_exit_time::text               AS last_exit,
       COALESCE(ws.total_seconds, 0)::bigint    AS total_seconds,
       COALESCE(ws.overtime_seconds, 0)::bigint AS overtime_seconds,
       sp.work_start::text                   AS work_start,
       sp.work_end::text                     AS work_end,
       (SELECT MIN(ws2.work_date)::text FROM work_sessions ws2
        WHERE ws2.user_id = $2)              AS first_session_date
     FROM generate_series(
       CURRENT_DATE - ($1 - 1) * INTERVAL '1 day',
       CURRENT_DATE,
       INTERVAL '1 day'
     ) AS gs(day)
     LEFT JOIN work_sessions ws
       ON ws.user_id = $2 AND ws.work_date = gs.day::date
     LEFT JOIN staff_profiles sp ON sp.user_id = $2
     ORDER BY gs.day ASC`,
    [d, id]
  );

  return res.rows.map(row => {
    const dow       = row.dow;
    const isWeekend = dow === 0 || dow === 6;
    const workStart = row.work_start || '08:30';
    const workEnd   = row.work_end   || '16:30';

    const [wsh, wsm] = workStart.split(':').map(Number);
    const [weh, wem] = workEnd.split(':').map(Number);
    const expectedSec = ((weh * 60 + wem) - (wsh * 60 + wsm)) * 60;

    const totalSec    = Number(row.total_seconds) || 0;
    const overtimeSec = Number(row.overtime_seconds) || 0;
    const workPct  = expectedSec > 0 ? Math.min(100, Math.round(totalSec / expectedSec * 100)) : 0;

    let lateMinutes = 0;
    if (row.first_entry) {
      const parts    = String(row.first_entry).split(':');
      const entryMin = Number(parts[0]) * 60 + Number(parts[1]);
      const graceMin = wsh * 60 + wsm + 30;
      if (entryMin > graceMin) lateMinutes = entryMin - graceMin;
    }

    // Days before the employee's first ever session = no_data (not absent)
    const hasSession = row.status && row.status !== 'absent';
    let status;
    if (isWeekend) {
      if (!hasSession) {
        status = 'weekend';
      } else if (lateMinutes > 0) {
        status = 'late';
      } else {
        status = 'present';
      }
    } else if (!hasSession) {
      if (row.first_session_date && row.date < row.first_session_date) {
        status = 'no_data';
      } else {
        status = 'absent';
      }
    } else if (lateMinutes > 0) {
      status = 'late';
    } else {
      status = 'present';
    }

    return {
      date:         row.date,
      dow,
      isWeekend,
      status,
      firstEntry:   row.first_entry ? String(row.first_entry).slice(0, 5) : null,
      lastExit:     row.last_exit   ? String(row.last_exit).slice(0, 5)   : null,
      totalSeconds: totalSec,
      overtimeSeconds: overtimeSec,
      workPct,
      lateMinutes,
    };
  });
}

async function getStaffLocations() {
  const res = await pool.query(`
    SELECT DISTINCT ON (u.id)
      u.id,
      u.full_name,
      sp.department,
      gp.latitude::float         AS latitude,
      gp.longitude::float        AS longitude,
      gp.is_inside,
      ROUND(gp.accuracy_m)::int  AS accuracy_m,
      ROUND(gp.distance_m)::int  AS distance_m,
      gp.created_at              AS last_ping_at,
      ws.status                  AS session_status,
      ws.outside_since,
      ws.first_entry_time,
      ws.last_exit_time,
      b.name                     AS building_name
    FROM users u
    JOIN gps_pings gp       ON gp.user_id = u.id
    LEFT JOIN work_sessions ws ON ws.user_id = u.id AND ws.work_date = CURRENT_DATE
    LEFT JOIN staff_profiles sp ON sp.user_id = u.id
    LEFT JOIN buildings b   ON b.id = gp.building_id
    WHERE u.role IN ('staff', 'admin', 'prorektor')
      AND u.is_active = true
      AND gp.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY u.id, gp.created_at DESC
  `);
  return res.rows;
}

module.exports = {
  getStaffTodayData,
  getAllStaff,
  listBuildings,
  getBuildingGpsPings,
  getBuildingDailyStats,
  createBuilding,
  updateBuilding,
  deleteBuilding,
  getActiveNow,
  getStaffDetail,
  getStaffHistory,
  updateStaffStatus,
  generateQR,
  getOverview,
  getStudentsForAdmin,
  getStudentAdminDetail,
  sendBroadcastNotification,
  getStaffDocuments,
  getStaffVacations,
  getStaffRewards,
  getStaffWorkLogs,
  getAbsentToday,
  getPendingVacations,
  updateVacationStatus,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  getDepartments,
  getDepartmentStaff,
  getAdminMonthlyReport,
  getAdminWeeklyReport,
  getAdminYearlyReport,
  getStaffLocations,
};

