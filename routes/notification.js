var express = require('express');
var router = express.Router();
const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const adminMiddleware = require('../middleware/adminAuth');
const NotificationController = require('../controllers/notification.controller');

// User notifications
router.get('/', checkIfAuthenticated, NotificationController.userNotifications);

// Admin rank-achievement notifications — must use adminMiddleware (role === 'admin')
// checkIfAuthenticated rejects admins because it checks role === 'user'
router.get('/admin', adminMiddleware, NotificationController.adminNotifications);
router.post('/admin/mark-read', adminMiddleware, NotificationController.markAdminNotificationsRead);

module.exports = router;
