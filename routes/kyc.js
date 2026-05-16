var express = require("express");
var router = express.Router();
const KycController=require('../controllers/kyc.controller')
router.post(
  "/webhook",
  KycController.listenKycEvents
);
router.get(
  "/user/:id",
  KycController.getKycInfo
);
module.exports = router;
