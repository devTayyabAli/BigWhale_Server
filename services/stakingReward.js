const userStakingReward = require("../models/userStakingReward.model");
const moment = require("moment");

const createUserStakingRewards = async (payload) => {
  const stakingReward = await userStakingReward.insertMany(payload);
  return stakingReward;
};
const getUserRewardWithinLast24Hrs=async (stakeId,twentyFourHoursAgo)=>{
  const reward = await userStakingReward.findOne({
     stakeId,
    createdAt: { $gt: twentyFourHoursAgo }
  });
  return reward
}

module.exports = {
    createUserStakingRewards,
    getUserRewardWithinLast24Hrs
};
