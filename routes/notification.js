var express = require('express');
var router = express.Router();
const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const NotificationController = require('../controllers/notification.controller');

// User notifications
router.get('/', checkIfAuthenticated, NotificationController.userNotifications);

// Admin rank-achievement notifications
router.get('/admin', checkIfAuthenticated, NotificationController.adminNotifications);
router.post('/admin/mark-read', checkIfAuthenticated, NotificationController.markAdminNotificationsRead);

module.exports = router;
