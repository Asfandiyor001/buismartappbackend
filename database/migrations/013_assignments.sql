CREATE TABLE assignments (
  id            SERIAL PRIMARY KEY,
  teacher_id    INT REFERENCES users(id),
  subject       VARCHAR(100) NOT NULL,
  group_name    VARCHAR(50),
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  deadline      TIMESTAMP NOT NULL,
  max_score     INT DEFAULT 100,
  file_url      VARCHAR(255),
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE assignment_submissions (
  id              SERIAL PRIMARY KEY,
  assignment_id   INT REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      INT REFERENCES users(id) ON DELETE CASCADE,
  file_url        VARCHAR(255),
  comment         TEXT,
  score           INT,
  feedback        TEXT,
  submitted_at    TIMESTAMP DEFAULT NOW(),
  graded_at       TIMESTAMP,
  status          VARCHAR(20) DEFAULT 'submitted'
                    CHECK (status IN ('submitted','graded','late')),
  UNIQUE(assignment_id, student_id)
);