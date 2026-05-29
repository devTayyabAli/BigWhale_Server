const Stake = require("../models/stake.model");
const { ObjectId } = require("mongoose").Types;
const {
  DEFAULT_STATUS,
  CONTRACT_EVENTS,
  TRANSACTION_STATUS,
  OTHER_REWARD,
  SETTING,
} = require("../config/constants");
const socket = require("../helpers/sockets");
const Transaction = require("../models/transaction.model");
const moment = require("moment");
const UserOtherReward = require("../models/userOtherReward.model");
const helper = require("../helpers/index");
const { getSettingWithKey } = require("../helpers/setting");
const createPaginator = require("../helpers/paginate");
const {momentToAdd, momentFormated, momentToSubtract}=require('../helpers/moment')
const create = async (payload, response) => {
  await Stake.deleteMany({
    userId: new ObjectId(payload.userId),
    status: "pending",
  });
  const stake = await Stake.create(payload);
  if (stake) {
    response.success = true;
    response.message = "Stake added successfully";
    response.status = 201;
    response.data = stake;
    return response;
  }
};

const getStakeByPayload = async (req, response) => {
  const { userId } = req.params;
  const { status = "active" } = req.query;

  const stake = await Stake.findOne({
    userId: new ObjectId(userId),
    status,
  })
    .populate("userId")
    .populate("transactionId");

  response.success = true;
  response.message = "Stake fetched successfully";
  response.status = 200;
  response.data = stake || {};
  return response;
};

const getAllStakesByPayload = async (req, response) => {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const stakes = await Stake.find({
      userId: new ObjectId(userId),
      ...(status ? { status } : { status: { $in: ["active", "inactive"] } }),
    })
      .populate("userId")
      .populate("transactionId")
      .sort({ createdAt: -1 }) // Sort by createdAt in descending order
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Stake.countDocuments({
      userId: new ObjectId(userId),
      ...(status ? { status } : { status: { $in: ["active", "inactive"] } }),
    });
    const totalStakes = await getTotalStakeAmountByUser(userId);

    response.message = "Stakes fetched successfully";
    response.status = 200;
    response.data =
      {
        stakes,
        totalStakeAmount: totalStakes|| 0,
        totalRecords: totalCount,
        paginate: createPaginator.paginate(totalCount, limit, page),
      } || [];
    return response;

};

const getTotalStakeAmountByUser = async (userId) => {
  const totalAmount = await Stake.aggregate([
    {
      $match: {
        userId: new ObjectId(userId),
        status: { $nin: [DEFAULT_STATUS.PENDING, DEFAULT_STATUS.FAILED] }
      },
    },
    {
      $lookup: {
        from: "transactions",
        localField: "transactionId",
        foreignField: "_id",
        as: "populatedTransaction"
      }
    },
    {
      $unwind: "$populatedTransaction"
    },
    {
      $group: {
        _id: "$userId", // Change to _id: "$userId"
        totalAmount: { $sum: "$populatedTransaction.fiatAmount" }
      }
    }
  ]);
  const sum = totalAmount.length > 0 ? JSON.parse(JSON.stringify(totalAmount)).reduce((acc, curr) => acc + curr.totalAmount, 0) : 0;
  return sum||0;
};

const handleStakeEvent = async (txHash) => {
  const transaction = await Transaction.findOneAndUpdate(
    { txHash },
    { status: TRANSACTION_STATUS.COMPLETED }
  );

  if (!transaction) {
    console.warn(`handleStakeEvent: no transaction found for txHash=${txHash}`);
    return null;
  }

  const stake = await Stake.findOneAndUpdate(
    { transactionId: transaction?._id },
    { status: DEFAULT_STATUS.ACTIVE, lastReward: momentFormated() }
  ).populate("userId");

  if (!stake) {
    console.warn(`handleStakeEvent: no stake found for transactionId=${transaction._id}`);
    return null;
  }

  // ── Batch fetch setting in one cache read ──────────────────
  const instantBonusPercentage = await getSettingWithKey(SETTING.INSTANT_BONUS_PERCENTAGE);
  const instantReward = helper.calculatePercentage(instantBonusPercentage, stake?.amount);

  if (stake?.userId?.referredBy) {
    await UserOtherReward.create({
      userId: stake.userId.referredBy,
      type: OTHER_REWARD.INSTANT_BONUS,
      amount: instantReward,
      stakeId: stake._id,
      levelId: null,
      rewardPercentage: instantBonusPercentage,
    });
  }
  socket.io.to(`${stake?.userId?._id}`).emit(CONTRACT_EVENTS.STAKE, {});

  return stake;
};

