const TeamMember = require("../models/teamMember.model");
const mongoose = require("mongoose");
const IncomeLevel = require("../models/incomeLevel.model");
const Stake = require("../models/stake.model");
const { DEFAULT_STATUS, OTHER_REWARD, SETTING } = require("../config/constants");
const { userAccountCreated } = require("./user");
const { ObjectId } = require("mongoose").Types;
const UserStakeReward = require("../models/userStakingReward.model");
const UserOtherReward = require("../models/userOtherReward.model");
const User = require("../models/user.model");
const { getSettingWithKey } = require("../helpers/setting");
const UserRank = require("../models/userRank.model");
const socket = require('../helpers/sockets');
const { sendCappingLimitEmail } = require("../helpers/mail");
const Team = require("../models/team.model");
const helper = require("../helpers/index");
const { momentToSubtract, momentToAdd, momentDiffWithoutTimezone, momentToAddWithoutTimezone, momentFormated } = require("../helpers/moment");

/**
 * Get Direct Team Referral
 *
 * @param {ObjectId} teamId - Team ID
 */

const numOfReferrals = async (teamId, level) => {
  try {
    const teamMember = await TeamMember.countDocuments({
      teamId: teamId,
      level: level,
    });
    return teamMember;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const numOfAllReferrals = async (teamId) => {
  try {
    const teamMember = await TeamMember.countDocuments({ teamId: teamId });
    return teamMember;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const numOfAllActiveReferrals = async (teamId) => {
  try {
    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId)
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      {
        $match: {
          "user.status": DEFAULT_STATUS.ACTIVE,
        },
      },
      {
        $group: {
          _id: null, // Grouping without a specific field
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
        },
      },
    ]);
    return result.length > 0 ? result[0]?.total : 0;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const numOfActivePendigReferrals = async (teamId, level, status, startDate, endDate) => {
  try {
    // We'll build our match object dynamically
    const matchStage = {};

    // Conditionally add status to the match
    if (status) {
      matchStage["user.status"] = status;
    }

    // Conditionally add date range to the match
    if (startDate && endDate) {
      matchStage["user.createdAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          level
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        // Use our matchStage which includes both status and date filters if they exist
        $match: matchStage
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1
        }
      }
    ]);

    return result.length > 0 ? result[0].total : 0;
  } catch (err) {
    console.error(err);
    return err;
  }
};


const numOfReferralBussiness = async (teamId, level, status) => {
  try {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(teamId);

    if (!isValidObjectId) {
      throw new Error("Invalid userId format");
    }

    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          ...(status && { "user.status": status }), // Conditionally include status
        },
      },
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      { $unwind: { path: "$stakes", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$stakes.amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
        },
      },
    ]);

    // Get the total crypto amount
    return result.length > 0 ? result[0].totalAmount : 0;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const numOfDirectReferralBussiness = async (teamId, level, status, startDate, endDate) => {
  try {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(teamId);
    if (!isValidObjectId) {
      throw new Error("Invalid teamId format");
    }

    // Dynamically build a single object to match fields on the "user" document
    const userMatchStage = {};

    // If status is provided, filter by status
    if (status) {
      userMatchStage["user.status"] = status;
    }

    // If both startDate and endDate are provided, filter by user creation date range
    if (startDate && endDate) {
      userMatchStage["user.createdAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const result = await TeamMember.aggregate([
      // First, match documents in TeamMember
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      // Lookup the related users
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Now match against fields in the user document (status, date range)
      {
        $match: userMatchStage,
      },
      // Lookup stakes for each user
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      {
        $unwind: {
          path: "$stakes",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Sum up stakes amounts (only those with active status)
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: {
              $cond: [
                { $eq: ["$stakes.status", "active"] },
                { $ifNull: ["$stakes.amount", 0] },
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
        },
      },
    ]);

    // Return the total business amount or 0 if no documents
    return result.length > 0 ? result[0].totalAmount : 0;
  } catch (err) {
    console.log(err);
    return err;
  }
};



const directReferralList = async (teamId, level, page, limit) => {
  try {
    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      {
        $unwind: {
          path: "$stakes",
          preserveNullAndEmptyArrays: true, // Preserve users without stakes
        },
      },
      {
        $match: {
          "stakes.status": DEFAULT_STATUS.ACTIVE,
        },
      },
      {
        $group: {
          _id: "$user._id",
          user: { $first: "$user" },
          totalStakeAmount: { $sum: { $ifNull: ["$stakes.amount", 0] } },
          latestStakeDate: { $max: "$stakes.createdAt" },
        },
      },
      {
        $project: {
          _id: 0,
          user: 1,
          totalStakeAmount: 1,
          latestStakeDate: 1,
        },
      },
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    return result;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const activePendingReferralByCreated = async (teamId, status) => {
  try {
    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          // level: level,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "user.status": status,
          "user.createdAt": {
            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          }, // Filter for the last 30 days
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          users: { $push: "$user" },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          users: 1,
        },
      },
    ]);
    // Check if there is a result and extract the first item
    return result.length > 0 ? result[0]?.users : null;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const activePendingReferralList = async (
  teamId,
  level,
  status,
  page,
  limit,
  startDate,
  endDate,
  userName // 👈 NEW: search filter for userName
) => {
  try {
    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: {
          path: "$user",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Optional filter: user.status
      ...(status
        ? [
          {
            $match: {
              "user.status": status,
            },
          },
        ]
        : []),

      // Optional filter: userName (case-insensitive partial match)
      ...(userName
        ? [
          {
            $match: {
              "user.userName": {
                $regex: userName,
                $options: "i",
              },
            },
          },
        ]
        : []),

      // Optional filter: createdAt date range
      ...(startDate && endDate
        ? [
          {
            $match: {
              "user.createdAt": {
                $gte: new Date(startDate),
                $lte: new Date(endDate),
              },
            },
          },
        ]
        : []),

      // Lookup stakes
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },

      // Lookup user ranks
      {
        $lookup: {
          from: "userranks",
          localField: "user._id",
          foreignField: "userId",
          as: "uranks",
        },
      },
      {
        $unwind: {
          path: "$uranks",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Lookup rank info
      {
        $lookup: {
          from: "ranks",
          localField: "uranks.rankId",
          foreignField: "_id",
          as: "rankInfo",
        },
      },
      {
        $unwind: {
          path: "$rankInfo",
          preserveNullAndEmptyArrays: true,
        },
      },

      // Add totalStakeAmount and latestStakeDate fields
      {
        $addFields: {
          totalStakeAmount: {
            $sum: {
              $map: {
                input: "$stakes",
                as: "stake",
                in: {
                  $cond: [
                    { $eq: ["$$stake.status", "active"] },
                    { $ifNull: ["$$stake.amount", 0] },
                    0,
                  ],
                },
              },
            },
          },
          latestStakeDate: {
            $min: {
              $map: {
                input: "$stakes",
                as: "stake",
                in: {
                  $cond: [
                    { $eq: ["$$stake.status", "active"] },
                    "$$stake.createdAt",
                    null,
                  ],
                },
              },
            },
          },
        },
      },

      // Group by user to flatten results
      {
        $group: {
          _id: "$user._id",
          user: { $first: "$user" },
          teamMember: { $first: "$_id" },
          totalStakeAmount: { $first: "$totalStakeAmount" },
          latestStakeDate: { $first: "$latestStakeDate" },
          level: { $first: "$level" },
        },
      },

      // Final projection
      {
        $project: {
          _id: 0,
          level: 1,
          user: 1,
          teamMember: 1,
          totalStakeAmount: 1,
          latestStakeDate: 1,
          userRankStars: { $ifNull: ["$user.userRankId", 0] },
        },
      },

      // Sorting
      { $sort: { level: 1, teamMember: -1 } },

      // Pagination
      {
        $skip: (page - 1) * limit,
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    return result;
  } catch (err) {
    console.error("Error in activePendingReferralList:", err);
    return { error: err.message || "Internal server error" };
  }
};



const getIncomeLevelCheck = async (incomeLevel, directReferral, directReferralBussiness) => {
  let incomeLevelFulfill = false;
  if (incomeLevel.minLevel === 2 &&
    directReferral >= incomeLevel?.directReferral &&
    directReferralBussiness >= incomeLevel?.directBussiness
  ) {
    incomeLevelFulfill = true;
  }

  return incomeLevelFulfill;
}

const referralIncomeLevel = async (teamId, userID, status) => {
  try {
    let directReferral = 0;
    let allReferral = 0;
    let directReferralBussiness = 0;
    let teamMembers = [];
    let activeID = [];
    let accountActiveDays = 0;
    let getMembersLevel = [];
    let secondLevelIncomeCheck = false;
    let secondLevelDirectReferral = 0;
    let secondLevelDirectReferralBussiness = 0;

    if (teamId) {
      teamMembers = await TeamMember.aggregate([
        { $match: { teamId: new mongoose.Types.ObjectId(teamId) } },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        { $match: { "user.status": status } },
        { $group: { _id: "$level", count: { $sum: 1 } } },
      ]);

      directReferral = await numOfReferrals(teamId, 1);
      allReferral = await numOfAllReferrals(teamId);
      directReferralBussiness = await numOfReferralBussiness(teamId, 1);
      activeID = await activePendingReferralByCreated(
        teamId,
        DEFAULT_STATUS.ACTIVE
      );

      const userDetails = await User.findById(userID);
      const thirtyDaysAdd = momentToAdd(30, 'days', userDetails?.createdAt);
      secondLevelDirectReferral = await numOfReferralsWithIn30Days(teamId, 1, thirtyDaysAdd);
      secondLevelDirectReferralBussiness = await numOfReferralBussinessWithIn30Days(teamId, 1, thirtyDaysAdd);

      getMembersLevel = await Promise.all(
        teamMembers.map(async (doc) => {
          const incomeLevel = await getIncomeLevel(doc?._id);
          if (incomeLevel.minLevel === 2) {
            secondLevelIncomeCheck = await getIncomeLevelCheck(
              incomeLevel,
              secondLevelDirectReferral,
              secondLevelDirectReferralBussiness
            );
          }

          if (incomeLevel) {
            const meetsRequirements = doc.count >= incomeLevel.minimumRequiredReferrals;
            return { level: doc._id, log: meetsRequirements };
          }
        })
      );
    }

    const allIncomeLevels = await getAllIncomeLevels();

    const incomeLevelBonus = allIncomeLevels.map((level) => {
      const { minLevel, maxLevel } = level;
      const filteredRecords = getMembersLevel.filter(record => record.level >= minLevel && record.level <= maxLevel);
      // Map the filtered records to include only the required fields (level and log)
      const selectedRecords = filteredRecords.map(record => ({ level: record.level, log: record.log }));
      const matchingLog = selectedRecords.some(record => record.log === true);
      const isUnlocked = teamId && matchingLog &&
        level.minLevel === 2 &&
        secondLevelDirectReferral >= (level.directReferral || 0) &&
        secondLevelDirectReferralBussiness >= (level.directBussiness || 0);

      return {
        ...level.toObject(),
        rewardPercentage: isUnlocked ? level?.maximumRewardPercentage : level?.minimumRewardPercentage,
        unlocked: isUnlocked ? true : matchingLog
      }
    });

    const latestStake = await getLatestStake(userID);
    const secondIncomeLevel = allIncomeLevels[1];

    const unLock = {
      activationDate: latestStake?.createdAt || null,
      accountActiveDays: `${accountActiveDays}/${secondIncomeLevel?.activationDays}` || 0,
      directActiveReferrals: `${secondLevelDirectReferral}/${secondIncomeLevel?.directReferral}` || 0,
      allActiveReferrals: `${activeID?.length || 0}/${allReferral}`,
      directBusinessIn30Days: `${secondLevelDirectReferralBussiness}/${secondIncomeLevel?.directBussiness}` || 0,
      isUnlock: secondLevelIncomeCheck
    };

    return { unLock, incomeLevelBonus, allActiveReferrals: `${activeID?.length || 0}/${allReferral}` };
  } catch (error) {
    console.error("Error:", error);
    return error;
  }
};


const getIncomeLevel = async (level) => {
  return await IncomeLevel.findOne({
    $or: [
      { $and: [{ minLevel: { $lte: level } }, { maxLevel: { $gte: level } }] },
      { $and: [{ minLevel: { $gte: level } }, { maxLevel: { $lte: level } }] },
    ],
  });
};

const getAllIncomeLevels = async () => {
  return await IncomeLevel.find();
};

const getLatestStake = async (userID) => {
  return await Stake.findOne({ userId: userID })
    .sort({ createdAt: -1 })
    .limit(1);
};

const stakeAmountTaken = async (userId, stakeDate) => {
  try {
    const userStakeReward = await UserStakeReward.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          createdAt: { $gte: new Date(stakeDate) }
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]);
    const userOtherReward = await UserOtherReward.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          createdAt: { $gte: new Date(stakeDate) }
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]);
    const totalUserStakeReward =
      userStakeReward.length > 0 ? userStakeReward[0].totalAmount : 0;
    const totalUserOtherReward =
      userOtherReward.length > 0 ? userOtherReward[0].totalAmount : 0;
    const rewardTaken = totalUserStakeReward + totalUserOtherReward;
    return rewardTaken;
  } catch (error) {
    console.error("error======>", error);
  }
};

const handleCappingEvent = async (userId, date = null) => {
  try {
    if (!userId) {
      return { cappingAmount: 0, cappingFormula: 0, earnAmount: 0, rewardPercentage: 0, isCappingReached: true };
    }

    const { getSettingsWithKeys } = require("../helpers/setting");
    const refDate = new Date(date || Date.now());
    const userObjectId = new ObjectId(userId);

    // ── Batch: fetch all settings + user rank + stake aggregate in parallel ──
    const [settings, userRank, stakingAmount, oldestStaking] = await Promise.all([
      getSettingsWithKeys([SETTING.NORMAL_CAPPING, SETTING.MARKET_CAPPING, SETTING.STAKE_REWARD_PER_DAY]),
      User.findById(userObjectId).select("userRankId").lean(),
      Stake.aggregate([
        {
          $match: {
            userId: userObjectId,
            status: DEFAULT_STATUS.ACTIVE,
            endDate: { $gte: refDate },
          },
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
          },
        },
      ]),
      Stake.findOne({
        userId: userObjectId,
        status: DEFAULT_STATUS.ACTIVE,
        endDate: { $gte: refDate },
      }).sort({ createdAt: 1 }).select("createdAt").lean(),
    ]);

    const normalCapping    = settings[SETTING.NORMAL_CAPPING];
    const marketCapping    = settings[SETTING.MARKET_CAPPING];
    const stakeRewardPerDay= settings[SETTING.STAKE_REWARD_PER_DAY];

    const cappingFormula         = userRank?.userRankId === null ? normalCapping : marketCapping;
    const totalActiveStakeAmount = stakingAmount.length > 0 ? stakingAmount[0].totalAmount : 0;
    const cappingAmount          = totalActiveStakeAmount * cappingFormula;

    const earnAmount      = await stakeAmountTaken(userId, new Date(oldestStaking?.createdAt || Date.now()));
    const rewardPercentage= stakeRewardPerDay;
    const isCappingReached= earnAmount >= cappingAmount;

    if (isCappingReached) {
      // Run side-effects in parallel — no need to await sequentially
      await Promise.all([
        getStakeExpiry(userObjectId),
        User.findOneAndUpdate(
          { _id: userObjectId },
          { $set: { userRankId: null } },
          { new: true }
        ),
      ]);
      socket.io.to(`${userObjectId}`).emit("capping Limit reached", {});
    }

    return {
      cappingAmount,
      cappingFormula,
      earnAmount,
      rewardPercentage,
      isCappingReached: cappingAmount === 0 ? false : isCappingReached,
    };
  } catch (error) {
    console.error("handleCappingEvent error:", error);
    return { cappingAmount: 0, cappingFormula: 0, earnAmount: 0, rewardPercentage: 0, isCappingReached: false };
  }
};

