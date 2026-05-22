const UserOtherReward = require("../models/userOtherReward.model");
const cron = require("node-cron");
const CronLog = require("../models/cronLogs.model");
const { sendCronFailureEmail, sendCappingLimitEmail } = require("../helpers/mail");
const referral = require("../services/referral");
const { DEFAULT_STATUS, OTHER_REWARD } = require("../config/constants");
const User = require("../models/user.model");
const IncomeLevel = require("../models/incomeLevel.model");
const TeamMember = require("../models/teamMember.model");
const Team = require("../models/team.model");
const UserStakeReward = require("../models/userStakingReward.model");
const helper = require("../helpers/index");
const { momentToSubtract, momentFormated } = require("../helpers/moment");
const Stake = require("../models/stake.model");

let timeout;
let retryCount = 0;

const timeString = Number(process.env.INCOME_REWARD_LOOKBACK_DURATION) || 1;
const durationString = process.env.INCOME_REWARD_LOOKBACK_UNIT || "hour";
const cronTiming = process.env.INCOME_REWARD_CRON_SCHEDULE || (process.env.APP_ENV == 'production' ? "0 * * * *" : "5 0 * * *");
const saveIncomeRewardCron = cron.schedule(cronTiming, async () => {
  try {
    console.log("🚀 ~ saveIncomeRewardCron started");
    await saveIncomeLevelReward();
    console.log("🚀 ~ saveIncomeRewardCron ended");
  } catch (error) {
    console.log("Something went wrong in saveIncomeRewardCron", error?.message);
  }
});

const saveIncomeLevelReward = async () => {
  try {
    const startOfDay = momentToSubtract(timeString, durationString);
    console.log('startOfDay', startOfDay);
    const users = await User.find({
      $or: [
        { isLevelIncomeInactive: false },
        { isLevelIncomeInactive: { $exists: false } }
      ],
      status: DEFAULT_STATUS.ACTIVE,
      referralProcessedAt: {
        $ne: startOfDay
      }
    })
      .limit(Number(process.env.BATCH_SIZE_FOR_STAR_RANK));


    console.log('users====', users);
    if (users.length > 0) {
      for (let i = 0; i < users.length; i++) {
        const user = users[i];

        // Fetch the user's staking information
        const stake = await Stake.findOne({ userId: user._id });

        // Check if the user has a staking amount equal to or greater than 0.055
        if (stake && stake.amount >= 0.055) {
          await upsertDataInUserOtherReward(user, startOfDay);
          console.log('users====', user?._id);

        } else {
          console.log(`User ${user._id} does not meet the staking requirement.`);
          await updateProcessedRecords(user, startOfDay);
        }
      }
      // Recursively call the function to process the next batch (offset-free)
      await saveIncomeLevelReward();
    }
  } catch (error) {
    CronLog.create({
      title: "incomeRewardCalculationCron",
      error: error?.message,
    });
    console.log("🚀 ~ Something went wrong in incomeRewardCron:", error?.message);
    if (retryCount < process.env.MAX_RETRIES) {
      if (timeout) clearTimeout(timeout);
      retryCount++;

      console.log(
        `Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`
      );

      timeout = setTimeout(async () => {
        console.log("Retrying calculateAndUpdateincomeRewardCron ...");
        await saveIncomeLevelReward(); // Retry with offset-free query
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for incomeRewardCron.`);
      await sendCronFailureEmail("incomeRewardCron");
    }
  }
};

const upsertDataInUserOtherReward = async (user, startOfDay) => {
  if (user?._id) {
    const team = await Team.findOne({ userId: user?._id });
    const teamId = team?._id;

    // get array of unlocked referral income levels

    const referralResult = await referral?.referralIncomeLevel(
      teamId,
      user?._id,
      DEFAULT_STATUS.ACTIVE
    );

    const incomeLevelBonus = referralResult?.incomeLevelBonus || [];
    const referralIncomeUnLockedLevels = incomeLevelBonus?.filter(item => item.unlocked);

    const teamMembers = await TeamMember.aggregate([
      {
        $match: { teamId },
      },
      {
        $lookup: {
          from: "teams",
          localField: "teamId",
          foreignField: "_id",
          as: "team",
        },
      },
      { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "team.userId",
          foreignField: "_id",
          as: "users",
        },
      },
      { $unwind: { path: "$users", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "users.status": DEFAULT_STATUS.ACTIVE,
        },
      },
      {
        $lookup: {
          from: "stakes",
          localField: "userId",
          foreignField: "userId",
          as: "stakes",
        },
      },
      {
        $match: {
          "stakes.status": DEFAULT_STATUS.ACTIVE,
        },
      },
    ]);

    if (teamMembers.length > 0) {
      for (const member of teamMembers) {
        const memberIncomeLevel = await IncomeLevel.findOne({
          minLevel: { $lte: member?.level },
          maxLevel: { $gte: member?.level },
        });

        const isIncomeLevelExists = referralIncomeUnLockedLevels.find((incomeLevel) => incomeLevel?._id.toString() === memberIncomeLevel?._id.toString());

        // if this level is locked, skip this iteration
        if (!(memberIncomeLevel && isIncomeLevelExists)) {
          console.log('level is locked')
          continue;
        }

        if (member?.stakes?.length > 0) {
          for (const stake of member.stakes) {
            // need to modify this
            const capping = await referral.handleCappingEvent(user?._id);
            if (capping?.isCappingReached) {
              console.log('cappingReached');
              await updateProcessedRecords(user, startOfDay);
              await sendCappingLimitEmail(user?.email);
              return;
            }
            
            const whereClause = { //
              $gte: startOfDay, // Greater than or equal to start of day
              $lt: momentFormated() // Less than the next day
            };

           
            const stakeRewardDistribution = await UserStakeReward.findOne({
              userId: member?.userId,
              stakeId: stake?._id,
              createdAt: whereClause
            });

            // console.log('stakeRewardDistribution', stakeRewardDistribution);
            const stakeRewards = stakeRewardDistribution ? stakeRewardDistribution?.amount : 0;
            if (stakeRewards) {
              const otherStakeRewardExist = await UserOtherReward.findOne({
                userId: user?._id,
                stakeId: stake?._id,
                stakeRewardId: stakeRewardDistribution?._id,
                type: OTHER_REWARD.INCOME_LEVEL
              });

              // console.log('otherStakeRewardExist', otherStakeRewardExist);
              if (!otherStakeRewardExist) {
                const incomeRewardAmount = helper.calculatePercentage(
                  isIncomeLevelExists.rewardPercentage,
                  stakeRewards
                );

                if (incomeRewardAmount > 0) {
                  await UserOtherReward.create({
                    userId: user?._id,
                    type: OTHER_REWARD.INCOME_LEVEL,
                    amount: incomeRewardAmount,
                    stakeId: stake?._id,
                    levelId: isIncomeLevelExists?._id,
                    rewardPercentage: isIncomeLevelExists.rewardPercentage,
                    stakeRewardId: stakeRewardDistribution?._id,
                    createdAt: startOfDay
                  });
                }
              }
            }
          }
        }
      }
    }

    await updateProcessedRecords(user, startOfDay);
  }
};

const updateProcessedRecords = async (payload, startOfToday) => {
  await User.updateOne(
    { _id: payload?._id },
    { referralProcessedAt: startOfToday }
  );
};

module.exports = {
  saveIncomeRewardCron
};

