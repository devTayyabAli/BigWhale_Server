const userStakingReward = require("../models/userStakingReward.model");
const moment = require("moment-timezone");

const createUserStakingRewards = async (payload) => {
  const stakingReward = await userStakingReward.insertMany(payload);
  return stakingReward;
};

/**
 * Returns the reward record for a given stake on a specific calendar day.
 * Uses start-of-day / end-of-day boundaries in DEFAULT_TIMEZONE so a cron
 * that fires multiple times within the same day never inserts a second record.
 *
 * @param {ObjectId|string} stakeId
 * @param {Date|string}     targetDate  – any date whose calendar day we check
 *                                        (defaults to "today" in DEFAULT_TIMEZONE)
 */
const getRewardForDay = async (stakeId, targetDate) => {
  const tz = process.env.DEFAULT_TIMEZONE || "UTC";
  const day = targetDate
    ? moment.tz(targetDate, tz)
    : moment.tz(tz);
  const startOfDay = day.clone().startOf("day").toDate();
  const endOfDay   = day.clone().endOf("day").toDate();

  const reward = await userStakingReward.findOne({
    stakeId,
    createdAt: { $gte: startOfDay, $lte: endOfDay },
  });
  return reward;
};

module.exports = {
    createUserStakingRewards,
    /** @deprecated Use getRewardForDay instead */
    getUserRewardWithinLast24Hrs: getRewardForDay,
    getRewardForDay,
};
