var express = require("express");
var router = express.Router();
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const WithdrawalController = require("../controllers/withdrawal.controller");
const {
  createWithdrawalValidation,
  completeWithdrawalValidation
} = require("../middleware/validations/withdrawal.validation");
router.post(
  "/",
  //  checkIfAuthenticated,
  createWithdrawalValidation,
  WithdrawalController.addWithdrawal
);
router.post(
  "/complete/:id",
  //  checkIfAuthenticated,
  completeWithdrawalValidation,
  WithdrawalController.completeWithdrawal
);

router.get(
  "/:userId",
  //  checkIfAuthenticated,
  WithdrawalController.getWithdrawalByUser
);

router.get(
  "/history/:userId",
  //  checkIfAuthenticated,
  WithdrawalController.getWithdrawalHistory
);

router.get(
  "/all/:userId",
  //  checkIfAuthenticated,
  WithdrawalController.getAllWithdrawalsByUser
);

router.get(
  "/amount/:userID",
  //  checkIfAuthenticated,
  WithdrawalController.getWithdrawalAmount
);

router.post(
  "/transfer/amount/:address",
  //  checkIfAuthenticated,
  WithdrawalController.transferWithdrawalFunds
);

module.exports = router;
