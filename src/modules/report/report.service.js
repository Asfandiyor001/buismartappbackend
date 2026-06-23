const pool = require('../../config/database');
const { todayStr, formatDuration } = require('../../utils/time');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Ish kunlari: faqat Dushanba–Juma, firstDate va bugundan keyin emas. */
function workdaysInMonth(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workdays = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    const dow = new Date(year, month - 1, d).getDay();
    if (dow !== 0 && dow !== 6) workdays += 1;
  }
  return workdays;
}

/** Effective ish kunlari: firstDate dan bugunga qadar (joriy oy uchun). */
function workdaysEffective(year, month, firstDateStr) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  let startDay = 1;
  if (firstDateStr) {
    const [fy, fm, fd] = String(firstDateStr).slice(0, 10).split('-').map(Number);
    if (fy > year || (fy === year && fm > month)) return 0; // tizim hali boshlanmagan
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

function addDaysYmd(ymd, days) {
  const [y, mo, da] = ymd.split('-').map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function workdaysInWeekRange(fromYmd) {
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    const [y, m, d] = addDaysYmd(fromYmd, i).split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return n;
}

function isCurrentMonth(year, month) {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() + 1 === month;
}

async function getDailyReport(userId, date) {
  const workDate = date && String(date).match(/^\d{4}-\d{2}-\d{2}$/) ? date : todayStr();
  const res = await pool.query(
    `SELECT
      ws.id,
      ws.work_date::text AS work_date,
      ws.user_id,
      ws.first_entry_time::text AS first_entry_time,
      ws.last_exit_time::text AS last_exit_time,
      ws.total_seconds,
      ws.regular_seconds,
      ws.overtime_seconds,
      ws.break_seconds,
      ws.status,
      ws.is_finished,
      ws.finished_at,
      ws.buildings_visited,
      ws.building_switches,
      ws.notes,
      ws.created_at,
      ws.updated_at,
      ws.last_ping_at,
      ws.outside_since,
      ws.auto_checkout,
      COALESCE(
        json_agg(
          json_build_object(
            'id', wl.id,
            'building', b.name,
            'buildingShort', b.short_name,
            'entryTime', wl.entry_time,
            'exitTime', wl.exit_time,
            'durationSeconds', wl.duration_seconds,
            'isActive', wl.is_active,
            'isOvertime', wl.is_overtime,
            'entryLat', wl.entry_lat,
            'entryLon', wl.entry_lon
          ) ORDER BY wl.entry_time
        ) FILTER (WHERE wl.id IS NOT NULL),
        '[]'::json
      ) AS logs
     FROM work_sessions ws
     LEFT JOIN work_logs wl ON wl.session_id = ws.id
     LEFT JOIN buildings b ON b.id = wl.building_id
     WHERE ws.user_id = $1 AND ws.work_date = $2::date
     GROUP BY ws.id`,
    [userId, workDate]
  );

  if (res.rows.length === 0) {
    return {
      date: workDate,
      status: null,
      logs: [],
      totalSeconds: 0,
      regularSeconds: 0,
      overtimeSeconds: 0,
      firstEntry: null,
      lastExit: null,
      buildingsVisited: 0,
      buildingSwitches: 0,
      totalFormatted: formatDuration(0),
      overtimeFormatted: formatDuration(0),
    };
  }

  const ws = res.rows[0];
  const logs = typeof ws.logs === 'string' ? JSON.parse(ws.logs) : ws.logs;
  const totalSeconds = Number(ws.total_seconds) || 0;
  const regularSeconds = Number(ws.regular_seconds) || 0;
  const overtimeSeconds = Number(ws.overtime_seconds) || 0;

  return {
    date: workDate,
    status: ws.status,
    logs,
    totalSeconds,
    regularSeconds,
    overtimeSeconds,
    firstEntry: ws.first_entry_time,
    lastExit: ws.last_exit_time,
    buildingsVisited: ws.buildings_visited,
    buildingSwitches: ws.building_switches,
    totalFormatted: formatDuration(totalSeconds),
    overtimeFormatted: formatDuration(overtimeSeconds),
  };
}

async function getWeeklyReport(userId, fromDate) {
  const toExclusive = addDaysYmd(fromDate, 7);
  const res = await pool.query(
    `SELECT ws.work_date::text AS work_date,
            ws.status,
            ws.total_seconds, ws.regular_seconds, ws.overtime_seconds,
            ws.first_entry_time::text AS first_entry_time,
            ws.last_exit_time::text AS last_exit_time,
            ws.buildings_visited, ws.building_switches,
            COUNT(wl.id)::int AS log_count,
            COALESCE(
              json_agg(
                json_build_object(
                  'building', b.name,
                  'duration', wl.duration_seconds
                )
              ) FILTER (WHERE wl.id IS NOT NULL),
              '[]'::json
            ) AS building_breakdown
     FROM work_sessions ws
     LEFT JOIN work_logs wl ON wl.session_id = ws.id
     LEFT JOIN buildings b ON b.id = wl.building_id
     WHERE ws.user_id = $1
       AND ws.work_date >= $2::date
       AND ws.work_date < $3::date
     GROUP BY ws.id
     ORDER BY ws.work_date ASC`,
    [userId, fromDate, toExclusive]
  );

  const byDate = new Map();
  for (const r of res.rows) {
    const key =
      typeof r.work_date === 'string'
        ? r.work_date.slice(0, 10)
        : r.work_date instanceof Date
          ? todayStr(r.work_date)
          : String(r.work_date).slice(0, 10);
    const bd =
      typeof r.building_breakdown === 'string'
        ? JSON.parse(r.building_breakdown)
        : r.building_breakdown;
    byDate.set(key, { ...r, building_breakdown: bd });
  }

  const days = [];
  for (let i = 0; i < 7; i += 1) {
    days.push(byDate.get(addDaysYmd(fromDate, i)) || null);
  }

  const weekEnd = addDaysYmd(fromDate, 6);
  let totalSeconds = 0;
  let regularSeconds = 0;
  let overtimeSeconds = 0;
  let presentDays = 0;
  let absentDays = 0;
  const buildingDuration = new Map();

  for (let i = 0; i < 7; i += 1) {
    const key = addDaysYmd(fromDate, i);
    const [y, m, d] = key.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    if (wd === 0 || wd === 6) continue;
    const row = byDate.get(key);
    if (!row || row.status === 'absent') {
      absentDays += 1;
    } else {
      presentDays += 1;
      totalSeconds += Number(row.total_seconds) || 0;
      regularSeconds += Number(row.regular_seconds) || 0;
      overtimeSeconds += Number(row.overtime_seconds) || 0;
      const bd = row.building_breakdown || [];
      for (const item of bd) {
        if (!item.building) continue;
        const sec = Number(item.duration) || 0;
        buildingDuration.set(
          item.building,
          (buildingDuration.get(item.building) || 0) + sec
        );
      }
    }
  }

  const totalDays = workdaysInWeekRange(fromDate);
  const attendancePct =
    totalDays > 0 ? Math.round((presentDays / totalDays) * 10000) / 100 : 0;

  let mostUsedBuilding = null;
  let maxD = 0;
  for (const [name, sec] of buildingDuration) {
    if (sec > maxD) {
      maxD = sec;
      mostUsedBuilding = name;
    }
  }

  return {
    weekStart: fromDate,
    weekEnd,
    days,
    summary: {
      totalDays,
      presentDays,
      absentDays,
      totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
      regularHours: Math.round((regularSeconds / 3600) * 100) / 100,
      overtimeHours: Math.round((overtimeSeconds / 3600) * 100) / 100,
      attendancePct,
      mostUsedBuilding,
    },
  };
}

async function computeMonthlyFromSessions(userId, year, month) {
  // Foydalanuvchining birinchi sessiya sanasini aniqlaymiz
  const firstRes = await pool.query(
    `SELECT MIN(work_date)::text AS first_date FROM work_sessions WHERE user_id = $1`,
    [userId]
  );
  const firstDate = firstRes.rows[0]?.first_date || null;

  const res = await pool.query(
    `SELECT ws.work_date::text AS work_date,
            ws.status,
            ws.total_seconds, ws.regular_seconds, ws.overtime_seconds,
            ws.buildings_visited,
            ws.first_entry_time::text AS first_entry_time,
            ws.last_exit_time::text AS last_exit_time
     FROM work_sessions ws
     WHERE ws.user_id = $1
       AND EXTRACT(YEAR FROM ws.work_date) = $2
       AND EXTRACT(MONTH FROM ws.work_date) = $3
     ORDER BY ws.work_date ASC`,
    [userId, year, month]
  );
  const sessions = res.rows;

  // Effective ish kunlari: tizim boshlangan kundan bugunga qadar
  const workdaysInM = workdaysEffective(year, month, firstDate);
  let presentDays = 0;
  let vacationDays = 0;
  let sickDays = 0;
  let totalSeconds = 0;
  let regularSeconds = 0;
  let overtimeSeconds = 0;

  const nowJs = new Date();

  for (const s of sessions) {
    let sTotalSec   = Number(s.total_seconds)    || 0;
    let sRegularSec = Number(s.regular_seconds)  || 0;
    let sOvertimeSec= Number(s.overtime_seconds) || 0;

    // Aktiv sessiya uchun real vaqtni hisoblash
    if (s.status === 'active' && s.first_entry_time) {
      const entryStr = `${s.work_date}T${String(s.first_entry_time).slice(0,8)}`;
      const entryTs  = new Date(entryStr);
      if (!isNaN(entryTs.getTime())) {
        const liveTotal = Math.max(0, Math.floor((nowJs - entryTs) / 1000));
        if (liveTotal > sTotalSec) {
          // Standart ish kuni: 08:30–16:30 = 28800 soniya
          const schedSec = 8 * 3600;
          const nowH = nowJs.getHours();
          const nowM = nowJs.getMinutes();
          const afterWorkEnd = nowH > 16 || (nowH === 16 && nowM >= 30);
          sTotalSec    = liveTotal;
          sRegularSec  = Math.min(liveTotal, schedSec);
          sOvertimeSec = afterWorkEnd ? Math.max(0, liveTotal - schedSec) : 0;
        }
      }
    }

    if (s.status === 'vacation') vacationDays += 1;
    else if (s.status === 'sick') sickDays += 1;
    else if (s.status !== 'absent') presentDays += 1;
    totalSeconds    += sTotalSec;
    regularSeconds  += sRegularSec;
    overtimeSeconds += sOvertimeSec;
  }

  const absentDays = Math.max(0, workdaysInM - presentDays - vacationDays - sickDays);
  const expectedHours = workdaysInM * 8;
  const attendancePct =
    workdaysInM > 0 ? Math.round((presentDays / workdaysInM) * 10000) / 100 : 0;

  const logRes = await pool.query(
    `SELECT b.name AS building_name, COALESCE(SUM(wl.duration_seconds), 0)::bigint AS dur
     FROM work_logs wl
     JOIN work_sessions ws ON ws.id = wl.session_id
     JOIN buildings b ON b.id = wl.building_id
     WHERE ws.user_id = $1
       AND EXTRACT(YEAR FROM ws.work_date) = $2
       AND EXTRACT(MONTH FROM ws.work_date) = $3
       AND wl.duration_seconds IS NOT NULL
     GROUP BY b.name`,
    [userId, year, month]
  );

  const buildingStats = {};
  let mostUsedBuilding = null;
  let maxSec = 0;
  for (const r of logRes.rows) {
    const h = Number(r.dur) / 3600;
    const rounded = Math.round(h * 100) / 100;
    buildingStats[r.building_name] = rounded;
    if (Number(r.dur) > maxSec) {
      maxSec = Number(r.dur);
      mostUsedBuilding = r.building_name;
    }
  }

  const summary = {
    workdaysInMonth: workdaysInM,
    presentDays,
    absentDays,
    vacationDays,
    sickDays,
    attendancePct,
    totalHours: Math.round((totalSeconds / 3600) * 100) / 100,
    regularHours: Math.round((regularSeconds / 3600) * 100) / 100,
    overtimeHours: Math.round((overtimeSeconds / 3600) * 100) / 100,
    expectedHours,
    mostUsedBuilding,
    buildingStats,
  };

  return { sessions, summary };
}

async function getMonthlyReport(userId, year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error('Yil yoki oy noto\'g\'ri');
  }

  const current = isCurrentMonth(y, m);
  const { sessions, summary } = await computeMonthlyFromSessions(userId, y, m);

  if (!current) {
    const c = summary;
    try {
      await pool.query(
        `INSERT INTO monthly_reports (
           user_id, year, month,
           total_work_days, present_days, absent_days, vacation_days, sick_days,
           attendance_pct, total_hours, regular_hours, overtime_hours,
           break_hours, expected_hours, most_used_building, building_stats
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (user_id, year, month) DO UPDATE SET
           total_work_days = EXCLUDED.total_work_days,
           present_days = EXCLUDED.present_days,
           absent_days = EXCLUDED.absent_days,
           vacation_days = EXCLUDED.vacation_days,
           sick_days = EXCLUDED.sick_days,
           attendance_pct = EXCLUDED.attendance_pct,
           total_hours = EXCLUDED.total_hours,
           regular_hours = EXCLUDED.regular_hours,
           overtime_hours = EXCLUDED.overtime_hours,
           expected_hours = EXCLUDED.expected_hours,
           most_used_building = EXCLUDED.most_used_building,
           building_stats = EXCLUDED.building_stats,
           generated_at = NOW()`,
        [
          userId,
          y,
          m,
          c.workdaysInMonth,
          c.presentDays,
          c.absentDays,
          c.vacationDays,
          c.sickDays,
          c.attendancePct,
          c.totalHours,
          c.regularHours,
          c.overtimeHours,
          0,
          c.expectedHours,
          c.mostUsedBuilding,
          c.buildingStats || {},
        ]
      );
    } catch (insertErr) {
      console.warn(`monthly_reports INSERT xatosi (user=${userId}, ${y}/${m}):`, insertErr.message);
    }
  }

  return { year: y, month: m, sessions, summary };
}

async function getYearlyReport(userId, year) {
  const y = Number(year);
  if (!Number.isFinite(y)) {
    throw new Error('Yil noto\'g\'ri');
  }

  const res = await pool.query(
    `SELECT
       EXTRACT(MONTH FROM work_date)::int AS month,
       COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'absent')::int AS present_days,
       COALESCE(SUM(total_seconds), 0)::bigint AS total_seconds,
       COALESCE(SUM(overtime_seconds), 0)::bigint AS overtime_seconds
     FROM work_sessions
     WHERE user_id = $1 AND EXTRACT(YEAR FROM work_date) = $2
     GROUP BY EXTRACT(MONTH FROM work_date)
     ORDER BY month ASC`,
    [userId, y]
  );

  const byMonth = new Map();
  for (const r of res.rows) {
    byMonth.set(Number(r.month), r);
  }

  const months = [];
  let yearTotalSeconds = 0;
  let yearOvertimeSeconds = 0;
  let yearPresentDays = 0;

  for (let mo = 1; mo <= 12; mo += 1) {
    if (byMonth.has(mo)) {
      const row = byMonth.get(mo);
      const ts = Number(row.total_seconds) || 0;
      const ot = Number(row.overtime_seconds) || 0;
      const pd = Number(row.present_days) || 0;
      yearTotalSeconds += ts;
      yearOvertimeSeconds += ot;
      yearPresentDays += pd;
      months.push({
        month: mo,
        present_days: pd,
        total_seconds: ts,
        overtime_seconds: ot,
        total_hours: Math.round((ts / 3600) * 100) / 100,
        overtime_hours: Math.round((ot / 3600) * 100) / 100,
      });
    } else {
      months.push(null);
    }
  }

  return {
    year: y,
    months,
    totals: {
      presentDays: yearPresentDays,
      totalHours: Math.round((yearTotalSeconds / 3600) * 100) / 100,
      overtimeHours: Math.round((yearOvertimeSeconds / 3600) * 100) / 100,
    },
  };
}

/** Oxirgi yozilgan oylik hisobot (DB jadvalidan). */
async function getLatestMonthlyReportForUser(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    throw new Error('Foydalanuvchi identifikatori noto\'g\'ri');
  }
  const res = await pool.query(
    `SELECT *
     FROM monthly_reports
     WHERE user_id = $1
     ORDER BY year DESC, month DESC
     LIMIT 1`,
    [uid]
  );
  return res.rows[0] || null;
}

