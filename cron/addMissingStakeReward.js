const cron = require("node-cron");
const Stake = require("../models/stake.model");
const User = require("../models/user.model");
const UserStakeReward = require("../models/userStakingReward.model");
const moment = require("moment-timezone");
const { getSettingWithKey } = require("../helpers/setting");
const { SETTING } = require("../config/constants");
const { getMissingIncomeReward } = require("../services/referral");
const cronTiming = process.env.APP_ENV !== "production" ? "*/10 * * * *" : "45 0 * * *";

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

const addMissingStakeReward = cron.schedule(cronTiming, async () => {
  console.log("addMissingStakeReward-started");
  const users = await User.find({ status: "active" });
  try {
    for (const user of users) {
      const stakes = await Stake.find({
        userId: user?._id,
        status: "active",
      }).populate("userId");

      for (const stake of stakes) {
        const diffInDays = moment(new Date())
          .subtract(1, "days")
          .diff(moment(stake?.createdAt), "days");

        for (let count = 1; count <= diffInDays; count++) {
          const dateToVerifyReward = addDays(stake?.createdAt, count);

          const year = dateToVerifyReward.getUTCFullYear();
          const month = dateToVerifyReward.getUTCMonth() + 1; // Months are zero-based, so add 1
          const day = dateToVerifyReward.getUTCDate(); // Extract day directly from the date object

          const hours = stake?.createdAt.getUTCHours(); // Get the hours (0-23)
          const minutes = stake?.createdAt.getUTCMinutes(); // Get the minutes (0-59)
          const seconds = stake?.createdAt.getUTCSeconds(); // Get the seconds (0-59)
          const milliseconds = stake?.createdAt.getMilliseconds(); // Get the milliseconds (0-999)

          const reward = await UserStakeReward.find({
            userId: user?._id,
            $expr: {
              $and: [
                { $eq: [{ $year: "$createdAt" }, year] },
                { $eq: [{ $month: "$createdAt" }, month] },
                { $eq: [{ $dayOfMonth: "$createdAt" }, day] },
              ],
            },
          });

          if (reward?.length <= 0) {
            // Combine date and time components to create a new Date object
            const combinedDate = new Date(
              Date.UTC(
                year,
                month - 1,
                day,
                hours,
                minutes,
                seconds,
                milliseconds
              )
            );

            const percentage = await getSettingWithKey(
              SETTING.STAKE_REWARD_PER_DAY
            );
            const amount = calculatePercentage(percentage, stake?.amount);
            const rewardInserted = await UserStakeReward.create({
              userId: stake?.userId?._id,
              stakeId: stake?._id,
              amount: amount,
              createdAt: combinedDate,
            });
            await getMissingIncomeReward([rewardInserted], dateToVerifyReward);
          }
        }
      }
    }

    console.log('addMissingStakeReward-ended');
  } catch (err) {
    console.log(err, "addMissingStakeReward-error==>");
  }
});

const calculatePercentage = (percentage, value) => {
  return (Number(percentage) / 100) * value;
};

module.exports = { addMissingStakeReward };
