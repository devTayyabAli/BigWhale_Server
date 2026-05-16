const cron = require("node-cron");
const Stake = require("../models/stake.model");
const UserStakeReward = require("../models/userStakingReward.model");
const UserOtherReward = require("../models/userOtherReward.model");
const DeletedStakes = require("../models/deletedStake.model");
const { ObjectId } = require("mongoose").Types;
const cronTiming =
  process.env.APP_ENV !== "production" ? "*/20 * * * *" : "55 0 * * *";

const deleteSameDayStakeReward = cron.schedule(cronTiming, async () => {
  try {
    console.log('deleteSameDayStakeReward-started');
    const stakes = await Stake.find({
      status: "active",
    }).populate("userId");

    for (const stake of stakes) {
      const dateToVerifyReward = new Date(stake?.createdAt);

      const year = dateToVerifyReward.getUTCFullYear();
      const month = dateToVerifyReward.getUTCMonth() + 1; // Months are zero-based, so add 1
      const day = dateToVerifyReward.getUTCDate(); // Extract day directly from the date object
      const reward = await UserStakeReward.findOneAndDelete({
        stakeId: stake?._id,
        $expr: {
          $and: [
            { $eq: [{ $year: "$createdAt" }, year] },
            { $eq: [{ $month: "$createdAt" }, month] },
            { $eq: [{ $dayOfMonth: "$createdAt" }, day] },
          ],
        },
      });
      if (reward) {
        const { missingRecordProcessedAt, userId, stakeId, amount, createdAt } =
          reward;

        await UserOtherReward.findOneAndDelete({
          stakeId: stake?._id,
          $expr: {
            $and: [
              { $eq: [{ $year: "$createdAt" }, year] },
              { $eq: [{ $month: "$createdAt" }, month] },
              { $eq: [{ $dayOfMonth: "$createdAt" }, day] },
            ],
          },
        });

        await DeletedStakes.create({
          missingRecordProcessedAt,
          userId,
          stakeId,
          amount,
          createdAt,
        });
      }
    }

    console.log('deleteSameDayStakeReward-ended');
  } catch (err) {
    console.log(err, "deleteSameDayStakeReward-error==>");
  }
});

module.exports = { deleteSameDayStakeReward };
