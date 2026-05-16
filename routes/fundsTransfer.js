var express = require("express");
var router = express.Router();
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const FundsTransferController = require("../controllers/fundsTransfer.controller");
const {
  createFundsTransferValidation,
  validateCompleteFundTransferValidation
} = require("../middleware/validations/fundsTransfer");

router.post(
  "/",
  //  checkIfAuthenticated,
  createFundsTransferValidation,
  FundsTransferController.create
);

router.post(
  "/complete/:id",
  //  checkIfAuthenticated,
  validateCompleteFundTransferValidation,
  FundsTransferController.complete
);

router.post(
  "/sendBlockTransactions",
  //  checkIfAuthenticated,
  FundsTransferController.blockUser
);
router.get(
  "/all/:userId",
  //  checkIfAuthenticated,
  //   createConfigValidation,
  FundsTransferController.getFundsByUser
);
router.get(
  "/availableToConvert/:userId",
  FundsTransferController.availableToConvert
);

module.exports = router;
