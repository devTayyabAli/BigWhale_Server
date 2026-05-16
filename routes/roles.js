var express = require('express');
var router = express.Router();
const validate = require('express-joi-validate');

const {
  createRoleValidation,
} = require('../middleware/validations/roles.validation');

const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const RoleController = require('../controllers/role.controller');

router.get('/', checkIfAuthenticated, RoleController.index); // ROLES LISTING API
router.get('/:id', checkIfAuthenticated, RoleController.view); // FIND ROLE API
router.post(
  '/save',
  checkIfAuthenticated,
  validate(createRoleValidation),
  RoleController.create
); // CREATE ROLE API
router.put('/update/:id', checkIfAuthenticated, RoleController.edit); // UPDATE ROLE API
router.delete('/delete/:id', checkIfAuthenticated, RoleController.remove); // DELETE ROLE API

module.exports = router;
