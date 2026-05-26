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

const timeString = Number(process.env.INCOME_REWARD_LOOKBACK_DURATION) || 6;
const durationString = process.env.INCOME_REWARD_LOOKBACK_UNIT || "minutes";
const cronTiming = process.env.INCOME_REWARD_CRON_SCHEDULE || (process.env.APP_ENV == 'production' ? "*/6 * * * *" : "5 0 * * *");
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
  // User eligibility lookback — how recently a user was last processed
  const startOfDay = momentToSubtract(timeString, durationString);
  // Stake reward search window — always look back 24 hours for stake rewards
  // because stake rewards are timestamped at the stake's creation time-of-day
  const stakeRewardLookback = momentToSubtract(24, 'hours');
  const processedUserIds = new Set();
  retryCount = 0;

  const processBatch = async () => {
    try {
      console.log('startOfDay', startOfDay);
      const users = await User.find({
        $and: [
          {
            $or: [
              { isLevelIncomeInactive: false },
              { isLevelIncomeInactive: { $exists: false } }
            ]
          },
          {
            $or: [
              { referralProcessedAt: null },
              { referralProcessedAt: { $exists: false } },
              { referralProcessedAt: { $lt: startOfDay } }
            ]
          }
        ],
        status: DEFAULT_STATUS.ACTIVE,
        _id: { $nin: Array.from(processedUserIds) }, // skip already processed users
      }).limit(Number(process.env.BATCH_SIZE_FOR_STAR_RANK));

      if (users.length === 0) {
        console.log("✅ All users processed for this cron run.");
        return;
      }

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        processedUserIds.add(user._id.toString()); // mark as processed before DB update

        const stake = await Stake.findOne({ userId: user._id, status: DEFAULT_STATUS.ACTIVE });

        if (stake && stake.amount >= 0.055) {
          await upsertDataInUserOtherReward(user, startOfDay, stakeRewardLookback);
          console.log('users====', user?._id);
        } else {
          console.log(`User ${user._id} does not meet the staking requirement.`);
          await updateProcessedRecords(user, startOfDay);
        }
      }

      // Process next batch
      await processBatch();
    } catch (error) {
      CronLog.create({
        title: "incomeRewardCalculationCron",
        error: error?.message,
      });
      console.log("🚀 ~ Something went wrong in incomeRewardCron:", error?.message);
      if (retryCount < process.env.MAX_RETRIES) {
        if (timeout) clearTimeout(timeout);
        retryCount++;
        console.log(`Retrying in ${process.env.RETRY_INTERVAL / 1000} seconds...`);
        timeout = setTimeout(async () => {
          console.log("Retrying calculateAndUpdateincomeRewardCron ...");
          await processBatch();
        }, process.env.RETRY_INTERVAL);
      } else {
        console.error(`Maximum retries reached for incomeRewardCron.`);
        await sendCronFailureEmail("incomeRewardCron");
      }
    }
  };

  await processBatch();
};

const upsertDataInUserOtherReward = async (user, startOfDay, stakeRewardLookback) => {
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
            
            const whereClause = {
              $gte: stakeRewardLookback, // look back 24h — no upper bound needed (stakeRewardId check prevents duplicates)
            };

            console.log(`🔍 Looking for stakeRewards: userId=${member?.userId}, stakeId=${stake?._id}, from=${stakeRewardLookback}`);
           
            const stakeRewardDistributions = await UserStakeReward.find({
              userId: member?.userId,
              stakeId: stake?._id,
              createdAt: whereClause
            });

            console.log(`🔍 stakeRewardDistributions found: ${stakeRewardDistributions.length}`);

            for (const stakeRewardDistribution of stakeRewardDistributions) {
              const stakeRewards = stakeRewardDistribution ? stakeRewardDistribution?.amount : 0;
              if (stakeRewards) {
                const otherStakeRewardExist = await UserOtherReward.findOne({
                  userId: user?._id,
                  stakeId: stake?._id,
                  stakeRewardId: stakeRewardDistribution?._id,
                  type: OTHER_REWARD.INCOME_LEVEL
                });

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
                      createdAt: stakeRewardDistribution?.createdAt || startOfDay
                    });
                    console.log(`✅ Saved UserOtherReward for user: ${user?._id}, amount: ${incomeRewardAmount}, stakeRewardId: ${stakeRewardDistribution?._id}`);
                  }
                } else {
                  console.log(`⚠️ Level reward already saved for user: ${user?._id} on stakeRewardId: ${stakeRewardDistribution?._id}`);
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
  saveIncomeRewardCron,
  saveIncomeLevelReward
};

