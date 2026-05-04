const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const reportController = require('./report.controller');

router.get('/daily', authenticate, reportController.getDailyReport);
router.get('/weekly', authenticate, reportController.getWeeklyReport);
router.get('/monthly', authenticate, reportController.getMonthlyReport);
router.get('/yearly', authenticate, reportController.getYearlyReport);
router.get('/building', authenticate, reportController.getBuildingReport);

module.exports = router;