async function getBuildingReport(buildingId, date) {
  const bid = Number(buildingId);
  if (!Number.isFinite(bid)) {
    throw new Error('Bino identifikatori noto\'g\'ri');
  }
  const d = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? date : todayStr();

  const bRes = await pool.query('SELECT * FROM buildings WHERE id = $1', [bid]);
  const building = bRes.rows[0];
  if (!building) {
    throw new Error('Bino topilmadi');
  }

  const res = await pool.query(
    `SELECT
       u.id, u.full_name, u.avatar_url,
       sp.department, sp.position,
       wl.entry_time, wl.exit_time,
       wl.duration_seconds, wl.is_active
     FROM work_logs wl
     JOIN users u ON u.id = wl.user_id
     LEFT JOIN staff_profiles sp ON sp.user_id = u.id
     WHERE wl.building_id = $1
       AND (wl.entry_time::date) = $2::date
     ORDER BY wl.entry_time ASC`,
    [bid, d]
  );

  const staff = res.rows;
  const activeCount = staff.filter((r) => r.is_active).length;

  return {
    building,
    date: d,
    staff,
    totalCount: staff.length,
    activeCount,
  };
}

module.exports = {
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getYearlyReport,
  getBuildingReport,
  getLatestMonthlyReportForUser,
};
