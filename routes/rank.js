var express = require("express");
var router = express.Router();
const RankController = require("../controllers/rank.controller");
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");

router.get(
  "/:userId",
  checkIfAuthenticated,
  RankController.getStakeRewardForUser
);

module.exports = router;
