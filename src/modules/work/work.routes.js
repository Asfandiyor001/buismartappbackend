const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const checkRole = require('../../middleware/role');
const workController = require('./work.controller');

router.post('/checkin', authenticate, workController.checkIn);
router.post('/checkout', authenticate, workController.checkOut);
router.post('/reset-session', authenticate, workController.resetSession);
router.get('/today', authenticate, workController.getToday);
router.get('/week', authenticate, workController.getWeek);
router.get('/month', authenticate, workController.getMonth);
router.get('/active', authenticate, workController.getActiveLog);

router.post(
  '/ping',
  authenticate,
  checkRole('staff', 'admin', 'prorektor'),
  workController.pingHandler
);

router.post(
  '/sync-offline',
  authenticate,
  workController.syncOffline
);

module.exports = router;
