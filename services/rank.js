const moment = require("moment");
const User = require("../models/user.model");
const Stake = require("../models/stake.model");
const Rank = require("../models/rank.model");
const UserRank = require("../models/userRank.model");
const { DEFAULT_STATUS } = require("../config/constants");
const { ObjectId } = require("mongoose").Types;
const Team = require("../models/team.model");
const teamService = require("./team");
const fastTrack = require("./fastTrack");

let currentDate = moment().toDate();

const RANK_NAMES = {
  1: "Bronze Leader",
  2: "Silver Leader",
  3: "Gold Leader",
  4: "Platinum Leader",
  5: "Diamond Leader",
  6: "Crown Leader",
  7: "BigWhale Legend",
};

// 2X Fast-Track rank status: a rank is earned by STAKED directs and is lifetime
// (promotion-only), so a user at rank N is qualified for every rank <= N.
const getStakeRankDetails = async (req, response) => {
  const { userId } = req.params;
  const [systemRanks, stakedDirects, user] = await Promise.all([
    Rank.find({ starKey: { $gte: 1, $lte: 7 } }).sort({ starKey: 1 }).lean(),
    fastTrack.countStakedDirects(userId).catch(() => 0),
    User.findById(userId).select("userRankId").lean(),
  ]);
  const currentRank = Number(user?.userRankId || 0);

  // A holder of rank N also earns every lower rank's share, so the banner shows
  // the running total: 10, 20, 30, 42.5, 57.5, 75, 100 for the default shares.
  let cumulative = 0;
  const allRank = systemRanks.map((rank) => {
    cumulative += Number(rank.rewardPercentage) || 0;
    const required = Number(rank.directTeam || 0);
    const reached = stakedDirects >= required;
    return {
      title: RANK_NAMES[rank.starKey] || rank.title,
      imageKey: rank.title,
      starKey: rank.starKey,
      rewardPercentage: Number(cumulative.toFixed(2)),
      directTeam: {
        value: stakedDirects,
        status: reached,
        requiredValue: required,
      },
      qualified: currentRank >= rank.starKey || reached,
    };
  });

  response.success = true;
  response.data = allRank;
  response.message = "Stakes reward fetched successfully";
  response.status = 200;
  return response;
};

const getUserDetailsForBonus = async (userId = "", startDate = "") => {
  if (startDate) {
    currentDate = moment(startDate).toDate();
  }

  const pipeline = [
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "userId",
        as: "teams",
      },
    },
    {
      $lookup: {
        from: "teammembers",
        localField: "teams._id",
        foreignField: "teamId",
        as: "members",
      },
    },
    {
      $lookup: {
        from: "stakes",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
              status: DEFAULT_STATUS.ACTIVE,
              endDate: { $gt: currentDate },
            },
          },
          {
            $group: {
              _id: "$userId",
              amount: { $sum: "$amount" },
            },
          },
        ],
        as: "stakes",
      },
    },
    {
      $project: {
        _id: 1,
        email: 1,
        teams: "$teams._id",
        members: 1,
        stakes: {
          $ifNull: [{ $arrayElemAt: ["$stakes", 0] }, { amount: 0 }],
        },
      },
    },
  ];

  if (userId) {
    pipeline.push({ $match: { _id: new ObjectId(userId) } });
  } else {
    pipeline.push(
      {
        $match: { "stakes.amount": { $ne: 0 } },
      },
      { $limit: parseInt(process.env.BATCH_SIZE_FOR_STAR_RANK) }
    );
  }
  return await User.aggregate(pipeline, { maxTimeMS: 60000 });
};

const getUserDetailsForStarRank = async (startOfToday) => {
  const pipeline = [
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "userId",
        as: "teams",
      },
    },
    {
      $lookup: {
        from: "teammembers",
        localField: "teams._id",
        foreignField: "teamId",
        as: "members",
      },
    },
    {
      $lookup: {
        from: "stakes",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
              status: DEFAULT_STATUS.ACTIVE,
              endDate: { $gte: currentDate },
            },
          },
          {
            $group: {
              _id: "$userId",
              amount: { $sum: "$amount" },
            },
          },
        ],
        as: "stakes",
      },
    },
    {
      $project: {
        _id: 1,
        email: 1,
        processedAt: 1,
        userRankId: 1,
        teams: "$teams._id",
        members: 1,
        stakes: {
          $ifNull: [{ $arrayElemAt: ["$stakes", 0] }, { amount: 0 }],
        },
      },
    },
    {
      $match: {
        "stakes.amount": { $ne: 0 },
        processedAt: { $ne: startOfToday },
      },
    },
    { $limit: parseInt(process.env.BATCH_SIZE_FOR_STAR_RANK) },
  ];
  return await User.aggregate(pipeline, { maxTimeMS: 60000 });
};

