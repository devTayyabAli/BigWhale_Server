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
  const startOfDayTz = day.clone().startOf("day").toDate();
  const endOfDayTz   = day.clone().endOf("day").toDate();

  const utcDay = targetDate
    ? moment.utc(targetDate)
    : moment.utc();
  const startOfDayUtc = utcDay.clone().startOf("day").toDate();
  const endOfDayUtc   = utcDay.clone().endOf("day").toDate();

  // Guard against any reward created within the last 20 hours for this stake
  const twentyHoursAgo = moment.utc().subtract(20, "hours").toDate();

  const reward = await userStakingReward.findOne({
    stakeId,
    $or: [
      { createdAt: { $gte: startOfDayTz, $lte: endOfDayTz } },
      { createdAt: { $gte: startOfDayUtc, $lte: endOfDayUtc } },
      { createdAt: { $gte: twentyHoursAgo } },
    ],
  });
  return reward;
};

module.exports = {
    createUserStakingRewards,
    /** @deprecated Use getRewardForDay instead */
    getUserRewardWithinLast24Hrs: getRewardForDay,
    getRewardForDay,
};
