var express = require("express");
var router = express.Router();
const GiftController = require("../controllers/gift.controller");
const checkIfAuthenticated = require("../middleware/checkIfAuthenticated");
const adminMiddleware = require("../middleware/adminAuth");

router.get("/requests", adminMiddleware, GiftController.getRankGiftRequests);
router.put(
  "/update/requestStatus/:id",
  adminMiddleware,
  GiftController.updateGiftRequestStatus
);

module.exports = router;
