const nodemailer = require("nodemailer");
const { EMAIL_SUBJECT, EMAIL_TEMPLATE_PATH } = require("../config/constants");
const path = require("path");
const ejs = require("ejs");
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: process.env.MAIL_SECURE,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} text
 * @returns {Promise}
 */
const sendEmail = async (to, subject, html) => {
  const msg = { from: process.env.MAIL_FROM, to, subject, html };
  await transporter.sendMail(msg);
};
const sendVerifyEmailOTP = async (email, code) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.REGISTER;
    const emailData = [];
    emailData.code = code;
    emailData.email = email;
    emailData.subject = EMAIL_SUBJECT.REGISTER;
    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.VERIFICATION
      ),
      emailData
    );
     // Define recipients (User + Admin)
     const recipients = [email, process.env.MAIL_USERNAME];

     // Send email to both user and admin
     await Promise.all(recipients.map((email) => sendEmail(email, subject, html)));
    // await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendVerifyEmailOTPError", error);
    return error;
  }
};

const sendRegistrationEmail = async (email, token) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.REGISTER;
    const emailData = [];
    emailData.token = token;
    emailData.subject = EMAIL_SUBJECT.REGISTER;
    const html = await ejs.renderFile(
      path.join(process.env.FILE_STORAGE_PATH, EMAIL_TEMPLATE_PATH.REGISTER),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendRegistrationEmailError", error);
    return error;
  }
};

const sendForgetPasswordEmail = async (email, token) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.FORGOT_PASSWORD;
    const emailData = [];
    emailData.token = token;
    emailData.subject = EMAIL_SUBJECT.FORGOT_PASSWORD;
    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.FORGOT_PASSWORD
      ),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendForgetPasswordEmailError", error);
    return error;
  }
};

const sendInviteEmail = async (email) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.INVITE;
    const emailData = [];
    emailData.subject = EMAIL_SUBJECT.INVITE;
    const html = await ejs.renderFile(
      path.join(process.env.FILE_STORAGE_PATH, EMAIL_TEMPLATE_PATH.INVITE),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendForgetPasswordEmailError", error);
    return error;
  }
};

const sendRankUpdationEmail = async (email, rankDetails) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.RANK_UPDATION;
    const emailData = [];
    emailData.subject = EMAIL_SUBJECT.RANK_UPDATION;
    emailData.title = rankDetails?.title;

    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.RANK_UPDATION
      ),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendRankUpdationEmailError", error);
    return error;
  }
};

const sendRankGiftRequestEmail = async (email, object) => {
  try {
    if (!email) return;
    const subject = EMAIL_SUBJECT.RANK_GIFT_REQUEST;
    const emailData = [];
    emailData.subject = EMAIL_SUBJECT.RANK_GIFT_REQUEST;
    emailData.email = object?.users?.email || "";
    emailData.gift = object?.rank?.giftId?.title || "";

    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.RANK_GIFT_REQUEST
      ),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendRankGiftRequestEmailError", error);
    return error;
  }
};

const sendCronFailureEmail = async (cron) => {
  try {
    const subject = EMAIL_SUBJECT.REQUEST_PROCESS_FAILURE;
    const emailData = [];
    emailData.subject = EMAIL_SUBJECT.REQUEST_PROCESS_FAILURE;
    emailData.cron = cron;

    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.REQUEST_PROCESS_FAILURE
      ),
      emailData
    );
    await sendEmail(process.env.EMAIL_FOR_CRON_FAIL, subject, html);
  } catch (error) {
    console.log("sendCronFailureEmailError", error);
    return error;
  }
};

const sendCappingLimitEmail = async (email) => {
  try {
    const subject = EMAIL_SUBJECT.CAPPING_LIMIT;
    const emailData = [];
    emailData.subject = EMAIL_SUBJECT.CAPPING_LIMIT;
    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.CAPPING_LIMIT
      ),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendCappingLimitEmailError", error);
    return error;
  }
};

const sendCreateTicketEmail = async (email,body,mailsubject) => {
  try {
    const subject = mailsubject;
    const emailData = [];
    emailData.subject = mailsubject;
    emailData.body = body;

    const html = await ejs.renderFile(
      path.join(
        process.env.FILE_STORAGE_PATH,
        EMAIL_TEMPLATE_PATH.CREATE_TICKET
      ),
      emailData
    );
    await sendEmail(email, subject, html);
  } catch (error) {
    console.log("sendCreateTicketEmailError", error);
    return error;
  }
};
module.exports = {
  sendRegistrationEmail,
  sendForgetPasswordEmail,
  sendInviteEmail,
  sendVerifyEmailOTP,
  sendRankUpdationEmail,
  sendRankGiftRequestEmail,
  sendCronFailureEmail,
  sendCappingLimitEmail,
  sendCreateTicketEmail
};
