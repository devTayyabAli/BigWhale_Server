const Joi = require("@hapi/joi");

const createConfigValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      key:   Joi.string().max(255).required(),
      value: Joi.string().max(255).required(),
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

const updateConfigValidation = (req, res, next) => {
  try {
    const schema = Joi.object({
      value: Joi.string().max(255).required(),
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

module.exports = { createConfigValidation, updateConfigValidation };