const updateStake = (query, payload) => {
  return Stake.findOneAndUpdate(query, payload);
};

const completeStake = async (req, response) => {
  const { userId, txHash, fiatAmount, cryptoAmount } = req.body;
  const { id: stakeId } = req.params;

  const stake = await Stake.findOne({ _id: stakeId }).populate("userId").lean();
  if (!stake) {
    response.success = false;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }

  const transaction = await Transaction.create({
    userId,
    txHash,
    type: "staking",
    fiatAmount,
    cryptoAmount,
    status: DEFAULT_STATUS.PENDING,
  });

  // ── Batch fetch all 3 settings in one cache read ──────────────────
  const { getSettingsWithKeys } = require("../helpers/setting");
  const settings = await getSettingsWithKeys([
    SETTING.STAKE_DURATION,
    SETTING.STAKE_REWARD_PER_DAY,
    SETTING.STAKE_DURATION_UNIT,
  ]);
  const stakeDurationDays = settings[SETTING.STAKE_DURATION];
  const stakeRewardPerDay = settings[SETTING.STAKE_REWARD_PER_DAY];
  const stakeDurationUnit = settings[SETTING.STAKE_DURATION_UNIT];

  const updatedStake = await Stake.findOneAndUpdate(
    { _id: stakeId },
    {
      transactionId: transaction?._id,
      endDate: momentToAdd(stakeDurationDays, stakeDurationUnit),
      rewardPercentage: stakeRewardPerDay,
    }
  );

  if (!updatedStake) {
    response.success = false;
    response.message = "Something went wrong";
    response.status = 400;
    return response;
  }

  response.success = true;
  response.message = "Stake completed successfully";
  response.status = 200;
  response.data = updatedStake;
  return response;
};

const getActiveStakes = async (startOfToday) => {
  const stakes = await Stake.find({
    status: DEFAULT_STATUS.ACTIVE,
    endDate: { $gte: startOfToday },
  })
  .populate({
    path: 'userId',
    match: { status: DEFAULT_STATUS.ACTIVE } // Filter users based on status
  })
  .populate("transactionId");
  return stakes;
};
const getStakesToAddReward = async (date) => {
  const now = date ? momentFormated(date) : momentFormated();
  const stakes = await Stake.find({
    status: DEFAULT_STATUS.ACTIVE,
    endDate: { $gte: now },
    $or: [
      { lastReward: null },
      { lastReward: { $exists: false } },
      { lastReward: { $lte: now } },
    ],
  })
    .populate({
      path: "userId",
      match: { status: DEFAULT_STATUS.ACTIVE },
    })
    .populate("transactionId");
  return stakes;
};
const updateExpiredStakes = async () => {
  // const startDate = moment().subtract(1, "day").toDate();
  // const startOfToday = new Date(startDate.setUTCHours(0, 0, 0, 0));
  const currentDate = momentFormated();
  await Stake.updateMany(
    { endDate: { $lte: currentDate } },
    { status: DEFAULT_STATUS.INACTIVE }
  );
};
const getPendingStakes = async () => {
  const ninetySecondsAgo = momentToSubtract(5,'minutes')
  
  return await Stake.find(
    {
      status: DEFAULT_STATUS.PENDING,
      createdAt: { $lt: ninetySecondsAgo },
      transactionId: { $ne: null },
    }
  ).populate("transactionId");
};

const calculateGlobalTurnOver = async (date) => {
  const targetDate = moment(date).toDate();

  const pipeline = [
    {
      $addFields: {
        createdAtDate: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
      },
    },
    {
      $match: {
        status: DEFAULT_STATUS.ACTIVE,
        createdAtDate: { $eq: targetDate.toISOString().substring(0, 10) }, // Compare date only
      },
    },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
      },
    },
  ];

  return await Stake.aggregate(pipeline);
};

module.exports = {
  create,
  getStakeByPayload,
  getAllStakesByPayload,
  updateStake,
  handleStakeEvent,
  getActiveStakes,
  completeStake,
  getTotalStakeAmountByUser,
  updateExpiredStakes,
  getPendingStakes,
  calculateGlobalTurnOver,
  getStakesToAddReward
};
