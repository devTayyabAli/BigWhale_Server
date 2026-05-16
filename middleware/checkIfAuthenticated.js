const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const socket = require('../helpers/sockets');   
const { DEFAULT_STATUS } = require("../config/constants");

const checkIfAuthenticated = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers['authorization'];

    if (authorizationHeader) {
      const [bearer, token] = authorizationHeader.split(' ');
      if (bearer === 'Bearer' && token) {
        try {
          const decodedToken = jwt.verify(token, process.env.JWT_SECRET_STRING);

          // Now, you can access the user information from the decoded token
          const userIdFromToken = decodedToken.email;
          const user = await User.findOne({
            email: userIdFromToken,
          });

          // Check if the user email from the token matches the expected user email
          if (userIdFromToken === user?.email && user?.role === 'user') {
            // Check if the user is banned
            if (user?.status === DEFAULT_STATUS.BANNED) {
              return res.status(403).json({message: 'Forbidden: User is banned',success: false,status: 403});
            }

            req.user = user;
            next(); // User is authenticated and not banned, proceed to the next middleware or route handler
          } else {
            return res.status(401).json({
              message: 'Unauthorized: Token does not match the expected user',
              success: false,
              status: 401,
            });
          }
        } catch (error) {
          console.log('JWT verification failed:', error);
          return res.status(401).json({ message: 'Unauthorized', success: false, status: 401 });
        }
      } else {
        return res.status(401).json({
          message: 'Invalid Authorization Header',
          success: false,
          status: 400,
        });
      }
    } else {
      return res.status(401).json({ message: 'Unauthorized', success: false, status: 401 });
    }
  } catch (error) {
    console.log('Error:', error);
    return res.status(500).json({ message: 'Internal Server Error', success: false, status: 500 });
  }
};

module.exports = checkIfAuthenticated;
