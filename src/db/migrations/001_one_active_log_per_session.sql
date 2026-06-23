-- ═══════════════════════════════════════════════════════════
-- MIGRATION 001 — Sessiyada faqat BITTA aktiv work_log
-- ───────────────────────────────────────────────────────────
-- Race condition: ikki ping bir vaqtda kelganda ikkita aktiv log
-- yaratilar edi (duplicate) → ish vaqti ikki barobar sanaladi.
-- Bu partial unique index buni DB darajasida butunlay to'sadi.
-- geofence.openNewLog/openNewLogAt'dagi ON CONFLICT shu indeksga tayanadi.
--
-- DIQQAT: index yaratishdan oldin mavjud aktiv duplicatelar bo'lmasligi kerak
-- (002 cleanup ulardan oldin ishlashi mumkin, yoki barcha loglar yopiq bo'lishi kerak).
-- ═══════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_logs_one_active_per_session
  ON work_logs (session_id)
  WHERE is_active = true;
