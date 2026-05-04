const pool = require('../../config/database');
const { todayStr } = require('../../utils/time');
const { haversineDistance, isInsideBuilding } = require('../../utils/gps');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** JS Date → PostgreSQL day_of_week: 1=Dushanba … 7=Yakshanba */
function dayOfWeekPg(d = new Date()) {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function mondayOfWeekContaining(ref, weekOffset = 0) {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff + weekOffset * 7);
  return d;
}

function formatYmd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function getGroupNameOrThrow(userId) {
  const r = await pool.query(
    'SELECT group_name FROM student_profiles WHERE user_id = $1',
    [userId]
  );
  const gn = r.rows[0]?.group_name;
  if (!gn) {
    throw new Error('Guruh topilmadi');
  }
  return gn;
}

async function getProfile(userId) {
  const res = await pool.query(
    `SELECT
       u.id, u.full_name, u.phone, u.role,
       u.avatar_url, u.last_login, u.created_at,
       sp.group_name, sp.year, sp.department,
       sp.birth_date, sp.gender, sp.address,
       sp.education_level, sp.passport_series
     FROM users u
     LEFT JOIN student_profiles sp ON sp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'student'`,
    [userId]
  );
  const row = res.rows[0];
  if (!row) {
    throw new Error('Talaba topilmadi');
  }
  return row;
}

async function getSchedule(userId, weekOffset = 0) {
  const groupName = await getGroupNameOrThrow(userId);
  const off = Number(weekOffset) || 0;
  const monday = mondayOfWeekContaining(new Date(), off);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = formatYmd(monday);
  const weekEnd = formatYmd(sunday);

  const res = await pool.query(
    `SELECT
       s.id, s.subject, s.room, s.day_of_week,
       s.start_time, s.end_time, s.color, s.semester,
       u.full_name AS teacher_name,
       b.name AS building_name, b.short_name,
       qt.token AS qr_token, qt.valid_from, qt.valid_until
     FROM schedules s
     LEFT JOIN users u ON u.id = s.teacher_id
     LEFT JOIN buildings b ON b.id = s.building_id
     LEFT JOIN qr_tokens qt ON qt.schedule_id = s.id
       AND qt.valid_date = CURRENT_DATE
     WHERE s.group_name = $1 AND s.is_active = true
     ORDER BY s.day_of_week, s.start_time`,
    [groupName]
  );

  const days = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const row of res.rows) {
    const dow = Number(row.day_of_week);
    if (days[dow]) days[dow].push(row);
  }
  return { weekStart, weekEnd, days };
}

async function getTodaySchedule(userId) {
  const groupName = await getGroupNameOrThrow(userId);
  const dow = dayOfWeekPg();

  const res = await pool.query(
    `SELECT
       s.id, s.subject, s.room, s.day_of_week,
       s.start_time, s.end_time, s.color, s.semester,
       u.full_name AS teacher_name,
       b.name AS building_name, b.short_name,
       qt.token AS qr_token, qt.valid_from, qt.valid_until,
       sa.status AS attendance_status
     FROM schedules s
     LEFT JOIN users u ON u.id = s.teacher_id
     LEFT JOIN buildings b ON b.id = s.building_id
     LEFT JOIN qr_tokens qt ON qt.schedule_id = s.id
       AND qt.valid_date = CURRENT_DATE
     LEFT JOIN student_attendance sa ON sa.schedule_id = s.id
       AND sa.student_id = $2
       AND sa.attend_date = CURRENT_DATE
     WHERE s.group_name = $1 AND s.is_active = true AND s.day_of_week = $3
     ORDER BY s.start_time`,
    [groupName, userId, dow]
  );

  return res.rows.map(({ attendance_status, ...row }) => ({
    ...row,
    attendanceStatus: attendance_status ?? null,
  }));
}

function parseTimeToMsFromMidnight(t) {
  const s = String(t).slice(0, 8);
  const [hh, mm, ss] = s.split(':').map((x) => Number(x) || 0);
  return ((hh * 60 + mm) * 60 + ss) * 1000;
}

function todayAtScheduleTime(dateStr, timeVal) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms = parseTimeToMsFromMidnight(timeVal);
  const base = new Date(y, m - 1, d, 0, 0, 0, 0);
  return base.getTime() + ms;
}

