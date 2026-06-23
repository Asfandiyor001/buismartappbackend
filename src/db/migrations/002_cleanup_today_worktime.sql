-- ═══════════════════════════════════════════════════════════
-- MIGRATION 002 — Bugungi buzuq ish-vaqti ma'lumotlarini tuzatish (bir martalik)
-- ───────────────────────────────────────────────────────────
-- 1) Duplicate work_logs ni o'chirish (sub-soniya farqli double-insert)
-- 2) 18:00 (EOD) dan keyingi soxta loglarni tozalash/cheklash
-- 3) last_exit_time ni haqiqiy (capped) chiqishga moslash
-- 4) total/regular/overtime ni KANONIK formula bilan qayta hisoblash
-- ═══════════════════════════════════════════════════════════

BEGIN;

-- ── 1. DUPLICATE loglarni o'chirish ──────────────────────────────
-- Bir sessiyada entry_time'i ~1 soniyadan kam farq qiladigan juftliklar =
-- konkurent double-insert. Kichik id qoldiriladi, kattasi o'chiriladi.
DELETE FROM work_logs wl2
USING work_logs wl1
WHERE wl1.session_id = wl2.session_id
  AND wl1.id < wl2.id
  AND wl1.is_active = false
  AND wl2.is_active = false
  AND ABS(EXTRACT(EPOCH FROM (wl1.entry_time - wl2.entry_time))) < 1
  AND DATE(wl2.entry_time) = CURRENT_DATE;

-- ── 2a. To'liq 18:00 dan KEYIN boshlangan loglarni o'chirish ──────
-- (masalan entry 18:08 → 20:27) — ish kuni tugagandan keyingi ghost loglar.
DELETE FROM work_logs
WHERE DATE(entry_time) = CURRENT_DATE
  AND entry_time >= DATE(entry_time) + INTERVAL '18 hours';

-- ── 2b. 18:00 dan oshgan chiqishni 18:00 ga cheklash ─────────────
UPDATE work_logs
SET exit_time = DATE(entry_time) + INTERVAL '18 hours',
    duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM (
      DATE(entry_time) + INTERVAL '18 hours' - entry_time))::int)
WHERE DATE(entry_time) = CURRENT_DATE
  AND exit_time IS NOT NULL
  AND exit_time > DATE(entry_time) + INTERVAL '18 hours';

-- ── 3. last_exit_time ni haqiqiy oxirgi (capped) chiqishga moslash ─
UPDATE work_sessions ws
SET last_exit_time = (LEAST(
      CURRENT_DATE + INTERVAL '18 hours',
      COALESCE(
        (SELECT MAX(exit_time) FROM work_logs
          WHERE session_id = ws.id AND exit_time IS NOT NULL),
        CURRENT_DATE + INTERVAL '16 hours 30 minutes'
      )
    ))::time
WHERE ws.work_date = CURRENT_DATE
  AND ws.is_finished = true
  AND ws.first_entry_time IS NOT NULL;

-- ── 4. total/regular/overtime ni KANONIK formula bilan qayta hisoblash ─
-- worked = GREATEST(SUM(loglar), (kirish→chiqish oraliq − abet)), 9s cap
UPDATE work_sessions ws
SET total_seconds = calc.worked,
    regular_seconds = LEAST(calc.worked, 28800),
    overtime_seconds = GREATEST(0, calc.worked - 28800),
    updated_at = NOW()
FROM (
  SELECT s.id,
    LEAST(32400, GREATEST(
      COALESCE((SELECT SUM(duration_seconds) FROM work_logs
                 WHERE session_id = s.id AND exit_time IS NOT NULL), 0),
      GREATEST(0,
        EXTRACT(EPOCH FROM (
          (CASE
             WHEN s.is_finished = false THEN LEAST(NOW(), CURRENT_DATE + INTERVAL '18 hours')
             ELSE LEAST(CURRENT_DATE + INTERVAL '18 hours',
                        COALESCE((CURRENT_DATE + s.last_exit_time),
                                 s.last_ping_at,
                                 CURRENT_DATE + INTERVAL '16 hours 30 minutes'))
           END)
          - (CURRENT_DATE + s.first_entry_time)
        ))::bigint
        -- abet (13:00–14:00) kesishishi ayriladi
        - GREATEST(0, EXTRACT(EPOCH FROM (
            LEAST(
              (CASE
                 WHEN s.is_finished = false THEN LEAST(NOW(), CURRENT_DATE + INTERVAL '18 hours')
                 ELSE LEAST(CURRENT_DATE + INTERVAL '18 hours',
                            COALESCE((CURRENT_DATE + s.last_exit_time),
                                     s.last_ping_at,
                                     CURRENT_DATE + INTERVAL '16 hours 30 minutes'))
               END),
              CURRENT_DATE + INTERVAL '14 hours')
            - GREATEST((CURRENT_DATE + s.first_entry_time),
                       CURRENT_DATE + INTERVAL '13 hours')
          ))::bigint)
      )
    ))::int AS worked
  FROM work_sessions s
  WHERE s.work_date = CURRENT_DATE
    AND s.first_entry_time IS NOT NULL
) calc
WHERE ws.id = calc.id;

COMMIT;
