const cron = require("node-cron");
const services = require("../services/index");
const socket = require("../helpers/sockets");
const { SETTING } = require("../config/constants");
const { getSettingWithKey } = require("../helpers/setting");
const Stake = require("../models/stake.model");
const { sendCappingLimitEmail } = require("../helpers/mail");
const referral = require("../services/referral");
const {
  momentToSubtract,
  momentFormatedWithSetTime,
  momentTimezone,
} = require("../helpers/moment");
const userStakingReward = require("../models/userStakingReward.model");

const timeString = process.env.APP_ENV !== "production" ? 10 : 24;
const durationString =
  process.env.APP_ENV !== "production" ? "minutes" : "hour";
const cronTiming =
  process.env.APP_ENV !== "production" ? "*/2 * * * *" : "*/15 * * * *";

let isStakeRewardCronRunning = false;

const calcuateStakingRewards = cron.schedule(cronTiming, async () => {
  if (isStakeRewardCronRunning) {
    console.log("⏭ stakeRewardCron skipped — previous run still in progress");
    return;
  }
  isStakeRewardCronRunning = true;
  try {
    await stakeRewardCron();
  } finally {
    isStakeRewardCronRunning = false;
  }
});

const stakeRewardCron = async () => {
  try {
    const twentyFourHoursAgo = momentToSubtract(timeString, durationString);

    const activeStakes = await services.stakeService.getStakesToAddReward(
      twentyFourHoursAgo
    );
    const percentage = await getSettingWithKey(SETTING.STAKE_REWARD_PER_DAY);

    for (const stake of activeStakes) {
      if (!stake?.userId?._id) {
        continue;
      }

      // Bug fix 1: use `continue` not `break` — a capped user should not
      // stop rewards for every other user in the list.
      const capping = await referral.handleCappingEvent(stake?.userId?._id);
      if (capping?.isCappingReached) {
        // Bug fix 3: await the email so errors surface in logs
        await sendCappingLimitEmail(stake?.userId?.email);
        continue; // skip only this stake, keep processing others
      }

      const lastReward =
        await services.userStakingRewardService.getUserRewardWithinLast24Hrs(
          stake?._id,
          twentyFourHoursAgo
        );

      if (!lastReward) {
        const amount = calculatePercentage(percentage, stake?.amount);

        // Extract time-of-day from the original stake's creation time.
        // Use local (timezone-adjusted) time components, not UTC, so the
        // reward timestamp stays aligned with the stake's local creation time.
        const localCreatedAt = momentTimezone(stake?.createdAt);
        const time = {
          hour:        localCreatedAt.hours(),
          minute:      localCreatedAt.minutes(),
          second:      localCreatedAt.seconds(),
          millisecond: localCreatedAt.milliseconds(),
        };

        const rewardTimestamp = momentFormatedWithSetTime(momentTimezone(), time);

        // Bug fix 5: write the reward record and update lastReward together.
        // If either fails the error is caught and logged; the stake will be
        // retried on the next cron tick because lastReward won't have advanced.
        await userStakingReward.create({
          userId: stake?.userId?._id,
          stakeId: stake?._id,
          amount,
          createdAt: rewardTimestamp,
        });

        await Stake.findOneAndUpdate(
          { _id: stake?._id },
          { lastReward: rewardTimestamp }
        );
      }
    }

    // Notify all clients to refetch their withdrawal amount
    socket.io.emit("withdrawAmount", {});
  } catch (error) {
    console.error("Error while adding stake reward:", error);
  }
};

const calculatePercentage = (percentage, value) => {
  return (Number(percentage) / 100) * value;
};

module.exports = { calcuateStakingRewards, stakeRewardCron };
