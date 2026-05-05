-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_date ON work_sessions(user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_work_sessions_date ON work_sessions(work_date);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_logs_session ON work_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_user ON work_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_active ON work_logs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_gps_pings_user ON gps_pings(user_id);
CREATE INDEX IF NOT EXISTS idx_gps_pings_created ON gps_pings(created_at);
CREATE INDEX IF NOT EXISTS idx_student_attendance_student ON student_attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_date ON student_attendance(date);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_teacher ON schedules(teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_user ON staff_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;
