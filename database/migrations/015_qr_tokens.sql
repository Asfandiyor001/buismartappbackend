-- 1. Jadvalni yaratish
CREATE TABLE IF NOT EXISTS qr_tokens (
    id            SERIAL PRIMARY KEY,
    schedule_id   INT NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    token         VARCHAR(100) UNIQUE NOT NULL, -- Tasodifiy generatsiya qilingan UUID yoki string
    valid_date    DATE NOT NULL,               -- Qaysi kun uchun amal qilishi
    valid_from    TIMESTAMP NOT NULL,          -- Amal qilish boshlanish vaqti
    valid_until   TIMESTAMP NOT NULL,          -- Amal qilish tugash vaqti
    is_used_count INT DEFAULT 0,               -- Skaner qilgan talabalar soni
    created_at    TIMESTAMP DEFAULT NOW()
);

-- 2. Indexlar (Tezkor qidiruv uchun)
CREATE INDEX IF NOT EXISTS idx_qr_tokens_schedule ON qr_tokens(schedule_id);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_date     ON qr_tokens(valid_date);

-- 3. UNIQUE CONSTRAINT (Cursor maslahat bergan eng muhim qism)
-- Bu indeks bitta dars uchun bir kunda faqat bitta QR kod bo'lishini ta'minlaydi
-- Admin qayta generate qilsa, eskisini topib UPDATE qilishga yordam beradi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_qr_tokens_schedule_valid_date 
    ON qr_tokens (schedule_id, valid_date);