const express = require("express");
const router = express.Router();
const adminMiddleware = require("../../middleware/adminAuth");
const OwnerWalletController = require("../../controllers/admin/ownerWallet.controller");

// All owner wallet management routes are protected by adminMiddleware
router.get("/status", adminMiddleware, OwnerWalletController.getStatus);
router.post("/", adminMiddleware, OwnerWalletController.updateKey);
router.delete("/", adminMiddleware, OwnerWalletController.deleteKey);

module.exports = router;
