const express = require("express");
const router = express.Router();
const adminMiddleware = require("../../middleware/adminAuth");
const FastTrackController = require("../../controllers/admin/fastTrack.controller");

router.use(adminMiddleware);

router.get("/ranks", FastTrackController.getRanks);
router.put("/ranks", FastTrackController.updateRanks);

router.get("/stats", FastTrackController.getStats);
router.get("/audit", FastTrackController.getAudit);
router.post("/resync", FastTrackController.resyncAll);
router.post("/reset-ranks", FastTrackController.resetRanks);

router.get("/withdrawals", FastTrackController.listWithdrawals);
router.post("/withdrawals/:id/cancel", FastTrackController.cancelWithdrawal);

router.get("/user/:userId", FastTrackController.getUserFastTrack);
router.put("/user/:userId/credits", FastTrackController.setCredits);
router.post("/user/:userId/reset-window", FastTrackController.resetWindow);
router.post("/user/:userId/resync", FastTrackController.resyncUser);

module.exports = router;
