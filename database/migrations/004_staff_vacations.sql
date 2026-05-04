CREATE TABLE staff_vacations (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(30) CHECK (
                  type IN (
                    'yillik','kasallik','homiladorlik',
                    'bola_parvarish','nikoh','aza','boshqa'
                  )
                ),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days_count    INT GENERATED ALWAYS AS
                  (end_date - start_date + 1) STORED,
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  approved_by   INT REFERENCES users(id),
  approved_at   TIMESTAMP,
  rejection_reason TEXT,
  created_at    TIMESTAMP DEFAULT NOW()
);