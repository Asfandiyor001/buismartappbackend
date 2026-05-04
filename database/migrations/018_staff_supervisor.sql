-- Hierarchy for manager → subordinates (recursive team status)
ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS supervisor_id INT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staff_profiles_supervisor ON staff_profiles(supervisor_id);
