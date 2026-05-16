const Joi = require("@hapi/joi");

const createWithdrawalValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      userId: Joi.string().length(24).hex().required(),
      amount: Joi.number().positive().required(),
    });

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res
        .status(400)
        .send({ success: false, message: error?.details[0]?.message });
    }
    next();
  } catch (err) {
    console.log(err, "error");
    res.status(500).send({ success: false, message: err });
  }
};
const completeWithdrawalValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      txHash: Joi.string().regex(/^(0x)?[a-fA-F0-9]{64}$/).required(),
      userId: Joi.string().required(),
      cryptoAmount: Joi.number().positive().required(),
      fiatAmount: Joi.number().positive().required(),
    });

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res
        .status(400)
        .send({ success: false, message: error?.details[0]?.message });
    }
    next();
  } catch (err) {
    console.log(err, "error");
    res.status(500).send({ success: false, message: err });
  }

};

module.exports = { createWithdrawalValidation, completeWithdrawalValidation };
