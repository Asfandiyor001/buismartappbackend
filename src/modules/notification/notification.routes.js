const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/auth');
const notificationController = require('./notification.controller');

router.get('/', authenticate, notificationController.getMyNotifications);
router.post('/push-token', authenticate, notificationController.savePushToken);
router.put('/read-all', authenticate, notificationController.markAllRead);
router.put('/:id/read', authenticate, notificationController.markAsRead);
router.delete('/:id', authenticate, notificationController.deleteNotification);

module.exports = router;
