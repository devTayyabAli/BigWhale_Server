const Transaction = require("../models/transaction.model");
const User = require("../models/user.model");
const {
  DEFAULT_STATUS,
  CONTRACT_EVENTS,
  KYC_STATUS,
  TRANSACTION_STATUS,
  SETTING
} = require("../config/constants.js");
const moment = require("moment");
const socket = require("../helpers/sockets");
const { sendVerifyEmailOTP } = require("../helpers/mail");
const Logs = require("../models/webhookLogs.js");
const { LOGS_STATUS } = require("../config/constants.js");
const { ObjectId } = require("mongoose").Types;
const { api } = require("../helpers/api.js");
const { getSettingWithKey } = require("../helpers/setting");

  const handleRegisterEvent = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );
  if (transaction) {
    const user = await User.findOneAndUpdate(
      {
        registrationTransactionId: transaction?._id,
        status: DEFAULT_STATUS.PENDING,
      },
      { status: DEFAULT_STATUS.ACTIVE }
    );
    if (user?._id) {
      socket.io.to(`${user?._id}`).emit(CONTRACT_EVENTS.REGISTER, {});
      const otpCode = Math.floor(100000 + Math.random() * 900000);
      await sendVerifyEmailOTP(user?.email, otpCode);
      const otpExpiryDuration = await getSettingWithKey(SETTING.OTP_EXPIRY_DURATION);
      const otpExpiryUnit = await getSettingWithKey(SETTING.OTP_EXPIRY_UNIT);
      const otpExpiry = moment().add(otpExpiryDuration, otpExpiryUnit);
      await User.findOneAndUpdate({ email: user?.email }, { otpCode, otpExpiry });
    }
  }
};

const updateUserOtp = async (email, otpCode, response) => {
  const otpExpiryDuration = await getSettingWithKey(SETTING.OTP_EXPIRY_DURATION);
  const otpExpiryUnit = await getSettingWithKey(SETTING.OTP_EXPIRY_UNIT);
  const otpExpiry = moment().add(otpExpiryDuration, otpExpiryUnit);
  await User.findOneAndUpdate({ email }, { otpCode, otpExpiry });

  response.success = true;
  response.status = 200;
  response.message = `OTP sent to ${email} successfully.`;

  return response;
};

const findUserByPayload = (payload) => {
  return User.findOne(payload);
};

const verifyEmailOTP = async (email, otp, response) => {
  const foundUser = await User.findOne({
    email,
    status: DEFAULT_STATUS.ACTIVE,
    otpExpiry: { $gt: new Date() },
  });

  if (foundUser && parseInt(foundUser.otpCode) != parseInt(otp)) {
    response.success = false;
    response.status = 400;
    response.message = `Invalid OTP`;
    return response;
  } else if (foundUser && parseInt(foundUser.otpCode) == parseInt(otp)) {
    await User.findOneAndUpdate(
      { email: foundUser?.email, status: DEFAULT_STATUS.ACTIVE },
      { otpCode: null, otpExpiry: null, emailVerified: true }
    );
    response.success = true;
    response.status = 200;
    response.message = `email verified successfully`;
    return response;
  }

  response.success = false;
  response.status = 400;
  response.message = `OTP expired`;
  return response;
};

const handleKYCEvents = async (event, _id) => {
  let status = null;
  let userId = event?.refId;
  if (event.status) {
    status = KYC_STATUS[event.event];
  }
  if (status) {
    const userUpdated = await updateKycStatus(userId, status);
    if (userUpdated) {
      await Logs.findOneAndUpdate(
        { _id: new ObjectId(_id) },
        { status: LOGS_STATUS.COMPLETED }
      );
      socket.io.to(`${userUpdated?._id}`).emit("kycUpdated", {});
      return userUpdated;
    }
  }
};

const updateKycStatus = async (id, kycStatus) => {
  return await User.findByIdAndUpdate(new ObjectId(id), { kycStatus });
};

const getkycUserByRefId = async (refId, response) => {
  try {
    const user = await User.findById(new ObjectId(refId));
    if (!user) {
      response.message = "Could not found user";
      response.status = 400;
      response.success = false;
      return response;
    }

    const info = await api.get(`/${process.env.KYC_CLIENT_ID}/refId/${refId}`, {
      headers: { Authorization: process.env.KYC_API_KEY },
    });

    if (info?.data.status === "success") {
      response.message = "User Info fetched successfully";
      response.status = 200;
      response.success = true;
      response.data = info.data.data;
      return response;
    }

    response.message = "Could not found user";
    response.status = 200;
    response.success = false;
    return response;
  } catch (err) {

    response.message = "Could not found user";
    response.status = 200;
    response.success = false;
    return response
    console.log(err, "error");
  }
};
const getPendingRegisterUsers=async ()=>{
  const ninetySecondsAgo = new Date(Date.now() - 90 * 1000);
  const users= await User.find(
    { status: "pending", createdAt: { $lt: ninetySecondsAgo },registrationTransactionId: { $ne: null } }
  ).populate("registrationTransactionId");
  return users
}
const updateUser=async (query,payload)=>{
  return User.findOneAndUpdate(query,payload)
}

const updateUserStatus = async (user, status) => {
  if (user) {
    return await User.findByIdAndUpdate(user._id, { status }, { new: true });
  }
};
module.exports = {
  handleRegisterEvent,
  updateUserOtp,
  findUserByPayload,
  verifyEmailOTP,
  updateKycStatus,
  handleKYCEvents,
  getkycUserByRefId,
  updateUserStatus,
  getPendingRegisterUsers,
  updateUser
};
