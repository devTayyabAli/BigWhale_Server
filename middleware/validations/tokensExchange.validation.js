const Joi = require("@hapi/joi");

const createTokensExchangeValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      userId: Joi.string().hex().length(24).required(),
      amount: Joi.number().positive().required(),
      type: Joi.string().valid('buy', 'sell').required()
    });

    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res
        .status(400)
        .send({ success: false, message: error?.details[0]?.message });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createTokensExchangeValidation
};
