const Joi = require('@hapi/joi');

const createRoleValidation = {
  body: {
    roleName: Joi.string().required(),
    permissions: Joi.array().items(Joi.string()),
  },
};

module.exports = {
  createRoleValidation,
};
