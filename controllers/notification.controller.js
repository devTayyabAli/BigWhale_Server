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
}

module.exports = NotificationController;
