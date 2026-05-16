const jwt = require('jsonwebtoken');
const Invite = require('../models/invite.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const ResponseHelper = require('../helpers/response');
const { sendInviteEmail } = require('../helpers/mail');   
const socket = require('../helpers/sockets');   

class InvitesController {
  /**
   * @param req request body
   * @param res callback response object
   * @description Method to get invities listing
   */
  static async invitesListing(req, res) {         
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

      const sendedInvites = await Invite.find({ senderUserId: user?._id });
      const receivedInvites = await Invite.find({ receiverEmail: user?.email });          
      if (sendedInvites || receivedInvites) {     
        response.success = true;
        response.message = 'Sended and received invites listing.';                         
        response.status = 200;                      
        response.data = {                   
          sendedInvites,            
          receivedInvites,                             
        };
      }
    } catch (error) {
      console.error('invitesListingError: ', error);          
      response.message = error.message || 'An internal server error occurred';   
      response.status = 500;
      response.success = false;            
    } finally {    
      return res.status(response.status).json(response);                
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to send invite
   */
  static async sendInvite(req, res) {   
    let response = ResponseHelper.getResponse(             
      false, 
      'Something went wrong',   
      {},
      400
    );  

    try {
      const receiverEmail = req.body.email;     

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

      const receiver = await User.findOne({ email: receiverEmail });
      if (!receiver) {
        response.message = 'Receiver not exists.';                          
        return;    
      }

      const isInviteExists = await Invite.findOne({      
        senderUserId: user?._id,           
        receiverEmail: receiverEmail, //|| receiver?.email,     
      });     

      if (isInviteExists) {   
        response.success = true;        
        response.message = 'Invite already sent successfully.';        
        response.status = 200;     
        return;
      }

      const createInvite = await Invite.create({                        
        senderUserId: user?._id,        
        receiverEmail: receiverEmail, //receiver?.email,
      });

      if (createInvite) {
        await sendInviteEmail(receiverEmail);            

        const createNotification = await Notification.create({       
          userId: receiver?._id,
          notificationType: 'Invitation Request',    
          description: `You get the invitation request from ${user?.email}.`,         
        });

        if (createNotification) {    
          socket.io.emit('sendInviteNotification', {              
            title: createNotification?.notificationType,
            description: createNotification?.description,         
          });     
        }

        response.success = true;   
        response.message = 'Invite sent successfully.';          
        response.status = 200;         
      }
    } catch (error) {
      console.error('sendInviteError: ', error);   
      response.message = error.message || 'An internal server error occurred';     
      response.status = 500;   
      response.success = false;     
    } finally {
      return res.status(response.status).json(response);         
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to resend invite
   */
  static async resendInvite(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const receiverEmail = req.body.email;

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

      const isInviteExists = await Invite.findOne({
        senderUserId: user?._id,
        receiverEmail: receiverEmail,
        status: 'pending',
      });

      if (!isInviteExists) {
        response.message = 'Invite not exists.';
        return false;
      }

      await sendInviteEmail(receiverEmail);

      response.success = true;
      response.message = 'Invite resended successfully.';
      response.status = 200;
    } catch (error) {
      console.error('resendInviteError: ', error);
      response.message = error.message || 'An internal server error occurred';
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to accept invite
   */
  static async acceptInvite(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { email, status } = req.body;

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

      const receiver = await User.findOne({ email: email });

      const isInviteExists = await Invite.findOne({
        senderUserId: user?._id,   
        receiverEmail: email,    
      });

      if (!isInviteExists) {    
        response.message = 'Invite is not exists with this email.';
        return;     
      }

      const updateUser = await Invite.updateOne(
        { _id: isInviteExists?._id },   
        {
          $set: {
            status: status,   
          },    
        }
      );

      if (updateUser) {
        response.success = true;   
        response.message = 'Invite accepted successfully.';
        response.status = 200;
      }
    } catch (error) {
      console.error('acceptInviteError: ', error);
      response.message = error.message || 'An internal server error occurred';
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to reject invite
   */
  static async rejectInvite(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      'Something went wrong',
      {},
      400
    );

    try {
      const { email, status } = req.body;

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

      const isInviteExists = await Invite.findOne({
        senderUserId: user?._id,
        receiverEmail: email,     
      });

      if (!isInviteExists) {
        response.message = 'Invite is not exists with this email.';  
        return;    
      }

      const updateUser = await Invite.updateOne(       
        { _id: isInviteExists?._id },    
        {
          $set: {     
            status: status,       
          },            
        }
      );

      if (updateUser) {    
        response.success = true;    
        response.message = 'Invite rejected successfully.';
        response.status = 200;   
      }
    } catch (error) {
      console.error('rejectInviteError: ', error);
      response.message = error.message || 'An internal server error occurred';
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = InvitesController;
