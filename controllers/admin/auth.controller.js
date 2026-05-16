const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../../models/user.model");
const { DEFAULT_STATUS } = require("../../config/constants");

/**
 * @param req request body
 * @param res callback response object
 * @description Method to login
 */
const login = async (req, res) => {
  try {
    const { userName, password } = req.body;

    const user = await User.findOne({ userName });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "UserID or password is incorrect."
      });
    }

    if (user.status === DEFAULT_STATUS.BANNED) {
      return res.status(403).json({
        success: false,
        message: `Your account is banned. Please contact support (${process.env.WHATSAPP_NO})`
      });
    }

    const compareHashPassword = bcrypt.compareSync(password, user.password);

    if (!compareHashPassword) {
      return res.status(400).json({
        success: false,
        message: "Password is incorrect."
      });
    }

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET_STRING);

    return res.status(200).json({
      success: true,
      message: "Logged in successfully.",
      data: {
        ...user._doc,
        token
      }
    });
  } catch (err) {
    console.error("loginError: ", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error"
    });
  }
};

module.exports = {
  login
};