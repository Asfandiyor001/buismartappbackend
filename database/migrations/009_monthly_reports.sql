-- Har xodimning OYLIK hisoboti
CREATE TABLE monthly_reports (
  id                    SERIAL PRIMARY KEY,
  user_id               INT REFERENCES users(id) ON DELETE CASCADE,
  year                  INT NOT NULL,
  month                 INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  
  -- Kun statistikasi
  total_work_days       INT DEFAULT 0,       -- ish kunlari soni (oy ichida)
  present_days          INT DEFAULT 0,       -- kelgan kunlar
  absent_days           INT DEFAULT 0,       -- kelmagan kunlar
  vacation_days         INT DEFAULT 0,       -- ta'til kunlari
  sick_days             INT DEFAULT 0,       -- kasallik kunlari
  attendance_pct        DECIMAL(5,2),        -- davomat foizi
  
  -- Soat statistikasi
  total_hours           DECIMAL(6,2) DEFAULT 0,   -- jami soat
  regular_hours         DECIMAL(6,2) DEFAULT 0,   -- oddiy soat
  overtime_hours        DECIMAL(6,2) DEFAULT 0,   -- qo'shimcha soat
  break_hours           DECIMAL(6,2) DEFAULT 0,   -- tanaffus soat
  expected_hours        DECIMAL(6,2) DEFAULT 0,   -- kutilgan soat (8×ish kunlari)
  
  -- Bino statistikasi
  most_used_building    VARCHAR(100),              -- eng ko'p ishlagan bino
  building_stats        JSONB,                     -- har bino uchun soat
  -- masalan: {"Bino 1": 120.5, "Bino 2": 40.0}
  
  -- Mukofot/jarima
  total_rewards         DECIMAL(12,2) DEFAULT 0,
  total_fines           DECIMAL(12,2) DEFAULT 0,
  
  generated_at          TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, year, month)
);