

const sendVerifyEmailOTP = async (email) => {
  await client.verify.v2
    .services(serviceId)
    .verifications.create({ to: email, channel: "email" })
    .then((verification) => console.log(verification))
    .catch((err) => console.log(err, "error==>"));
};

const verifyEmailOTP = async (email, code) => {
  await client.verify.v2
    .services(serviceId)
    .verificationChecks.create({ to: email, code })
    .then((verification_check) => console.log(verification_check.sid));
};

module.exports = {
  sendVerifyEmailOTP,
  verifyEmailOTP,
};
