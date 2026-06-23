const { HTTP_STATUS_CODE } = require("../config/constants");
const referral = require("../services/referral");
const userCreated = require("../services/user");
const Team = require("../models/team.model");
const { DEFAULT_STATUS, OTHER_REWARD } = require("../config/constants");
const createPaginator = require("../helpers/paginate");
const User = require("../models/user.model");
const Stake = require("../models/stake.model");
const mongoose = require("mongoose");
const IncomeLevel = require("../models/incomeLevel.model");
const TeamMember = require("../models/teamMember.model");
const UserStakeReward = require("../models/userStakingReward.model");
const UserOtherReward = require("../models/userOtherReward.model");
const helper = require("../helpers/index");
const withdrawal = require("../services/withdrawal");
const { ObjectId } = require("mongoose").Types;
const stakeCron = require("../cron/incomeReward");
const { calculateTotalWithdrawalAmount } = require('../services/withdrawal')
/**
 * Get Drops
 *
 * @param {Object} request
 * @param {Object} response
 * @param {number} - request.query.page - PageNumber
 * @param {number} - request.query.numberOfRows - Number of documents expected
 */

const getReferralBonusLevel = async (request, response) => {
  try {
    const { _id } = request.user;
    const team = await Team.findOne({ userId: _id });
    const teamId = team?._id;
    const { unLock, incomeLevelBonus } = await referral.referralIncomeLevel(
      teamId,
      _id,
      DEFAULT_STATUS.ACTIVE
    );
    return response.status(HTTP_STATUS_CODE.OK).json({
      unLock,
      incomeLevelBonus,
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};
const getReferralStats = async (request, response) => {
  try {
    const { _id } = request.user;
    const team = await Team.findOne({ userId: _id });
    const teamId = team?._id;
    const directReferral = teamId ? await referral.numOfReferrals(teamId, 1) : 0;
    const activeDirectReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, 1, DEFAULT_STATUS.ACTIVE) : 0;
    const pendingDirectReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, 1, DEFAULT_STATUS.BANNED) : 0;
    const directReferralBussiness = teamId ? await referral.numOfDirectReferralBussiness(teamId, 1, DEFAULT_STATUS.ACTIVE) : 0;
    const downlineReferral = teamId ? await referral.numOfReferrals(teamId, { $ne: 1 }) : 0;
    const activeDownlineReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, { $ne: 1 }, DEFAULT_STATUS.ACTIVE) : 0;
    const pendingDownlineReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, { $ne: 1 }, DEFAULT_STATUS.BANNED) : 0;
    const directDownlineBussiness = teamId ? await referral.numOfDirectReferralBussiness(teamId, { $ne: 1 }, DEFAULT_STATUS.ACTIVE) : 0;
 const todayBonus = await withdrawal.calculateTodayBonus(_id);
    const todayTeam = teamId ? await referral.numOfReferralsByDate(teamId) : 0

    // const stakingRewardBonus = await referral.stakingRewardAmount(_id);
    // const referralLevelBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.INCOME_LEVEL);
    // const leadershipBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.LEADERSHIP);
    // const instantRewardBonus =  await referral.referralLevelAmount(_id,  OTHER_REWARD.INSTANT_BONUS);
    // const withdrawalAmount = await withdrawal?.totalWithdrawalAmount(_id);//
    // const totalBonus = stakingRewardBonus + referralLevelBonus + leadershipBonus + instantRewardBonus;//
    // const availableBonusBalance = totalBonus - (withdrawalAmount[0]?.totalAmount || 0);//
    const { stakingRewardBonus, referralLevelBonus, leadershipBonus, instantRewardBonus, withdrawalAmount, totalBonus, availableBonusBalance } = await calculateTotalWithdrawalAmount(_id)
    const userDetail = await User.findById(_id);
    const userRank = userDetail?.userRankId;
    return response.status(HTTP_STATUS_CODE.OK).json({
      directReferral,
      activeDirectReferrals,
      pendingDirectReferrals,
      directReferralBussiness,
      downlineReferral,
      activeDownlineReferrals,
      pendingDownlineReferrals,
      directDownlineBussiness,
      stakingRewardBonus,
      referralLevelBonus,
      leadershipBonus,
      instantRewardBonus,
      totalBonus,
      userRank,
      totalWithdrawal: withdrawalAmount,
      availableBonusBalance,
       todayBonus,
      todayTeam
    });
  } catch (error) {
    console.log('========>', error);
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getReferralStatsByUserID = async (request, response) => {
  try {
    const { userId } = request.params;

    if (!userId) {
      return response.status(HTTP_STATUS_CODE.BAD_REQUEST).json({ message: "User ID is required" });
    }
    const _id = new ObjectId(userId); // Convert to ObjectId if needed for MongoDB
    const team = await Team.findOne({ userId: _id });
    const teamId = team?._id;
    const directReferral = teamId ? await referral.numOfReferrals(teamId, 1) : 0;
    const activeDirectReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, 1, DEFAULT_STATUS.ACTIVE) : 0;
    const pendingDirectReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, 1, DEFAULT_STATUS.BANNED) : 0;
    const directReferralBussiness = teamId ? await referral.numOfDirectReferralBussiness(teamId, 1, DEFAULT_STATUS.ACTIVE) : 0;
    const downlineReferral = teamId ? await referral.numOfReferrals(teamId, { $ne: 1 }) : 0;
    const activeDownlineReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, { $ne: 1 }, DEFAULT_STATUS.ACTIVE) : 0;
    const pendingDownlineReferrals = teamId ? await referral.numOfActivePendigReferrals(teamId, { $ne: 1 }, DEFAULT_STATUS.BANNED) : 0;
    const directDownlineBussiness = teamId ? await referral.numOfDirectReferralBussiness(teamId, { $ne: 1 }, DEFAULT_STATUS.ACTIVE) : 0;

    // const stakingRewardBonus = await referral.stakingRewardAmount(_id);
    // const referralLevelBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.INCOME_LEVEL);
    // const leadershipBonus = await referral.referralLevelAmount(_id,  OTHER_REWARD.LEADERSHIP);
    // const instantRewardBonus =  await referral.referralLevelAmount(_id,  OTHER_REWARD.INSTANT_BONUS);
    // const withdrawalAmount = await withdrawal?.totalWithdrawalAmount(_id);//
    // const totalBonus = stakingRewardBonus + referralLevelBonus + leadershipBonus + instantRewardBonus;//
    // const availableBonusBalance = totalBonus - (withdrawalAmount[0]?.totalAmount || 0);//
    const { stakingRewardBonus, referralLevelBonus, leadershipBonus, instantRewardBonus, withdrawalAmount, totalBonus, availableBonusBalance } = await calculateTotalWithdrawalAmount(_id)
    const userDetail = await User.findById(_id);
    const userRank = userDetail?.userRankId;
    return response.status(HTTP_STATUS_CODE.OK).json({
      directReferral,
      activeDirectReferrals,
      pendingDirectReferrals,
      directReferralBussiness,
      downlineReferral,
      activeDownlineReferrals,
      pendingDownlineReferrals,
      directDownlineBussiness,
      stakingRewardBonus,
      referralLevelBonus,
      leadershipBonus,
      instantRewardBonus,
      totalBonus,
      userRank,
      totalWithdrawal: withdrawalAmount,
      availableBonusBalance
    });
  } catch (error) {
    console.log('========>', error);
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getReferralReward = async (request, response) => {
  try {
    const { date } = request.params;
    let teamMembers = [];
    const currentDate = new Date(date);
    const startOfDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate()
    );
    const endOfDay = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() + 1
    );
    const users = await User.find({ status: DEFAULT_STATUS.ACTIVE });
    for (const user of users) {
      if (user?._id) {
        const stakes = await Stake.find({
          status: DEFAULT_STATUS.ACTIVE,
          userId: user?._id,
        });
        for (const stake of stakes) {
          const capping = await referral.handleCappingEvent(user?._id);
          if (capping?.isCappingReached) {
            break;
          }
          const stakeRewardDistribution = await UserStakeReward.findOne({
            stakeId: new ObjectId(stake?._id),
            createdAt: {
              $gte: startOfDay,
              $lt: endOfDay,
            },
          });
          const stakeRewards = stakeRewardDistribution
            ? stakeRewardDistribution?.amount
            : 0;
          if (stakeRewards) {
            teamMembers = await TeamMember.aggregate([
              {
                $match: { userId: user?._id },
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
            ]);
            if (teamMembers.length > 0) {
              for (const member of teamMembers) {
                const otherStakeRewardExist = await UserOtherReward.findOne({
                  userId: new ObjectId(member?.team?.userId),
                  stakeId: new ObjectId(stake?._id),
                  type: { $ne: "instant_bonus" }, // Exclude documents with type equal to "instant_bonus"
                  createdAt: {
                    $gte: startOfDay,
                    $lt: endOfDay,
                  },
                });
                if (!otherStakeRewardExist) {
                  const noOfmemberRef = await referral.numOfAllActiveReferrals(
                    member?.teamId
                  );
                  const incomeLevel = await IncomeLevel.findOne({
                    minLevel: { $lte: member?.level },
                    maxLevel: { $gte: member?.level },
                  });

                  const meetsRequirements =
                    noOfmemberRef >= incomeLevel.minimumRequiredReferrals;
                  if (incomeLevel) {
                    const directReferralBussiness =
                      await referral.numOfReferralBussiness(
                        member?.teamId,
                        1,
                        DEFAULT_STATUS.ACTIVE
                      ); //3000

                    const accountActiveDays =
                      await userCreated.userAccountCreated(
                        member?.team?.userId
                      );
                    if (meetsRequirements) {
                      let percent;
                      if (
                        incomeLevel.minLevel === 2 &&
                        noOfmemberRef >= incomeLevel?.directReferral &&
                        directReferralBussiness >=
                        incomeLevel?.directBussiness &&
                        accountActiveDays <= incomeLevel?.activationDays
                      ) {
                        percent = helper.calculatePercentage(
                          incomeLevel.maximumRewardPercentage,
                          stakeRewards
                        );
                      } else {
                        percent = helper.calculatePercentage(
                          incomeLevel.minimumRewardPercentage,
                          stakeRewards
                        );
                      }
                      if (percent > 0) {
                        UserOtherReward.create({
                          userId: member?.team?.userId,
                          type: "income_level",
                          amount: percent,
                          stakeId: stake?._id,
                          levelId: incomeLevel?._id,
                          rewardPercentage: (incomeLevel.minLevel === 2 &&
                            noOfmemberRef >= incomeLevel?.directReferral &&
                            directReferralBussiness >=
                            incomeLevel?.directBussiness &&
                            accountActiveDays <= incomeLevel?.activationDays) ? incomeLevel.maximumRewardPercentage : incomeLevel.minimumRewardPercentage
                        });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return response.status(HTTP_STATUS_CODE.OK).json({
      teamMembers,
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getReferralByType = async (request, response) => {
  try {
    const { type, page, limit, userName } = request.query;
    const { _id } = request.user;
    const team = await Team.findOne({ userId: _id });
    const teamId = team?._id;
    if (!team) {
      return response.status(404).json({ error: "Team not found" });
    }

    let data = [];
    let total = 0;
    let totalBussiness = 0;
    let referralStatus = DEFAULT_STATUS.ACTIVE;
    switch (type) {
      case "direct":
        break;
      case "directActive":
      case "downlineActive":
        break;
      case "directPending":
      case "downlinePending":
        referralStatus = DEFAULT_STATUS.BANNED;
        break;
      default:
        break;
    }

    if (
      type === "direct"
    ) {
      data = await referral.activePendingReferralList(
        teamId,
        1,
        null,
        page,
        limit,
        null,
        null,
        userName


      );
      total = await referral.numOfActivePendigReferrals(
        teamId,
        1,
        null
      );
      totalBussiness = await referral.numOfDirectReferralBussiness(
        teamId,
        1,
        null
      );
    } else if (
      type === "directActive" ||
      type === "directPending"
    ) {
      data = await referral.activePendingReferralList(
        teamId,
        1,
        referralStatus,
        page,
        limit,
        null,
        null,
        userName
      );
      total = await referral.numOfActivePendigReferrals(
        teamId,
        1,
        referralStatus
      );
      totalBussiness = await referral.numOfDirectReferralBussiness(
        teamId,
        1,
        referralStatus
      );
    }

    else if (type === "downlineActive" || type === "downlinePending") {
      data = await referral.activePendingReferralList(
        teamId,
        { $ne: 1 },
        referralStatus,
        page,
        limit,
        null,
        null,
        userName
      );
      total = await referral.numOfActivePendigReferrals(
        teamId,
        { $ne: 1 },
        referralStatus
      );
      totalBussiness = await referral.numOfReferralBussiness(
        teamId,
        { $ne: 1 },
        referralStatus
      );
    }

    return response.status(HTTP_STATUS_CODE.OK).json({
      data,
      total,
      totalBussiness,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};
const getLeadershipBonus = async (request, response) => {
  try {
    const { _id } = request.user;
    const { page, limit } = request.query;
    const { total, userOtherReward } = await referral.getLeadershipBonus(_id, page, limit);
    return response.status(HTTP_STATUS_CODE.OK).json({
      data: userOtherReward.length > 0 ? userOtherReward[0] : [],
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getStakeBonus = async (request, response) => {
  try {
    const { _id } = request.user;
    const { page, limit } = request.query;
    const { userStakeReward, totalRewardAmount, total } = await referral.getStakeBonus(_id, page, limit);
    return response.status(HTTP_STATUS_CODE.OK).json({
      totalRewardAmount, data: userStakeReward,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getLevelBonus = async (request, response) => {
  try {
    const { _id } = request.user;
    const { page, limit } = request.query;
    const { rewardsWithLevels, totalRewardAmount, total } = await referral.getLevelBonus(_id, page, limit);
    return response.status(HTTP_STATUS_CODE.OK).json({
      totalRewardAmount, data: rewardsWithLevels,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getInstantBonus = async (request, response) => {
  try {
    const { _id } = request.user;
    const { page, limit } = request.query;
    const { rewardsWithLevels, totalRewardAmount, total } = await referral.getInstantBonus(_id, page, limit);
    return response.status(HTTP_STATUS_CODE.OK).json({
      totalRewardAmount, data: rewardsWithLevels,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
};

const getSalaryRankHistory = async (request, response) => {
  try {
    const { _id } = request.user;
    const { page, limit } = request.query;
    const { rewards, total } = await referral.getSalaryRankHistory(_id, page, limit);
    return response.status(HTTP_STATUS_CODE.OK).json({
      data: rewards,
      paginate: createPaginator.paginate(total, limit, page),
    });
  } catch (error) {
    return response.status(HTTP_STATUS_CODE.INTERNAL_SERVER).json(error);
  }
}
module.exports = {
  getReferralByType,
  getReferralStats,
  getReferralStatsByUserID,
  getReferralBonusLevel,
  getReferralReward,
  getLeadershipBonus,
  getStakeBonus,
  getLevelBonus,
  getInstantBonus,
  getSalaryRankHistory
};
