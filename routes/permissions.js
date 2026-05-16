var express = require('express');
var router = express.Router();
const validate = require('express-joi-validate');

const {
  createPermissionValidation,
} = require('../middleware/validations/permissions.validation');

const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const PermissionController = require('../controllers/permission.controller');

router.get('/', checkIfAuthenticated, PermissionController.index); // PERMISSIONS LISTING API
router.get('/:id', checkIfAuthenticated, PermissionController.view); // FIND PERMISSION API
router.post(
  '/save',
  checkIfAuthenticated,
  validate(createPermissionValidation),
  PermissionController.create
); // CREATE PERMISSION API
router.put('/update/:id', checkIfAuthenticated, PermissionController.edit); // UPDATE PERMISSION API
router.delete('/delete/:id', checkIfAuthenticated, PermissionController.remove); // DELETE PERMISSION API

module.exports = router;
