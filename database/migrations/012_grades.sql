CREATE TABLE grades (
  id            SERIAL PRIMARY KEY,
  student_id    INT REFERENCES users(id) ON DELETE CASCADE,
  teacher_id    INT REFERENCES users(id),
  subject       VARCHAR(100) NOT NULL,
  semester      VARCHAR(20)  NOT NULL,
  
  -- Baholar
  midterm       DECIMAL(5,2),              -- oraliq (max 40)
  final         DECIMAL(5,2),              -- yakuniy (max 60)
  total         DECIMAL(5,2) GENERATED ALWAYS AS
                  (COALESCE(midterm,0) + COALESCE(final,0)) STORED,
  
  -- Harf bahosi
  letter_grade  VARCHAR(5),               -- A, B+, C ...
  is_passed     BOOLEAN,                  -- o'tdimi
  
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE(student_id, subject, semester)
);