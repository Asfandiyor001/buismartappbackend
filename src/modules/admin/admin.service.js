const crypto = require('crypto');
const pool = require('../../config/database');
const { todayStr } = require('../../utils/time');
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
  let where = "WHERE u.role = 'staff'";

  if (filters.isActive === true || filters.isActive === false) {
    where += ` AND u.is_active = $${idx}`;
    params.push(filters.isActive);
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
    `SELECT u.id, u.full_name, u.phone, u.is_active, u.last_login,
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
  const res = await pool.query(
    `SELECT id, name, short_name
     FROM buildings
     WHERE is_active = true
     ORDER BY id ASC`
  );
  return res.rows;
}

async function getActiveNow() {
  const res = await pool.query(
    `SELECT u.id, u.full_name, u.role,
            sp.department, sp.position, sp.employee_id,
            b.id AS building_id, b.name AS building_name, b.short_name AS building_short,
            wl.entry_time, wl.checkout_reason,
            FLOOR(EXTRACT(EPOCH FROM (NOW() - wl.entry_time)))::bigint AS seconds_in_building,
            ws.total_seconds,
            (
              FLOOR(EXTRACT(EPOCH FROM (NOW() - wl.entry_time)))::bigint
              + (SELECT COALESCE(SUM(duration_seconds), 0)::bigint
                 FROM work_logs closed_wl
                 WHERE closed_wl.session_id = ws.id
                   AND closed_wl.is_active = false
                   AND closed_wl.duration_seconds IS NOT NULL)
            ) AS live_total_seconds,
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
     ORDER BY b.id ASC, wl.entry_time ASC`
  );

  const grouped = {};
  let total = 0;
  for (const row of res.rows) {
    const key = String(row.building_id);
    if (!grouped[key]) grouped[key] = [];
    const entryTime = row.entry_time;
    grouped[key].push({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      department: row.department,
      position: row.position,
      employeeId: row.employee_id ?? null,
      buildingId: row.building_id,
      buildingName: row.building_name,
      buildingShort: row.building_short,
      entryTime,
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
  if (!roleRes.rows[0] || roleRes.rows[0].role !== 'staff') {
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

async function getOverview() {
  const staffCountRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM users WHERE role = 'staff' AND is_active = true`
  );
  const totalStaff = staffCountRes.rows[0].c;

  const presentRes = await pool.query(
    `SELECT COUNT(DISTINCT wl.user_id)::int AS c
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     WHERE wl.is_active = true AND u.role = 'staff'`
  );
  const presentNow = presentRes.rows[0].c;

  const absentToday = Math.max(0, totalStaff - presentNow);

  const otRes = await pool.query(
    `SELECT COUNT(*)::int AS c FROM work_sessions ws
     WHERE ws.work_date = CURRENT_DATE
       AND ws.overtime_seconds > 0
       AND ws.user_id IN (SELECT id FROM users WHERE role = 'staff')`
  );
  const overtimeNow = otRes.rows[0].c;

  const bcRes = await pool.query(
    `SELECT b.name AS n, COUNT(*)::int AS c
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     JOIN users u ON u.id = wl.user_id
     WHERE wl.is_active = true AND u.role = 'staff'
     GROUP BY b.name`
  );
  const buildingCounts = {};
  for (const r of bcRes.rows) {
    buildingCounts[r.n] = r.c;
  }

  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const attRes = await pool.query(
    `SELECT AVG(
       LEAST(100, (ws.total_seconds::numeric / NULLIF(8 * 3600, 0)) * 100)
     )::numeric AS avg_pct
     FROM work_sessions ws
     JOIN users u ON u.id = ws.user_id
     WHERE u.role = 'staff'
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
     WHERE u.role = 'staff'
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
     WHERE u.role = 'staff'
       AND EXTRACT(YEAR FROM wl.entry_time) = $1
       AND EXTRACT(MONTH FROM wl.entry_time) = $2
     GROUP BY b.name
     ORDER BY c DESC
     LIMIT 1`,
    [y, m]
  );
  const mostActiveBuilding = mbRes.rows[0]?.name || null;

  const recentRes = await pool.query(
    `SELECT wl.id, wl.entry_time, wl.exit_time, wl.duration_seconds,
            u.full_name AS user_name, b.name AS building_name
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     JOIN buildings b ON b.id = wl.building_id
     ORDER BY wl.entry_time DESC
     LIMIT 10`
  );

  return {
    today: {
      totalStaff,
      presentNow,
      absentToday,
      overtimeNow,
      buildingCounts,
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
    /* guruh yo‘q */
  }
  return { profile, attendance, grades, schedule, assignments };
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
  let sentCount = 0;
  for (const uid of ids) {
    await sendNotification(uid, type, title, body, { fromAdmin: adminId });
    sentCount += 1;
  }
  return { sentCount };
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

async function getStaffWorkLogs(staffId, date) {
  const id = Number(staffId);
  if (!Number.isFinite(id)) throw new Error('Noto\'g\'ri identifikator');
  const dateVal = date || todayStr();
  const res = await pool.query(
    `SELECT wl.*, b.name AS building_name, b.short_name AS building_short
     FROM work_logs wl
     JOIN buildings b ON b.id = wl.building_id
     WHERE wl.user_id = $1
       AND DATE(wl.entry_time) = $2::date
     ORDER BY wl.entry_time ASC`,
    [id, dateVal]
  );
  return res.rows;
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
       AND u.is_active = true
       AND u.id NOT IN (
         SELECT DISTINCT ws.user_id FROM work_sessions ws
         WHERE ws.work_date = CURRENT_DATE AND ws.status IN ('active','done')
       )
     ORDER BY u.full_name ASC`
  );
  return res.rows;
}

module.exports = {
  getAllStaff,
  listBuildings,
  getActiveNow,
  getStaffDetail,
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
};