const processDataForRankDetails = async (users, startDate = "") => {
  let userRankPayload = [];

  for (let i = 0; i < users.length; i++) {
    let maxStake = 0;
    let fiftyPercentageOfMaxStake = 0;
    let directTeamCount = 0;
    let directBussiness = 0;
    let totalTeamBusiness = 0;
    let threeStarCount = 0;
    let fourStarCount = 0;
    let fiveStarCount = 0;
    let sixStarCount = 0;
    for (let j = 0; j < users[i].members.length; j++) {
      const member = users[i].members[j];
      const memberRank = await getRankByUserId(member?.userId);

      if (memberRank.length > 0) {
        const updatedCounts = await calculateUserStarCount(
          memberRank,
          threeStarCount,
          fourStarCount,
          fiveStarCount,
          sixStarCount
        );

        threeStarCount = updatedCounts.threeStar;
        fourStarCount = updatedCounts.fourStar;
        fiveStarCount = updatedCounts.fiveStar;
        sixStarCount = updatedCounts.sixStar;
      }

      const memberStakeInfo = await getUserStakeAmount(
        member.userId,
        startDate
      );

      member.stakeAmount =
        memberStakeInfo.length > 0 ? memberStakeInfo[0]?.totalStakeAmount : 0;

      if (member.level == 1) {
        directTeamCount++;
        directBussiness = directBussiness + member.stakeAmount;
        totalTeamBusiness = totalTeamBusiness + member.stakeAmount;

        const teamMembers = await teamService.getTeamMemberAlongStakedAmount(
          member.userId,
          startDate
        );

        if (
          teamMembers?.totalStakedAmounts &&
          teamMembers?.totalStakedAmounts.length > 0
        ) {
          const directLegStake = await calculateStakeOfDirectLegTeam(
            teamMembers?.totalStakedAmounts
          );

          totalTeamBusiness = totalTeamBusiness + directLegStake;

          if (directLegStake > maxStake) maxStake = directLegStake;
        }
      }
    }

    if (maxStake > 0) {
      fiftyPercentageOfMaxStake = maxStake * 0.5;
      totalTeamBusiness = totalTeamBusiness - fiftyPercentageOfMaxStake;
    }

    users[i].directTeamCount = directTeamCount;
    users[i].teamSize = users[i].members.length;
    users[i].directBussiness = directBussiness;
    users[i].totalTeamBusiness = totalTeamBusiness;
    users[i].qualifications = [
      {
        id: process.env.THIRD_RANK_ID,
        count: threeStarCount,
      },
      {
        id: process.env.FOURTH_RANK_ID,
        count: fourStarCount,
      },
      {
        id: process.env.FIFTH_RANK_ID,
        count: fiveStarCount,
      },
      { id: process.env.SIXTH_RANK_ID, count: sixStarCount },
    ];

    const userRankDetails = await getUserRankReward(users[i]);

    if (userRankDetails) {
      userRankPayload.push({
        userId: users[i]?._id,
        rankId: userRankDetails?._id || null,
        rank: userRankDetails || {},
        users: users[i],
      });
    }
  }

  return userRankPayload;
};

const calculateStakeOfDirectLegTeam = async (totalStakes) => {
  const totalAmount = totalStakes.reduce((sum, item) => {
    return sum + item?.totalStakedAmount;
  }, 0);
  return totalAmount;
};

const calculateUserStarCount = async (
  userRank,
  threeStar,
  fourStar,
  fiveStar,
  sixStar
) => {
  let rankDetails = userRank[0]?.rankDetails;

  if (rankDetails[0]?.title && rankDetails[0].title.toLowerCase().includes("3 star")) {
    threeStar++;
  } else if (rankDetails[0]?.title && rankDetails[0].title.toLowerCase().includes("4 star")) {
    fourStar++;
  } else if (rankDetails[0]?.title && rankDetails[0].title.toLowerCase().includes("5 star")) {
    fiveStar++;
  } else if (rankDetails[0]?.title && rankDetails[0].title.toLowerCase().includes("6 star")) {
    sixStar++;
  }
  return { threeStar, fourStar, fiveStar, sixStar };
};

const getRankByUserId = async (userId) => {
  const pipeline = [
    {
      $match: { _id: userId },
    },
    {
      $lookup: {
        from: "ranks",
        localField: "userRankId",
        foreignField: "_id",
        as: "rankDetails",
      },
    },
    {
      $project: {
        _id: 0,
        userId: "$_id",
        rankId: "$userRankId",
        rankDetails: "$rankDetails",
      },
    },
  ];
  return await User.aggregate(pipeline);
};

const getUserStakeAmount = async (userId, startDate) => {
  return await Stake.aggregate([
    {
      $match: {
        userId: userId,
        endDate: { $gt: startDate },
        status: DEFAULT_STATUS.ACTIVE,
      },
    },
    {
      $group: {
        _id: null,
        totalStakeAmount: { $sum: "$amount" },
      },
    },
  ]);
};

