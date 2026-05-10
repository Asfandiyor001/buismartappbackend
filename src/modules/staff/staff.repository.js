const pool = require('../../config/database');

/**
 * Single-query team status for today: log aggregates, last checkout, intervals — no per-row subqueries.
 *
 * @param {'admin'|'staff'} mode
 * @param {[number]|[number, number]} params — admin: [excludeUserId]; staff: [supervisorUserId, excludeUserId]
 */
async function findTeamStatusToday(mode, params) {
  const sql =
    mode === 'admin' ? TEAM_STATUS_SQL_ADMIN : TEAM_STATUS_SQL_STAFF;
  return pool.query(sql, params);
}

/** Shared CTE core — appended after role-specific staff_scope CTE */
const TEAM_CORE = `
today_sessions AS (
  SELECT
    id,
    user_id,
    status,
    auto_checkout,
    last_ping_at,
    outside_since,
    first_entry_time,
    last_exit_time,
    total_seconds
  FROM work_sessions
  WHERE work_date = CURRENT_DATE
),
log_stats AS (
  SELECT
    wl.session_id,
    SUM(
      CASE
        WHEN wl.duration_seconds IS NOT NULL THEN wl.duration_seconds::bigint
        WHEN wl.is_active THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - wl.entry_time))::bigint)
        ELSE 0::bigint
      END
    ) AS worked_seconds,
    COUNT(*) FILTER (WHERE wl.checkout_reason = 'gps_lost')::int AS gps_lost_count,
    BOOL_OR(wl.is_active) AS has_active_log
  FROM work_logs wl
  INNER JOIN today_sessions ts ON ts.id = wl.session_id
  GROUP BY wl.session_id
),
last_closed AS (
  SELECT DISTINCT ON (wl.session_id)
    wl.session_id,
    wl.id AS last_closed_log_id,
    wl.entry_time AS last_log_entry_time,
    wl.exit_time AS last_log_exit_time,
    wl.checkout_reason AS last_checkout_reason
  FROM work_logs wl
  INNER JOIN today_sessions ts ON ts.id = wl.session_id
  WHERE wl.exit_time IS NOT NULL
  ORDER BY wl.session_id, wl.exit_time DESC, wl.id DESC
),
active_log AS (
  SELECT DISTINCT ON (wl.session_id)
    wl.session_id,
    wl.entry_time AS active_log_entry_time,
    wl.building_id AS active_building_id
  FROM work_logs wl
  INNER JOIN today_sessions ts ON ts.id = wl.session_id
  WHERE wl.is_active = true
  ORDER BY wl.session_id, wl.id DESC
),
log_intervals AS (
  SELECT
    wl.session_id,
    COALESCE(
      json_agg(
        json_build_object(
          'id', wl.id,
          'entry_time', wl.entry_time,
          'exit_time', wl.exit_time,
          'duration_seconds', wl.duration_seconds,
          'checkout_reason', wl.checkout_reason,
          'is_active', wl.is_active
        ) ORDER BY wl.entry_time ASC, wl.id ASC
      ),
      '[]'::json
    ) AS work_log_intervals
  FROM work_logs wl
  INNER JOIN today_sessions ts ON ts.id = wl.session_id
  GROUP BY wl.session_id
)
`;

const SELECT_ROW = `
SELECT
  ss.level,
  u.id,
  u.full_name,
  u.phone,
  ss.position AS position,
  p.department,
  ws.status AS work_status,
  ws.first_entry_time,
  ws.outside_since,
  ws.last_ping_at,
  ws.last_exit_time,
  ws.auto_checkout AS session_auto_checkout,
  al.active_log_entry_time,
  lc.last_checkout_reason,
  lc.last_checkout_reason AS checkout_reason,
  json_build_object(
    'entry_time', lc.last_log_entry_time,
    'exit_time', lc.last_log_exit_time
  ) AS last_log_details,
  COALESCE(ls.worked_seconds, 0)::bigint AS total_work_seconds,
  FLOOR(COALESCE(ls.worked_seconds, 0) / 60)::int AS total_work_minutes,
  GREATEST(
    60::bigint,
    COALESCE(
      NULLIF(p.work_hours_day, 0) * 3600,
      EXTRACT(
        EPOCH FROM (
          COALESCE(p.work_end, TIME '16:30') - COALESCE(p.work_start, TIME '08:30')
        )
      )::bigint
    )
  ) AS scheduled_seconds,
  ROUND(
    (
      COALESCE(ls.worked_seconds, 0)::numeric
      / NULLIF(
          GREATEST(
            60::bigint,
            COALESCE(
              NULLIF(p.work_hours_day, 0) * 3600,
              EXTRACT(
                EPOCH FROM (
                  COALESCE(p.work_end, TIME '16:30') - COALESCE(p.work_start, TIME '08:30')
                )
              )::bigint
            )
          ),
          0
        )
    ) * 100,
    2
  ) AS performance_percent,
  CASE
    WHEN COALESCE(ls.has_active_log, false) THEN 'Ishda'
    WHEN ws.auto_checkout
      OR lc.last_checkout_reason IN ('auto_gps', 'gps_lost', 'system_timeout')
      THEN 'Avto-chiqish'
    ELSE 'Offline'
  END AS status_label,
  COALESCE(ls.gps_lost_count, 0)::int AS gps_lost_count,
  li.work_log_intervals
FROM staff_scope ss
JOIN users u ON u.id = ss.user_id
JOIN staff_profiles p ON p.user_id = u.id
LEFT JOIN today_sessions ws ON ws.user_id = u.id
LEFT JOIN log_stats ls ON ls.session_id = ws.id
LEFT JOIN last_closed lc ON lc.session_id = ws.id
LEFT JOIN active_log al ON al.session_id = ws.id
LEFT JOIN log_intervals li ON li.session_id = ws.id
`;

const TEAM_STATUS_SQL_ADMIN = `
WITH staff_scope AS (
  SELECT
    0 AS level,
    u.id AS user_id,
    p.position AS position
  FROM users u
  INNER JOIN staff_profiles p ON p.user_id = u.id
  WHERE u.role = 'staff'
    AND u.is_active = true
    AND u.id <> $1::int
),
${TEAM_CORE}
${SELECT_ROW}
ORDER BY p.department ASC NULLS LAST, u.full_name ASC
`;

const TEAM_STATUS_SQL_STAFF = `
WITH RECURSIVE subordinates AS (
  SELECT sp.user_id, sp.supervisor_id, sp.position, 0 AS level
  FROM staff_profiles sp
  WHERE sp.user_id = $1::int
  UNION ALL
  SELECT s.user_id, s.supervisor_id, s.position, sub.level + 1 AS level
  FROM staff_profiles s
  INNER JOIN subordinates sub ON s.supervisor_id = sub.user_id
),
staff_scope AS (
  SELECT sub.level, sub.user_id, sub.position, sub.supervisor_id
  FROM subordinates sub
)
,
${TEAM_CORE}
${SELECT_ROW}
WHERE u.id <> $2::int
ORDER BY ss.level ASC, ss.supervisor_id ASC NULLS LAST, u.id ASC
`;

module.exports = {
  findTeamStatusToday,
};