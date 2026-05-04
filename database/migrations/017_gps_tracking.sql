-- 1. YAShIRIN GPS HARAKATLARINI SAQLASh UCHUN YANGI JADVAL
CREATE TABLE IF NOT EXISTS gps_pings (
    id            SERIAL PRIMARY KEY,
    user_id       INT REFERENCES users(id) ON DELETE CASCADE,
    latitude      DECIMAL(10,8) NOT NULL,
    longitude     DECIMAL(11,8) NOT NULL,
    accuracy_m    DECIMAL(6,2),               -- GPS aniqligi (metrlarda)
    building_id   INT REFERENCES buildings(id), -- Agar bino ichida bo'lsa
    distance_m    DECIMAL(8,2),               -- Binoning markaziga bo'lgan masofa
    is_inside     BOOLEAN DEFAULT false,      -- Bino radiusida yoki yo'qmi
    action        VARCHAR(30),                -- backend yozadigan status ('auto_checkin', 'outside_waiting', va h.k.)
    created_at    TIMESTAMP DEFAULT NOW()
);

-- Qidiruvni tezlashtirish uchun indeks (Xodimning oxirgi joylashuvini tez topish uchun)
CREATE INDEX IF NOT EXISTS idx_gps_user ON gps_pings(user_id, created_at DESC);


-- 2. MAVJUD work_sessions JADVALINI KENGAYTIRISH
-- (Avtomatik check-out va ping vaqtlarini kuzatish uchun qo'shimcha ustunlar)
ALTER TABLE work_sessions
    ADD COLUMN IF NOT EXISTS last_ping_at   TIMESTAMP, -- Oxirgi bor qachon GPS signal keldi
    ADD COLUMN IF NOT EXISTS outside_since  TIMESTAMP, -- Qachondan beri bino tashqarisida
    ADD COLUMN IF NOT EXISTS auto_checkout  BOOLEAN DEFAULT false; -- Tizim avtomat chiqardimi?


-- 3. MAVJUD work_logs JADVALINI KENGAYTIRISH
-- (Xodim nima sababdan chiqib ketganligini bilish uchun)
ALTER TABLE work_logs
    ADD COLUMN IF NOT EXISTS checkout_reason VARCHAR(20) DEFAULT 'manual'; -- 'manual' (o'zi bosdi) yoki 'auto_gps' (15 min tashqarida qoldi)