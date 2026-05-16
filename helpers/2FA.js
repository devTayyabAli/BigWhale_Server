
const client = require("twilio")(
    process.env.ACCOUNT_SID,
    process.env.AUTH_TOKEN
  );


exports.sendTwilioCode = async (phoneNumber) => {
 return await client.verify.v2.services(process.env.SERVICE_SID)
  .verifications
  .create({to: phoneNumber, channel: 'sms'})
};

exports.verifyTwilioCode = async (phoneNumber, code) => {
    return await client.verify.v2.services(process.env.SERVICE_SID)
    .verificationChecks
    .create({to: phoneNumber, code: code})
};

exports.maskPhoneNumber = (phoneNumber, trailingCharsIntactCount) => {
  if (phoneNumber?.length > 0) {
    phoneNumber =
      new Array(phoneNumber?.length - trailingCharsIntactCount + 1)?.join(
        "*"
      ) + phoneNumber?.slice(-trailingCharsIntactCount);
    return phoneNumber;
  } else {
    return "";
  }
};