async function qrCheckIn(userId, token, lat, lon) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tokRes = await client.query(
      `SELECT
         qt.id AS qr_token_pk,
         qt.schedule_id,
         qt.token,
         qt.valid_from,
         qt.valid_until,
         s.id AS schedule_row_id,
         s.subject,
         s.start_time,
         s.end_time,
         s.semester,
         s.group_name,
         b.latitude,
         b.longitude,
         b.radius_m
       FROM qr_tokens qt
       JOIN schedules s ON s.id = qt.schedule_id
       JOIN buildings b ON b.id = s.building_id
       WHERE qt.token = $1`,
      [token]
    );
    const row = tokRes.rows[0];
    if (!row) {
      throw new Error('QR kod topilmadi');
    }

    const validFrom = new Date(row.valid_from);
    const validUntil = new Date(row.valid_until);
    const now = new Date();
    if (now < validFrom) {
      throw new Error('Dars hali boshlanmagan');
    }
    if (now > validUntil) {
      throw new Error('QR kod muddati tugagan');
    }

    const building = {
      latitude: row.latitude,
      longitude: row.longitude,
      radius_m: row.radius_m,
    };
    if (!isInsideBuilding(lat, lon, building)) {
      throw new Error('Siz auditoriyada emassiz (GPS tasdiqlanmadi)');
    }

    const scheduleId = row.schedule_row_id;
    const attendDate = todayStr(now);

    const exist = await client.query(
      `SELECT * FROM student_attendance
       WHERE student_id = $1 AND schedule_id = $2 AND attend_date = CURRENT_DATE`,
      [userId, scheduleId]
    );
    if (exist.rows.length > 0 && exist.rows[0].status === 'present') {
      throw new Error('Davomat allaqachon belgilangan');
    }

    const prevStatus = exist.rows[0]?.status;
    const bumpSummary =
      !exist.rows.length ||
      prevStatus === 'absent' ||
      prevStatus === 'excused';

    const startMs = todayAtScheduleTime(attendDate, row.start_time);
    const nowMs = now.getTime();
    const lateMinutes = Math.max(0, Math.floor((nowMs - startMs) / 60000));

    let status;
    if (nowMs <= startMs + 10 * 60 * 1000) {
      status = 'present';
    } else if (nowMs <= startMs + 20 * 60 * 1000) {
      status = 'late';
    } else {
      status = 'present';
    }

    const distM = Number(haversineDistance(lat, lon, building.latitude, building.longitude).toFixed(2));

    const upAtt = await client.query(
      `INSERT INTO student_attendance (
         student_id, schedule_id, qr_token_id, attend_date,
         status, check_in_time, late_minutes,
         check_in_lat, check_in_lon, gps_confirmed, gps_distance_m
       ) VALUES ($1, $2, $3, CURRENT_DATE, $4, NOW(), $5, $6, $7, true, $8)
       ON CONFLICT (student_id, schedule_id, attend_date)
       DO UPDATE SET
         status = EXCLUDED.status,
         check_in_time = EXCLUDED.check_in_time,
         late_minutes = EXCLUDED.late_minutes,
         check_in_lat = EXCLUDED.check_in_lat,
         check_in_lon = EXCLUDED.check_in_lon,
         gps_confirmed = EXCLUDED.gps_confirmed,
         gps_distance_m = EXCLUDED.gps_distance_m,
         qr_token_id = EXCLUDED.qr_token_id
       RETURNING *`,
      [userId, scheduleId, row.qr_token_pk, status, lateMinutes, lat, lon, distM]
    );
    const attendance = upAtt.rows[0];

    await client.query(
      'UPDATE qr_tokens SET is_used_count = is_used_count + 1 WHERE id = $1',
      [row.qr_token_pk]
    );

    const gRes = await client.query(
      'SELECT group_name FROM student_profiles WHERE user_id = $1',
      [userId]
    );
    const groupName = gRes.rows[0]?.group_name;
    if (!groupName) {
      throw new Error('Guruh topilmadi');
    }

    const subject = row.subject;
    const semester = row.semester == null ? '' : String(row.semester);

    if (bumpSummary) {
      const totalRes = await client.query(
        `SELECT COUNT(*)::int AS c FROM schedules
         WHERE group_name = $1 AND subject = $2
           AND COALESCE(semester, '') = $3
           AND is_active = true`,
        [groupName, subject, semester]
      );
      const totalClasses = Math.max(1, totalRes.rows[0].c);

      const sumRes = await client.query(
        `SELECT * FROM attendance_summary
         WHERE student_id = $1 AND subject = $2 AND semester = $3`,
        [userId, subject, semester]
      );

      const lateDelta = status === 'late' ? 1 : 0;

      if (sumRes.rows.length === 0) {
        const presentCount = 1;
        const lateCount = lateDelta;
        const pct =
          Math.round((presentCount * 10000) / totalClasses) / 100;
        await client.query(
          `INSERT INTO attendance_summary (
             student_id, subject, semester, total_classes,
             present_count, absent_count, late_count, excused_count,
             attendance_pct, is_warning, updated_at
           ) VALUES ($1, $2, $3, $4, $5, 0, $6, 0, $7, $8, NOW())`,
          [
            userId,
            subject,
            semester,
            totalClasses,
            presentCount,
            lateCount,
            pct,
            pct < 80,
          ]
        );
      } else {
        const ex = sumRes.rows[0];
        const tc = Math.max(Number(ex.total_classes) || 0, totalClasses);
        const newP = Number(ex.present_count) + 1;
        const newL = Number(ex.late_count) + lateDelta;
        const pct = Math.round((newP * 10000) / tc) / 100;
        await client.query(
          `UPDATE attendance_summary SET
             total_classes = $1,
             present_count = $2,
             late_count = $3,
             attendance_pct = $4,
             is_warning = $5,
             updated_at = NOW()
           WHERE id = $6`,
          [tc, newP, newL, pct, pct < 80, ex.id]
        );
      }
    }

    const latePart =
      lateMinutes > 0 ? ` Kech: ${lateMinutes} daqiqa` : '';
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'davomat', $2, $3)`,
      [
        userId,
        'Davomat tasdiqlandi ✓',
        `${row.subject} — ${String(row.start_time).slice(0, 5)}.${latePart}`,
      ]
    );

    await client.query('COMMIT');
    return {
      attendance,
      subject: row.subject,
      status,
      lateMinutes,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function getMyAttendance(userId, subject, semester) {
  const params = [userId];
  let idx = 2;
  let where = 'WHERE sa.student_id = $1';
  if (subject) {
    where += ` AND s.subject = $${idx}`;
    params.push(subject);
    idx += 1;
  }
  if (semester) {
    where += ` AND s.semester = $${idx}`;
    params.push(semester);
    idx += 1;
  }

  const res = await pool.query(
    `SELECT
       sa.*, s.subject, s.start_time, s.end_time,
       s.room, s.day_of_week, s.semester
     FROM student_attendance sa
     JOIN schedules s ON s.id = sa.schedule_id
     ${where}
     ORDER BY sa.attend_date DESC, s.start_time`,
    params
  );
  const records = res.rows;
  let presentCount = 0;
  let absentCount = 0;
  let lateCount = 0;
  for (const r of records) {
    if (r.status === 'present') presentCount += 1;
    else if (r.status === 'absent') absentCount += 1;
    else if (r.status === 'late') lateCount += 1;
  }
  return {
    records,
    total: records.length,
    presentCount,
    absentCount,
    lateCount,
  };
}

async function getAttendanceSummary(userId) {
  const res = await pool.query(
    `SELECT ats.*
     FROM attendance_summary ats
     WHERE ats.student_id = $1
     ORDER BY ats.attendance_pct ASC NULLS LAST`,
    [userId]
  );
  const subjects = res.rows;
  let sumPresent = 0;
  let sumTotal = 0;
  const warningSubjects = [];
  for (const s of subjects) {
    const tc = Number(s.total_classes) || 0;
    const pc = Number(s.present_count) || 0;
    sumPresent += pc;
    sumTotal += tc;
    if (s.is_warning) warningSubjects.push(s.subject);
  }
  const overallPct =
    sumTotal > 0 ? Math.round((sumPresent * 10000) / sumTotal) / 100 : 0;
  return {
    subjects,
    overall: {
      overallPct,
      warningSubjects,
      totalClasses: sumTotal,
      totalPresent: sumPresent,
    },
  };
}

async function getGrades(userId, semester) {
  const params = [userId];
  let where = 'WHERE g.student_id = $1';
  if (semester != null && String(semester).length > 0) {
    where += ' AND g.semester = $2';
    params.push(semester);
  }
  const res = await pool.query(
    `SELECT g.*,
            u.full_name AS teacher_name
     FROM grades g
     LEFT JOIN users u ON u.id = g.teacher_id
     ${where}
     ORDER BY g.subject`,
    params
  );
  const grades = res.rows;
  const gpaParts = [];
  for (const g of grades) {
    if (g.is_passed && g.total != null) {
      gpaParts.push((Number(g.total) / 100) * 4.0);
    }
  }
  const gpa =
    gpaParts.length > 0
      ? Math.round((gpaParts.reduce((a, b) => a + b, 0) / gpaParts.length) * 100) / 100
      : null;
  return { grades, gpa, semester: semester || null };
}

async function getAssignments(userId) {
  const groupName = await getGroupNameOrThrow(userId);
  const res = await pool.query(
    `SELECT
       a.*,
       u.full_name AS teacher_name,
       sub.id AS submission_id,
       sub.status AS submission_status,
       sub.score, sub.submitted_at, sub.feedback
     FROM assignments a
     LEFT JOIN users u ON u.id = a.teacher_id
     LEFT JOIN assignment_submissions sub
       ON sub.assignment_id = a.id AND sub.student_id = $2
     WHERE a.group_name = $1
     ORDER BY a.deadline ASC`,
    [groupName, userId]
  );

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const enrich = (row) => {
    const dl = new Date(row.deadline).getTime();
    const submitted =
      row.submission_id != null &&
      ['submitted', 'graded', 'late'].includes(row.submission_status);
    return {
      ...row,
      isUrgent: !submitted && dl > now && dl <= now + dayMs,
      isOverdue: !submitted && dl < now,
    };
  };

  const all = res.rows.map(enrich);
  const pending = [];
  const urgent = [];
  const submitted = [];
  const overdue = [];

  for (const a of all) {
    const hasSub =
      a.submission_id != null &&
      ['submitted', 'graded', 'late'].includes(a.submission_status);
    if (hasSub) {
      submitted.push(a);
      continue;
    }
    if (a.isOverdue) {
      overdue.push(a);
    } else if (a.isUrgent) {
      urgent.push(a);
    } else {
      pending.push(a);
    }
  }

  return { pending, urgent, submitted, overdue };
}

async function submitAssignment(userId, assignmentId, data) {
  const { file_url, comment } = data || {};
  if (!file_url) {
    throw new Error('file_url majburiy');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupName = await getGroupNameOrThrow(userId);

    const aRes = await client.query(
      'SELECT * FROM assignments WHERE id = $1',
      [assignmentId]
    );
    const a = aRes.rows[0];
    if (!a) {
      throw new Error('Topshiriq topilmadi');
    }
    if (a.group_name !== groupName) {
      throw new Error('Bu topshiriq sizning guruhingiz uchun emas');
    }

    const subRes = await client.query(
      `SELECT * FROM assignment_submissions
       WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, userId]
    );
    const existing = subRes.rows[0];
    if (existing && existing.status === 'graded') {
      throw new Error('Topshiriq allaqachon baholangan');
    }

    const deadlineMs = new Date(a.deadline).getTime();
    const late = Date.now() > deadlineMs;
    const submissionStatus = late ? 'late' : 'submitted';

    const ins = await client.query(
      `INSERT INTO assignment_submissions (
         assignment_id, student_id, file_url, comment, status, submitted_at
       ) VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET
         file_url = EXCLUDED.file_url,
         comment = EXCLUDED.comment,
         status = EXCLUDED.status,
         submitted_at = NOW()
       RETURNING *`,
      [assignmentId, userId, file_url, comment || null, submissionStatus]
    );
    const submission = ins.rows[0];

    const stu = await client.query(
      'SELECT full_name FROM users WHERE id = $1',
      [userId]
    );
    const studentName = stu.rows[0]?.full_name || 'Talaba';

    if (a.teacher_id) {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'topshiriq', $2, $3)`,
        [
          a.teacher_id,
          'Yangi topshiriq keldi',
          `${studentName} — ${a.title}`,
        ]
      );
    }

    await client.query('COMMIT');
    return submission;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getProfile,
  getSchedule,
  getTodaySchedule,
  qrCheckIn,
  getMyAttendance,
  getAttendanceSummary,
  getGrades,
  getAssignments,
  submitAssignment,
};
