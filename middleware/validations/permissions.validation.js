const Joi = require('@hapi/joi');

const createPermissionValidation = {
  body: {
    permissionName: Joi.string().required(),
  },
};

module.exports = {
  createPermissionValidation,
};
