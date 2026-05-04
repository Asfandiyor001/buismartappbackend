-- Har bir xodimning KUNLIK sessiyasi (1 kun = 1 sessiya)
CREATE TABLE work_sessions (
  id                SERIAL PRIMARY KEY,
  user_id           INT REFERENCES users(id) ON DELETE CASCADE,
  work_date         DATE NOT NULL,
  
  -- Vaqt ma'lumotlari
  first_entry_time  TIME,                    -- kun boshidagi birinchi kirish
  last_exit_time    TIME,                    -- kun oxiridagi chiqish
  
  -- Hisoblab chiqilgan vaqtlar (sekundlarda)
  total_seconds     INT DEFAULT 0,           -- umumiy ish vaqti
  regular_seconds   INT DEFAULT 0,           -- rasmiy ish vaqti (max 8s)
  overtime_seconds  INT DEFAULT 0,           -- qo'shimcha ish vaqti
  break_seconds     INT DEFAULT 0,           -- tanaffus vaqti
  
  -- Holat
  status            VARCHAR(20) DEFAULT 'active'
                      CHECK (status IN ('active','done','absent','vacation','sick')),
  is_finished       BOOLEAN DEFAULT false,
  finished_at       TIMESTAMP,
  
  -- Statistika
  buildings_visited INT DEFAULT 0,           -- nechta binoga kirgan
  building_switches INT DEFAULT 0,           -- bino almashtirishlar soni
  
  notes             TEXT,
  created_at        TIMESTAMP DEFAULT NOW(),
  updated_at        TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, work_date)
);

-- Index
CREATE INDEX idx_work_sessions_user_date 
  ON work_sessions(user_id, work_date);
CREATE INDEX idx_work_sessions_date 
  ON work_sessions(work_date);