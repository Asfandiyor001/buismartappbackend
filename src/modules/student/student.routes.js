const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const checkRole = require('../../middleware/role');
const studentController = require('./student.controller');

const studentOnly = checkRole('student');

router.get('/profile', authenticate, studentOnly, studentController.getProfile);
router.get('/schedule', authenticate, studentOnly, studentController.getSchedule);
router.get('/schedule/today', authenticate, studentOnly, studentController.getTodaySchedule);
router.post('/attendance/checkin', authenticate, studentOnly, studentController.qrCheckIn);
router.get('/attendance', authenticate, studentOnly, studentController.getMyAttendance);
router.get('/attendance/summary', authenticate, studentOnly, studentController.getAttendanceSummary);
router.get('/grades', authenticate, studentOnly, studentController.getGrades);
router.get('/assignments', authenticate, studentOnly, studentController.getAssignments);
router.post('/assignments/:id/submit', authenticate, studentOnly, studentController.submitAssignment);

module.exports = router;
