-- Har bir bino kirish/chiqish yozuvi
CREATE TABLE work_logs (
  id                SERIAL PRIMARY KEY,
  session_id        INT REFERENCES work_sessions(id) ON DELETE CASCADE,
  user_id           INT REFERENCES users(id) ON DELETE CASCADE,
  building_id       INT REFERENCES buildings(id),
  
  -- Vaqt
  entry_time        TIMESTAMP NOT NULL,      -- kirish vaqti (to'liq timestamp)
  exit_time         TIMESTAMP,               -- chiqish vaqti (null = hali aktiv)
  duration_seconds  INT,                     -- exit bo'lganda avtomatik hisoblanadi
  
  -- GPS ma'lumotlari
  entry_lat         DECIMAL(10,8),
  entry_lon         DECIMAL(11,8),
  entry_accuracy_m  DECIMAL(6,2),            -- GPS aniqligi (metr)
  exit_lat          DECIMAL(10,8),
  exit_lon          DECIMAL(11,8),
  exit_accuracy_m   DECIMAL(6,2),
  
  -- Holat
  is_active         BOOLEAN DEFAULT true,    -- hozir shu binodami
  is_overtime       BOOLEAN DEFAULT false,   -- qo'shimcha vaqt davomidami
  entry_type        VARCHAR(20) DEFAULT 'gps'
                      CHECK (entry_type IN ('gps','manual','admin')),
  exit_type         VARCHAR(20)
                      CHECK (exit_type IN ('gps','manual','admin','auto','checkout')),
  
  created_at        TIMESTAMP DEFAULT NOW()
);

-- Indexlar
CREATE INDEX idx_work_logs_session   ON work_logs(session_id);
CREATE INDEX idx_work_logs_user      ON work_logs(user_id);
CREATE INDEX idx_work_logs_building  ON work_logs(building_id);
CREATE INDEX idx_work_logs_entry     ON work_logs(entry_time);
CREATE INDEX idx_work_logs_active    ON work_logs(is_active) WHERE is_active = true;