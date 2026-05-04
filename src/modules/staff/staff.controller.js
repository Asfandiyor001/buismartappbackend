const staffService = require('./staff.service');
const pool = require('../../config/database');
const geofenceService = require('../work/geofence.service');
const reportService = require('../report/report.service');
const { success, error } = require('../../utils/response');

const getProfile = async (req, res) => {
  try {
    const data = await staffService.getProfile(req.user.id);
    return success(res, data, 'Xodim profili');
  } catch (err) {
    return error(res, err.message, 404);
  }
};

const updateProfile = async (req, res) => {
  try {
    const data = await staffService.updateProfile(req.user.id, req.body);
    return success(res, data, 'Profil yangilandi');
  } catch (err) {
    let status = 400;
    if (err.message.includes('Xodim profili topilmadi')) status = 404;
    if (err.message.includes('Faqat xodimlar')) status = 403;
    return error(res, err.message, status);
  }
};

const getDocuments = async (req, res) => {
  try {
    const data = await staffService.getDocuments(req.user.id);
    return success(res, data, 'Hujjatlar ro\'yxati');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const addDocument = async (req, res) => {
  try {
    const data = await staffService.addDocument(req.user.id, req.body);
    return success(res, data, 'Hujjat qo\'shildi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getVacations = async (req, res) => {
  try {
    const data = await staffService.getVacations(req.user.id);
    return success(res, data, 'Ta\'tillar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const requestVacation = async (req, res) => {
  try {
    const data = await staffService.requestVacation(req.user.id, req.body);
    return success(res, data, 'Ta\'til so\'rovi qabul qilindi');
  } catch (err) {
    return error(res, err.message, 400);
  }
};

const getRewards = async (req, res) => {
  try {
    const data = await staffService.getRewards(req.user.id);
    return success(res, data, 'Mukofotlar va jarimalar');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

const getWorkStats = async (req, res) => {
  try {
    const data = await staffService.getWorkStats(req.user.id);
    return success(res, data, 'Ish statistikasi');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/** Oxirgi oylik hisobot (monthly_reports). */
const getMyReport = async (req, res) => {
  try {
    const report = await reportService.getLatestMonthlyReportForUser(req.user.id);
    return success(res, report, 'Oylik hisobot');
  } catch (err) {
    return error(res, err.message, 500);
  }
};

/**
 * Parse JSON fields from pg and coerce team-status numerics.
 */
function normalizeTeamStatusRow(row) {
  let workLogIntervals = row.work_log_intervals;
  if (typeof workLogIntervals === 'string') {
    try {
      workLogIntervals = JSON.parse(workLogIntervals);
    } catch {
      workLogIntervals = [];
    }
  }
  if (!Array.isArray(workLogIntervals)) workLogIntervals = [];

  let lastLogDetails = row.last_log_details;
  if (typeof lastLogDetails === 'string') {
    try {
      lastLogDetails = JSON.parse(lastLogDetails);
    } catch {
      lastLogDetails = null;
    }
  }

  return {
    ...row,
    checkout_reason:
      row.checkout_reason != null ? String(row.checkout_reason).trim() : null,
    total_work_minutes:
      row.total_work_minutes != null ? Number(row.total_work_minutes) : 0,
    gps_lost_count: row.gps_lost_count != null ? Number(row.gps_lost_count) : 0,
    last_log_details: lastLogDetails,
    work_log_intervals: workLogIntervals,
  };
}

const TEAM_STATUS_SELECT = `
  u.id, u.full_name, u.phone, p.department, p.position,
  ws.status AS work_status, ws.first_entry_time, ws.outside_since, ws.last_ping_at, ws.last_exit_time,
  wl_active.entry_time AS active_log_entry_time,
  wl_latest.checkout_reason,
  COALESCE(
    (SELECT FLOOR(COALESCE(SUM(
      CASE
        WHEN wl3.duration_seconds IS NOT NULL THEN wl3.duration_seconds
        WHEN wl3.is_active THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - wl3.entry_time))::bigint)
        ELSE 0
      END
    ), 0) / 60)::int
     FROM work_logs wl3 WHERE wl3.session_id = ws.id),
    0
  ) AS total_work_minutes,
  COALESCE(
    (SELECT COUNT(*)::int FROM work_logs wl4
     WHERE wl4.session_id = ws.id AND wl4.checkout_reason = 'gps_lost'),
    0
  ) AS gps_lost_count,
  (
    SELECT json_build_object('entry_time', wl5.entry_time, 'exit_time', wl5.exit_time)
    FROM work_logs wl5
    WHERE wl5.session_id = ws.id
    ORDER BY wl5.id DESC
    LIMIT 1
  ) AS last_log_details,
  (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', wl6.id,
          'entry_time', wl6.entry_time,
          'exit_time', wl6.exit_time,
          'duration_seconds', wl6.duration_seconds,
          'checkout_reason', wl6.checkout_reason,
          'is_active', wl6.is_active
        ) ORDER BY wl6.entry_time ASC, wl6.id ASC
      ),
      '[]'::json
    )
    FROM work_logs wl6
    WHERE wl6.session_id = ws.id
  ) AS work_log_intervals
`;

/**
 * Admin: barcha xodimlar. Staff: rekrusiv ostona (supervisor zanjiri).
 */
const getTeamStatus = async (req, res) => {
  try {
    await geofenceService.finalizeInactiveSessions();

    const userId = req.user.id;
    const uid = Number(userId);
    if (!Number.isFinite(uid)) {
      return error(res, "Noto'g'ri foydalanuvchi", 400);
    }
    const { role } = req.user;

    if (role === 'admin') {
      const { rows } = await pool.query(
        `SELECT 0 AS level, ${TEAM_STATUS_SELECT}
         FROM users u
         INNER JOIN staff_profiles p ON p.user_id = u.id
         LEFT JOIN work_sessions ws ON ws.user_id = u.id AND ws.work_date = CURRENT_DATE
         LEFT JOIN work_logs wl_active ON wl_active.session_id = ws.id AND wl_active.is_active = true
         LEFT JOIN LATERAL (
           SELECT wl.checkout_reason
           FROM work_logs wl
           WHERE wl.session_id = ws.id AND wl.exit_time IS NOT NULL
           ORDER BY wl.exit_time DESC, wl.id DESC
           LIMIT 1
         ) wl_latest ON true
         WHERE u.role = 'staff' AND u.is_active = true AND u.id <> $1::int
         ORDER BY p.department ASC NULLS LAST, u.full_name ASC`,
        [uid]
      );
      const team = rows.map(normalizeTeamStatusRow);
      return success(res, { team }, 'Jamoa holati');
    }

    if (role === 'staff') {
      const { rows } = await pool.query(
        `WITH RECURSIVE subordinates AS (
            SELECT sp.user_id, sp.supervisor_id, sp.position, 0 AS level
            FROM staff_profiles sp
            WHERE sp.user_id = $1::int
            UNION ALL
            SELECT s.user_id, s.supervisor_id, s.position, sub.level + 1 AS level
            FROM staff_profiles s
            INNER JOIN subordinates sub ON s.supervisor_id = sub.user_id
         )
         SELECT
            sub.level, ${TEAM_STATUS_SELECT.replace('p.position,', 'sub.position AS position,')}
         FROM subordinates sub
         JOIN users u ON sub.user_id = u.id
         JOIN staff_profiles p ON sub.user_id = p.user_id
         LEFT JOIN work_sessions ws ON ws.user_id = u.id AND ws.work_date = CURRENT_DATE
         LEFT JOIN work_logs wl_active ON wl_active.session_id = ws.id AND wl_active.is_active = true
         LEFT JOIN LATERAL (
           SELECT wl.checkout_reason
           FROM work_logs wl
           WHERE wl.session_id = ws.id AND wl.exit_time IS NOT NULL
           ORDER BY wl.exit_time DESC, wl.id DESC
           LIMIT 1
         ) wl_latest ON true
         WHERE u.id <> $2::int
         ORDER BY sub.level ASC, sub.supervisor_id ASC NULLS LAST, u.id ASC`,
        [uid, uid]
      );
      const team = rows.map(normalizeTeamStatusRow);
      return success(res, { team }, 'Jamoa holati');
    }

    return error(res, 'Ruxsat yo\'q', 403);
  } catch (err) {
    return error(res, err.message, 500);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getDocuments,
  addDocument,
  getVacations,
  requestVacation,
  getRewards,
  getWorkStats,
  getMyReport,
  getTeamStatus,
};
