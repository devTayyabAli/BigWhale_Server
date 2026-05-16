var express = require("express");
var router = express.Router();
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const TokensExchangeController = require("../controllers/tokensExchange.controller");
const {
  createTokensExchangeValidation
} = require("../middleware/validations/tokensExchange.validation");

router.post(
  "/",
  //  checkIfAuthenticated,
  createTokensExchangeValidation,
  TokensExchangeController.create
);

router.post(
  "/complete/:id",
  //  checkIfAuthenticated,
  TokensExchangeController.complete
);
router.get(
  "/all/:userId/:type",
  //  checkIfAuthenticated,
  TokensExchangeController.getTokenExchangeByType
);
router.post(
  "/complete-exchangeTx/:txHash",
  //  checkIfAuthenticated,
  TokensExchangeController.completeExchangeTx
);
module.exports = router;
