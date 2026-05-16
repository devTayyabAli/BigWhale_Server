var express = require("express");
var router = express.Router();
const adminMiddleware = require("../../middleware/adminAuth");

const AuthController = require("../../controllers/admin/auth.controller");
const UserController = require("../../controllers/admin/user.controller");
const RankController = require("../../controllers/rank.controller");

router.post("/signin", AuthController.login);
router.get("/user-list", adminMiddleware, UserController.userList);
router.get("/profile/:id", adminMiddleware, UserController.getUserProfile);
router.get("/withdrawals-list/:userId", adminMiddleware, UserController.getWithdrawals);
router.get("/sellToken-list/:userId", adminMiddleware, UserController.getSellToken);
router.get("/fundTransfer-list/:userId", adminMiddleware, UserController.getFundsTransfer);
router.post("/change-password", adminMiddleware, UserController.changePassword);
router.get("/reward-list/:userId", adminMiddleware, UserController.rewardList);
router.get("/user-detail/:userId", adminMiddleware, UserController.userDetail);
router.delete('/:userId', adminMiddleware, UserController.deleteUserById);
router.get('/teamTotalReward/:userId', adminMiddleware, UserController.teamTotalReward);
router.put('/:userId/status', adminMiddleware, UserController.updateUserStatus);
router.put('/:userId/withdrawstatus', adminMiddleware, UserController.updateUserWithdrawStatus);
router.put(
    "/:userId/levelIncomeStatus",
    adminMiddleware,
    UserController.updateUserLevelIncomeRewardStatus
);
router.get("/statistics", adminMiddleware, UserController.Statistics);
router.get("/stakeReward/:stakeId", adminMiddleware, UserController.stakingRewardByStakeId);
router.get("/today-stake-reward", adminMiddleware, UserController.getTodayStakeReward);
router.get("/today-sale", adminMiddleware, UserController.getTodaySale);
router.get("/today-users", adminMiddleware, UserController.getTodayUsers);
router.get("/today-banned-users", adminMiddleware, UserController.getTodayBannedUsers);


router.get("/other-reward", adminMiddleware, UserController.getOtherReward);
router.put("/updateStaking/:userId/status", adminMiddleware, UserController.updateStakingStatus);
router.get("/stake-list", adminMiddleware, UserController.stakingList);
router.get("/stake-list/:userId", adminMiddleware, UserController.stakingList);
router.get("/teams/:userId", adminMiddleware, UserController.getReferralByType);
router.post("/save-token-rate", adminMiddleware, UserController.saveTokenRate);
router.get("/latest-token-rate", adminMiddleware, UserController.getLatestTokenRate);
router.get("/get-rank-status/:userId", adminMiddleware, RankController.getStakeRewardForUser);


module.exports = router;
