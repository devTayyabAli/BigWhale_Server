const express = require("express");
const router = express.Router();
const authRouter = require("./auth");
const googleRouter = require("./google");
const rolesRouter = require("./roles");
const permissionsRouter = require("./permissions");
const notificationRouter = require("./notification");
const invitesRouter = require("./invites");
const stakeRouter = require("./stake");
const giftRouter = require("./gift");
const withdrawalRouter = require("./withdrawal");
const settingRouter = require("./setting");
const fundsTransferRouter = require("./fundsTransfer");
const kycRouter = require("./kyc");
const adminAuthRouter = require("./admin/auth");
const referralRouter = require("./referral");
const transactionRouter = require("./transaction");
const rankRouter = require("./rank");
const tokenExchangeRouter = require("./tokensExchange");
const supportRouter = require("./supportTickets");
const bannerRouter = require("./admin/Banner");



/* GET default server response. */
router.get("/", function (req, res) {
  res.status(200).json({
    status: 200,
    success: true,
    message: `Welcome to ${process.env.APP_NAME} APIs`,
    data: {},
  });
});

router.use("/auth", authRouter); // Auth routes
router.use("/authorization", googleRouter); // Google routes
router.use("/roles", rolesRouter); // Roles routes
router.use("/permissions", permissionsRouter); // Permissions routes
router.use("/notifications", notificationRouter); // Permissions routes
router.use("/invites", invitesRouter);
router.use("/stake", stakeRouter);
router.use("/withdrawal", withdrawalRouter);
router.use("/setting", settingRouter);
router.use("/fundsTransfer", fundsTransferRouter);
router.use("/kyc", kycRouter);
router.use("/admin", adminAuthRouter);
router.use("/referral", referralRouter);
router.use("/transaction", transactionRouter);
router.use("/support", supportRouter);
router.use("/admin/banner", bannerRouter);



router.use("/rank", rankRouter);
router.use("/gift", giftRouter);
router.use("/tokensExchange", tokenExchangeRouter);

module.exports = router;
