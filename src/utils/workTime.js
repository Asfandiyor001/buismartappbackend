// ═══════════════════════════════════════════════════════════
// ISH VAQTI — YAGONA KANONIK HISOB FORMULASI
// ───────────────────────────────────────────────────────────
// GPS faqat JOYLASHUVNI tasdiqlaydi (bino ichida/tashqarida).
// ISH VAQTI esa birinchi kirish (first_entry_time) dan oxirgi
// chiqish (last_exit_time / NOW()) gacha bo'lgan ORALIQ —
// abet (13:00–14:00, 1 soat) ayriladi.
//
// worked = GREATEST(
//            SUM(work_logs.duration_seconds),     -- GPS tasdiqlagan vaqt (pol)
//            (oxir − boshlanish) − abet_overlap   -- haqiqiy oraliq
//          )  , 9 soatga cheklangan (TOTAL_CAP)
//
// Nega GREATEST? GPS ping uzilsa loglar kichik bo'lib qoladi
// (xodim 8 soat ishlasa ham 54 daqiqa ko'rsatardi). Oraliq vaqt
// bu bo'shliqlarni to'ldiradi. Pol sifatida loglar yig'indisi —
// agar xodim haqiqatan ko'p bino almashgan bo'lsa kam bo'lmasligi uchun.
//
// Tip eslatmasi: first_entry_time/last_exit_time = TIME, shuning uchun
// CURRENT_DATE + ustun => timestamp. last_ping_at/entry_time = timestamp.
// Ulanish timezone = Asia/Tashkent, NOW()/CURRENT_DATE mahalliy vaqt.
// ═══════════════════════════════════════════════════════════

const REGULAR_CAP = 8 * 3600;   // 28800 — normal ish kuni (8 soat)
const TOTAL_CAP = 9 * 3600;     // 32400 — maksimum (8s + 1s overtime)
const ABET_SECONDS = 3600;      // 13:00–14:00 tushlik tanaffusi

// SQL interval konstantalari (kanonik kun chegaralari)
const EOD = `INTERVAL '18 hours'`;                 // ish kuni qat'iy oxiri (18:00)
const WORK_END = `INTERVAL '16 hours 30 minutes'`; // standart tugash (16:30)
const ABET_START = `INTERVAL '13 hours'`;          // tushlik boshlanishi
const ABET_END = `INTERVAL '14 hours'`;            // tushlik tugashi

/**
 * work_sessions qatori uchun "ishlangan soniya" SQL ifodasini quradi.
 * @param {string} alias — work_sessions jadval aliasi (masalan 'ws')
 * @param {string|null} logSumOverride — log yig'indisi uchun maxsus SQL
 *        (masalan staff.repository'da jonli aktiv-log vaqtini ham qo'shadigan
 *         CTE qiymati). Berilmasa yopilgan loglar yig'indisi ishlatiladi.
 * @returns {string} SELECT/UPDATE ichida ishlatish mumkin bo'lgan SQL ifoda
 */
function workedSecondsSql(alias, logSumOverride = null) {
  const ws = alias;

  // GPS tasdiqlagan vaqt (pol). Yopilgan loglar yig'indisi.
  const logSum =
    logSumOverride ||
    `(SELECT COALESCE(SUM(duration_seconds), 0)
        FROM work_logs
       WHERE session_id = ${ws}.id AND exit_time IS NOT NULL)`;

  // Oraliq boshlanishi — birinchi kirish vaqti (timestamp'ga aylantirilgan)
  const startTs = `(CURRENT_DATE + ${ws}.first_entry_time)`;

  // Oraliq oxiri:
  //   aktiv sessiya  → hozir (18:00 dan oshmaydi)
  //   yopilgan sessiya → last_exit_time (18:00 cap), bo'lmasa last_ping yoki 16:30
  const endTs = `(CASE
      WHEN ${ws}.is_finished = false THEN
        LEAST(NOW(), CURRENT_DATE + ${EOD})
      ELSE
        LEAST(
          CURRENT_DATE + ${EOD},
          COALESCE(
            (CURRENT_DATE + ${ws}.last_exit_time),
            ${ws}.last_ping_at,
            CURRENT_DATE + ${WORK_END}
          )
        )
    END)`;

  // Abet kesishishi — [start, end] oralig'ining [13:00, 14:00] bilan umumiy qismi
  const abetOverlap = `GREATEST(0, EXTRACT(EPOCH FROM (
        LEAST(${endTs}, CURRENT_DATE + ${ABET_END})
        - GREATEST(${startTs}, CURRENT_DATE + ${ABET_START})
      ))::bigint)`;

  // Haqiqiy oraliq (abet ayrilgan)
  const spanSeconds = `GREATEST(0,
      EXTRACT(EPOCH FROM (${endTs} - ${startTs}))::bigint - ${abetOverlap})`;

  // GREATEST(log yig'indisi, oraliq) — 9 soatga cheklangan
  // first_entry_time NULL bo'lsa (absent) → span NULL → GREATEST log polini beradi (0)
  return `LEAST(${TOTAL_CAP}::bigint,
      GREATEST(COALESCE(${logSum}, 0)::bigint, COALESCE(${spanSeconds}, 0)::bigint))`;
}

module.exports = {
  REGULAR_CAP,
  TOTAL_CAP,
  ABET_SECONDS,
  workedSecondsSql,
};
