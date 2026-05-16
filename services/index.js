const stakeService = require("./stake");
const withdrawalService = require("./withdrawal");
const settingService = require("./setting");
const authService = require("./auth");
const userStakingRewardService = require("./stakingReward");
const fundsTranferService = require("./fundsTransfer");
const transactionService = require("./transaction");
const rankService = require("./rank");
const giftService = require("./gift");
const tokenExchange = require("./tokensExchange")
module.exports = {
  stakeService,
  withdrawalService,
  settingService,
  authService,
  userStakingRewardService,
  fundsTranferService,
  transactionService,
  rankService,
  giftService,
  tokenExchange
};
