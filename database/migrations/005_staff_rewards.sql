CREATE TABLE staff_rewards (
  id            SERIAL PRIMARY KEY,
  user_id       INT REFERENCES users(id) ON DELETE CASCADE,
  type          VARCHAR(20) CHECK (type IN ('mukofot','jarima','bonus')),
  amount        DECIMAL(12,2),
  percentage    DECIMAL(5,2),               -- maoshning foizi
  reason        TEXT NOT NULL,
  reward_date   DATE DEFAULT CURRENT_DATE,
  issued_by     INT REFERENCES users(id),
  is_paid       BOOLEAN DEFAULT false,
  paid_at       TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);