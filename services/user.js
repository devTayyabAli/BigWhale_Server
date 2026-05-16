const User = require("../models/user.model");

const userAccountCreated = async (userID) => {
    try {
      // Find the user document by ID
      const user = await User.findById(userID);
      // Get the current date and time
      const currentDate = new Date();
  
      // Get the user's activation date
      const activationDate = user?.createdAt;
  
      // Calculate the time difference in milliseconds
      const timeDifference = currentDate - activationDate;
      // Calculate the number of days
      const daysDifference = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
      return daysDifference;
    } catch (error) {
      console.error("Error:", error);
      return error;
    }
  };
  module.exports = {
    userAccountCreated
  }