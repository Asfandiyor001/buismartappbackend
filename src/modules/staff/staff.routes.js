const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const checkRole = require('../../middleware/role');
const staffController = require('./staff.controller');

const staffOrAdmin = checkRole('staff', 'admin', 'prorektor');

router.get('/profile', authenticate, staffOrAdmin, staffController.getProfile);
router.put('/profile', authenticate, staffOrAdmin, staffController.updateProfile);
router.get('/documents', authenticate, staffOrAdmin, staffController.getDocuments);
router.post('/documents', authenticate, staffOrAdmin, staffController.addDocument);
router.get('/vacations', authenticate, staffOrAdmin, staffController.getVacations);
router.post('/vacations', authenticate, staffOrAdmin, staffController.requestVacation);
router.get('/rewards', authenticate, staffOrAdmin, staffController.getRewards);
router.get('/work-stats', authenticate, staffOrAdmin, staffController.getWorkStats);
router.get('/my-report', authenticate, staffOrAdmin, staffController.getMyReport);
router.get('/team-status', authenticate, staffOrAdmin, staffController.getTeamStatus);

module.exports = router;