const getLeadershipBonus = async (userId, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit);
    const total = await UserOtherReward.countDocuments({
      userId: new ObjectId(userId),
      type: OTHER_REWARD.LEADERSHIP,
    });
    const userOtherReward = await UserOtherReward.aggregate([
      {
        $match: { userId: new ObjectId(userId), type: OTHER_REWARD.LEADERSHIP },
      },
      {
        $lookup: {
          from: "ranks",
          localField: "rankId",
          foreignField: "_id",
          as: "rank",
        },
      },
      {
        $unwind: { path: "$rank", preserveNullAndEmptyArrays: true },
      },
      {
        $lookup: {
          from: "user",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
      },
      {
        $replaceRoot: {
          newRoot: {
            date: "$createdAt",
            rankTitle: { $ifNull: ["$rank.title", null] },
            userRankStars: { $ifNull: ["$user.userRankId", 0] },
            totalBonus: { $ifNull: ["$amount", 0] },
          },
        },
      },
      {
        $group: {
          _id: "$userId",
          userOtherRewardData: { $push: "$$ROOT" },
          totalAmount: { $sum: { $toDouble: "$totalBonus" } },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
          userOtherRewardData: {
            $slice: [{ $sortArray: { input: "$userOtherRewardData", sortBy: { date: -1 } } }, skip, limitValue],
          },
        },
      },
    ]);
    return { total, userOtherReward };
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getStakeBonus = async (userId, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit);

    // Calculate the total reward amount for the user
    const totalRewardAmount = await stakingRewardAmount(userId);
    const userStakeReward =
      await UserStakeReward.aggregate([
        {
          $match: { userId: new ObjectId(userId) },
        },
        {
          $lookup: {
            from: "stakes",
            localField: "stakeId",
            foreignField: "_id",
            as: "stake", // Alias for the joined field
          },
        },
        {
          $unwind: { path: "$stake", preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: {
              stakeId: "$stakeId",
              createdAt: {
                $dateToString: {
                  format: "%Y-%m-%d", // Format to group by year-month-day
                  date: "$createdAt",
                },
              },
            },
            totalRewardAmount: {
              $sum: { $toDouble: { $ifNull: ["$amount", 0] } },
            }, // Sum the amounts of rewards
            stakeAmount: { $first: "$stake.amount" },
            percent: { $first: "$stake.rewardPercentage" },
          },
        },
        {
          $project: {
            _id: 0,
            stakeId: "$_id.stakeId", // Include stakeId in the output
            createdAt: "$_id.createdAt", // Include createdAt field in the output
            totalRewardAmount: 1,
            stakeAmount: 1,
            percent: 1,
          },
        },
        {
          $sort: {
            createdAt: -1,
          },
        },
        {
          $skip: skip,
        },
        {
          $limit: limitValue,
        },
        {
          $group: {
            _id: null, // Group all documents together
            count: { $sum: 1 }, // Count the documents
            results: { $push: "$$ROOT" } // Store the results in an array
          },
        },
        {
          $project: {
            _id: 0,
            count: 1,
            results: 1
          }
        }
      ]);

    const pipeline = [
      {
        $match: {
          userId: new ObjectId(userId)
        }
      },
      {
        $group: {
          _id: {
            stakeId: "$stakeId",
            createdAt: {
              $dateToString: {
                format: "%Y-%m-%d", // Format to group by year-month-day
                date: "$createdAt",
              },
            },
          },
          count: { $sum: 1 } // Count the number of documents in each group
        }
      },
      {
        $count: "totalDocuments" // Count the total number of documents
      }
    ];
    const total = await UserStakeReward.aggregate(pipeline);

    return { userStakeReward: userStakeReward[0]?.results || [], totalRewardAmount, total: total[0]?.totalDocuments };
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getLevelBonus = async (userId, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit);
    const total = await UserOtherReward.countDocuments({
      userId,
      type: OTHER_REWARD.INCOME_LEVEL,
    });

    const rewardsWithLevelsData = await UserOtherReward.aggregate([
      {
        $match: {
          userId,
          type: OTHER_REWARD.INCOME_LEVEL,
        },
      },
      {
        $lookup: {
          from: "incomelevels",
          localField: "levelId",
          foreignField: "_id",
          as: "level",
        },
      },
      { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stakes",
          localField: "stakeId",
          foreignField: "_id",
          as: "stake",
        },
      },
      { $unwind: { path: "$stake", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "stake.userId",
          foreignField: "_id",
          as: "user",
        },
      },

      // Unwind the user array to destructure the user details
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $replaceRoot: {
          newRoot: {
            date: "$createdAt",
            fromUser: "$user.userName",
            stakeBonus: { $ifNull: ["$stake.amount", null] },
            percent: { $ifNull: ["$rewardPercentage", null] },
            totalStakeBonus: { $ifNull: ["$amount", null] },
          },
        },
      },
      {
        $group: {
          _id: "$userId",
          levelBonusData: { $push: "$$ROOT" },
          totalAmount: { $sum: { $toDouble: "$totalStakeBonus" } },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
          levelBonusData: {
            $slice: [{ $sortArray: { input: "$levelBonusData", sortBy: { date: -1 } } }, skip, limitValue],
          },
        },
      },
    ]);
    const rewardsWithLevels =
      rewardsWithLevelsData.length > 0 ? rewardsWithLevelsData[0] : [];
    return { total, rewardsWithLevels };
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getInstantBonus = async (userId, page, limit) => {
  try {
    const skip = (page - 1) * limit;
    const limitValue = parseInt(limit);
    const total = await UserOtherReward.countDocuments({
      userId,
      type: OTHER_REWARD.INSTANT_BONUS,
    });

    const rewardsWithLevelsData = await UserOtherReward.aggregate([
      {
        $match: {
          userId: new ObjectId(userId),
          type: OTHER_REWARD.INSTANT_BONUS,
        },
      },
      {
        $lookup: {
          from: "incomelevels",
          localField: "levelId",
          foreignField: "_id",
          as: "level",
        },
      },
      { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stakes",
          localField: "stakeId",
          foreignField: "_id",
          as: "stake",
        },
      },
      { $unwind: { path: "$stake", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "stake.userId",
          foreignField: "_id",
          as: "user",
        },
      },

      // Unwind the user array to destructure the user details
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $replaceRoot: {
          newRoot: {
            date: "$createdAt",
            package: { $ifNull: ["$stake.amount", null] },
            percent: { $ifNull: ["$level.minimumRewardPercentage", 10] },
            totalStakeBonus: { $ifNull: ["$amount", null] },
            status: "$stake.status"
          },
        },
      },
      {
        $group: {
          _id: "$userId",
          levelBonusData: { $push: "$$ROOT" },
          totalAmount: { $sum: { $toDouble: "$totalStakeBonus" } },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
          levelBonusData: {
            $slice: [{ $sortArray: { input: "$levelBonusData", sortBy: { date: -1 } } }, skip, limitValue],
          },
        },
      },
    ]);
    const rewardsWithLevels =
      rewardsWithLevelsData.length > 0 ? rewardsWithLevelsData[0] : [];
    return { total, rewardsWithLevels };
  } catch (err) {
    console.log(err);
    return err;
  }
};
const stakingRewardAmount = async (userId, startDate = null, endDate = null) => {
  try {
    const matchQuery = { userId };

    // ✅ If startDate & endDate provided, add date filter
    if (startDate && endDate) {
      matchQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    const totalRewardAggregate = await UserStakeReward.aggregate([
      {
       $match: matchQuery,
      },
      {
        $group: {
          _id: null,
          totalRewardAmount: {
            $sum: { $toDouble: { $ifNull: ["$amount", 0] } },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRewardAmount: 1,
        },
      },
    ]);

    const totalRewardAmount =
      totalRewardAggregate.length > 0
        ? totalRewardAggregate[0].totalRewardAmount
        : 0;
    return totalRewardAmount;
  } catch (err) {
    console.log(err);
    return err;
  }
}

const referralLevelAmount = async (userId, type, startDate = null, endDate = null) => {
  try {
    const matchQuery = { userId, type };

    // ✅ If startDate & endDate provided, add date filter
    if (startDate && endDate) {
      matchQuery.createdAt = { $gte: startDate, $lte: endDate };
    }
    const totalRewardAggregate = await UserOtherReward.aggregate([
      {
        $match: matchQuery,
      },
      {
        $group: {
          _id: null,
          totalRewardAmount: {
            $sum: { $toDouble: { $ifNull: ["$amount", 0] } },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalRewardAmount: 1,
        },
      },
    ]);

    const totalRewardAmount =
      totalRewardAggregate.length > 0
        ? totalRewardAggregate[0].totalRewardAmount
        : 0;
    return totalRewardAmount;
  } catch (err) {
    console.log(err);
    return err;
  }
}

const getStakeExpiry = async (userID) => {
  try {
    return await Stake.findOneAndUpdate(
      { userId: userID },
      {
        $set: {
          cappingReached: true,
          status: DEFAULT_STATUS.INACTIVE
        }
      },
      { new: true }
    );
  } catch (err) {
    console.log(err);
    return err;
  }
};

const getMissingIncomeReward = async (incomingStakeRewards = [], date = '') => {
  try {
    let startOfDay = date;
    let stakeRewards = incomingStakeRewards;

    if (incomingStakeRewards?.length === 0) {
      const timeString = process.env.APP_ENV !== 'production' ? 10 : 24;
      const durationString = process.env.APP_ENV !== 'production' ? "minutes" : "hour";

      startOfDay = momentToSubtract(timeString, durationString);
      // console.log('startOfDay', startOfDay);

      // get all stake rewards of previous day
      stakeRewards = await UserStakeReward.find({
        createdAt: {
          $lte: startOfDay
        },
        missingRecordProcessedAt: null
      }).sort({ createdAt: 1 }).limit(1); // Sort by createdAt field in ascending order
    }
    for (const stakeReward of stakeRewards) {
      // now fetch teams where i am added
      const myTeams = await TeamMember.aggregate([
        {
          $match: { userId: stakeReward?.userId },
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
      ]);
      if (myTeams.length > 0) {
        for (const team of myTeams) {
          // my parent record
          const parentId = team?.users?._id;
          // console.log('parentId', parentId);

          // get array of unlocked referral income levels
          const { incomeLevelBonus } = await referralIncomeLevel(team?.team?._id, parentId, DEFAULT_STATUS.ACTIVE);
          const referralIncomeUnLockedLevels = incomeLevelBonus.filter(item => item.unlocked);

          const memberIncomeLevel = await IncomeLevel.findOne({
            minLevel: { $lte: team?.level },
            maxLevel: { $gte: team?.level },
          });

          const isIncomeLevelExists = referralIncomeUnLockedLevels.find((incomeLevel) => incomeLevel?._id.toString() === memberIncomeLevel?._id.toString());

          // if this level is locked, skip this iteration
          if (!(memberIncomeLevel && isIncomeLevelExists)) {
            // console.log('level is locked')
            continue;
          }

          // we need to check, if referral reward already added against
          const otherStakeRewardExist = await UserOtherReward.findOne({
            userId: parentId,
            stakeId: stakeReward?.stakeId,
            type: OTHER_REWARD.INCOME_LEVEL,
            stakeRewardId: stakeReward?._id
          });

          // console.log('otherStakeRewardExist', otherStakeRewardExist);
          if (!otherStakeRewardExist) {
            incomeRewardAmount = helper.calculatePercentage(
              isIncomeLevelExists.rewardPercentage,
              stakeReward?.amount
            );

            // console.log('isIncomeLevelExists', isIncomeLevelExists);
            if (incomeRewardAmount > 0) {
              const userOtherRewardToInsert = {
                userId: parentId,
                type: OTHER_REWARD.INCOME_LEVEL,
                amount: incomeRewardAmount,
                stakeId: stakeReward?.stakeId,
                levelId: isIncomeLevelExists?._id,
                rewardPercentage: isIncomeLevelExists.rewardPercentage,
                stakeRewardId: stakeReward?._id,
                createdAt: stakeReward?.createdAt
              };

              // console.log('userOtherRewardToInsert', userOtherRewardToInsert);
              await UserOtherReward.create(userOtherRewardToInsert);
            }
          }
        }
      }

      updateProcessedRecords(stakeReward?._id, startOfDay);
    }
  } catch (error) {
    console.error(`Error:`, error);
    return error;
  }
};

const updateProcessedRecords = async (payload, startOfToday) => {
  await UserStakeReward.updateOne(
    { _id: payload?._id },
    { missingRecordProcessedAt: startOfToday }
  );
};
const numOfReferralsWithIn30Days = async (teamId, level, date) => {
  try {

    const teamMember = await TeamMember.countDocuments({
      teamId: teamId,
      level: level,
      createdAt: {
        $lt: date
      }
    });
    return teamMember;
  } catch (err) {
    console.log(err);
    return err;
  }
};
const numOfReferralBussinessWithIn30Days = async (teamId, level, date) => {
  try {
    const isValidObjectId = mongoose.Types.ObjectId.isValid(teamId);

    if (!isValidObjectId) {
      throw new Error("Invalid userId format");
    }

    const result = await TeamMember.aggregate([
      {
        $match: {
          teamId: new ObjectId(teamId),
          level: level,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "stakes",
          localField: "user._id",
          foreignField: "userId",
          as: "stakes",
        },
      },
      { $unwind: { path: "$stakes", preserveNullAndEmptyArrays: true } }, // Unwind the stakes array
      {
        $match: {
          "stakes.createdAt": {
            $lt: new Date(date)
          }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$stakes.amount" },
        },
      },
      {
        $project: {
          _id: 0,
          totalAmount: 1,
        },
      },
    ]);

    // Get the total crypto amount
    return result.length > 0 ? result[0].totalAmount : 0;
  } catch (err) {
    console.log(err);
    return err;
  }
};

const numOfReferralsByDate = async (teamId, ) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const matchQuery = {
    teamId,
    createdAt: { $gte: startOfToday, $lte: endOfToday },
  };

  // // If you only want direct (level = 1)
  // if (typeof level === "number") {
  //   matchQuery.level = level;
  // } else if (typeof level === "object") {
  //   matchQuery.level = level;
  // }

  const count = await TeamMember.countDocuments(matchQuery);
  return count;
};

module.exports = {
  numOfReferrals,
  numOfActivePendigReferrals,
  numOfReferralBussiness,
  directReferralList,
  activePendingReferralList,
  referralIncomeLevel,
  numOfAllReferrals,
  numOfDirectReferralBussiness,
  stakeAmountTaken,
  handleCappingEvent,
  getLeadershipBonus,
  getStakeBonus,
  getLevelBonus,
  getInstantBonus,
  stakingRewardAmount,
  referralLevelAmount,
  getStakeExpiry,
  numOfAllActiveReferrals,
  getMissingIncomeReward,
  getLatestStake,
  activePendingReferralByCreated,
  numOfReferralsWithIn30Days,
  numOfReferralBussinessWithIn30Days,
  numOfReferralsByDate
};