const getUserRankReward = async (userDetails) => {
  const ranks = await Rank.find({}).populate("giftId");
  let userRank = null;
  const rankIdsToCheck = ["4 star reward", "5 star reward", "6 star reward"];

  for (const rank of ranks) {
    if (
      userDetails.stakes.amount >= rank.selfBusiness &&
      userDetails.directTeamCount >= rank.directTeam &&
      userDetails.directBussiness >= rank.directBussiness &&
      userDetails.totalTeamBusiness >= rank.totalTeamBusiness &&
      userDetails.teamSize >= rank.totalTeamSize
    ) {
      if (rankIdsToCheck.includes(rank.title)) {
        for (qualification of userDetails.qualifications) {
          if (
            new ObjectId(qualification.id).equals(rank?.rankId) &&
            qualification.count >= rank?.referralCount
          ) {
            userRank = rank;
            break;
          }
        }
      } else {
        userRank = rank;
      }
    }
  }
  return userRank;
};

const createUserRank = async (userRankPayloadIds, users, payload) => {
  const userIdsToUpdate = users
    .filter((user) => user._id && userRankPayloadIds.includes(user._id))
    .map((user) => ({
      _id: user._id,
      userRankId: payload.find((item) => item.userId === user._id)?.rank
        ?.starKey,
    }));

  if (userIdsToUpdate.length === 0) {
    return { error: true, message: "no rank update needed." };
  }

  // Update each user's userRankId individually so every user gets their own
  // correct starKey value. The previous updateMany with an array of $set
  // objects is invalid MongoDB syntax — it would apply only the first $set
  // to every matched document, causing all updated users to receive the same
  // (wrong) rank.
  await Promise.all(
    userIdsToUpdate.map((update) =>
      User.updateOne(
        { _id: update._id },
        { $set: { userRankId: update.userRankId } }
      )
    )
  );

  return await UserRank.insertMany(payload);
};

const getUserRank = async (startOfToday) => {
  const pipeline = [
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$userId",
        latestRank: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$latestRank" } },
    {
      $lookup: {
        from: "ranks",
        localField: "rankId",
        foreignField: "_id",
        as: "rankData",
      },
    },
    { $unwind: "$rankData" },
    { $match: { processedAt: { $ne: startOfToday } } },
    { $limit: parseInt(process.env.BATCH_SIZE_FOR_DISTRIBUTION) },
  ];

  return await UserRank.aggregate(pipeline);
};

const updateParentRank = async (payload, startDate) => {
  const today = new Date(startDate).setHours(0, 0, 0, 0);
  console.log("🚀 ~ updateParentRank ~ today:", today);

  const endDate = new Date(startDate).setHours(23, 59, 59, 999);
  console.log("🚀 ~ updateParentRank ~ endDate:", endDate);

  for (let i = 0; i < payload.length; i++) {
    console.log("updating  parent ranks...");
    const response = await UserRank.updateOne(
      {
        userId: payload[i].userId,
        rankId: payload[i].rankId,
        createdAt: { $gte: today, $lte: endDate },
      },
      { rankId: payload[i].rankId }
    );
    console.log("logging the result of parent ", response);
  }
};

const getDetailsForMemberParent = async (startOfToday, userIds) => {
  const pipeline = [
    {
      $match: { _id: { $in: userIds } }, // Match documents where _id is in the array of user IDs
    },
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "userId",
        as: "teams",
      },
    },
    {
      $lookup: {
        from: "teammembers",
        localField: "teams._id",
        foreignField: "teamId",
        as: "members",
      },
    },
    {
      $lookup: {
        from: "stakes",
        let: { userId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$userId", "$$userId"] },
              status: DEFAULT_STATUS.ACTIVE,
              endDate: { $gte: currentDate },
            },
          },
          {
            $group: {
              _id: "$userId",
              amount: { $sum: "$amount" },
            },
          },
        ],
        as: "stakes",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "members.userId",
        foreignField: "_id",
        as: "memberDetails",
      },
    },
    {
      $unwind: "$memberDetails",
    },
    {
      $project: {
        _id: 1,
        email: 1,
        processedAt: 1,
        teams: "$teams._id",
        members: 1,
        stakes: {
          $ifNull: [{ $arrayElemAt: ["$stakes", 0] }, { amount: 0 }],
        },
      },
    },
    {
      $match: {
        "stakes.amount": { $ne: 0 },
        processedAt: { $ne: startOfToday },
      },
    },
  ];
  return await User.aggregate(pipeline, { maxTimeMS: 60000 });
};

module.exports = {
  getUserDetailsForBonus,
  getUserDetailsForStarRank,
  createUserRank,
  processDataForRankDetails,
  getStakeRankDetails,
  getUserRank,
  updateParentRank,
  getDetailsForMemberParent,
};
