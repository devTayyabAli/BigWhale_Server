const Joi = require("@hapi/joi");

const completeTxValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      txHash: Joi.string().regex(/^(0x)?[a-fA-F0-9]{64}$/).required(),
    });

    const { error } = schema.validate(req.params, { abortEarly: false });
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
const txLogValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      txHash: Joi.string().regex(/^(0x)?[a-fA-F0-9]{64}$/).optional(''),
      walletAddress: Joi.string().required().regex(/^(0x)?[0-9a-fA-F]{40}$/).messages({
        "string.base": "Address must be a string",
        "string.empty": "Address cannot be empty",
        "any.required": "Address is required",
        "string.pattern.base": "Address must be a valid hexadecimal string of length 40 (with or without '0x' prefix)"
      }),
      error:Joi.string().required()
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

module.exports = { completeTxValidation,txLogValidation };
