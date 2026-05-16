var express = require('express');
var router = express.Router();
const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const NotificationController = require('../controllers/notification.controller');

// User notifications
router.get('/', checkIfAuthenticated, NotificationController.userNotifications);

module.exports = router;
