const cron = require("node-cron");
const services = require("../services/index");
const socket = require("../helpers/sockets");
const { SETTING } = require("../config/constants");
const { getSettingWithKey } = require("../helpers/setting");
const Stake = require("../models/stake.model");
const { sendCappingLimitEmail } = require("../helpers/mail");
const referral = require("../services/referral");
const {
  momentFormatedWithSetTime,
  momentTimezone,
} = require("../helpers/moment");
const userStakingReward = require("../models/userStakingReward.model");
const { getRewardForDay } = require("../services/stakingReward");
const cronTiming =
  process.env.STAKE_REWARD_CRON_SCHEDULE || "*/5 * * * *";

const calcuateStakingRewards = cron.schedule(cronTiming, async () => {
  stakeRewardCron();
});

const stakeRewardCron = async () => {
  try {
    // Use today's UTC date as the lookback reference so the query returns
    // all active stakes regardless of when they were last rewarded.
    const todayUtc = momentTimezone();

    const activeStakes = await services.stakeService.getStakesToAddReward(
      todayUtc
    );
    console.log("activeStakes count:", activeStakes.length);

    const percentage = await getSettingWithKey(SETTING.STAKE_REWARD_PER_DAY);

    for (const stake of activeStakes) {
      if (!stake?.userId?._id) {
        continue;
      }
      const capping = await referral.handleCappingEvent(stake?.userId?._id);

      if (capping?.isCappingReached) {
        sendCappingLimitEmail(stake?.userId?.email);
        continue;
      }

      // Calendar-day duplicate guard (PRODUCTION only):
      // In production → allow only 1 reward per stake per calendar day.
      // In non-production (testing) → allow 1 reward per cron run (every hour),
      //   so you can verify 24 records accumulate in 24 hours.
      if (process.env.APP_ENV === "production") {
        const existingTodayReward = await getRewardForDay(stake?._id);
        if (existingTodayReward) {
          console.log(`⚠️  Reward already exists for stake ${stake?._id} today – skipping.`);
          continue;
        }
      }

      // Set the reward's createdAt to today's date at the stake's original
      // time-of-day so dashboard grouping lines up with the stake creation time.
      const time = {
        hour:        stake?.createdAt.getUTCHours(),
        minute:      stake?.createdAt.getUTCMinutes(),
        second:      stake?.createdAt.getUTCSeconds(),
        millisecond: stake?.createdAt.getMilliseconds(),
      };

      const amount = calculatePercentage(percentage, stake?.amount);

      await userStakingReward.create({
        userId:    stake?.userId?._id,
        stakeId:   stake?._id,
        amount:    amount,
        createdAt: momentFormatedWithSetTime(momentTimezone(), time),
      });

      await Stake.findOneAndUpdate(
        { _id: stake?._id },
        { lastReward: momentFormatedWithSetTime(momentTimezone(), time) }
      );

      console.log(`✅ Reward saved for stake ${stake?._id}, amount: ${amount}`);
    }
    // Emit event so clients refetch the updated withdrawal amount
    socket.io.emit("withdrawAmount", {});
  } catch (error) {
    console.error("Error while adding stake reward:", error);
    // Handle errors here
  }
};

const calculatePercentage = (percentage, value) => {
  return (Number(percentage) / 100) * value;
};

module.exports = { calcuateStakingRewards, stakeRewardCron };
