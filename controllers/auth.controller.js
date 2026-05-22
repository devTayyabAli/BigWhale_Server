const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/user.model");
const ResponseHelper = require("../helpers/response");
const { sendForgetPasswordEmail } = require("../helpers/mail");
const { TRANSACTION_TYPES, DEFAULT_STATUS } = require("../config/constants");
const Transaction = require("../models/transaction.model");
const { ObjectId } = require("mongoose").Types;
const { setRefererTeamMember } = require("../services/referralService");
const { sendVerifyEmailOTP } = require("../helpers/mail");
const referral = require("../services/referral");
const {
  updateUserOtp,
  findUserByPayload,
  verifyEmailOTP,
  updateUserStatus
} = require("../services/auth");
const Stake = require("../models/stake.model");
const { sendTwilioCode, verifyTwilioCode, maskPhoneNumber } = require("../helpers/2FA");
const { getTotalStakeAmountByUser } = require("../services/stake");
class AuthController {
  /**
   * @param req request body
   * @param res callback response object
   * @description Method to registration
   */
  static async registration(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const {
        email,
        name,
        userName,
        password,
        role,
        walletAddress,
        referredBy,
        phoneNumber,
      } = req.body;
  
      const formatPhone = phoneNumber.replace(/\s+/g, "");      
      const userExists = await User.findOne({
        $or: [
          { walletAddress: { $regex: new RegExp('^' + walletAddress + '$', 'i') } },
          { userName: userName },
          { email: email }
        ]
      });
      
      if (userExists) {
        response.message = `User with this ${userExists.walletAddress===walletAddress ? 'walletAddress' : userExists.userName===userName ? 'login user Id' : 'email'} already exists`;
        response.status = 400;
        response.success = false;
        return
      }
        // Create a new user
        const newUser = await User.create({
          email,
          name,
          userName,
          role,
          password,
          walletAddress,
          referredBy
        });
        jwt.sign({ email: newUser.email }, process.env.JWT_SECRET_STRING);
        response.success = true;
        response.data = { _id: newUser?._id };
        response.message = "Registration successful. Please verify your account.";
        response.status = 200;
      
    } catch (error) {
      console.log("AuthError: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
 
  /**
   * @param req request body
   * @param res callback response object
   * @description Method to registration
   */
  static async completeRegistration(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { txHash, userId } = req.body;

      const user = await User.findOne({
        _id: new ObjectId(userId),
      });

      if (!user) {
        response.message = "User do not exists!";
        return;
      }
      if (user?.referredBy) {
      await setRefererTeamMember(user?.referredBy, new ObjectId(userId));
      }
      const transaction = await Transaction.create({
        txHash,
        userId: user?._id,
        type: TRANSACTION_TYPES.REGISTER,
      });

      await User.findOneAndUpdate(
        { _id: user?._id },
        {
          $set: {
            registrationTransactionId: transaction?._id,
          },
        },
        { upsert: true, new: true }
      );

      response.success = true;
      response.data = { _id: user?._id };
      response.message = "User signup completed successfully!";
      response.status = 201;
    } catch (error) {
      console.log("CompleteSignupError: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to login
   */
  static async login(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { userName, password, walletAddress } = req.body;

      const user = await User.findOne({
        walletAddress,
        userName,
      });

      if (!user || user?.status === DEFAULT_STATUS.PENDING) {
        response.message = "UserID, password or Wallet address is incorrect.";
        return;
      }

      if (
        user &&
        (user?.status === DEFAULT_STATUS.BANNED ||
          user?.status === DEFAULT_STATUS.INACTIVE)
      ) {
        response.message = `You account is ${user?.status}. Please contact to support team (${process.env.WHATSAPP_NO})`;
        return;
      }

      if (user?.emailVerified === false) {
        response.message = "Please verify your email";
        response.success = false;
        const sendOtp = await AuthController.sendEmailVerficationOtp({
          body: { email: user.email },
        });
        if (sendOtp?.message) {
          response.message = sendOtp?.message;
        }
        response.data = {
          emailVerified: false,
          email: user.email,
        };
        return;
      }

      if (user?.is2faEnabled) {
        response.message = "Verification code has been sent to your phone number.";
        response.success = false;

        const responseCode = await sendTwilioCode(
          user?.phoneNumber
        );
        
        response.data = {
          is2faEnabled: true,
          email: user.email,
          phoneNumber: maskPhoneNumber(user?.phoneNumber, 4)
        };

        return;
      }

      const compareHashPassword = await bcrypt.compareSync(
        password,
        user.password
      );

      if (compareHashPassword === false) {
        response.message = "Password is incorrect.";
        return false;
      }

      const token = jwt.sign(
        { email: user.email },
        process.env.JWT_SECRET_STRING
      );

      response.success = true;
      response.message = "Logged in successfully..";
      response.data = {
        ...user._doc,
        token,
      };
      delete response.data.password;
      response.status = 200;
    } catch (err) {
      console.log("loginError: ", err);
      response.message = err.message || "Internal Server Error";
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to account information
   */
  static async getProfile(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { id } = req.params;
      const user = await User.findOne({ _id: id });
      const totalStakeAmount = await getTotalStakeAmountByUser(id);

      if (user) {
        const token = jwt.sign(
          { email: user.email },
          process.env.JWT_SECRET_STRING
        );
        response.success = true;
        response.message = "Account Information.";
        response.data = {
          ...user?._doc,
          token,
          totalStakeAmount: totalStakeAmount||0,
        };
        response.status = 200;
      }
    } catch (err) {
      console.log("getProfileError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to profile completeness
   */
  static async updateProfile(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { name, phoneNumber } = req.body;
      const { userId } = req.params;
      const file = req.file?.filename;

      const user = await User.findById(userId);
      if (!user) {
        response.success = false;
        response.message = "User not found with this email.";
        response.status = 404;
        return;
      }

      const formatPhone = phoneNumber.replace(/\s+/g, "");
      const checkPhoneNumberExist = await User.findOne({ 
        phoneNumber: formatPhone,
        _id: { $ne: user?._id }
      });

      if (checkPhoneNumberExist) {
        response.success = false;
        response.message = "Phone Number already exists";
        response.status = 400;
        return;
      }

      const updationUser = await User.findByIdAndUpdate(
        user?._id,
        {
          $set: {
            name: name || user?.name,
            phoneNumber: phoneNumber || user?.phoneNumber,
            ...(file && {
              profilePicture: `${process.env.FILE_BASE_URL}/${file}`,
            }),
          },
        },
        { new: true } // to return the updated document
      );

      if (updationUser) {
        const updateUser = await User.findById(userId);
        response.success = true;
        response.message = "Congratulations! Your profile has been updated.";
        response.status = 200;
        response.data = updateUser;
      }
    } catch (error) {
      console.error("updateProfileError: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to change password
   */
  static async changePassword(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

  
try {
  const { oldPassword, password } = req.body;

  const authorizationToken = req.headers["authorization"].split(" ");
  const userEmail = jwt.verify(
    authorizationToken[1],
    process.env.JWT_SECRET_STRING
  );

  const user = await User.findOne({ email: userEmail?.email });

  const compareHashPassword = bcrypt.compareSync(
    oldPassword,
    user?.password
  );

  if (!compareHashPassword) {
    response.message = "Old password is incorrect.";
    return;
  }

  // Update the password directly on the user object
  user.password = password;
  await user.save(); // Save the updated user object

  response.success = true;
  response.message = "Password changed successfully.";
  response.data = { ...user?._doc };
  response.status = 200;
  } catch (err) {
      console.log("changePasswordError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to forget password
   */
  static async forgetPassword(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { email } = req.body;
      const user = await User.findOne({
        $and: [{ email: email }],
      });

      if (user) {
        const token = jwt.sign(
          { email: user.email },
          process.env.JWT_SECRET_STRING
        );
        await sendForgetPasswordEmail(user?.email, token);
        response.success = true;
        response.message = "Password reset instructions sent to your email.";
        response.data = {};
        response.status = 200;
      }
    } catch (err) {
      console.log("forgetPasswordError: ", err);
      response.message = err.message || "An error occurred";
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to reset password
   */
  static async resetPassword(req, res) { 
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );
  
    try {
      const { token } = req.params;
      const { password, requestType, phoneNumber } = req.body;
  
      const isVerified = await jwt.verify(token, process.env.JWT_SECRET_STRING);
  
      const user = await User.findOne({ email: isVerified?.email });
      if (!isVerified || !user) {
        response.message = "Token is expired.";
        return res.status(response.status).json(response);
      }
  
      if (requestType === "accountVerification") {
        user.password = password;
        user.emailVerified = true;
      } else {
        user.password = password;
      }
  
      await user.save();
  
      response.success = true;
      response.message = "Reset Password successfully.";
      response.status = 200;
    } catch (err) {
      console.log("resetPasswordError: ", err?.message);
      response.message = err?.message;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to setup 2FA
   */
  static async generateTwoFa(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { phoneNumber } = req.body;
      const user = await User.findOne({
        phoneNumber: phoneNumber || req?.user?.phoneNumber,
      });
      if (!user) {
        response.message = "Phone Number does not exist!!";
        response.status = 500;
      }

      const sendTwilioOtp = await sendTwilioCode(
        phoneNumber || req?.user?.phoneNumber
      );
      
      if (sendTwilioOtp) {
        response.success = true;
        response.message = "Otp sent successfully.";
        response.data = sendTwilioOtp;
        response.status = 200;
      }
    } catch (err) {
      console.log("generateTwoFaError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to verify 2FA
   */

  static async verifyTwoFa(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { otp, requestType, phoneNumber } = req.body; // Assuming you receive the email and OTP in the request body
      const user = await User.findOne({
        phoneNumber: phoneNumber || req?.user?.phoneNumber,
      });

      if (!user) {
        response.success = false;
        response.message = "Phone Number not found";
        response.status = 400;
        return;
      }

      const isVerified = await verifyTwilioCode(
        phoneNumber || req?.user?.phoneNumber,
        otp
      );
      
      if (!(isVerified && isVerified.status === "approved")) {
        response.success = false;
        response.message = "OTP is Invalid";
        response.status = 400;
        return;
      }

      await User.updateOne(
        { _id: user?._id },
        {
          $set: {
            is2faEnabled: true,
          },
        }
      );

      response.success = true;
      response.message = "OTP activated successfully.";
      response.status = 200;
    } catch (err) {
      console.log("verifyTwoFaError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async disableTwoFa(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { otp, phoneNumber } = req.body; // Assuming you receive the phoneNumber and OTP in the request body
      const user = await User.findOne({
        phoneNumber: phoneNumber || req?.user?.phoneNumber,
      });

      if (!user) {
        response.success = false;
        response.message = "Phone Number not found";
        response.status = 400;
        return res.status(response.status).json(response);
      }

      const isVerified = await verifyTwilioCode(
        phoneNumber || req?.user?.phoneNumber,
        otp
      );

      if (!(isVerified && isVerified.status === "approved")) {
        response.success = false;
        response.message = "OTP is invalid";
        response.status = 400;
        return res.status(response.status).json(response);
      }

      await User.updateOne(
        { _id: user?._id },
        {
          $set: {
            is2faEnabled: false,
          },
        }
      );

      response.success = true;
      response.message = "2FA disabled successfully.";
      response.status = 200;
    } catch (err) {
      console.log("disableTwoFaError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to account information
   */
  static async getReferralDetail(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { userName } = req.params;

      if (!userName) {
        response.message = "Please provide Referral Id";
        response.status = 400;
        return;
      }

      const user = await User.findOne({ userName });
      if (!user) {
        response.message = "Invalid referral ID";
        response.status = 400;
        return;
      }
      if (user?.status ===  DEFAULT_STATUS.BANNED) {
        response.message = "Referral ID does not exist";
        response.status = 400;
        return;
        }
      response.success = true;
      response.message = "Referral Information.";
      response.data = { ...user?._doc };
      response.status = 200;
    } catch (err) {
      console.log("getReferralError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static checkUserNameEmail = async (req, res) => {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { userName, email } = req.query;
      let identifier=""
      if (userName || email) {
        if (userName) {
          const userNameExists = await User.findOne({
            userName,
            status: { $ne: DEFAULT_STATUS.PENDING },
          });

          if (userNameExists) {
            response.status = 400;
            response.message = `Username is already taken. Please choose another username.`;
            return false;
          }

          identifier = "username";
        }

        if (email) {
          const emailExists = await User.findOne({
            email,
            status: { $ne: DEFAULT_STATUS.PENDING },
          });
          
          if (emailExists) {
            response.status = 400;
            response.message = `Email is already taken. Please choose another email.`;
            return false;
          }

          identifier = "email";
        }
      }

      response.success = true;
      response.status = 200;
      response.message = `${
        identifier === "username" ? "User ID" : "Email"
      } is available.`;
    } catch (err) {
      console.log("checkUserNameEmailError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  };

  static sendEmailVerficationOtp = async (req, res) => {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const email = req.body.email;
      const user = await findUserByPayload({
        email,
        status: DEFAULT_STATUS.ACTIVE,
      });

      if (!user) {
        response.success = false;
        response.status = 400;
        response.message = "Could not found user";
        return;
      }

      const otp = Math.floor(100000 + Math.random() * 900000);
      const info = await sendVerifyEmailOTP(email, otp, user?.userName);
      if (info?.accepted?.length < 0) {
        response.success = false;
        response.status = 400;
        response.message = `Something went wrong`;
        return;
      }

      response = await updateUserOtp(email, otp, response);
    } catch (err) {
      console.log("otp error: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res ? res.status(response.status).json(response) : response;
    }
  };

  static verifyEmailOTP = async (req, res) => {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { email, otp } = req.body;
      const user = await findUserByPayload({ email, status: "active" });
      if (!user) {
        response.success = false;
        response.status = 400;
        response.message = "Could not found user";
        return;
      }

      response = await verifyEmailOTP(email, otp, response);
    } catch (err) {
      console.log("checkUserNameEmailError: ", err);
      response.message = err;
      response.status = 500;
      return res.status(response.status).json(response);
    } finally {
      return res.status(response.status).json(response);
    }
  };

  static deactiveAccount = async (req, res) => {
    try {
      const { _id } = req.user;

      const { password } = req.body;
      const user = await User.findById(_id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const compareHashPassword = bcrypt.compareSync(password, user.password);
      if (!compareHashPassword) {
        return res.status(400).json({ message: "Password is incorrect." });
      }

      // Update user status to 'banned'
      const updatedUser = await User.findByIdAndUpdate(
        _id,
        { status: DEFAULT_STATUS.BANNED },
        { new: true }
      );

      res
        .status(200)
        .json({ message: "User deactivated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error deactivating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
  static deletePendingUser = async (req, res) => {
    try {
      const { id } = req.params;

      const user = await User.findById(id);

      if (!user) {
        return res.status(200).json({ message: "User not found",success:false });
      }
    const deletedUser=await  User.findOneAndDelete({_id:id,status:"pending",transaction:{$eq:null}})
      res
        .status(200)
        .json({ message: "Pending user deleted successfully", success:true });
    } catch (error) {
      console.error("Error deletePendingUser:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to verify 2FA OTP
   */
  static async verifyTwoFaOtp(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { otp, email } = req.body; // Assuming you receive the email and OTP in the request body
      const user = await User.findOne({
        email,
      });

      if (!user?.phoneNumber) {
        response.success = false;
        response.message = "phone number not found";
        response.status = 400;
        return;
      }

      const isVerified = await verifyTwilioCode(
        user?.phoneNumber,
        otp
      );
      
      if (!(isVerified && isVerified.status === "approved")) {
        response.success = false;
        response.message = "OTP is invalid";
        response.status = 400;
        return;
      }

      const token = jwt.sign(
        { email: user.email },
        process.env.JWT_SECRET_STRING
      );

      response.success = true;
      response.message = "OTP verified successfully.";
      response.data = {
        ...user._doc,
        token,
      };
      response.status = 200;
    } catch (err) {
      console.log("verifyTwoFaOtpError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @param req request body
   * @param res callback response object
   * @description Method to send 2FA OTP
   */
  static async sendTwoFa(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      const { email } = req.body;
      const user = await User.findOne({
        email
      });

      if (!user?.phoneNumber) {
        response.message = "Phone Number does not exist!!";
        response.status = 500;
      }

      const sendTwilioOtp = await sendTwilioCode(
        user?.phoneNumber
      );
      
      if (sendTwilioOtp) {
        response.success = true;
        response.message = "Verification code has been sent to your phone number.";
        response.data = sendTwilioOtp;
        response.status = 200;
      }
    } catch (err) {
      console.log("sendTwoFaError: ", err);
      response.message = err;
      response.status = 500;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description Telegram Login Widget callback — verifies hash, checks group membership
   * POST /auth/verify-telegram  { userId, telegramData: { id, first_name, hash, auth_date, ... } }
   */
  static async verifyTelegram(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const { userId, telegramData } = req.body;
      if (!userId || !telegramData) {
        response.message = "userId and telegramData are required";
        response.status = 400;
        return;
      }
      const user = await User.findById(userId);
      if (!user) { response.message = "User not found"; response.status = 404; return; }

      const { verifyTelegramWidgetData, checkTelegramMembership } = require("../services/socialVerification");

      // Step 1: Verify Telegram Login Widget signature
      const widgetCheck = verifyTelegramWidgetData(telegramData);
      if (!widgetCheck.valid) {
        response.message = widgetCheck.reason;
        response.status = 400;
        return;
      }

      // Step 2: Check group membership using verified Telegram user ID
      const membership = await checkTelegramMembership(telegramData.id);
      if (!membership.verified) {
        response.success = false;
        response.status = 400;
        response.message = membership.reason;
        return;
      }

      // Step 3: Save to DB
      await User.findByIdAndUpdate(userId, {
        $set: {
          "socialConfirmed.telegramJoined":     true,
          "socialConfirmed.telegramUsername":   telegramData.username || telegramData.first_name || String(telegramData.id),
          "socialConfirmed.telegramVerifiedAt": new Date(),
        },
      });

      response.success = true;
      response.status  = 200;
      response.message = "Telegram membership verified successfully!";
      response.data    = { telegramJoined: true, telegramUsername: telegramData.username || telegramData.first_name };
    } catch (err) {
      console.error("verifyTelegramError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description Poll endpoint — frontend calls this every 3s.
   * Reads DB only — returns verified once the webhook has updated it.
   * GET /auth/whatsapp-check/:userId
   */
  static async checkWhatsAppCode(req, res) {
    // Disable all caching — every poll must get a fresh response from the DB.
    // Without this, Express sends 304 Not Modified and the frontend never
    // sees whatsappJoined: true even after the webhook updates the DB.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const { userId } = req.params;
      if (!userId) { response.message = "userId is required"; response.status = 400; return; }

      const { checkWhatsAppCodeReceived } = require("../services/whatsappVerification");
      const result = await checkWhatsAppCodeReceived(userId);

      if (result.verified) {
        // Emit socket so the frontend updates instantly even if it
        // detects verification via polling rather than the webhook event
        const io = req.app.get("io");
        if (io) io.to(userId).emit("whatsappVerified", { whatsappJoined: true });

        response.success = true;
        response.status  = 200;
        response.message = "WhatsApp verified!";
        response.data    = { whatsappJoined: true };
      } else {
        response.success = false;
        response.status  = 200;
        response.message = result.reason || "Not verified yet";
        response.data    = { whatsappJoined: false };
      }
    } catch (err) {
      console.error("checkWhatsAppCodeError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description DEV ONLY — simulate receiving a WhatsApp message.
   * Lets you test the full verification flow without ngrok or Meta webhook.
   * POST /auth/whatsapp-simulate  { code: "A3F9C2" }
   *
   * In production this endpoint should be removed or protected.
   */
  static async simulateWhatsAppMessage(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      // Only allow in development
      if (process.env.APP_ENV === "production") {
        response.message = "Not available in production";
        response.status  = 403;
        return;
      }

      const { code } = req.body;
      if (!code) { response.message = "code is required"; response.status = 400; return; }

      const { handleIncomingWhatsAppMessage } = require("../services/whatsappVerification");
      // Simulate a message from a dummy phone number
      const result = await handleIncomingWhatsAppMessage("00000000000", `VERIFY-${code.toUpperCase()}`);

      if (result.verified) {
        const io = req.app.get("io");
        if (io && result.userId) {
          io.to(result.userId).emit("whatsappVerified", { whatsappJoined: true });
        }
        response.success = true;
        response.status  = 200;
        response.message = "Simulated — WhatsApp verified!";
        response.data    = { whatsappJoined: true, userId: result.userId };
      } else {
        response.success = false;
        response.status  = 400;
        response.message = result.reason || "Simulation failed";
        response.data    = { whatsappJoined: false };
      }
    } catch (err) {
      console.error("simulateWhatsAppMessageError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description Generate a WhatsApp verification code for a user
   * POST /auth/whatsapp-code  { userId }
   */
  static async generateWhatsAppCode(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const { userId } = req.body;
      if (!userId) { response.message = "userId is required"; response.status = 400; return; }

      const user = await User.findById(userId);
      if (!user) { response.message = "User not found"; response.status = 404; return; }

      const { generateWhatsAppCode } = require("../services/whatsappVerification");
      const result = await generateWhatsAppCode(userId);

      response.success = true;
      response.status  = 200;
      response.message = "Verification code generated.";
      response.data    = {
        link:      result.link,
        code:      result.code,   // included so dev can use simulate endpoint
        expiresAt: result.expiresAt,
      };
    } catch (err) {
      console.error("generateWhatsAppCodeError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description WhatsApp Business webhook — receives incoming messages
   *
   * GET  /auth/whatsapp-webhook  — webhook verification (Meta handshake)
   * POST /auth/whatsapp-webhook  — incoming message events
   *
   * When a user sends "VERIFY-XXXXXX" to your WhatsApp Business number,
   * this handler matches the code, marks the user as verified, and emits
   * a socket event so the frontend updates in real time.
   */
  static async whatsappWebhookVerify(req, res) {
    // Meta webhook verification handshake
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log("WhatsApp webhook verified.");
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: "Forbidden" });
  }

  static async whatsappWebhookReceive(req, res) {
    // Always respond 200 immediately so Meta doesn't retry
    res.status(200).json({ status: "ok" });

    try {
      const body = req.body;
      if (body?.object !== "whatsapp_business_account") return;

      const entries = body?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          const messages = change?.value?.messages || [];
          for (const msg of messages) {
            if (msg?.type !== "text") continue;

            const from    = msg?.from;           // sender phone, digits only
            const text    = msg?.text?.body || "";

            const { handleIncomingWhatsAppMessage, sendWhatsAppReply } = require("../services/whatsappVerification");
            const result = await handleIncomingWhatsAppMessage(from, text);

            if (result.verified) {
              console.log(`WhatsApp verified userId=${result.userId} from=${from}`);

              // Emit socket event so frontend updates instantly
              const io = req.app.get("io");
              if (io && result.userId) {
                io.to(result.userId).emit("whatsappVerified", { whatsappJoined: true });
              }

              // Send a friendly reply (only if Meta Cloud API is configured)
              await sendWhatsAppReply(
                from,
                "✅ You're verified! You can now proceed with your withdrawal on BIGWHALE."
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("whatsappWebhookReceive error:", err.message);
    }
  }

  /**
   * @description Verify WhatsApp channel join — user self-attests they joined
   * POST /auth/verify-whatsapp  { userId }
   *
   * WhatsApp does not provide a public API to verify channel membership,
   * so we use a self-attestation model: the user clicks "I've Joined" and
   * we mark them as verified. This is the same pattern used by many platforms.
   * We also record whatsappLastCheckedAt so the re-verification window can
   * be enforced by getSocialStatus.
   */
  static async verifyWhatsApp(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const { userId } = req.body;
      if (!userId) {
        response.message = "userId is required";
        response.status = 400;
        return;
      }

      const user = await User.findById(userId);
      if (!user) {
        response.message = "User not found";
        response.status = 404;
        return;
      }

      // Mark WhatsApp as joined and record the check timestamp
      const now = new Date();
      await User.findByIdAndUpdate(userId, {
        $set: {
          "socialConfirmed.whatsappJoined":        true,
          "socialConfirmed.whatsappVerifiedAt":     now,
          "socialConfirmed.whatsappLastCheckedAt":  now,
        },
      });

      response.success = true;
      response.status  = 200;
      response.message = "WhatsApp channel membership confirmed!";
      response.data    = { whatsappJoined: true };
    } catch (err) {
      console.error("verifyWhatsAppError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  /**
   * @description Get social verification status for a user
   * GET /auth/social-status/:userId
   *
   * Real-time monitoring: if the user confirmed WhatsApp but hasn't been
   * re-checked within RE_VERIFY_WINDOW_MS (default 24 h), we reset
   * whatsappJoined to false so they must confirm again.
   * This simulates "left the channel" detection since WhatsApp has no
   * public membership API.
   */
  static async getSocialStatus(req, res) {
    let response = ResponseHelper.getResponse(false, "Something went wrong", {}, 400);
    try {
      const { userId } = req.params;
      if (!userId) { response.message = "userId is required"; response.status = 400; return; }

      const user = await User.findById(userId).select("socialConfirmed");
      if (!user) { response.message = "User not found"; response.status = 404; return; }

      const sc = user.socialConfirmed || {};

      // ── Re-verification window ────────────────────────────────────
      // Configurable via WHATSAPP_RE_VERIFY_HOURS (default: 24h).
      // If elapsed since last check > window, reset whatsappJoined so
      // the user must re-confirm on their next withdrawal attempt.
      // This is the closest approximation to "real-time monitoring"
      // since WhatsApp has no public channel-membership API.
      const RE_VERIFY_HOURS     = parseInt(process.env.WHATSAPP_RE_VERIFY_HOURS || "24", 10);
      const RE_VERIFY_WINDOW_MS = RE_VERIFY_HOURS * 60 * 60 * 1000;
      let whatsappJoined = sc.whatsappJoined || false;

      if (whatsappJoined && sc.whatsappLastCheckedAt) {
        const elapsed = Date.now() - new Date(sc.whatsappLastCheckedAt).getTime();
        if (elapsed > RE_VERIFY_WINDOW_MS) {
          // Window expired — reset so user must re-confirm
          whatsappJoined = false;
          await User.findByIdAndUpdate(userId, {
            $set: {
              "socialConfirmed.whatsappJoined": false,
              "socialConfirmed.whatsappLastCheckedAt": null,
            },
          });
        }
      }

      response.success = true;
      response.status  = 200;
      response.message = "Social status fetched successfully.";
      response.data    = {
        telegramJoined:          sc.telegramJoined     || false,
        telegramUsername:        sc.telegramUsername   || null,
        telegramVerifiedAt:      sc.telegramVerifiedAt || null,
        whatsappJoined,
        whatsappVerifiedAt:      sc.whatsappVerifiedAt || null,
        whatsappLastCheckedAt:   sc.whatsappLastCheckedAt || null,
        // bothConfirmed = WhatsApp only (Telegram removed from requirement)
        bothConfirmed: whatsappJoined === true,
      };
    } catch (err) {
      console.error("getSocialStatusError:", err);
      response.message = err.message || "An internal server error occurred";
      response.status  = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }

  static async getMissingIncomeReward(req, res) {
    let response = ResponseHelper.getResponse(
      false,
      "Something went wrong",
      {},
      400
    );

    try {
      await referral.getMissingIncomeReward();
      response.success = true;
      response.message = "Rewards added successful.";
      response.status = 200;
    } catch (error) {
      console.log("Error: ", error);
      response.message = error.message || "An internal server error occurred";
      response.status = 500;
      response.success = false;
    } finally {
      return res.status(response.status).json(response);
    }
  }
}

module.exports = AuthController;
