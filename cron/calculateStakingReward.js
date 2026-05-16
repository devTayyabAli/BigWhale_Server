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
  momentFormated,
  momentFormatedWithSetTime,momentTimezone,
} = require("../helpers/moment");
const userStakingReward = require("../models/userStakingReward.model");
const timeString = process.env.APP_ENV !== "production" ? 10 : 24;
const durationString =
  process.env.APP_ENV !== "production" ? "minutes" : "hour";
const cronTiming =
  process.env.APP_ENV !== "production" ? "*/2 * * * *" : "*/15 * * * *";

const calcuateStakingRewards = cron.schedule(cronTiming, async () => {
  stakeRewardCron();
});

const stakeRewardCron = async () => {
  try {
    const twentyFourHoursAgo = momentToSubtract(timeString, durationString);

    const activeStakes = await services.stakeService.getStakesToAddReward(
      twentyFourHoursAgo
    );
    const percentage = await getSettingWithKey(SETTING.STAKE_REWARD_PER_DAY);

    // const userRewardToInsert = [];
    // const idsToUpdate = [];

    for (const stake of activeStakes) {
      if (!stake?.userId?._id) {
        continue;
      }
      const capping = await referral.handleCappingEvent(stake?.userId?._id);

      if (capping?.isCappingReached) {
        isCappingReached = true;
        sendCappingLimitEmail(stake?.userId?.email);
        break;
      }

      const lastReward =
        await services.userStakingRewardService.getUserRewardWithinLast24Hrs(
          stake?._id,
          twentyFourHoursAgo
        );
      const hours = stake?.createdAt.getUTCHours(); // Get the hours (0-23)
      const minutes = stake?.createdAt.getUTCMinutes(); // Get the minutes (0-59)
      const seconds = stake?.createdAt.getUTCSeconds(); // Get the seconds (0-59)
      const milliseconds = stake?.createdAt.getMilliseconds(); // Get the milliseconds (0-999)
      const time = {
        hour: hours,
        minute: minutes,
        second: seconds,
        millisecond: milliseconds,
      };
      if (!lastReward) {
        const amount = calculatePercentage(percentage, stake?.amount);
        //old
        // userRewardToInsert.push({
        //   userId: stake?.userId?._id,
        //   stakeId: stake?._id,
        //   amount: amount,
        //   createdAt: momentFormatedWithSetTime(time),
        // });

        //new
        await userStakingReward.create({
          userId: stake?.userId?._id,
          stakeId: stake?._id,
          amount: amount,
          createdAt: momentFormatedWithSetTime(momentTimezone(),time),
        });
        
      
        //old
        // idsToUpdate.push(stake?._id);

        //new
        await Stake.findOneAndUpdate({_id:stake?._id},{lastReward:momentFormatedWithSetTime(momentTimezone(),time)});
      }
    }
    //old
    // // console.log("userRewardToInsert", userRewardToInsert);
    // await services.userStakingRewardService.createUserStakingRewards(
    //   userRewardToInsert
    // );

    // await Stake.updateMany(
    //   {
    //     _id: { $in: idsToUpdate },
    //   },
    //   { lastReward: momentFormated() }
    // );

    // event to refetch withdrawal amount for all users
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
