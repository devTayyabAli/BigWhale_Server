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
const { deleteSameDayStakeReward } = require("./deleteSameDayStakeReward");
const { saveIncomeRewardCron } = require("./incomeReward");
const { fastTrackRankSyncCron } = require("./fastTrackRankSync");
const startCronJobs = () => {
  calcuateStakingRewards.start();
  validateStakeExpiration.start();
  deleteSameDayStakeReward.start();
  // eventsTestCron.start()
  validatePendingStakeTx.start();
  validatePendingP2PTx.start();
  valdatePendingWithdrawalTx.start();
  validatePendingRegisterUsers.start();

  // ── Ranks ────────────────────────────────────────────────────────────────
  // 2X Fast-Track: ranks are driven by staked-direct count (5^N) and are
  // lifetime. The legacy turnover-based rank crons below reset userRankId to
  // null for users who don't meet the OLD criteria (selfBusiness, team
  // business, team size) and would wipe the new ranks every night.
  // They are intentionally DISABLED — do not re-enable without reworking
  // services/rank.js to the new criteria.
  // calculateAndUpdateUserStarRank.start();
  // processParentRankCron.start();
  fastTrackRankSyncCron.start();

  starRewardDistributionCron.start();
  saveLeadershipBonusCron.start();
  addMissingStakeReward.start();
  saveIncomeRewardCron.start();
};

module.exports = startCronJobs;
