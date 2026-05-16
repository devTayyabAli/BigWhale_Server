var express = require('express');
var router = express.Router();
const validate = require('express-joi-validate');
const {
  sendInviteValidation,
  respondInviteValidation,
} = require('../middleware/validations/auth.validation');

const checkIfAuthenticated = require('../middleware/checkIfAuthenticated');
const InvitesController = require('../controllers/invites.controller');

router.get('/', checkIfAuthenticated, InvitesController.invitesListing);

router.post(
  '/send-invite',
  checkIfAuthenticated,
  validate(sendInviteValidation),
  InvitesController.sendInvite
);

router.post(
  '/resend-invite',
  checkIfAuthenticated,
  validate(sendInviteValidation),
  InvitesController.resendInvite
);

router.post(
  '/accept-invite',
  checkIfAuthenticated,
  validate(respondInviteValidation),
  InvitesController.acceptInvite
);

router.post(
  '/reject-invite',
  checkIfAuthenticated,
  validate(respondInviteValidation),
  InvitesController.rejectInvite
);
module.exports = router;
