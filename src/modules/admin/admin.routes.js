const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const checkRole = require('../../middleware/role');
const adminController = require('./admin.controller');

const adminOnly = checkRole('admin');
const adminOrProrektor = checkRole('admin', 'prorektor');

// ── Xodimlar ────────────────────────────────────────────
router.get('/staff-today', authenticate, adminOrProrektor, adminController.getStaffToday);
router.get('/staff/active-now', authenticate, adminOrProrektor, adminController.getActiveNow);
router.get('/staff/absent-today', authenticate, adminOrProrektor, adminController.getAbsentToday);
router.get('/staff', authenticate, adminOrProrektor, adminController.getAllStaff);
router.get('/staff/:id', authenticate, adminOrProrektor, adminController.getStaffDetail);
router.get('/staff/:id/history', authenticate, adminOrProrektor, adminController.getStaffHistory);
router.get('/staff/:id/documents', authenticate, adminOrProrektor, adminController.getStaffDocuments);
router.get('/staff/:id/vacations', authenticate, adminOrProrektor, adminController.getStaffVacations);
router.get('/staff/:id/rewards', authenticate, adminOrProrektor, adminController.getStaffRewards);
router.get('/staff/:id/work-logs', authenticate, adminOrProrektor, adminController.getStaffWorkLogs);
router.put('/staff/:id/status', authenticate, adminOnly, adminController.updateStaffStatus);

// ── Talabalar ───────────────────────────────────────────
router.get('/students', authenticate, adminOrProrektor, adminController.getStudentsList);
router.get('/students/:id', authenticate, adminOrProrektor, adminController.getStudentAdmin);

// ── Foydalanuvchilar (yaratish / o'chirish) ─────────────
router.get('/users', authenticate, adminOnly, adminController.getAllUsers);
router.post('/users', authenticate, adminOnly, adminController.createUser);
router.put('/users/:id', authenticate, adminOnly, adminController.updateUser);
router.delete('/users/:id', authenticate, adminOnly, adminController.deleteUser);
router.post('/users/:id/reset-password', authenticate, adminOnly, adminController.resetUserPassword);

// ── Xarita / Joylashuv ──────────────────────────────────
router.get('/staff-locations', authenticate, adminOrProrektor, adminController.getStaffLocations);

// ── Binolar (CRUD) ──────────────────────────────────────
router.get('/buildings', authenticate, adminOrProrektor, adminController.listBuildings);
router.get('/buildings/gps-pings', authenticate, adminOrProrektor, adminController.getBuildingGpsPings);
router.get('/buildings/daily-stats', authenticate, adminOrProrektor, adminController.getBuildingDailyStats);
router.post('/buildings', authenticate, adminOnly, adminController.createBuilding);
router.put('/buildings/:id', authenticate, adminOnly, adminController.updateBuilding);
router.delete('/buildings/:id', authenticate, adminOnly, adminController.deleteBuilding);

// ── QR va boshqalar ─────────────────────────────────────
router.get('/vacations/pending', authenticate, adminOrProrektor, adminController.getPendingVacations);
router.put('/vacations/:id', authenticate, adminOrProrektor, adminController.updateVacationStatus);
router.post('/qr/generate', authenticate, adminOnly, adminController.generateQR);
router.get('/overview', authenticate, adminOrProrektor, adminController.getOverview);
router.get('/departments', authenticate, adminOrProrektor, adminController.getDepartments);
router.get('/departments/:dept/staff', authenticate, adminOrProrektor, adminController.getDepartmentStaff);
router.post('/notify', authenticate, adminOnly, adminController.sendBroadcastNotification);

// ── Sessiyalarni majburiy yopish (18:00 cron'ni qo'lda chaqirish) ────────────
router.post('/force-close-today', authenticate, adminOnly, adminController.forceCloseToday);

// ── Admin Reports ────────────────────────────────────────────────────────────
router.get('/reports/monthly', authenticate, adminOrProrektor, adminController.getAdminMonthlyReport);
router.get('/reports/weekly',  authenticate, adminOrProrektor, adminController.getAdminWeeklyReport);
router.get('/reports/yearly',  authenticate, adminOrProrektor, adminController.getAdminYearlyReport);

module.exports = router;
