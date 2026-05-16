var express = require("express");
var router = express.Router();
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const StakeController = require("../controllers/stake.controller");
const {
  createStakeValidation,
  completeStakeValidation,
} = require("../middleware/validations/stake.validation");


router.post(
  "/",
  //  checkIfAuthenticated,
  createStakeValidation,
  StakeController.addStake
);
router.post(
  "/complete/:id",
  //  checkIfAuthenticated,
  completeStakeValidation,
  StakeController.completeStake
);

router.get(
  "/:userId",
  //  checkIfAuthenticated,
  StakeController.getStakeByUser
);

router.get(
  "/all/:userId",
  //  checkIfAuthenticated,
  StakeController.getAllStakesByUser
);
router.post(
  "/testCron"
  // testCron
  //  checkIfAuthenticated,
  // StakeController.getAllStakesByUser
);

module.exports = router;
