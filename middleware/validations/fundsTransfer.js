const Joi = require("@hapi/joi");

const createFundsTransferValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      toUserId: Joi.string().hex().length(24).required(), // Assuming toUserId is a mongoose ObjectId
      amount: Joi.number().positive().required(),
      fromUserId: Joi.string().hex().length(24).required(), // Assuming fromUserId is a mongoose ObjectId
      // txHash: Joi.string().required(), // Assuming transactionId is a string
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

const validateCompleteFundTransferValidation = (req, res, next) => {
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
    console.error(err);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createFundsTransferValidation,
  validateCompleteFundTransferValidation,
};
