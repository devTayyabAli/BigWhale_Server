const { calcuateStakingRewards } = require("./calculateStakingReward");
const validateStakeExpiration = require("./validateStakeExpiration");
const eventsTestCron = require("./eventsTestCron");
const validatePendingStakeTx = require("./validatePendingStakeTx");
const validatePendingP2PTx = require("./validatePendingP2PTx");
const valdatePendingWithdrawalTx = require("./validatePendingWithdrawTx");
const validatePendingRegisterUsers = require("./validatePendingRegisterUsers");
const { calculateAndUpdateUserStarRank } = require("./starRewardCalculation");
const { starRewardDistributionCron } = require("./startRewardDistribution");
const { saveLeadershipBonusCron } = require("./saveUserRewardDetails");
const { processParentRankCron } = require("./processMemberParentRank");
const { addMissingStakeReward } = require("./addMissingStakeReward");
const {deleteSameDayStakeReward}=require("./deleteSameDayStakeReward")
const startCronJobs = () => {
  calcuateStakingRewards.start();
  validateStakeExpiration.start();
  deleteSameDayStakeReward.start();
  // eventsTestCron.start()
  validatePendingStakeTx.start();
  validatePendingP2PTx.start();
  valdatePendingWithdrawalTx.start();
  validatePendingRegisterUsers.start();
  calculateAndUpdateUserStarRank.start();
  starRewardDistributionCron.start();
  saveLeadershipBonusCron.start();
  processParentRankCron.start();
  addMissingStakeReward.start()
};

module.exports = startCronJobs;
