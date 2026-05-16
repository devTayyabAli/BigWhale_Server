const Joi = require("@hapi/joi");

const signupValidation = {
  body: {
    walletAddress: Joi.string().required().regex(/^(0x)?[0-9a-fA-F]{40}$/).messages({
      "string.base": "Address must be a string",
      "string.empty": "Address cannot be empty",
      "any.required": "Address is required",
      "string.pattern.base": "Address must be a valid hexadecimal string of length 40 (with or without '0x' prefix)"
    }),
    referredBy: Joi.string().optional().allow(""),
    email: Joi.string().email().required(),
    name: Joi.string().required(),
    userName: Joi.string().required(),
    role: Joi.string().required(),
    amount: Joi.string().optional().allow(""),
    tokens: Joi.string().optional().allow(""),
    phoneNumber: Joi.string().optional().allow(""),
    password: Joi.string()
      .min(6)
      .required()
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/, "password"),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password")) // Ensure it matches the 'password' field
      .required()
      .label("confirmPassword")
      .messages({ "any.only": "{{#label}} does not match the password" }), // Custom error message
  },
};

const completeSignupUpdation = {
  body: {
  txHash: Joi.string().regex(/^(0x)?[a-fA-F0-9]{64}$/).required(),
    userId: Joi.string().length(24).hex().required(),
  },
};

const signinValidation = {
  body: {
    walletAddress: Joi.string().required().regex(/^(0x)?[0-9a-fA-F]{40}$/).messages({
      "string.base": "Address must be a string",
      "string.empty": "Address cannot be empty",
      "any.required": "Address is required",
      "string.pattern.base": "Address must be a valid hexadecimal string of length 40 (with or without '0x' prefix)"
    }),
    email: Joi.string().email().required(),
    password: Joi.string()
      .min(6)
      .required()
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/, "password"),
  },
};

const forgetPasswordValidation = {
  body: {
    email: Joi.string().email().required(),
  },
};

const changePasswordValidation = {
  body: {
    oldPassword: Joi.string()
      .min(6)
      .required()
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/, "oldPassword"),
    password: Joi.string()
      .min(6)
      .required()
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/, "password"),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password")) // Ensure it matches the 'password' field
      .required()
      .label("confirmPassword")
      .messages({ "any.only": "{{#label}} does not match the password" }), // Custom error message
  },
};

const resetPasswordValidation = {
  body: {
    requestType: Joi.string(),
    password: Joi.string()
      .min(6)
      .required()
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{6,})/, "password"),
    confirmPassword: Joi.string()
      .valid(Joi.ref("password")) // Ensure it matches the 'password' field
      .required()
      .label("confirmPassword")
      .messages({ "any.only": "{{#label}} does not match the password" }), // Custom error message
  },
};

const optVerificationValidation = {
  body: {
    requestType: Joi.string(),
    email: Joi.string().email().required(),
    opt: Joi.string().required(),
  },
};

const sendInviteValidation = {
  body: {
    email: Joi.string().email().required(),
  },
};

const respondInviteValidation = {
  body: {
    email: Joi.string().email().required(),
    status: Joi.string().required(),
  },
};

module.exports = {
  signupValidation,
  signinValidation,
  forgetPasswordValidation,
  changePasswordValidation,
  resetPasswordValidation,
  optVerificationValidation,
  sendInviteValidation,
  respondInviteValidation,
  completeSignupUpdation
};
