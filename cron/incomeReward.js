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

const timeString = process.env.APP_ENV == 'production' ? 10 : 24;
const durationString = process.env.APP_ENV == 'production' ? "minutes" : "hour";
const cronTiming =
  process.env.APP_ENV == 'production'
    ? "0 * * * *"
    : "5 0 * * *";
const saveIncomeRewardCron = cron.schedule(cronTiming, async () => {
  try {
    console.log("🚀 ~ saveIncomeRewardCron started");
    await saveIncomeLevelReward(0);
    console.log("🚀 ~ saveIncomeRewardCron ended");
  } catch (error) {
    console.log("Something went wrong in saveIncomeRewardCron", error?.message);
  }
});

const saveIncomeLevelReward = async (skip = 0) => {
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
      .skip(skip)
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
        }
      }
      // Recursively call the function to process the next batch
      await saveIncomeLevelReward(skip + users.length);
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
        await saveIncomeLevelReward(skip); // Retry with the same skip value
      }, process.env.RETRY_INTERVAL);
    } else {
      console.error(`Maximum retries reached for incomeRewardCron.`);
      await sendCronFailureEmail("incomeRewardCron");
    }
  }
};

const upsertDataInUserOtherReward = async (user, startOfDay) => {
  if (!user?._id) return;

  const team = await Team.findOne({ userId: user._id }).lean();
  const teamId = team?._id;
  if (!teamId) return;

  // ── Check capping ONCE per user — before processing any members/stakes ──
  // Previously this was inside the inner stakes loop = N×M DB calls per user
  const capping = await referral.handleCappingEvent(user._id);
  if (capping?.isCappingReached) {
    console.log('cappingReached for user:', user._id);
    await updateProcessedRecords(user, startOfDay);

    // Re-fetch to get latest cappingEmailSentAt (user object is stale)
    const freshUser = await User.findById(user._id).select('cappingEmailSentAt email').lean();
    const alreadyNotified = freshUser?.cappingEmailSentAt &&
      new Date(freshUser.cappingEmailSentAt) >= new Date(startOfDay);

    if (!alreadyNotified) {
      sendCappingLimitEmail(freshUser?.email || user.email);
      await User.updateOne(
        { _id: user._id },
        { $set: { cappingEmailSentAt: new Date() } }
      );
      console.log(`Capping email sent to ${freshUser?.email || user.email}`);
    } else {
      console.log(`Capping email already sent this cycle for user: ${user._id}`);
    }
    return; // stop processing this user entirely
  }

  // ── Fetch unlocked income levels ──────────────────────────────────
  const referralResult = await referral.referralIncomeLevel(teamId, user._id, DEFAULT_STATUS.ACTIVE);
  const incomeLevelBonus = referralResult?.incomeLevelBonus || [];
  const referralIncomeUnLockedLevels = incomeLevelBonus.filter(item => item.unlocked);

  // ── Fetch team members with active stakes ─────────────────────────
  const teamMembers = await TeamMember.aggregate([
    { $match: { teamId } },
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
    { $match: { "users.status": DEFAULT_STATUS.ACTIVE } },
    {
      $lookup: {
        from: "stakes",
        localField: "userId",
        foreignField: "userId",
        as: "stakes",
      },
    },
    { $match: { "stakes.status": DEFAULT_STATUS.ACTIVE } },
  ]);

  if (teamMembers.length === 0) {
    await updateProcessedRecords(user, startOfDay);
    return;
  }

  // ── Pre-fetch all income levels in one query (avoid N queries in loop) ──
  const allIncomeLevels = await IncomeLevel.find({}).lean();
  const getIncomeLevelForMember = (level) =>
    allIncomeLevels.find(il => il.minLevel <= level && il.maxLevel >= level);

  const whereClause = {
    $gte: startOfDay,
    $lt: momentFormated(),
  };

  for (const member of teamMembers) {
    const memberIncomeLevel = getIncomeLevelForMember(member?.level);
    const isIncomeLevelExists = referralIncomeUnLockedLevels.find(
      il => il._id.toString() === memberIncomeLevel?._id?.toString()
    );

    if (!(memberIncomeLevel && isIncomeLevelExists)) {
      console.log('level is locked for member:', member?.userId);
      continue;
    }

    if (!member?.stakes?.length) continue;

    for (const stake of member.stakes) {
      const stakeRewardDistribution = await UserStakeReward.findOne({
        userId: member?.userId,
        stakeId: stake?._id,
        createdAt: whereClause,
      }).lean();

      const stakeRewards = stakeRewardDistribution?.amount || 0;
      if (!stakeRewards) continue;

      const otherStakeRewardExist = await UserOtherReward.findOne({
        userId: user._id,
        stakeId: stake?._id,
        stakeRewardId: stakeRewardDistribution?._id,
        type: OTHER_REWARD.INCOME_LEVEL,
      }).lean();

      if (!otherStakeRewardExist) {
        const incomeRewardAmount = helper.calculatePercentage(
          isIncomeLevelExists.rewardPercentage,
          stakeRewards
        );

        if (incomeRewardAmount > 0) {
          await UserOtherReward.create({
            userId: user._id,
            type: OTHER_REWARD.INCOME_LEVEL,
            amount: incomeRewardAmount,
            stakeId: stake?._id,
            levelId: isIncomeLevelExists?._id,
            rewardPercentage: isIncomeLevelExists.rewardPercentage,
            stakeRewardId: stakeRewardDistribution?._id,
            createdAt: startOfDay,
          });
        }
      }
    }
  }

  await updateProcessedRecords(user, startOfDay);
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
