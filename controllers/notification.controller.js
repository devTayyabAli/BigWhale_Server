const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const ResponseHelper = require('../helpers/response');

class NotificationController {
  /**
   * @param req request body
   * @param res callback response object
   * @description This method to get user notification listing
   */
  static async userNotifications(req, res) {
    let response = ResponseHelper.getResponse(                
      false,
      'Something went wrong',     
      {},            
      400
    );

    try {
      const authorizationToken = req.headers['authorization'].split(' ');    
      const userEmail = jwt.verify(
        authorizationToken[1],
        process.env.JWT_SECRET_STRING         
      );
      const user = await User.findOne({ email: userEmail?.email });

      if (!user) {
        response.message = 'User not found with this email.';
        return;
      }
    
      const notifications = await Notification.find({
        _id: user?._id,
      });

      if (notifications) {
        response.success = true;
        response.message = 'Notifications listing.';
        response.status = 200;
        response.data = notifications;
      }
    } catch (error) {
      console.error('userNotificationsError: ', error);
      response.message = error.message || 'An internal server error occurred';    
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);           
    }
  }

  /**
   * Returns paginated rank-achievement notifications for the admin panel.
   * GET /notifications/admin?page=1&limit=20
   */
  static async adminNotifications(req, res) {
    let response = ResponseHelper.getResponse(false, 'Something went wrong', {}, 400);
    try {
      const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
      const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
      const skip  = (page - 1) * limit;

      const filter = { notificationType: 'Rank Updation' };

      const [total, notifications] = await Promise.all([
        Notification.countDocuments(filter),
        Notification.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'userName email userRankId')
          .lean(),
      ]);

      response.success = true;
      response.message = 'Admin notifications fetched.';
      response.status  = 200;
      response.data    = { notifications, total, page, limit };
    } catch (error) {
      console.error('adminNotificationsError:', error);
      response.message = error.message || 'An internal server error occurred';
      response.status  = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * Mark all rank-achievement notifications as read for the admin.
   * POST /notifications/admin/mark-read
   * (Adds a `readByAdmin` boolean field on the notification.)
   */
  static async markAdminNotificationsRead(req, res) {
    let response = ResponseHelper.getResponse(false, 'Something went wrong', {}, 400);
    try {
      await Notification.updateMany(
        { notificationType: 'Rank Updation', readByAdmin: { $ne: true } },
        { $set: { readByAdmin: true } }
      );
      response.success = true;
      response.message = 'Notifications marked as read.';
      response.status  = 200;
    } catch (error) {
      console.error('markAdminNotificationsReadError:', error);
      response.message = error.message || 'An internal server error occurred';
      response.status  = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = NotificationController;
