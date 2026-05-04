const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const checkRole = require('../../middleware/role');
const adminController = require('./admin.controller');

const adminOnly = checkRole('admin');
const adminOrProrektor = checkRole('admin', 'prorektor');

router.get('/staff/active-now', authenticate, adminOrProrektor, adminController.getActiveNow);
router.get('/staff/absent-today', authenticate, adminOrProrektor, adminController.getAbsentToday);
router.get('/staff', authenticate, adminOrProrektor, adminController.getAllStaff);
router.get('/staff/:id', authenticate, adminOrProrektor, adminController.getStaffDetail);
router.get('/staff/:id/documents', authenticate, adminOrProrektor, adminController.getStaffDocuments);
router.get('/staff/:id/vacations', authenticate, adminOrProrektor, adminController.getStaffVacations);
router.get('/staff/:id/rewards', authenticate, adminOrProrektor, adminController.getStaffRewards);
router.get('/staff/:id/work-logs', authenticate, adminOrProrektor, adminController.getStaffWorkLogs);
router.get('/students', authenticate, adminOrProrektor, adminController.getStudentsList);
router.get('/students/:id', authenticate, adminOrProrektor, adminController.getStudentAdmin);
router.put('/staff/:id/status', authenticate, adminOnly, adminController.updateStaffStatus);
router.post('/qr/generate', authenticate, adminOnly, adminController.generateQR);
router.get('/overview', authenticate, adminOrProrektor, adminController.getOverview);
router.post('/notify', authenticate, adminOnly, adminController.sendBroadcastNotification);

module.exports = router;
